/**
 * Arsenal Tools — tracking (visites + clics), fire-and-forget comme le site validé
 */

import { apiFetch } from "./api";

/** POST /api/track {type:"click", productId, action} — n'attend pas la réponse */
export function trackClick(productId: string, action = "open"): void {
  apiFetch("/api/track", {
    method: "POST",
    body: { type: "click", productId, action },
    timeoutMs: 1500,
  }).catch(() => {});
}

let visitTracked = false;

/** POST /api/track {type:"visit"} — une fois par chargement de page */
export function trackVisit(): void {
  if (visitTracked) return;
  visitTracked = true;
  apiFetch("/api/track", {
    method: "POST",
    body: { type: "visit" },
    timeoutMs: 1500,
  }).catch(() => {});
}
