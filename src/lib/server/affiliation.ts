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

export type AffiliateStatus = "pending" | "active" | "suspended";
export const AFFILIATE_STATUSES: readonly AffiliateStatus[] = ["pending", "active", "suspended"];

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

export interface AffiliateLinkRow {
  id: string;
  affiliate_id: string;
  product_id: string;
  code: string;
  campaign_id: string | null;
  created_at: number;
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
  commissionTotal: number;
  pending: number;
  payable: number;
  paid: number;
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
      `INSERT INTO affiliate_links (id, affiliate_id, product_id, code, campaign_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(link.id, link.affiliate_id, link.product_id, link.code, link.campaign_id, link.created_at);
}

/**
 * Lien d'un couple (affilié, produit) — idempotent : le code est déterministe
 * (`CODE-AFFILIE-PRODUIT`), donc la contrainte UNIQUE(code) suffit à empêcher
 * les doublons même sous concurrence ; on relit la ligne en cas de collision.
 * En cas de collision avec un AUTRE produit (titres identiques), un suffixe
 * aléatoire est ajouté.
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
  input: { link: AffiliateLinkRow; visitorHash: string; now?: number }
): D1PreparedStatement[] {
  const now = input.now ?? Date.now();
  return [
    db
      .prepare(
        `INSERT INTO click_events (id, link_id, affiliate_id, product_id, campaign_id, ts, visitor_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        crypto.randomUUID(),
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
  const now = input.now ?? Date.now();
  if (await hasRecentClick(db, input.link.id, input.visitorHash, now)) return false;
  await db.batch(clickEventStatements(db, { link: input.link, visitorHash: input.visitorHash, now }));
  return true;
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

function emptyCommissionTotals(): CommissionTotals {
  return { pending: 0, payable: 0, paid: 0, total: 0 };
}

/** Agrège les commissions par état (les `cancelled` sont exclues des montants). */
function addCommissionState(totals: CommissionTotals, state: string, amount: number): void {
  if (state === "cancelled") return;
  totals.total = round2(totals.total + amount);
  if (state === "pending" || state === "validated") totals.pending = round2(totals.pending + amount);
  else if (state === "payable") totals.payable = round2(totals.payable + amount);
  else if (state === "paid") totals.paid = round2(totals.paid + amount);
}

function buildStats(
  clicks: number,
  sales: number,
  aEarned: number,
  totals: CommissionTotals
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
      .prepare("SELECT state, COALESCE(SUM(amount), 0) AS total FROM commissions WHERE affiliate_id = ? GROUP BY state")
      .bind(affiliate.id)
      .all<{ state: string; total: number }>(),
  ]);

  const totals = emptyCommissionTotals();
  for (const row of commissionRows.results || []) {
    addCommissionState(totals, row.state, Number(row.total) || 0);
  }
  return buildStats(
    Math.trunc(Number(clicksRow?.n ?? 0)),
    Math.trunc(Number(salesRow?.n ?? 0)),
    Number(rewardRow?.total ?? 0),
    totals
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
        `SELECT affiliate_id, state, COALESCE(SUM(amount), 0) AS total FROM commissions WHERE affiliate_id IN (${idPlaceholders}) GROUP BY affiliate_id, state`
      )
      .bind(...ids)
      .all<{ affiliate_id: string; state: string; total: number }>(),
  ]);

  const clicks = new Map<string, number>();
  for (const row of clicksRes.results || []) clicks.set(row.affiliate_id, Math.trunc(Number(row.n) || 0));
  const sales = new Map<string, number>();
  for (const row of salesRes.results || []) sales.set(row.affiliate_id, Math.trunc(Number(row.n) || 0));
  const rewards = new Map<string, number>();
  for (const row of rewardRes.results || []) rewards.set(row.user_id, Number(row.total) || 0);
  const totals = new Map<string, CommissionTotals>();
  for (const row of commissionRes.results || []) {
    const current = totals.get(row.affiliate_id) ?? emptyCommissionTotals();
    addCommissionState(current, row.state, Number(row.total) || 0);
    totals.set(row.affiliate_id, current);
  }

  for (const affiliate of affiliates) {
    map.set(
      affiliate.id,
      buildStats(
        clicks.get(affiliate.id) ?? 0,
        sales.get(affiliate.id) ?? 0,
        rewards.get(affiliate.user_id) ?? 0,
        totals.get(affiliate.id) ?? emptyCommissionTotals()
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
