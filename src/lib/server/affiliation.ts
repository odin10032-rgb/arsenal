/**
 * Arsenal — Affiliation (Phase 2). Contrat FIGÉ : docs/chantier/05-contrat-api-phase2.md
 *
 * Logique pure : chaque fonction reçoit D1Database en paramètre (même style que
 * store.ts), ce qui la rend testable et réutilisable par les routes du Worker.
 *
 * Règles de sécurité appliquées ici :
 * - le code affilié et les codes de lien sont GÉNÉRÉS CÔTÉ SERVEUR (jamais fournis par le client) ;
 * - le visiteur n'est jamais tracé en clair : seul `sha256(ip + user-agent + jour)` est stocké ;
 * - les statistiques (clics, ventes, commissions, A gagnés) sont TOUJOURS recalculées en SQL.
 */
import { getSetting, setSetting } from "./store";
import { sha256hex } from "./auth";

/* ---------------------------------- Types ---------------------------------- */

/**
 * Statuts d'affilié. Vague 4 : deux états de SORTIE s'ajoutent aux trois états
 * du contrat Phase 2 :
 *   • `rejected`  → candidature refusée par l'admin (le rôle reste `user`) ;
 *   • `withdrawn` → retrait volontaire du programme d'affiliation (choix du
 *     propriétaire : un état DÉDIÉ plutôt que `suspended`, sémantiquement
 *     distinct — une suspension est une sanction admin, un retrait est un acte
 *     volontaire. Le rôle `users.role` redevient `user`, `membership` est CONSERVÉ :
 *     quitter l'affiliation ne retire pas la monnaie A, ce sont deux choses).
 */
export type AffiliateStatus = "pending" | "active" | "suspended" | "rejected" | "withdrawn";
export const AFFILIATE_STATUSES: readonly AffiliateStatus[] = [
  "pending",
  "active",
  "suspended",
  "rejected",
  "withdrawn",
];

/** Rôles `users.role` (Phase 1 : le rôle `affiliate` n'est posé qu'à l'activation). */
export type UserRole = "user" | "affiliate" | "super_affiliate" | "admin";

export interface AffiliateRow {
  id: string;
  user_id: string;
  code: string;
  status: string;
  note: string | null;
  applied_at: number;
  activated_at: number | null;
  updated_at: number;
}

/**
 * État d'un lien affilié (migration 0011) :
 *   active    → occupe un emplacement, attribue clics/ventes ;
 *   inactive  → désactivé (par l'affilié ou l'admin) : n'attribue plus ;
 *   saturated → plafond de ventes atteint : désactivé automatiquement.
 */
export type AffiliateLinkStatus = "active" | "inactive" | "saturated";
export const AFFILIATE_LINK_STATUSES: readonly AffiliateLinkStatus[] = [
  "active",
  "inactive",
  "saturated",
];

export interface AffiliateLinkRow {
  id: string;
  affiliate_id: string;
  product_id: string;
  code: string;
  campaign_id: string | null;
  created_at: number;
  /** État du lien (migration 0011 ; absent en base pré-0011 → `active`). */
  status: string;
  /** Ventes attribuées à CE lien (compteur dénormalisé, plafond max_sales_per_link). */
  sales_count: number;
}

/** Produit tel que stocké (colonnes d'affiliation ajoutées par la migration 0003). */
export interface AffiliateProductRow {
  id: string;
  title: string;
  price: string;
  image_url: string;
  action_url: string;
  affiliate_enabled: number | null;
  commission_type: string | null;
  commission_value: number | null;
  reward_a: number | null;
}

export interface AffiliateStats {
  clicks: number;
  sales: number;
  conversion: number;
  aEarned: number;
  /**
   * Commissions en FCFA (ventes externes Chariow / saisie administrateur).
   * ⚠️ Ne JAMAIS additionner avec `commissionA` : deux monnaies distinctes,
   * sans aucune conversion (décision propriétaire du 03/10/2026 — le constat
   * C4 de l'audit mélangeait les devises dans un même total).
   */
  commissionTotal: number;
  pending: number;
  payable: number;
  paid: number;
  /** Commissions gagnées en A (achats réglés avec la monnaie interne). */
  commissionA: number;
  /** Part des commissions A encore en attente (pending/validated). */
  aPending: number;
}

/** Objet `affiliate` du contrat (GET /api/affiliate/me). */
export interface PublicAffiliate {
  code: string;
  status: string;
  appliedAt: number;
  activatedAt: number;
  isSuper: boolean;
  stats: AffiliateStats;
}

/* ---------------------------------- Réglages ---------------------------------- */

/** Défauts du contrat (docs/chantier/05-contrat-api-phase2.md § Réglages). */
export const AFFILIATE_SETTING_DEFAULTS = {
  affiliate_min_sales: 0,
  super_min_sales: 10,
  super_min_clicks: 100,
  default_commission_percent: 30,
  default_reward_a: 50,
  /**
   * Vague 2 — récompenses copie/clic et anti-spam du partage (décisions
   * propriétaire). Ces clés sont ÉCRIVABLES via `POST /api/admin/settings` :
   * `isAffiliateSettingKey` les reconnaît (dérivé de ces défauts) et
   * `writeAffiliateSetting` les normalise (entier ≥ 0, sinon défaut).
   */
  reward_share_a: 5,
  reward_click_a: 1,
  share_max_per_day: 50,
  /**
   * Vague 4 — plafonds de liens (décisions propriétaire). Whitelistés
   * automatiquement (`isAffiliateSettingKey` dérive de ces défauts).
   *   max_active_links      : liens ACTIFS maximum pour un affilié normal (3) ;
   *   max_sales_per_link    : ventes maximum par lien avant saturation (20) ;
   *   super_max_active_links : plafond du Super-affilié — 0 = ILLIMITÉ (défaut).
   */
  max_active_links: 3,
  max_sales_per_link: 20,
  super_max_active_links: 0,
} as const;

export type AffiliateSettingKey = keyof typeof AFFILIATE_SETTING_DEFAULTS;

export const AFFILIATE_SETTING_KEYS = Object.keys(AFFILIATE_SETTING_DEFAULTS) as AffiliateSettingKey[];

/** Clé de réglage du secret du webhook Chariow — JAMAIS renvoyée en clair aux clients. */
export const CHARIOW_WEBHOOK_SECRET_KEY = "chariow_webhook_secret";

export interface AffiliateSettings {
  affiliateMinSales: number;
  superMinSales: number;
  superMinClicks: number;
  defaultCommissionPercent: number;
  defaultRewardA: number;
  /** A crédités par partage enregistré (défaut 5). */
  rewardShareA: number;
  /** A crédités par clic compté (défaut 1). */
  rewardClickA: number;
  /** Plafond de partages par jour (défaut 50). */
  shareMaxPerDay: number;
  /** Liens ACTIFS maximum pour un affilié normal (défaut 3). */
  maxActiveLinks: number;
  /** Ventes maximum par lien avant saturation automatique (défaut 20). */
  maxSalesPerLink: number;
  /** Plafond du Super-affilié (0 = illimité, défaut). */
  superMaxActiveLinks: number;
}

export function isAffiliateSettingKey(key: string): key is AffiliateSettingKey {
  return (AFFILIATE_SETTING_KEYS as string[]).includes(key);
}

/**
 * Normalise une valeur de réglage numérique : entier ≥ 0, sinon défaut du contrat.
 * Une clé ABSENTE ou vide (jamais écrite en base) donne bien le défaut — pas 0.
 */
export function normalizeAffiliateSetting(key: AffiliateSettingKey, raw: unknown): number {
  const fallback = AFFILIATE_SETTING_DEFAULTS[key];
  if (raw === null || raw === undefined) return fallback;
  const text = typeof raw === "string" ? raw.trim() : "";
  if (typeof raw === "string" && text === "") return fallback;
  const n = typeof raw === "number" ? raw : Number(text);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.trunc(n);
}

/** Réglages effectifs (défauts appliqués si la clé est absente ou invalide). */
export async function readAffiliateSettings(db: D1Database): Promise<AffiliateSettings> {
  const placeholders = AFFILIATE_SETTING_KEYS.map(() => "?").join(", ");
  const { results = [] } = await db
    .prepare(`SELECT key, value FROM settings WHERE key IN (${placeholders})`)
    .bind(...AFFILIATE_SETTING_KEYS)
    .all<{ key: string; value: string }>();
  const stored = new Map((results || []).map((r) => [r.key, r.value]));
  const read = (key: AffiliateSettingKey) => normalizeAffiliateSetting(key, stored.get(key));
  return {
    affiliateMinSales: read("affiliate_min_sales"),
    superMinSales: read("super_min_sales"),
    superMinClicks: read("super_min_clicks"),
    defaultCommissionPercent: read("default_commission_percent"),
    defaultRewardA: read("default_reward_a"),
    rewardShareA: read("reward_share_a"),
    rewardClickA: read("reward_click_a"),
    shareMaxPerDay: read("share_max_per_day"),
    maxActiveLinks: read("max_active_links"),
    maxSalesPerLink: read("max_sales_per_link"),
    superMaxActiveLinks: read("super_max_active_links"),
  };
}

/** Écrit un réglage whitelisté et renvoie la valeur normalisée réellement stockée. */
export async function writeAffiliateSetting(
  db: D1Database,
  key: AffiliateSettingKey,
  raw: unknown
): Promise<number> {
  const value = normalizeAffiliateSetting(key, raw);
  await setSetting(db, key, String(value));
  return value;
}

/** Secret du webhook Chariow (null si non configuré) — lecture serveur uniquement. */
export async function readChariowWebhookSecret(db: D1Database): Promise<string | null> {
  const value = await getSetting(db, CHARIOW_WEBHOOK_SECRET_KEY);
  const trimmed = (value ?? "").trim();
  return trimmed.length ? trimmed : null;
}

/* ------------------------------ Code affilié ------------------------------ */

/**
 * Alphabet SANS caractères ambigus (ni I, ni O, ni 0, ni 1) — le code est lu
 * et recopié par des humains.
 */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_SUFFIX_LENGTH = 4;
const CODE_MAX_ATTEMPTS = 8;
const CODE_BASE_MAX_LENGTH = 12;

function randomCodeSuffix(length: number = CODE_SUFFIX_LENGTH): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

/** Base du code dérivée du pseudo : majuscules alphanumériques, sans accents (ex. FLORIAN). */
export function sanitizeCodeBase(pseudo: string): string {
  const base = (pseudo || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, CODE_BASE_MAX_LENGTH);
  return base || "AFFILIE";
}

/** Code affilié `PSEUDO-XXXX` unique (majuscules, caractères non ambigus). */
export async function generateAffiliateCode(db: D1Database, pseudo: string): Promise<string> {
  const base = sanitizeCodeBase(pseudo);
  for (let i = 0; i < CODE_MAX_ATTEMPTS; i++) {
    const candidate = `${base}-${randomCodeSuffix()}`;
    const existing = await db
      .prepare("SELECT id FROM affiliates WHERE code = ?")
      .bind(candidate)
      .first<{ id: string }>();
    if (!existing) return candidate;
  }
  // Collision statistiquement improbable après 8 essais : on allonge le suffixe.
  return `${base}-${randomCodeSuffix(8)}`;
}

/** true si l'erreur est une violation de contrainte UNIQUE D1 (idempotence). */
export function isUniqueViolation(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /unique constraint failed/i.test(message);
}

/**
 * Nombre de lignes modifiées par un `D1Result` (utile aux UPDATE conditionnels).
 * Dupliqué depuis `commissions.ts` (dont le module importe déjà `affiliation` —
 * un import inverse créerait un cycle).
 */
function changesOf(result: unknown): number {
  const meta = (result as { meta?: { changes?: unknown } } | null)?.meta;
  const n = Number(meta?.changes ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/* ------------------------------- Affiliés (lecture) ------------------------------- */

export async function getAffiliateByUserId(db: D1Database, userId: string): Promise<AffiliateRow | null> {
  return (
    (await db.prepare("SELECT * FROM affiliates WHERE user_id = ?").bind(userId).first<AffiliateRow>()) ?? null
  );
}

export async function getAffiliateById(db: D1Database, id: string): Promise<AffiliateRow | null> {
  return (await db.prepare("SELECT * FROM affiliates WHERE id = ?").bind(id).first<AffiliateRow>()) ?? null;
}

export async function getAffiliateByCode(db: D1Database, code: string): Promise<AffiliateRow | null> {
  return (await db.prepare("SELECT * FROM affiliates WHERE code = ?").bind(code).first<AffiliateRow>()) ?? null;
}

export interface AffiliateWithUser extends AffiliateRow {
  pseudo: string;
  email: string;
  role: string;
}

const AFFILIATE_WITH_USER_SELECT = `
  SELECT a.id, a.user_id, a.code, a.status, a.note, a.applied_at, a.activated_at, a.updated_at,
         u.pseudo, u.email, u.role
  FROM affiliates a
  LEFT JOIN users u ON u.id = a.user_id
`;

export async function getAffiliateWithUserById(
  db: D1Database,
  id: string
): Promise<AffiliateWithUser | null> {
  const row = await db
    .prepare(`${AFFILIATE_WITH_USER_SELECT} WHERE a.id = ?`)
    .bind(id)
    .first<AffiliateWithUser>();
  return row ?? null;
}

/** Liste admin (filtre optionnel par statut), plus récents d'abord. */
export async function listAffiliatesAdmin(
  db: D1Database,
  status?: string | null
): Promise<AffiliateWithUser[]> {
  const order = " ORDER BY a.applied_at DESC, a.id DESC";
  const { results = [] } = status
    ? await db
        .prepare(`${AFFILIATE_WITH_USER_SELECT} WHERE a.status = ?${order}`)
        .bind(status)
        .all<AffiliateWithUser>()
    : await db.prepare(`${AFFILIATE_WITH_USER_SELECT}${order}`).all<AffiliateWithUser>();
  return results || [];
}

/**
 * Candidature : crée l'affilié `pending` avec un code généré serveur.
 * Lève une erreur UNIQUE si l'utilisateur a déjà candidaté (course) — la route
 * renvoie alors 409 comme pour une candidature déjà connue.
 */
export async function createAffiliate(
  db: D1Database,
  input: { userId: string; pseudo: string; note?: string | null; now?: number }
): Promise<AffiliateRow> {
  const now = input.now ?? Date.now();
  const row: AffiliateRow = {
    id: crypto.randomUUID(),
    user_id: input.userId,
    code: await generateAffiliateCode(db, input.pseudo),
    status: "pending",
    note: input.note?.trim() ? input.note.trim().slice(0, 500) : null,
    applied_at: now,
    activated_at: null,
    updated_at: now,
  };
  await db
    .prepare(
      `INSERT INTO affiliates (id, user_id, code, status, note, applied_at, activated_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(row.id, row.user_id, row.code, row.status, row.note, row.applied_at, null, row.updated_at)
    .run();
  return row;
}

/* ---------------------------------- Produits ---------------------------------- */

const PRODUCT_AFFILIATE_COLUMNS =
  "id, title, price, image_url, action_url, affiliate_enabled, commission_type, commission_value, reward_a";

/** Produits éligibles à l'affiliation (`affiliate_enabled = 1`). */
export async function listEligibleProducts(db: D1Database): Promise<AffiliateProductRow[]> {
  const { results = [] } = await db
    .prepare(
      `SELECT ${PRODUCT_AFFILIATE_COLUMNS} FROM products
       WHERE affiliate_enabled = 1 ORDER BY created_at DESC, rowid DESC`
    )
    .all<AffiliateProductRow>();
  return results || [];
}

export async function getProductById(db: D1Database, productId: string): Promise<AffiliateProductRow | null> {
  const row = await db
    .prepare(`SELECT ${PRODUCT_AFFILIATE_COLUMNS} FROM products WHERE id = ?`)
    .bind(productId)
    .first<AffiliateProductRow>();
  return row ?? null;
}

/**
 * Repli d'attribution produit pour le webhook : identifiant externe Chariow
 * (`sale.product.id`) puis titre exact (insensible à la casse). Aucun champ
 * n'est inventé : si rien ne correspond, on renvoie null.
 */
export async function findProductByExternalRef(
  db: D1Database,
  externalId: string | null,
  title: string | null
): Promise<AffiliateProductRow | null> {
  if (externalId) {
    const byId = await getProductById(db, externalId);
    if (byId) return byId;
  }
  if (title && title.trim()) {
    const byTitle = await db
      .prepare(`SELECT ${PRODUCT_AFFILIATE_COLUMNS} FROM products WHERE title = ? COLLATE NOCASE LIMIT 1`)
      .bind(title.trim())
      .first<AffiliateProductRow>();
    if (byTitle) return byTitle;
  }
  return null;
}

/* ------------------------------- Liens affiliés ------------------------------- */

/** Base publique des liens de redirection (page /r/ de l'export statique). */
export const AFFILIATE_LINK_BASE = "https://arsenal-tools.pages.dev/r";

export function linkUrl(code: string): string {
  return `${AFFILIATE_LINK_BASE}/${code}`;
}

/** Suffixe lisible du code de lien, dérivé du titre (repli : début de l'id produit). */
export function productLinkSuffix(product: { id: string; title: string }): string {
  const fromTitle = (product.title || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
  if (fromTitle) return fromTitle;
  return (product.id || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

export async function getAffiliateLink(
  db: D1Database,
  affiliateId: string,
  productId: string
): Promise<AffiliateLinkRow | null> {
  const row = await db
    .prepare("SELECT * FROM affiliate_links WHERE affiliate_id = ? AND product_id = ? LIMIT 1")
    .bind(affiliateId, productId)
    .first<AffiliateLinkRow>();
  return row ?? null;
}

export async function getAffiliateLinkByCode(db: D1Database, code: string): Promise<AffiliateLinkRow | null> {
  const row = await db
    .prepare("SELECT * FROM affiliate_links WHERE code = ?")
    .bind(code)
    .first<AffiliateLinkRow>();
  return row ?? null;
}

function insertLinkStatement(
  db: D1Database,
  link: AffiliateLinkRow
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO affiliate_links (id, affiliate_id, product_id, code, campaign_id, created_at, status, sales_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      link.id,
      link.affiliate_id,
      link.product_id,
      link.code,
      link.campaign_id,
      link.created_at,
      link.status,
      link.sales_count
    );
}

/** Normalise l'état d'un lien lu en base (défaut sûr : `active` si absente/inconnue). */
export function normalizeLinkStatus(raw: unknown): AffiliateLinkStatus {
  return typeof raw === "string" && (AFFILIATE_LINK_STATUSES as readonly string[]).includes(raw)
    ? (raw as AffiliateLinkStatus)
    : "active";
}

/**
 * Conserve la signature historique (régénération depuis la route `POST …/link`)
 * mais l'état du lien n'ôte plus l'éligibilité : un lien déjà existant est
 * renvoyé TEL QUEL (y compris `inactive`/`saturated`) — la RÉACTIVATION est un
 * acte volontaire distinct (`activateAffiliateLink`). Un lien nouvellement créé
 * naît `active` avec `sales_count = 0`.
 */
export async function getOrCreateAffiliateLink(
  db: D1Database,
  affiliate: AffiliateRow,
  product: { id: string; title: string },
  campaignId: string | null = null
): Promise<AffiliateLinkRow> {
  const existing = await getAffiliateLink(db, affiliate.id, product.id);
  if (existing) return existing;

  const base = `${affiliate.code}-${productLinkSuffix(product)}`.slice(0, 48);
  for (let attempt = 0; attempt < 4; attempt++) {
    const code = attempt === 0 ? base : `${base}-${randomCodeSuffix(3)}`;
    const link: AffiliateLinkRow = {
      id: crypto.randomUUID(),
      affiliate_id: affiliate.id,
      product_id: product.id,
      code,
      campaign_id: campaignId,
      created_at: Date.now(),
      status: "active",
      sales_count: 0,
    };
    try {
      await insertLinkStatement(db, link).run();
      return link;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // Collision : soit le lien existe déjà (course), soit le code est pris par un autre lien.
      const byCode = await getAffiliateLinkByCode(db, code);
      if (byCode && byCode.affiliate_id === affiliate.id && byCode.product_id === product.id) return byCode;
      const raced = await getAffiliateLink(db, affiliate.id, product.id);
      if (raced) return raced;
    }
  }
  throw new Error("Impossible de générer un code de lien affilié unique.");
}

/* ------------------- Plafonds et état des liens (vague 4) ------------------- */

/**
 * DEUX CATÉGORIES DE LIENS, DEUX COMPTEURS (décision propriétaire du 03/10/2026) :
 *
 *  • lien « normal » — un produit promu à l'initiative de l'affilié. Il consomme
 *    le plafond `max_active_links` (3 par défaut).
 *  • lien « de campagne » — un produit que l'affilié promeut parce qu'il
 *    PARTICIPE à une campagne (`campaign_participants`). Ces liens sont **HORS
 *    PLAFOND** : un affilié avec 3 liens normaux + 2 campagnes a bien 5 liens
 *    actifs, sans jamais être bloqué.
 *
 * Le plafond de VENTES PAR LIEN (`max_sales_per_link`, 20) s'applique en
 * revanche **aux deux** catégories : une campagne double le nombre de liens,
 * pas le rendement de chacun.
 *
 * L'appartenance à une campagne est lue en direct depuis `campaign_participants`
 * (source de vérité) : rejoindre/quitter une campagne reclasse automatiquement
 * tous les liens de ses produits, sans migration ni risque de désynchronisation.
 */

/** Ids des campagnes auxquelles l'affilié participe (source de vérité). */
export async function readParticipatingCampaignIds(
  db: D1Database,
  affiliateId: string
): Promise<string[]> {
  try {
    const { results = [] } = await db
      .prepare("SELECT campaign_id FROM campaign_participants WHERE affiliate_id = ?")
      .bind(affiliateId)
      .all<{ campaign_id: string }>();
    return (results || []).map((r) => r.campaign_id).filter(Boolean);
  } catch {
    return []; // table absente : aucun lien de campagne (repli sûr)
  }
}

/**
 * Répartit les liens ACTIFS d'un affilié entre « campagne » et « normaux ».
 * Un lien dont le PRODUIT est visé par une campagne rejointe est un lien de
 * campagne, même si `campaign_id` n'a pas été renseigné à la création.
 */
export async function countActiveLinksByKind(
  db: D1Database,
  affiliateId: string
): Promise<{ campaign: number; normal: number; total: number }> {
  const campaignIds = await readParticipatingCampaignIds(db, affiliateId);
  let campaignProducts = new Set<string>();
  if (campaignIds.length) {
    const placeholders = campaignIds.map(() => "?").join(", ");
    try {
      const { results = [] } = await db
        .prepare(`SELECT DISTINCT product_id FROM campaigns WHERE id IN (${placeholders})`)
        .bind(...campaignIds)
        .all<{ product_id: string }>();
      campaignProducts = new Set((results || []).map((r) => r.product_id).filter(Boolean));
    } catch {
      /* lecture impossible : aucun lien classé « campagne » */
    }
  }
  const links = await listActiveLinks(db, affiliateId);
  let campaign = 0;
  for (const l of links) {
    // Campagne rejointe (par produit) OU lien créé explicitement pour une campagne.
    if (campaignProducts.has(l.product_id) || (l.campaign_id && campaignIds.includes(l.campaign_id))) {
      campaign++;
    }
  }
  return { campaign, normal: links.length - campaign, total: links.length };
}

/**
 * Nombre de liens ACTIFS **hors campagne** d'un affilié — c'est CE chiffre qui
 * est comparé à `max_active_links` (les liens de campagne ne consomment rien).
 */
export async function countActiveLinks(db: D1Database, affiliateId: string): Promise<number> {
  return (await countActiveLinksByKind(db, affiliateId)).normal;
}

/** Liens ACTIFS d'un affilié (sert la liste de choix en cas de plafond atteint). */
export async function listActiveLinks(db: D1Database, affiliateId: string): Promise<AffiliateLinkRow[]> {
  const { results = [] } = await db
    .prepare(
      `SELECT * FROM affiliate_links WHERE affiliate_id = ? AND status = 'active'
        ORDER BY created_at ASC, id ASC`
    )
    .bind(affiliateId)
    .all<AffiliateLinkRow>();
  return results || [];
}

/** Liens (tous états) de plusieurs produits pour un affilié — lecture de la liste produits. */
export async function listLinksByAffiliate(
  db: D1Database,
  affiliateId: string
): Promise<AffiliateLinkRow[]> {
  const { results = [] } = await db
    .prepare("SELECT * FROM affiliate_links WHERE affiliate_id = ?")
    .bind(affiliateId)
    .all<AffiliateLinkRow>();
  return results || [];
}

/**
 * Plafonds EFFECTIFS d'un affilié. `maxActiveLinks` vaut le plafond Super (0 =
 * illimité) pour un Super-affilié, sinon le plafond normal. `isSuper` est décidé
 * par l'appelant (rôle ou seuils — voir `isSuperAffiliate`).
 */
export interface AffiliateLimits {
  /** Liens actifs HORS campagne — seuls comparés au plafond. */
  activeCount: number;
  /** Liens actifs issus de campagnes rejointes : hors plafond. */
  campaignCount?: number;
  /** Plafond de liens actifs effectif (0 = illimité, cas Super). */
  maxActiveLinks: number;
  /** Plafond de ventes par lien avant saturation. */
  maxSalesPerLink: number;
  /** L'affilié est-il Super (donc sans plafond de liens) ? */
  isSuper: boolean;
}

export function effectiveLimits(
  settings: AffiliateSettings,
  isSuper: boolean,
  activeCount: number
): AffiliateLimits {
  const max = isSuper ? settings.superMaxActiveLinks : settings.maxActiveLinks;
  return {
    activeCount,
    maxActiveLinks: Math.max(0, Math.trunc(max)),
    maxSalesPerLink: Math.max(0, Math.trunc(settings.maxSalesPerLink)),
    isSuper,
  };
}

/**
 * true si l'affilié peut encore activer un lien.
 * `campaignExempt` = le lien visé relève d'une campagne REJOINTE : il ne
 * consomme pas le plafond (règle propriétaire du 03/10/2026), donc l'activation
 * est toujours permise — même à 3 liens normaux actifs.
 */
export function canActivateMoreLinks(limits: AffiliateLimits, campaignExempt = false): boolean {
  if (campaignExempt) return true;
  if (limits.maxActiveLinks === 0) return true; // 0 = illimité (Super)
  return limits.activeCount < limits.maxActiveLinks;
}

/** Résultat d'une tentative d'activation : le lien + si un emplacement reste libre. */
export interface ActivationOutcome {
  ok: boolean;
  /** Lien concerné (existant ou créé) si l'activation a pu se faire. */
  link: AffiliateLinkRow | null;
  /** Raison du refus (`idempotent` = déjà actif ; `limit` = plafond atteint). */
  reason?: "idempotent" | "limit";
  limits: AffiliateLimits;
  /** Liens actifs, renvoyés en cas de plafond atteint pour proposer un choix. */
  activeLinks: AffiliateLinkRow[];
}

/**
 * Active (ou réactive) le lien d'un couple (affilié, produit). Décision SERVEUR :
 * le front ne choisit jamais à la place du serveur.
 *  1. un lien déjà `active` → idempotent (on renvoie l'existant, aucun décompte) ;
 *  2. sinon, si le plafond de liens ACTIFS est atteint (et non Super) → refus
 *     `limit` avec la liste des liens actifs (le front propose : désactiver lequel
 *     ou abandonner) ;
 *  3. sinon on (re)met le lien en `active` (créé s'il n'existe pas encore).
 * Le compteur de ventes (`sales_count`) n'est PAS remis à zéro à la réactivation :
 * les ventes déjà acquises restent comptées (décision propriétaire).
 */
export async function activateAffiliateLink(
  db: D1Database,
  affiliate: AffiliateRow,
  product: { id: string; title: string },
  limits: AffiliateLimits
): Promise<ActivationOutcome> {
  const existing = await getAffiliateLink(db, affiliate.id, product.id);
  if (existing && normalizeLinkStatus(existing.status) === "active") {
    return { ok: true, link: existing, reason: "idempotent", limits, activeLinks: [] };
  }
  // Ce produit relève-t-il d'une campagne que l'affilié a REJOINTE ? Si oui, le
  // lien est HORS PLAFOND et peut toujours être activé (règle propriétaire).
  const campaignIds = await readParticipatingCampaignIds(db, affiliate.id);
  let campaignExempt = false;
  if (campaignIds.length) {
    const placeholders = campaignIds.map(() => "?").join(", ");
    try {
      const row = await db
        .prepare(
          `SELECT 1 AS ok FROM campaigns WHERE product_id = ? AND id IN (${placeholders}) LIMIT 1`
        )
        .bind(product.id, ...campaignIds)
        .first<{ ok: number }>();
      campaignExempt = Boolean(row);
    } catch {
      /* lecture impossible : on retombe sur la règle normale */
    }
  }
  if (!canActivateMoreLinks(limits, campaignExempt)) {
    return {
      ok: false,
      link: null,
      reason: "limit",
      limits,
      activeLinks: await listActiveLinks(db, affiliate.id),
    };
  }

  // Lien existant → réactivation ; sinon création (idempotente par UNIQUE(code)).
  if (existing) {
    await db
      .prepare("UPDATE affiliate_links SET status = 'active' WHERE id = ? AND status != 'active'")
      .bind(existing.id)
      .run();
    const refreshed = (await getAffiliateLink(db, affiliate.id, product.id)) ?? existing;
    return { ok: true, link: refreshed, limits, activeLinks: [] };
  }
  const link = await getOrCreateAffiliateLink(db, affiliate, product);
  return { ok: true, link, limits, activeLinks: [] };
}

/**
 * Désactive un lien (passe en `inactive`) — libère un emplacement.
 * La PROPRIÉTÉ est vérifiée par l'appelant ; ici on garantit seulement qu'on ne
 * touche jamais à un lien déjà `saturated` (son état porte une information).
 */
export async function deactivateAffiliateLink(db: D1Database, linkId: string): Promise<boolean> {
  const res = await db
    .prepare("UPDATE affiliate_links SET status = 'inactive' WHERE id = ? AND status = 'active'")
    .bind(linkId)
    .run();
  return changesOf(res) > 0;
}

export interface AffiliateLinkTarget {
  link: AffiliateLinkRow;
  affiliate: AffiliateRow;
  product: AffiliateProductRow;
}

/** Résout un code de lien public → lien + affilié + produit (null si inconnu). */
export async function resolveLinkTarget(
  db: D1Database,
  code: string
): Promise<AffiliateLinkTarget | null> {
  const link = await getAffiliateLinkByCode(db, code);
  if (!link) return null;
  const [affiliate, product] = await Promise.all([
    getAffiliateById(db, link.affiliate_id),
    getProductById(db, link.product_id),
  ]);
  if (!affiliate || !product) return null;
  return { link, affiliate, product };
}

/* ------------------------------- Clics (tracking) ------------------------------- */

/** Au plus 1 clic compté par (lien, visiteur) sur cette fenêtre. */
export const CLICK_DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Empreinte visiteur : `sha256(ip + user-agent + jour)`.
 * L'IP brute et le user-agent ne sont JAMAIS stockés.
 */
/**
 * Empreinte de suivi DURABLE (PONT DE TRACKING, vague 2) — volontairement
 * SANS le jour, contrairement à `visitorHashOf` :
 *
 *  • `visitorHashOf` (sha256(ip+ua+JOUR)) sert à DÉDUPLIQUER les clics : il DOIT
 *    changer chaque jour, sinon un même visiteur ne compterait qu'un clic à vie.
 *  • Le suivi d'un parcours, lui, doit reconnaître le MÊME visiteur plusieurs
 *    jours de suite (fenêtre 30 j) — sinon « dernier toucher » ne relie pas
 *    deux visites à J et J+1 (défaut constaté le 03/10/2026).
 *
 * Même nature et mêmes garanties que l'autre : l'IP BRUTE n'est jamais stockée,
 * seules l'IP et l'empreinte du navigateur entrent dans le calcul, salées par un
 * préfixe distinct pour qu'on ne puisse pas corréler les deux usages.
 */
export function trackingVisitorHash(ip: string | undefined | null, userAgent: string | undefined | null): string {
  return sha256hex(`track|${ip || "unknown"}|${userAgent || "unknown"}`);
}

export function visitorHashOf(
  ip: string | undefined | null,
  userAgent: string | undefined | null,
  now: number = Date.now()
): string {
  const day = new Date(now).toISOString().slice(0, 10);
  return sha256hex(`${ip || "unknown"}|${userAgent || "unknown"}|${day}`);
}

export async function hasRecentClick(
  db: D1Database,
  linkId: string,
  visitorHash: string,
  now: number = Date.now()
): Promise<boolean> {
  const row = await db
    .prepare("SELECT id FROM click_events WHERE link_id = ? AND visitor_hash = ? AND ts > ? LIMIT 1")
    .bind(linkId, visitorHash, now - CLICK_DEDUP_WINDOW_MS)
    .first<{ id: string }>();
  return Boolean(row);
}

/** Borne de `recent_visits` (miroir de RECENT_VISITS_MAX de store.ts). */
const RECENT_VISITS_MAX = 500;

/**
 * Écrit le clic ET le compteur global `clicks_by_product` dans le MÊME batch
 * (SQL miroir de store.incrementClick, dupliqué ici pour rester atomique avec
 * l'insertion du clic affilié).
 */
export function clickEventStatements(
  db: D1Database,
  input: { link: AffiliateLinkRow; visitorHash: string; now?: number; clickId?: string }
): D1PreparedStatement[] {
  const now = input.now ?? Date.now();
  return [
    db
      .prepare(
        `INSERT INTO click_events (id, link_id, affiliate_id, product_id, campaign_id, ts, visitor_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        input.clickId ?? crypto.randomUUID(),
        input.link.id,
        input.link.affiliate_id,
        input.link.product_id,
        input.link.campaign_id,
        now,
        input.visitorHash
      ),
    db
      .prepare(
        "INSERT INTO clicks_by_product (product_id, clicks) VALUES (?, 1) ON CONFLICT(product_id) DO UPDATE SET clicks = clicks + 1"
      )
      .bind(input.link.product_id),
    db.prepare(
      "INSERT INTO analytics_counters (key, value) VALUES ('actions_total', 1) ON CONFLICT(key) DO UPDATE SET value = value + 1"
    ),
    db
      .prepare(
        "INSERT INTO analytics_counters (key, value) VALUES ('updated_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
      )
      .bind(now),
    db.prepare("INSERT OR REPLACE INTO recent_visits (ts) VALUES (?)").bind(now),
    db
      .prepare(
        "DELETE FROM recent_visits WHERE ts NOT IN (SELECT ts FROM recent_visits ORDER BY ts DESC LIMIT ?)"
      )
      .bind(RECENT_VISITS_MAX),
  ];
}

/**
 * Enregistre un clic affilié (dédup 24 h par lien + empreinte visiteur).
 * Retourne true si le clic a été compté, false s'il a été dédupliqué.
 */
export async function recordAffiliateClick(
  db: D1Database,
  input: { link: AffiliateLinkRow; visitorHash: string; now?: number }
): Promise<boolean> {
  return (await recordAffiliateClickId(db, input)) !== null;
}

/**
 * Variante qui retourne l'ID du clic compté (null si dédupliqué) : cet id est
 * la clé d'idempotence du crédit de récompense de clic (`click:<id>`) — la
 * récompense est ainsi liée AU CLIC COMPTÉ, jamais à une requête client.
 * Un clic dédupliqué (même lien + même empreinte sous 24 h) ne crédite RIEN :
 * c'est la garde anti-abus de la route publique.
 */
export async function recordAffiliateClickId(
  db: D1Database,
  input: { link: AffiliateLinkRow; visitorHash: string; now?: number }
): Promise<string | null> {
  const now = input.now ?? Date.now();
  if (await hasRecentClick(db, input.link.id, input.visitorHash, now)) return null;
  const clickId = crypto.randomUUID();
  await db.batch(
    clickEventStatements(db, { link: input.link, visitorHash: input.visitorHash, now, clickId })
  );
  return clickId;
}

/* ------------------------------ Partage (vague 2) ------------------------------ */
/*
 * Récompense de PARTAGE (copie d'un lien) : un partage n'existe que s'il est
 * ENREGISTRÉ côté serveur (route `POST /api/me/share`). La limite anti-spam
 * (50/jour par défaut, réglage `share_max_per_day`) se compte ICI, sur les
 * `share_events` du jour — avant d'enregistrer, pour refuser sans rien créditer.
 */

/** Début du jour UTC (minuit) contenant `now` — même découpage que `visitorHashOf`. */
export function startOfUtcDay(now: number = Date.now()): number {
  return Date.parse(`${new Date(now).toISOString().slice(0, 10)}T00:00:00.000Z`);
}

/** Nombre de partages enregistrés par cet utilisateur depuis `since` (inclus). */
export async function countSharesSince(
  db: D1Database,
  userId: string,
  since: number
): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM share_events WHERE user_id = ? AND created_at >= ?")
    .bind(userId, Math.trunc(since))
    .first<{ n: number }>();
  return Math.trunc(Number(row?.n) || 0);
}

/** Nombre de partages enregistrés aujourd'hui (jour UTC) par cet utilisateur. */
export async function countSharesToday(db: D1Database, userId: string, now: number = Date.now()): Promise<number> {
  return countSharesSince(db, userId, startOfUtcDay(now));
}

export interface ShareEventInput {
  affiliateId: string;
  userId: string;
  linkId?: string | null;
  productId?: string | null;
  now?: number;
}

/** Ligne `share_events` créée pour un partage enregistré (l'id est la clé d'idempotence du crédit). */
export interface ShareEvent {
  id: string;
  affiliateId: string;
  userId: string;
  createdAt: number;
}

/**
 * INSERT de `share_events` prêt pour un db.batch. L'`id` retourné sert de clé
 * d'idempotence au crédit (`share:<id>`) : un même partage ne crédite qu'une fois.
 */
export function shareEventStatement(
  db: D1Database,
  input: ShareEventInput
): { event: ShareEvent; statement: D1PreparedStatement } {
  const now = input.now ?? Date.now();
  const event: ShareEvent = {
    id: crypto.randomUUID(),
    affiliateId: input.affiliateId,
    userId: input.userId,
    createdAt: now,
  };
  const statement = db
    .prepare(
      `INSERT INTO share_events (id, affiliate_id, user_id, link_id, product_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      event.id,
      event.affiliateId,
      event.userId,
      input.linkId ?? null,
      input.productId ?? null,
      event.createdAt
    );
  return { event, statement };
}

/* -------------------------------- Statistiques -------------------------------- */

/** Arrondi à 2 décimales (montants et taux du contrat). */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function conversionRate(sales: number, clicks: number): number {
  if (clicks <= 0) return 0;
  return round2((sales / clicks) * 100);
}

interface CommissionTotals {
  pending: number;
  payable: number;
  paid: number;
  total: number;
}

/** Totaux des commissions libellées en A (monnaie interne) — jamais mélangés aux FCFA. */
interface CommissionTotalsA {
  pending: number;
  total: number;
}

function emptyCommissionTotals(): CommissionTotals {
  return { pending: 0, payable: 0, paid: 0, total: 0 };
}

function emptyCommissionTotalsA(): CommissionTotalsA {
  return { pending: 0, total: 0 };
}

/** Agrège les commissions par état (les `cancelled` sont exclues des montants). */
function addCommissionState(totals: CommissionTotals, state: string, amount: number): void {
  if (state === "cancelled") return;
  totals.total = round2(totals.total + amount);
  if (state === "pending" || state === "validated") totals.pending = round2(totals.pending + amount);
  else if (state === "payable") totals.payable = round2(totals.payable + amount);
  else if (state === "paid") totals.paid = round2(totals.paid + amount);
}

/** Même agrégation, restreinte aux commissions en A (pas de payable/paid : la monnaie A n'est pas « versée »). */
function addCommissionStateA(totals: CommissionTotalsA, state: string, amount: number): void {
  if (state === "cancelled") return;
  totals.total = round2(totals.total + amount);
  if (state === "pending" || state === "validated") totals.pending = round2(totals.pending + amount);
}

function buildStats(
  clicks: number,
  sales: number,
  aEarned: number,
  totals: CommissionTotals,
  totalsA: CommissionTotalsA = emptyCommissionTotalsA()
): AffiliateStats {
  return {
    clicks,
    sales,
    conversion: conversionRate(sales, clicks),
    aEarned: Math.trunc(aEarned),
    commissionTotal: totals.total,
    pending: totals.pending,
    payable: totals.payable,
    paid: totals.paid,
    commissionA: totalsA.total,
    aPending: totalsA.pending,
  };
}

/** Statistiques d'un affilié (toutes recalculées serveur). */
export async function computeAffiliateStats(
  db: D1Database,
  affiliate: AffiliateRow
): Promise<AffiliateStats> {
  const [clicksRow, salesRow, rewardRow, commissionRows] = await Promise.all([
    db
      .prepare("SELECT COUNT(*) AS n FROM click_events WHERE affiliate_id = ?")
      .bind(affiliate.id)
      .first<{ n: number }>(),
    db
      .prepare("SELECT COUNT(*) AS n FROM sales WHERE affiliate_id = ? AND state = 'confirmed'")
      .bind(affiliate.id)
      .first<{ n: number }>(),
    db
      .prepare("SELECT COALESCE(SUM(delta), 0) AS total FROM a_transactions WHERE user_id = ? AND type = 'reward'")
      .bind(affiliate.user_id)
      .first<{ total: number }>(),
    db
      .prepare(
        "SELECT state, currency, COALESCE(SUM(amount), 0) AS total FROM commissions WHERE affiliate_id = ? GROUP BY state, currency"
      )
      .bind(affiliate.id)
      .all<{ state: string; currency: string | null; total: number }>(),
  ]);

  // Deux monnaies, deux totaux : les commissions en A (monnaie interne) ne sont
  // JAMAIS additionnées aux FCFA (décision propriétaire — aucun cumul, aucune
  // conversion). Une devise absente/illisible compte comme FCFA (défaut du schéma).
  const totals = emptyCommissionTotals();
  const totalsA = emptyCommissionTotalsA();
  for (const row of commissionRows.results || []) {
    const amount = Number(row.total) || 0;
    if (String(row.currency ?? "").toUpperCase() === "A") {
      addCommissionStateA(totalsA, row.state, amount);
    } else {
      addCommissionState(totals, row.state, amount);
    }
  }
  return buildStats(
    Math.trunc(Number(clicksRow?.n ?? 0)),
    Math.trunc(Number(salesRow?.n ?? 0)),
    Number(rewardRow?.total ?? 0),
    totals,
    totalsA
  );
}

/** Statistiques de plusieurs affiliés en 4 requêtes agrégées (écran admin). */
export async function affiliateStatsMap(
  db: D1Database,
  affiliates: AffiliateRow[]
): Promise<Map<string, AffiliateStats>> {
  const map = new Map<string, AffiliateStats>();
  if (!affiliates.length) return map;

  const ids = affiliates.map((a) => a.id);
  const userIds = affiliates.map((a) => a.user_id);
  const idPlaceholders = ids.map(() => "?").join(", ");
  const userPlaceholders = userIds.map(() => "?").join(", ");

  const [clicksRes, salesRes, rewardRes, commissionRes] = await Promise.all([
    db
      .prepare(`SELECT affiliate_id, COUNT(*) AS n FROM click_events WHERE affiliate_id IN (${idPlaceholders}) GROUP BY affiliate_id`)
      .bind(...ids)
      .all<{ affiliate_id: string; n: number }>(),
    db
      .prepare(
        `SELECT affiliate_id, COUNT(*) AS n FROM sales WHERE state = 'confirmed' AND affiliate_id IN (${idPlaceholders}) GROUP BY affiliate_id`
      )
      .bind(...ids)
      .all<{ affiliate_id: string; n: number }>(),
    db
      .prepare(
        `SELECT user_id, COALESCE(SUM(delta), 0) AS total FROM a_transactions WHERE type = 'reward' AND user_id IN (${userPlaceholders}) GROUP BY user_id`
      )
      .bind(...userIds)
      .all<{ user_id: string; total: number }>(),
    db
      .prepare(
        `SELECT affiliate_id, state, currency, COALESCE(SUM(amount), 0) AS total FROM commissions WHERE affiliate_id IN (${idPlaceholders}) GROUP BY affiliate_id, state, currency`
      )
      .bind(...ids)
      .all<{ affiliate_id: string; state: string; currency: string | null; total: number }>(),
  ]);

  const clicks = new Map<string, number>();
  for (const row of clicksRes.results || []) clicks.set(row.affiliate_id, Math.trunc(Number(row.n) || 0));
  const sales = new Map<string, number>();
  for (const row of salesRes.results || []) sales.set(row.affiliate_id, Math.trunc(Number(row.n) || 0));
  const rewards = new Map<string, number>();
  for (const row of rewardRes.results || []) rewards.set(row.user_id, Number(row.total) || 0);
  // Deux devises séparées : A (monnaie interne) et FCFA — jamais additionnées.
  const totals = new Map<string, CommissionTotals>();
  const totalsA = new Map<string, CommissionTotalsA>();
  for (const row of commissionRes.results || []) {
    const amount = Number(row.total) || 0;
    if (String(row.currency ?? "").toUpperCase() === "A") {
      const currentA = totalsA.get(row.affiliate_id) ?? emptyCommissionTotalsA();
      addCommissionStateA(currentA, row.state, amount);
      totalsA.set(row.affiliate_id, currentA);
    } else {
      const current = totals.get(row.affiliate_id) ?? emptyCommissionTotals();
      addCommissionState(current, row.state, amount);
      totals.set(row.affiliate_id, current);
    }
  }

  for (const affiliate of affiliates) {
    map.set(
      affiliate.id,
      buildStats(
        clicks.get(affiliate.id) ?? 0,
        sales.get(affiliate.id) ?? 0,
        rewards.get(affiliate.user_id) ?? 0,
        totals.get(affiliate.id) ?? emptyCommissionTotals(),
        totalsA.get(affiliate.id) ?? emptyCommissionTotalsA()
      )
    );
  }
  return map;
}

/** Performance par produit d'un affilié (clics, ventes confirmées, conversion). */
export async function productPerformanceMap(
  db: D1Database,
  affiliateId: string
): Promise<Map<string, AffiliateStats>> {
  const [clicksRes, salesRes] = await Promise.all([
    db
      .prepare("SELECT product_id, COUNT(*) AS n FROM click_events WHERE affiliate_id = ? GROUP BY product_id")
      .bind(affiliateId)
      .all<{ product_id: string; n: number }>(),
    db
      .prepare(
        "SELECT product_id, COUNT(*) AS n FROM sales WHERE affiliate_id = ? AND state = 'confirmed' GROUP BY product_id"
      )
      .bind(affiliateId)
      .all<{ product_id: string; n: number }>(),
  ]);

  const clicks = new Map<string, number>();
  for (const row of clicksRes.results || []) clicks.set(row.product_id, Math.trunc(Number(row.n) || 0));
  const sales = new Map<string, number>();
  for (const row of salesRes.results || []) sales.set(row.product_id, Math.trunc(Number(row.n) || 0));

  const map = new Map<string, AffiliateStats>();
  for (const productId of new Set([...clicks.keys(), ...sales.keys()])) {
    const c = clicks.get(productId) ?? 0;
    const s = sales.get(productId) ?? 0;
    map.set(productId, buildStats(c, s, 0, emptyCommissionTotals()));
  }
  return map;
}

/* --------------------------------- Sérialisation --------------------------------- */

/**
 * Statut Super Affilié (Phase 2 : lecture seule — la promotion elle-même
 * relève de la Phase 3). Le rôle prime ; sinon les seuils des réglages
 * `super_min_sales` ET `super_min_clicks` doivent être atteints.
 */
export function isSuperAffiliate(
  role: string | null | undefined,
  stats: AffiliateStats,
  settings: AffiliateSettings
): boolean {
  if (role === "super_affiliate") return true;
  return stats.sales >= settings.superMinSales && stats.clicks >= settings.superMinClicks;
}

/** Objet `affiliate` du contrat GET /api/affiliate/me. */
export function toPublicAffiliate(
  affiliate: AffiliateRow,
  stats: AffiliateStats,
  isSuper: boolean
): PublicAffiliate {
  return {
    code: affiliate.code,
    status: affiliate.status,
    appliedAt: Number(affiliate.applied_at ?? 0),
    activatedAt: affiliate.activated_at != null ? Number(affiliate.activated_at) : 0,
    isSuper,
    stats,
  };
}
