/**
 * Arsenal Tools — couche API admin : onglet « Utilisateurs ».
 *
 * Trois lectures en LECTURE SEULE (X-Admin-Auth posé par `apiFetch { auth: true }`,
 * comme src/lib/admin.ts) :
 * - GET /api/admin/users?q=            liste (profil, solde A, achats, affiliation) ;
 * - GET /api/admin/users/:id           fiche détaillée (compteurs + affilié) ;
 * - GET /api/admin/users/:id/activity  timeline d'activité fusionnée.
 *
 * Même tolérance de forme que src/lib/admin.ts : seule la mise en forme est
 * normalisée (les helpers de coercition y sont privés — redéfinis ici), aucune
 * valeur métier n'est inventée.
 */

import { apiFetch } from "./api";

/** Affiliation éventuelle d'un compte (code public + statut brut serveur). */
export interface AdminUserAffiliate {
  code: string;
  status: string;
}

/** Ligne de GET /api/admin/users */
export interface AdminUser {
  id: string;
  pseudo: string;
  email: string;
  role: string;
  /** Solde A recalculé serveur = SUM(delta) de a_transactions. */
  balanceA: number;
  createdAt: number;
  /** Achats NON annulés (statuts actifs du contrat achats : pending/paid/fulfillment_pending/fulfilled). */
  purchasesCount: number;
  /** Affiliation du compte (code + statut), sinon null. */
  affiliate: AdminUserAffiliate | null;
}

/** Compteurs de la fiche détaillée. */
export interface AdminUserCounts {
  transactions: number;
  /** Achats non annulés (même définition que la liste). */
  purchases: number;
  licenses: number;
  /** Téléchargements réellement servis (security_events `purchase_download`). */
  downloads: number;
}

/** Fiche détaillée (GET /api/admin/users/:id) */
export interface AdminUserDetail {
  user: {
    id: string;
    pseudo: string;
    email: string;
    role: string;
    balanceA: number;
    createdAt: number;
    updatedAt: number;
  };
  counts: AdminUserCounts;
  affiliate:
    | (AdminUserAffiliate & {
        id: string;
        /** Clics trackés (click_events). */
        clicks: number;
        /** Ventes confirmées (sales.state = 'confirmed'). */
        sales: number;
        appliedAt: number;
        activatedAt: number | null;
      })
    | null;
}

export type AdminActivityKind = "securite" | "a" | "achat" | "role";

/** Entrée de la timeline fusionnée (GET /api/admin/users/:id/activity) */
export interface AdminActivityEntry {
  at: number;
  kind: AdminActivityKind;
  label: string;
  /** delta A (nombre) · meta JSON (objet) · texte composé (chaîne) · null. */
  detail: unknown;
}

/* Coercition défensive (mêmes règles que les helpers privés de src/lib/admin.ts). */
const adminStr = (v: unknown): string => (typeof v === "string" ? v : "");
const adminNum = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : 0;
/** Timestamp ou null (champ facultatif : aucune valeur inventée). */
const adminTs = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

function normalizeAffiliate(raw: unknown): AdminUserAffiliate | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const code = adminStr(item.code);
  return code ? { code, status: adminStr(item.status) } : null;
}

/**
 * GET /api/admin/users?q= — liste des comptes (tri serveur : inscription récente d'abord).
 * `q` filtre pseudo/email côté serveur (LIKE échappé) ; vide = tous les comptes.
 */
export async function fetchAdminUsers(q?: string): Promise<AdminUser[]> {
  const term = (q ?? "").trim();
  const query = term ? `?q=${encodeURIComponent(term)}` : "";
  const res = await apiFetch<{ ok: boolean; users?: unknown[] }>(`/api/admin/users${query}`, {
    auth: true,
    timeoutMs: 6000,
  });
  return (res.users || []).map((raw) => {
    const item = (raw || {}) as Record<string, unknown>;
    return {
      id: adminStr(item.id),
      pseudo: adminStr(item.pseudo),
      email: adminStr(item.email),
      role: adminStr(item.role) || "user",
      balanceA: adminNum(item.balanceA ?? item.balance_a),
      createdAt: adminNum(item.createdAt ?? item.created_at),
      purchasesCount: adminNum(item.purchasesCount ?? item.purchases_count),
      affiliate: normalizeAffiliate(item.affiliate),
    } satisfies AdminUser;
  });
}

/** GET /api/admin/users/:id — fiche détaillée (404 → ApiError côté apiFetch). */
export async function fetchAdminUser(id: string): Promise<AdminUserDetail> {
  const res = await apiFetch<{
    ok?: boolean;
    user?: Record<string, unknown> | null;
    counts?: Record<string, unknown> | null;
    affiliate?: unknown;
  }>(`/api/admin/users/${encodeURIComponent(id)}`, { auth: true, timeoutMs: 6000 });

  const user = (res.user ?? {}) as Record<string, unknown>;
  const counts = (res.counts ?? {}) as Record<string, unknown>;
  const affiliateRaw = res.affiliate && typeof res.affiliate === "object"
    ? (res.affiliate as Record<string, unknown>)
    : null;
  const affiliate = normalizeAffiliate(res.affiliate);

  return {
    user: {
      id: adminStr(user.id),
      pseudo: adminStr(user.pseudo),
      email: adminStr(user.email),
      role: adminStr(user.role) || "user",
      balanceA: adminNum(user.balanceA ?? user.balance_a),
      createdAt: adminNum(user.createdAt ?? user.created_at),
      updatedAt: adminNum(user.updatedAt ?? user.updated_at),
    },
    counts: {
      transactions: adminNum(counts.transactions),
      purchases: adminNum(counts.purchases),
      licenses: adminNum(counts.licenses),
      downloads: adminNum(counts.downloads),
    },
    affiliate:
      affiliate && affiliateRaw
        ? {
            ...affiliate,
            id: adminStr(affiliateRaw.id),
            clicks: adminNum(affiliateRaw.clicks),
            sales: adminNum(affiliateRaw.sales),
            appliedAt: adminNum(affiliateRaw.appliedAt ?? affiliateRaw.applied_at),
            activatedAt: adminTs(affiliateRaw.activatedAt ?? affiliateRaw.activated_at),
          }
        : null,
  };
}

const ACTIVITY_KINDS: readonly AdminActivityKind[] = ["securite", "a", "achat", "role"];

/**
 * GET /api/admin/users/:id/activity?limit= — timeline fusionnée, triée par date
 * décroissante côté serveur (≤ 200 entrées). `limit` est borné ici aussi.
 */
export async function fetchAdminUserActivity(
  id: string,
  limit = 100,
): Promise<AdminActivityEntry[]> {
  const bounded = Math.min(Math.max(Math.trunc(limit) || 100, 1), 200);
  const res = await apiFetch<{ ok: boolean; activity?: unknown[] }>(
    `/api/admin/users/${encodeURIComponent(id)}/activity?limit=${bounded}`,
    { auth: true, timeoutMs: 6000 },
  );
  return (res.activity || []).map((raw) => {
    const item = (raw || {}) as Record<string, unknown>;
    const kind = ACTIVITY_KINDS.includes(item.kind as AdminActivityKind)
      ? (item.kind as AdminActivityKind)
      : "securite";
    return {
      at: adminNum(item.at),
      kind,
      label: adminStr(item.label),
      detail: item.detail ?? null,
    } satisfies AdminActivityEntry;
  });
}
