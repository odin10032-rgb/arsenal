import { Hono } from "hono";
import {
  isTrackingStep,
  recordTrackingStep,
  touchTrackingSession,
} from "../../src/lib/server/tracking";
import type { App, Env } from "../env";

/**
 * Collecte des ÉTAPES DU PARCOURS (vague 4).
 *
 * POST /api/track/step {token, step} → 200 {ok:true}
 *
 * Route PUBLIQUE : aucune authentification — c'est le VISITEUR ANONYME qui
 * déclare son action (le jeton de tracking, opaque, est sa seule identité, et
 * il est déjà posé côté serveur par le pont `/r/<code>`). Aucune donnée
 * personnelle n'est reçue ici : ni IP, ni empreinte — uniquement un jeton et
 * une étape de la liste FERMÉE (`TRACKING_STEPS`).
 *
 * Validations (400 si elles échouent) :
 *   • `token` : chaîne non vide, longueur ≤ 200 (le jeton fait ~ 2 UUID, on
 *     borne pour refuser un corps abusif) ;
 *   • `step`  : appartient à `TRACKING_STEPS` (via `isTrackingStep`).
 *
 * Réponse : `{ok:true}` — TOUJOURS 200, même si le jeton est INCONNU ou EXPIRÉ.
 * C'est un choix DÉLIBÉRÉ : un visiteur ne doit jamais voir d'erreur pour un
 * jeton périmé (il n'a aucune action à corriger), et révéler l'existence d'un
 * jeton ouvrirait un oracle d'énumération. On ignore donc silencieusement
 * (`recordTrackingStep` ne fait rien pour un jeton absent, `touchTrackingSession`
 * est best-effort). Le 400 reste RÉSERVÉ aux requêtes malformées (le développeur/
 * client fautif), pas au jeton inconnu.
 *
 * Anti-abus : aucun rate-limit ici (géré ailleurs) ; on borne la TAILLE (token
 * ≤ 200) et on REFUSE un corps illisible (400). Tout l'effet est best-effort :
 * `recordTrackingStep` / `touchTrackingSession` n'émettent jamais d'exception.
 */

/** Longueur maximale acceptée pour un jeton (le jeton réel ~ 2 UUID concaténés). */
const MAX_TOKEN_LENGTH = 200;

export const trackingRoutes: App = new Hono<{ Bindings: Env }>().post(
  "/api/track/step",
  async (c) => {
    let body: { token?: unknown; step?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ ok: false, error: "JSON invalide." }, 400);
    }

    const token = typeof body?.token === "string" ? body.token.trim() : "";
    if (!token || token.length > MAX_TOKEN_LENGTH) {
      return c.json({ ok: false, error: "Jeton requis." }, 400);
    }
    if (!isTrackingStep(body?.step)) {
      return c.json({ ok: false, error: "Étape inconnue." }, 400);
    }

    // Best-effort : jeton inconnu/expiré → aucune écriture, mais on répond 200
    // (voir l'en-tête : jamais d'erreur pour un visiteur anonyme).
    await recordTrackingStep(c.env.DB, token, body.step);
    await touchTrackingSession(c.env.DB, token);

    return c.json({ ok: true });
  }
);
