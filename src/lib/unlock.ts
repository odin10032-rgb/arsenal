/**
 * Arsenal Tools — déblocage de statut (contrat Phase 3 §2 : docs/chantier/08-contrat-phase3.md)
 *
 * État contrôlé serveur : l'animation de déblocage n'est jouée qu'UNE seule fois par
 * statut et par utilisateur (UNIQUE(user_id, status) en base). Le front lit le premier
 * événement non vu, joue l'animation, puis marque vu (idempotent). Le marquage ne porte
 * que sur les événements de la session (Bearer).
 */

import { apiFetch } from "./api";

/** Statut dont le déblocage déclenche l'animation */
export type UnlockStatus = "affiliate" | "super_affiliate";

/** Réponse de GET /api/me/unlock — premier événement non vu (status null : aucun) */
export interface UnlockState {
  status: UnlockStatus | null;
  seenAt: number | null;
}

const isUnlockStatus = (v: unknown): v is UnlockStatus =>
  v === "affiliate" || v === "super_affiliate";

/** GET /api/me/unlock — événement de déblocage non vu de la session, sinon null */
export async function getUnlock(): Promise<UnlockState> {
  const res = await apiFetch<{ ok: boolean; status?: unknown; seenAt?: unknown }>("/api/me/unlock", {
    bearer: true,
    timeoutMs: 4000,
  });
  return {
    status: isUnlockStatus(res.status) ? res.status : null,
    seenAt: typeof res.seenAt === "number" ? res.seenAt : null,
  };
}

/**
 * POST /api/me/unlock/seen — marque l'événement vu (idempotent, 400 si statut invalide).
 * Un échec réseau n'est pas bloquant : l'événement restera non vu et l'animation
 * sera simplement rejouée à la prochaine visite.
 */
export async function markUnlockSeen(status: UnlockStatus): Promise<void> {
  await apiFetch("/api/me/unlock/seen", {
    method: "POST",
    body: { status },
    bearer: true,
    timeoutMs: 6000,
  });
}
