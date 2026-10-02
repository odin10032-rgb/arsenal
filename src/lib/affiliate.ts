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

import { apiFetch } from "./api";

/* ---------- Types du contrat ---------- */

export type AffiliateStatus = "pending" | "active" | "suspended";

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
  /** Commissions hors `cancelled` */
  commissionTotal: number;
  /** Commissions `pending` + `validated` */
  pending: number;
  /** Commissions `payable` */
  payable: number;
  /** Commissions `paid` */
  paid: number;
}

/** `affiliate` de GET /api/affiliate/me — null si l'utilisateur n'a jamais candidaté */
export interface Affiliate {
  code: string;
  status: AffiliateStatus;
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
  /** URL publique de suivi (…/r/CODE-PRODUIT) */
  link: string;
  linkCode: string;
}

/** Lien d'affiliation d'un produit (réponse de POST …/link) */
export interface AffiliateLink {
  link: string;
  linkCode: string;
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
  };
}

function normalizeStatus(raw: unknown): AffiliateStatus {
  return raw === "active" || raw === "suspended" ? raw : "pending";
}

function normalizeAffiliate(raw: Affiliate): Affiliate {
  return {
    code: str(raw?.code),
    status: normalizeStatus(raw?.status),
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
  };
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
 * GET /api/affiliate/me/products — produits éligibles + performance.
 * Un affilié `suspended` reçoit une liste vide (contrat).
 */
export async function fetchAffiliateProducts(): Promise<AffiliateProduct[]> {
  const res = await apiFetch<{ ok: boolean; products?: AffiliateProduct[] }>(
    "/api/affiliate/me/products",
    { bearer: true, timeoutMs: 6000 },
  );
  return (res.products || []).map(normalizeProduct);
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

/* ---------- Route publique — tracking d'un clic ---------- */

/**
 * POST /api/track/affiliate-click — route PUBLIQUE (aucun Bearer).
 * Renvoie l'URL de destination du produit (`action_url`).
 * Timeout court : la page /r ne doit jamais faire patienter le visiteur.
 */
export async function trackAffiliateClick(code: string): Promise<string> {
  const res = await apiFetch<{ ok: boolean; url?: string }>("/api/track/affiliate-click", {
    method: "POST",
    body: { code: code.trim() },
    timeoutMs: 1500, // POST → garde-fou de 6 s maximum dans apiFetch
  });
  return str(res.url);
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
