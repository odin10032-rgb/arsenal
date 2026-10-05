/**
 * Arsenal Tools — couche API « affilié » (contrat figé : docs/chantier/05-contrat-api-phase2.md)
 *
 * Toutes les routes sont en Bearer (session utilisateur, lib/user-auth.ts)
 * SAUF le tracking d'un clic, route publique.
 *
 * Règle : aucun montant, statut ou solde n'est calculé ici — les valeurs affichées
 * viennent toujours de l'API. Les normalisations se contentent de rendre les
 * agrégats absents inoffensifs (0) et de tolérer les deux formes de réponse
 * d'un lien (`"https://…"` ou `{ link, linkCode }`).
 */

import { ApiError, apiFetch } from "./api";

/* ---------- Types du contrat ---------- */

/**
 * Statuts du CONTRAT admin (Phase 2) : pending | active | suspended. Conservé
 * tel quel car l'écran admin (`affiliates-tab`) s'y indexe. Les deux états de
 * sortie de la vague 4 (`rejected`, `withdrawn`) ne concernent que l'AFFILIÉ
 * lui-même → voir `AffiliateAccountStatus`.
 */
export type AffiliateStatus = "pending" | "active" | "suspended";

/**
 * Statut réel du dossier d'affiliation côté affilié (vague 4) : ajoute
 * `rejected` (candidature refusée) et `withdrawn` (retrait volontaire).
 */
export type AffiliateAccountStatus = AffiliateStatus | "rejected" | "withdrawn";

/** État d'un lien affilié (vague 4) : actif, désactivé, ou saturé (plafond de ventes). */
export type AffiliateLinkStatus = "active" | "inactive" | "saturated";

/** Plafonds effectifs d'un affilié (GET /api/affiliate/me/products → `limits`). */
export interface AffiliateLimits {
  /** Plafond de liens ACTIFS (0 = illimité, cas Super-affilié). */
  maxActiveLinks: number;
  /** Plafond de ventes par lien avant saturation. */
  maxSalesPerLink: number;
  /** Nombre de liens actifs HORS campagne (seuls comparés au plafond). */
  activeCount: number;
  /**
   * Liens actifs issus de CAMPAGNES rejointes — HORS PLAFOND (décision
   * propriétaire 03/10/2026) : 3 liens normaux + 2 campagnes = 5 liens actifs.
   */
  campaignCount?: number;
  /** L'affilié est-il Super (donc sans plafond de liens) ? */
  isSuper: boolean;
}

export type CommissionType = "percent" | "fixed";

/** Statistiques d'un affilié — champ `stats` de GET /api/affiliate/me */
export interface AffiliateStats {
  /** Clics enregistrés (dédupliqués par visiteur/jour côté serveur) */
  clicks: number;
  /** Ventes attribuées */
  sales: number;
  /** Ventes / clics × 100 (2 décimales côté serveur) */
  conversion: number;
  /** Récompenses A cumulées (transactions `reward`) */
  aEarned: number;
  /**
   * Commissions en FCFA (ventes externes / saisie admin) hors `cancelled`.
   * ⚠️ Indépendant de `commissionA` : les deux monnaies ne se cumulent jamais
   * et ne se convertissent pas (décision propriétaire du 03/10/2026).
   */
  commissionTotal: number;
  /** Commissions `pending` + `validated` (FCFA) */
  pending: number;
  /** Commissions `payable` (FCFA) */
  payable: number;
  /** Commissions `paid` (FCFA) */
  paid: number;
  /** Commissions gagnées en A (achats réglés avec la monnaie interne). */
  commissionA: number;
  /** Part A encore en attente (`pending`/`validated`). */
  aPending: number;
}

/** `affiliate` de GET /api/affiliate/me — null si l'utilisateur n'a jamais candidaté */
export interface Affiliate {
  code: string;
  /** Statut du contrat (3 valeurs) — conservé pour les écrans existants. */
  status: AffiliateStatus;
  /** Statut réel COMPLET (ajoute `rejected`, `withdrawn`) — lu par l'espace affilié. */
  accountStatus: AffiliateAccountStatus;
  appliedAt: number;
  /** null tant que la candidature n'est pas validée */
  activatedAt: number | null;
  /** Super affilié (seuil de ventes/clics atteint) */
  isSuper: boolean;
  stats: AffiliateStats;
}

/** Élément de GET /api/affiliate/me/products */
export interface AffiliateProduct {
  id: string;
  title: string;
  imageUrl: string;
  /** Prix affiché tel que fourni par l'API (chaîne, ex. « 15 000 FCFA ») */
  price: string;
  commissionType: CommissionType;
  commissionValue: number;
  rewardA: number;
  clicks: number;
  sales: number;
  conversion: number;
  /** URL publique de suivi (…/r/CODE-PRODUIT) — vide si aucun lien n'existe encore. */
  link: string;
  linkCode: string;
  /** Id du lien (nécessaire pour désactiver) — null si aucun lien. */
  linkId: string | null;
  /** État réel du lien — null si aucun lien n'existe pour ce produit. */
  linkStatus: AffiliateLinkStatus | null;
  /** Ventes attribuées à CE lien (plafond maxSalesPerLink). */
  salesCount: number;
  /**
   * Origine de la règle appliquée : `product` (réglages du produit),
   * `campaign` (une campagne active l'emporte) ou `default` (réglage global).
   * Permet d'afficher POURQUOI l'affilié touche ce montant.
   */
  commissionSource: "product" | "campaign" | "default" | "none";
  rewardSource: "product" | "campaign" | "default" | "none";
  /** Campagne active responsable (null si la règle ne vient pas d'une campagne). */
  campaign: {
    id: string;
    name: string;
    endsAt: number | null;
    goalSales: number | null;
  } | null;
  /** Ce que le produit rapporterait SANS campagne (comparatif). */
  baseCommissionType: CommissionType;
  baseCommissionValue: number;
  baseRewardA: number;
}

/** Lien d'affiliation d'un produit (réponse de POST …/link et …/activate) */
export interface AffiliateLink {
  link: string;
  linkCode: string;
}

/** Lien renvoyé par les routes d'activation/désactivation (état réel). */
export interface AffiliateLinkState {
  id: string;
  productId: string;
  link: string;
  linkCode: string;
  status: AffiliateLinkStatus;
  salesCount: number;
  createdAt: number;
}

/**
 * Refus d'activation pour plafond atteint (409) : le front doit proposer un
 * CHOIX (désactiver un lien actif de la liste, ou abandonner).
 */
export interface LinkLimitConflict {
  error: string;
  limits: AffiliateLimits;
  activeLinks: AffiliateLinkState[];
}

/* ---------- Normalisations défensives (aucune valeur inventée) ---------- */

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

function normalizeStats(raw: Partial<AffiliateStats> | null | undefined): AffiliateStats {
  return {
    clicks: num(raw?.clicks),
    sales: num(raw?.sales),
    conversion: num(raw?.conversion),
    aEarned: num(raw?.aEarned),
    commissionTotal: num(raw?.commissionTotal),
    pending: num(raw?.pending),
    payable: num(raw?.payable),
    paid: num(raw?.paid),
    commissionA: num(raw?.commissionA),
    aPending: num(raw?.aPending),
  };
}

function normalizeAccountStatus(raw: unknown): AffiliateAccountStatus {
  return raw === "active" ||
    raw === "suspended" ||
    raw === "rejected" ||
    raw === "withdrawn"
    ? raw
    : "pending";
}

/** Statut étroit (contrat 3 valeurs) : tout état de sortie retombe sur `pending`. */
function normalizeStatus(raw: unknown): AffiliateStatus {
  return raw === "active" || raw === "suspended" ? raw : "pending";
}

function normalizeLinkStatus(raw: unknown): AffiliateLinkStatus | null {
  return raw === "active" || raw === "inactive" || raw === "saturated" ? raw : null;
}

function normalizeAffiliate(raw: Affiliate): Affiliate {
  return {
    code: str(raw?.code),
    status: normalizeStatus(raw?.status),
    accountStatus: normalizeAccountStatus(raw?.status),
    appliedAt: num(raw?.appliedAt),
    activatedAt: typeof raw?.activatedAt === "number" ? raw.activatedAt : null,
    isSuper: raw?.isSuper === true,
    stats: normalizeStats(raw?.stats),
  };
}

function normalizeProduct(raw: AffiliateProduct): AffiliateProduct {
  return {
    id: str(raw?.id),
    title: str(raw?.title),
    imageUrl: str(raw?.imageUrl),
    price: str(raw?.price),
    commissionType: raw?.commissionType === "fixed" ? "fixed" : "percent",
    commissionValue: num(raw?.commissionValue),
    rewardA: num(raw?.rewardA),
    clicks: num(raw?.clicks),
    sales: num(raw?.sales),
    conversion: num(raw?.conversion),
    link: str(raw?.link),
    linkCode: str(raw?.linkCode) || codeFromLink(str(raw?.link)),
    linkId: typeof raw?.linkId === "string" && raw.linkId ? raw.linkId : null,
    linkStatus: normalizeLinkStatus(raw?.linkStatus),
    salesCount: num(raw?.salesCount),
    commissionSource: normalizeRuleSource(raw?.commissionSource),
    rewardSource: normalizeRuleSource(raw?.rewardSource),
    campaign: raw?.campaign
      ? {
          id: str((raw.campaign as Record<string, unknown>).id),
          name: str((raw.campaign as Record<string, unknown>).name),
          endsAt:
            typeof (raw.campaign as Record<string, unknown>).endsAt === "number"
              ? ((raw.campaign as Record<string, unknown>).endsAt as number)
              : null,
          goalSales:
            typeof (raw.campaign as Record<string, unknown>).goalSales === "number"
              ? Math.trunc((raw.campaign as Record<string, unknown>).goalSales as number)
              : null,
        }
      : null,
    baseCommissionType: raw?.baseCommissionType === "fixed" ? "fixed" : "percent",
    baseCommissionValue: num(raw?.baseCommissionValue),
    baseRewardA: num(raw?.baseRewardA),
  };
}

/** Origine d'une règle de commission (repli prudent : « none »). */
function normalizeRuleSource(raw: unknown): "product" | "campaign" | "default" | "none" {
  return raw === "product" || raw === "campaign" || raw === "default" ? raw : "none";
}

/** Extrait le code de suivi d'une URL « …/r/<code> » */
function codeFromLink(link: string): string {
  const m = link.match(/\/r\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

/* ---------- Routes utilisateur (Bearer) ---------- */

/**
 * POST /api/affiliate/apply — candidature (`note` optionnelle).
 * 409 si l'utilisateur est déjà affilié (message renvoyé tel quel par l'API).
 */
export async function applyToAffiliate(note?: string): Promise<Affiliate> {
  const trimmed = (note || "").trim();
  const res = await apiFetch<{ ok: boolean; affiliate: Affiliate | null }>("/api/affiliate/apply", {
    method: "POST",
    body: trimmed ? { note: trimmed } : {},
    bearer: true,
    timeoutMs: 8000,
  });
  if (!res.affiliate) throw new Error("Réponse inattendue du serveur.");
  return normalizeAffiliate(res.affiliate);
}

/**
 * GET /api/affiliate/me — version Phase 3 : état + progression Super +
 * animation de déblocage en attente (champs tolérés absents).
 */
export async function fetchAffiliateMeData(): Promise<AffiliateMe | null> {
  const res = await apiFetch<Record<string, unknown>>("/api/affiliate/me", {
    bearer: true,
    timeoutMs: 4000,
  });
  if (!res.affiliate) return null;
  const raw = res as Record<string, unknown>;
  const sup = raw.super as Record<string, unknown> | undefined;
  const pending = raw.unlockPending;
  return {
    affiliate: normalizeAffiliate(res.affiliate as Affiliate),
    super: sup
      ? {
          requested: bool(sup.requested),
          eligible: bool(sup.eligible),
          criteria: {
            minSales: num((sup.criteria as Record<string, unknown> | undefined)?.minSales),
            minClicks: num((sup.criteria as Record<string, unknown> | undefined)?.minClicks),
          },
          progress: {
            sales: num((sup.progress as Record<string, unknown> | undefined)?.sales),
            clicks: num((sup.progress as Record<string, unknown> | undefined)?.clicks),
          },
        }
      : undefined,
    unlockPending: pending === "affiliate" || pending === "super_affiliate" ? pending : null,
  };
}

/** GET /api/affiliate/me — état de la candidature + statistiques (null si jamais candidaté) */
export async function fetchAffiliateMe(): Promise<Affiliate | null> {
  const res = await apiFetch<{ ok: boolean; affiliate: Affiliate | null }>("/api/affiliate/me", {
    bearer: true,
    timeoutMs: 4000,
  });
  return res.affiliate ? normalizeAffiliate(res.affiliate) : null;
}

/**
 * GET /api/affiliate/me/history — historique de statut (`status_history`, écrit
 * depuis la Phase 2 mais jusqu'ici jamais lu). Liste chronologique inverse,
 * plafonnée à 100 entrées côté serveur. Jamais d'erreur bloquante : un historique
 * illisible renvoie une liste vide (l'affichage du reste n'en dépend pas).
 */
export async function fetchAffiliateHistory(): Promise<StatusHistoryEntry[]> {
  const res = await apiFetch<{ ok: boolean; history?: StatusHistoryEntry[] }>(
    "/api/affiliate/me/history",
    { bearer: true, timeoutMs: 4000 },
  );
  return res.history || [];
}

/** Entrée d'historique de statut (forme renvoyée par GET /api/affiliate/me/history). */
export interface StatusHistoryEntry {
  id: string;
  /** Rôle ou statut précédent — le schéma historique porte les deux sémantiques. */
  fromRole: string | null;
  toRole: string;
  reason: string | null;
  createdAt: number;
}

/** Réponse de GET /api/affiliate/me/products (produits + plafonds). */
export interface AffiliateProductsResponse {
  products: AffiliateProduct[];
  limits: AffiliateLimits;
}

function normalizeLimits(raw: unknown): AffiliateLimits {
  const l = (raw || {}) as Record<string, unknown>;
  return {
    maxActiveLinks: num(l.maxActiveLinks),
    maxSalesPerLink: num(l.maxSalesPerLink),
    activeCount: num(l.activeCount),
    isSuper: l.isSuper === true,
  };
}

/**
 * GET /api/affiliate/me/products — produits éligibles + performance + plafonds.
 * Un affilié `suspended` reçoit une liste vide (contrat). ⚠️ La consultation
 * NE crée AUCUN lien : `link` n'est renseigné que si un lien existe déjà, et
 * `linkStatus`/`salesCount` décrivent son état réel.
 */
export async function fetchAffiliateProducts(): Promise<AffiliateProductsResponse> {
  const res = await apiFetch<{ ok: boolean; products?: AffiliateProduct[]; limits?: unknown }>(
    "/api/affiliate/me/products",
    { bearer: true, timeoutMs: 6000 },
  );
  return {
    products: (res.products || []).map(normalizeProduct),
    limits: normalizeLimits(res.limits),
  };
}

/** POST /api/affiliate/me/products/:productId/link — (re)générer le lien d'un produit */
export async function createAffiliateLink(productId: string): Promise<AffiliateLink> {
  const res = await apiFetch<{ ok: boolean; link: unknown }>(
    `/api/affiliate/me/products/${encodeURIComponent(productId)}/link`,
    { method: "POST", bearer: true, timeoutMs: 8000 },
  );
  const raw = res.link;
  if (typeof raw === "string") return { link: raw, linkCode: codeFromLink(raw) };
  const obj = (raw || {}) as { link?: unknown; url?: unknown; linkCode?: unknown; code?: unknown };
  const link = str(obj.link) || str(obj.url);
  return {
    link,
    linkCode: str(obj.linkCode) || str(obj.code) || codeFromLink(link),
  };
}

/* ---------------- Vague 4 — activation explicite, plafonds, sorties ---------------- */

function normalizeLinkState(raw: unknown): AffiliateLinkState {
  const s = (raw || {}) as Record<string, unknown>;
  const link = str(s.link);
  return {
    id: str(s.id),
    productId: str(s.productId),
    link,
    linkCode: str(s.linkCode) || codeFromLink(link),
    status: normalizeLinkStatus(s.status) ?? "inactive",
    salesCount: num(s.salesCount),
    createdAt: num(s.createdAt),
  };
}

/**
 * POST …/activate — active (ou réactive) le lien d'un produit.
 * En cas de plafond atteint, l'API répond 409 : on lève une `ApiError` dont
 * `data` contient `{ limits, activeLinks }` — le front peut alors proposer un
 * choix (« désactiver tel lien » ou « abandonner »).
 */
export async function activateAffiliateProductLink(
  productId: string,
): Promise<{ link: AffiliateLinkState; limits: AffiliateLimits }> {
  const res = await apiFetch<{ ok: boolean; link: unknown; limits?: unknown }>(
    `/api/affiliate/me/products/${encodeURIComponent(productId)}/activate`,
    { method: "POST", body: {}, bearer: true, timeoutMs: 8000 },
  );
  return { link: normalizeLinkState(res.link), limits: normalizeLimits(res.limits) };
}

/** POST …/links/:linkId/deactivate — désactive un lien (libère un emplacement). */
export async function deactivateAffiliateLink(linkId: string): Promise<AffiliateLinkState> {
  const res = await apiFetch<{ ok: boolean; link: unknown }>(
    `/api/affiliate/me/links/${encodeURIComponent(linkId)}/deactivate`,
    { method: "POST", body: {}, bearer: true, timeoutMs: 8000 },
  );
  return normalizeLinkState(res.link);
}

/** Analyse d'une `ApiError` 409 de plafond : renvoie le conflit exploitable, sinon null. */
export function asLinkLimitConflict(err: unknown): LinkLimitConflict | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  const data = err.data || {};
  if (data.reason !== "limit" && !Array.isArray(data.activeLinks)) return null;
  return {
    error: typeof data.error === "string" ? data.error : "Plafond de liens actifs atteint.",
    limits: normalizeLimits(data.limits),
    activeLinks: Array.isArray(data.activeLinks)
      ? (data.activeLinks as unknown[]).map(normalizeLinkState)
      : [],
  };
}

/**
 * POST …/products/:productId/request — demande de disponibilité (Super uniquement).
 * 403 si non Super, 409 si le produit est déjà ouvert à l'affiliation.
 */
export async function requestProductAvailability(
  productId: string,
  note?: string,
): Promise<{ created: boolean }> {
  const trimmed = (note || "").trim();
  const res = await apiFetch<{ ok: boolean; created?: boolean }>(
    `/api/affiliate/me/products/${encodeURIComponent(productId)}/request`,
    { method: "POST", body: trimmed ? { note: trimmed } : {}, bearer: true, timeoutMs: 8000 },
  );
  return { created: res.created === true };
}

/** POST /api/affiliate/me/withdraw — retrait volontaire du programme d'affiliation. */
export async function withdrawFromAffiliate(): Promise<{ status: AffiliateAccountStatus }> {
  const res = await apiFetch<{ ok: boolean; status?: unknown }>("/api/affiliate/me/withdraw", {
    method: "POST",
    body: {},
    bearer: true,
    timeoutMs: 8000,
  });
  return { status: normalizeAccountStatus(res.status) };
}

/* ---------- Route publique — tracking d'un clic ---------- */

/**
 * POST /api/track/affiliate-click — route PUBLIQUE (aucun Bearer).
 * Renvoie l'URL de destination du produit (`action_url`, jeton de tracking déjà
 * posé en `ars=`) ET le jeton de tracking opaque (vague 1, `ars` — vide si le
 * serveur n'a pas pu en délivrer).
 * Timeout court : la page /r ne doit jamais faire patienter le visiteur.
 */
export async function trackAffiliateClick(
  code: string,
): Promise<{ url: string; trackingToken: string }> {
  const res = await apiFetch<{ ok: boolean; url?: string; trackingToken?: unknown }>(
    "/api/track/affiliate-click",
    {
      method: "POST",
      body: { code: code.trim() },
      timeoutMs: 1500, // POST → garde-fou de 6 s maximum dans apiFetch
    },
  );
  return { url: str(res.url), trackingToken: str(res.trackingToken) };
}

/* ---------------- Vague 2 — transferts de A et partage récompensé ---------------- */

/** Destinataire d'un transfert — réponse MINIMALE (pseudo seul, jamais d'id/email/solde). */
export interface TransferRecipient {
  pseudo: string;
}

/**
 * GET /api/me/transfer/lookup?q=<pseudo> — résolution EXACTE.
 * `recipient` vaut null si aucun utilisateur ne porte ce pseudo.
 */
export async function lookupTransferRecipient(
  pseudo: string,
): Promise<TransferRecipient | null> {
  const q = (pseudo || "").trim();
  if (!q) return null;
  const res = await apiFetch<{ ok: boolean; recipient?: { pseudo?: unknown } | null }>(
    `/api/me/transfer/lookup?q=${encodeURIComponent(q)}`,
    { bearer: true, timeoutMs: 4000 },
  );
  const p = res.recipient?.pseudo;
  return typeof p === "string" && p ? { pseudo: p } : null;
}

/** Résultat d'un transfert exécuté (POST /api/me/transfer). */
export interface TransferResult {
  transferId: string;
  amount: number;
  recipient: TransferRecipient;
  /** Solde A de l'expéditeur après transfert (recalculé serveur). */
  balanceA: number;
}

/**
 * POST /api/me/transfer {recipientPseudo, amount, idempotencyKey} — transfert A.
 * `idempotencyKey` (UUID généré UNE fois par tentative côté appelant) empêche un
 * double clic de créer deux transferts : réutiliser la même clé pour un nouvel
 * essai ne double jamais l'opération.
 */
export async function transferA(input: {
  recipientPseudo: string;
  amount: number;
  idempotencyKey: string;
}): Promise<TransferResult> {
  const res = await apiFetch<{
    ok: boolean;
    transferId?: unknown;
    amount?: unknown;
    recipient?: { pseudo?: unknown };
    balanceA?: unknown;
  }>("/api/me/transfer", {
    method: "POST",
    body: {
      recipientPseudo: input.recipientPseudo.trim(),
      amount: input.amount,
      idempotencyKey: input.idempotencyKey,
    },
    bearer: true,
    timeoutMs: 8000,
  });
  return {
    transferId: str(res.transferId),
    amount: num(res.amount),
    recipient: { pseudo: str(res.recipient?.pseudo) },
    balanceA: num(res.balanceA),
  };
}

/** Résultat d'un partage récompensé (POST /api/me/share). */
export interface ShareRewardResult {
  /** true si la récompense a été créditée (réglage > 0 et quota disponible). */
  rewarded: boolean;
  /** A crédités par ce partage (0 si non récompensé). */
  rewardA: number;
  /** Partages restants aujourd'hui après celui-ci (jamais négatif). */
  remainingToday: number;
}

/**
 * POST /api/me/share {productId, linkId?} — enregistre un partage et crédite la
 * récompense. 429 « Limite de N partages par jour atteinte » au-delà du quota
 * (aucune récompense) — l'erreur est propagée telle quelle par `apiFetch`.
 */
export async function shareReward(input: {
  productId: string;
  linkId?: string | null;
}): Promise<ShareRewardResult> {
  const res = await apiFetch<{ ok: boolean; rewarded?: unknown; rewardA?: unknown; remainingToday?: unknown }>(
    "/api/me/share",
    {
      method: "POST",
      body: { productId: input.productId, linkId: input.linkId ?? null },
      bearer: true,
      timeoutMs: 8000,
    },
  );
  return {
    rewarded: res.rewarded === true,
    rewardA: num(res.rewardA),
    remainingToday: num(res.remainingToday),
  };
}

/* ---------------- Phase 3 — Super Affiliate + campagnes ---------------- */

/** Progression vers le statut Super Affiliate (critères configurables côté serveur). */
export interface SuperProgress {
  requested: boolean;
  eligible: boolean;
  criteria: { minSales: number; minClicks: number };
  progress: { sales: number; clicks: number };
}

/** Réponse enrichie de GET /api/affiliate/me (champs Phase 3, tolérés absents). */
export interface AffiliateMe {
  affiliate: Affiliate | null;
  super?: SuperProgress;
  unlockPending?: UnlockStatusValue | null;
}

export type UnlockStatusValue = "affiliate" | "super_affiliate";

const bool = (v: unknown): boolean => v === true;

/** POST /api/affiliate/me/upgrade — demande de promotion (403 si critères non atteints). */
export async function requestSuperUpgrade(): Promise<{ requested: boolean }> {
  const res = await apiFetch<{ ok: boolean; requested?: boolean }>("/api/affiliate/me/upgrade", {
    method: "POST",
    body: {},
    bearer: true,
    timeoutMs: 6000,
  });
  return { requested: bool(res.requested) || true };
}

/** GET /api/affiliate/me/campaigns — campagnes actives + progression personnelle. */
export interface AffiliateCampaign {
  id: string;
  name: string;
  productName: string | null;
  endsAt: number | null;
  commissionType: CommissionType;
  commissionValue: number | null;
  rewardA: number;
  goalSales: number | null;
  mySales: number;
  myClicks: number;
  joined: boolean;
  expired: boolean;
}

export async function fetchMyCampaigns(): Promise<AffiliateCampaign[]> {
  const res = await apiFetch<{ ok: boolean; campaigns?: unknown[] }>("/api/affiliate/me/campaigns", {
    bearer: true,
    timeoutMs: 6000,
  });
  return (res.campaigns || []).map((raw) => {
    const c = raw as Record<string, unknown>;
    return {
      id: str(c.id),
      name: str(c.name),
      productName: typeof c.productName === "string" ? c.productName : null,
      endsAt: typeof c.endsAt === "number" ? c.endsAt : null,
      commissionType: (c.commissionType === "fixed" ? "fixed" : "percent") as CommissionType,
      commissionValue: typeof c.commissionValue === "number" ? c.commissionValue : null,
      rewardA: num(c.rewardA),
      goalSales: typeof c.goalSales === "number" ? c.goalSales : null,
      mySales: num(c.mySales),
      myClicks: num(c.myClicks),
      joined: bool(c.joined),
      expired: bool(c.expired),
    };
  });
}

/** POST /api/affiliate/me/campaigns/:id/join — participer à une campagne active. */
export async function joinCampaign(campaignId: string): Promise<void> {
  await apiFetch(`/api/affiliate/me/campaigns/${encodeURIComponent(campaignId)}/join`, {
    method: "POST",
    body: {},
    bearer: true,
    timeoutMs: 6000,
  });
}

/* --------------------- Notifications (cycle de vie, 0014) --------------------- */

/** Notification de l'espace affilié (changement d'éligibilité, campagne…). */
export interface AffiliateNotification {
  id: string;
  /** product_ineligible | product_reeligible | product_unavailable | product_deleted | campaign_ended | campaign_paused */
  type: string;
  message: string;
  createdAt: number;
}

/** GET /api/affiliate/me/notifications — notifications NON LUES de l'affilié. */
export async function fetchNotifications(): Promise<AffiliateNotification[]> {
  const res = await apiFetch<{ ok: boolean; notifications?: unknown[] }>(
    "/api/affiliate/me/notifications",
    { bearer: true, timeoutMs: 6000 }
  );
  return (res.notifications || []).map((raw) => {
    const n = raw as Record<string, unknown>;
    return {
      id: typeof n.id === "string" ? n.id : "",
      type: typeof n.type === "string" ? n.type : "",
      message: typeof n.message === "string" ? n.message : "",
      createdAt: typeof n.createdAt === "number" ? n.createdAt : 0,
    };
  }).filter((n) => n.id && n.message);
}

/** POST /api/affiliate/me/notifications/read — marque tout comme lu. */
export async function markNotificationsRead(): Promise<void> {
  await apiFetch("/api/affiliate/me/notifications/read", {
    method: "POST",
    body: {},
    bearer: true,
    timeoutMs: 6000,
  });
}
