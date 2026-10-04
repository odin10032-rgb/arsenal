/**
 * Arsenal Tools — couche API admin : onglet « Suivi » (pont de tracking, vague 6).
 *
 * Trois lectures en LECTURE SEULE (X-Admin-Auth posé par `apiFetch { auth: true }`,
 * comme src/lib/admin.ts / src/lib/admin-users.ts) :
 * - GET /api/admin/tracking/sessions?limit=   parcours récents (jeton tronqué) ;
 * - GET /api/admin/tracking/conflicts?limit=  conflits multi-liens (affilié retenu) ;
 * - GET /api/admin/tracking/referrals?limit=  parrainages (récompense versée ou non).
 *
 * MINIMISATION (§37) : ces routes ne renvoient JAMAIS d'IP ni d'email, et les jetons
 * sont TRONQUÉS côté serveur. Même tolérance de forme que les autres couches admin :
 * seule la mise en forme est normalisée, aucune valeur métier n'est inventée.
 */

import { apiFetch } from "./api";

/** Coercition défensive (mêmes règles que les helpers privés des autres couches admin). */
const trackStr = (v: unknown): string => (typeof v === "string" ? v : "");
const trackNum = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : 0;
/** Timestamp ou null (champ facultatif : aucune valeur inventée). */
const trackTs = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** Parcours de suivi (ligne de GET /api/admin/tracking/sessions). */
export interface TrackingSession {
  /** Jeton TRONQUÉ (jamais complet) — pour distinguer les lignes entre elles. */
  token: string;
  /** Pseudo de l'affilié d'origine (jointure affiliates→users), sinon null. */
  affiliatePseudo: string | null;
  productTitle: string | null;
  createdAt: number;
  lastSeenAt: number;
  /** Durée d'activité : dernière action − première action (ms, jamais négative). */
  durationMs: number;
  /** Étapes agrégées décodées (compteurs positifs), ex. `{product_view:3, add_to_cart:1}`. */
  steps: Record<string, number>;
}

/** Toucher d'entrée d'un conflit multi-liens (affilié + date). */
export interface TrackingConflictTouch {
  affiliatePseudo: string | null;
  productId: string | null;
  at: number | null;
}

/** Conflit multi-liens (ligne de GET /api/admin/tracking/conflicts). */
export interface TrackingConflict {
  /** Jeton TRONQUÉ. */
  token: string;
  touches: TrackingConflictTouch[];
  /** Affilié RETENU = dernier toucher (règle « dernier toucher »). */
  retainedAffiliatePseudo: string | null;
  lastSeenAt: number | null;
}

/** Parrainage (ligne de GET /api/admin/tracking/referrals). */
export interface TrackingReferral {
  referredPseudo: string | null;
  affiliatePseudo: string | null;
  createdAt: number;
  /** Récompense versée ? (non nul = versée). */
  rewardedAt: number | null;
  /** Montant en A de l'achat qui a déclenché la récompense (facultatif). */
  rewardAmountA: number | null;
}

/** Étapes : objet JSON de compteurs positifs, tolérant sur la forme. */
function normalizeSteps(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const n = Math.trunc(Number(value));
    if (Number.isFinite(n) && n > 0) out[key] = n;
  }
  return out;
}

/** GET /api/admin/tracking/sessions?limit= — parcours de suivi récents (≤ 200). */
export async function fetchTrackingSessions(limit = 100): Promise<TrackingSession[]> {
  const bounded = Math.min(Math.max(Math.trunc(limit) || 100, 1), 200);
  const res = await apiFetch<{ ok: boolean; sessions?: unknown[] }>(
    `/api/admin/tracking/sessions?limit=${bounded}`,
    { auth: true, timeoutMs: 6000 },
  );
  return (res.sessions || []).map((raw) => {
    const item = (raw || {}) as Record<string, unknown>;
    return {
      token: trackStr(item.token),
      affiliatePseudo: trackStr(item.affiliatePseudo) || null,
      productTitle: trackStr(item.productTitle) || null,
      createdAt: trackNum(item.createdAt),
      lastSeenAt: trackNum(item.lastSeenAt),
      durationMs: Math.max(0, trackNum(item.durationMs)),
      steps: normalizeSteps(item.steps),
    } satisfies TrackingSession;
  });
}

/** GET /api/admin/tracking/conflicts?limit= — conflits multi-liens (≤ 200). */
export async function fetchTrackingConflicts(limit = 50): Promise<TrackingConflict[]> {
  const bounded = Math.min(Math.max(Math.trunc(limit) || 50, 1), 200);
  const res = await apiFetch<{ ok: boolean; conflicts?: unknown[] }>(
    `/api/admin/tracking/conflicts?limit=${bounded}`,
    { auth: true, timeoutMs: 6000 },
  );
  return (res.conflicts || []).map((raw) => {
    const item = (raw || {}) as Record<string, unknown>;
    const touches = Array.isArray(item.touches) ? item.touches : [];
    return {
      token: trackStr(item.token),
      touches: touches.map((t) => {
        const touch = (t || {}) as Record<string, unknown>;
        return {
          affiliatePseudo: trackStr(touch.affiliatePseudo) || null,
          productId: trackStr(touch.productId) || null,
          at: trackTs(touch.at),
        } satisfies TrackingConflictTouch;
      }),
      retainedAffiliatePseudo: trackStr(item.retainedAffiliatePseudo) || null,
      lastSeenAt: trackTs(item.lastSeenAt),
    } satisfies TrackingConflict;
  });
}

/** GET /api/admin/tracking/referrals?limit= — parrainages (≤ 200). */
export async function fetchTrackingReferrals(limit = 100): Promise<TrackingReferral[]> {
  const bounded = Math.min(Math.max(Math.trunc(limit) || 100, 1), 200);
  const res = await apiFetch<{ ok: boolean; referrals?: unknown[] }>(
    `/api/admin/tracking/referrals?limit=${bounded}`,
    { auth: true, timeoutMs: 6000 },
  );
  return (res.referrals || []).map((raw) => {
    const item = (raw || {}) as Record<string, unknown>;
    return {
      referredPseudo: trackStr(item.referredPseudo) || null,
      affiliatePseudo: trackStr(item.affiliatePseudo) || null,
      createdAt: trackNum(item.createdAt),
      rewardedAt: trackTs(item.rewardedAt),
      rewardAmountA: trackTs(item.rewardAmountA) !== null ? trackNum(item.rewardAmountA) : null,
    } satisfies TrackingReferral;
  });
}
