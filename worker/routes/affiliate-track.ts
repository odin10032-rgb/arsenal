import { Hono } from "hono";
import {
  readAffiliateSettings,
  recordAffiliateClickId,
  resolveLinkTarget,
  visitorHashOf,
  trackingVisitorHash,
} from "../../src/lib/server/affiliation";
import { aTransactionStatement } from "../../src/lib/server/ledger";
import {
  createTrackingSession,
  latestTrackingTouch,
  recordTrackingLinkHistory,
  refreshTrackingTouch,
} from "../../src/lib/server/tracking";
import { isMember } from "../../src/lib/server/user-auth";
import type { UserRow } from "../../src/lib/server/user-auth";
import type { App, Env } from "../env";

/**
 * Phase 2 — tracking public d'un clic affilié (page `/r/` de l'export statique) :
 * POST /api/track/affiliate-click {code} → 200 {ok, url, trackingToken}
 *
 * - dédup : au plus 1 clic compté par (lien, empreinte visiteur) sur 24 h ;
 * - `visitor_hash = sha256(ip + user-agent + jour)` — l'IP BRUTE n'est jamais stockée ;
 * - le compteur global `clicks_by_product` existant est incrémenté dans le même batch ;
 * - vague 2 — RÉCOMPENSE DE CLIC : un clic COMPTÉ crédite le réglage
 *   `reward_click_a` à l'affilié, UNE SEULE FOIS (clé d'idempotence
 *   `click:<id du clic>`). La route est PUBLIQUE : le montant vient du RÉGLAGE
 *   (jamais du client) et la dédup 24 h existante est la seule garde d'abus —
 *   un clic dédupliqué ne crédite rien. L'affilié doit être `active` et son
 *   utilisateur MEMBRE (monnaie A réservée aux membres) ;
 * - PARCOURS : le clic redirige TOUJOURS vers la page produit du site
 *   (`/produit/?id=…&ars=<jeton>`) — jamais directement vers le paiement —
 *   pour que la découverte se fasse sur Arsenal et que le suivi/opportunité de
 *   compte (popup) s'appliquent ;
 * - PONT DE TRACKING (vague 1) : un jeton OPAQUE et ANONYME est délivré au passage
 *   (jamais dérivé de l'IP ; `visitor_hash` = `sha256(ip+ua+jour)` reste la seule
 *   empreinte). Le jeton est ajouté à l'URL de destination en paramètre `ars` et
 *   renvoyé dans `trackingToken`. Règle d'attribution = DERNIER TOUCHER : si une
 *   session existe déjà pour la MÊME empreinte visiteur, on réécrit son affilié /
 *   lien / produit (rafraîchie à 30 j) et l'entrée précédente reste TRACÉE dans
 *   `tracking_links_history` ; sinon une nouvelle session est créée ;
 * - 404 `{ok:false,error:"Lien inconnu."}` si le code est inconnu,
 *   409 si l'affilié est suspendu, le produit non éligible, ou le produit sans URL
 *   alors qu'aucune origine front valide n'est configurée.
 */

/** Première origine http(s) valide de FRONT_ORIGINS (liste séparée par des virgules). */
function firstValidFrontOrigin(frontOrigins: string | undefined): string | null {
  for (const part of (frontOrigins || "").split(",")) {
    const origin = part.trim().replace(/\/+$/, "");
    if (/^https?:\/\//i.test(origin)) return origin;
  }
  return null;
}

/**
 * Ajoute le jeton de tracking (`ars=<token>`) à une URL de destination, en
 * respectant la query EXISTANTE (`?` ou `&` selon l'URL) — la destination
 * d'origine n'est jamais cassée. Le hash `#…` éventuel est préservé (le
 * paramètre est posé sur la query, avant le fragment) ; un fragment déjà
 * porteur de `ars=` est laissé tel quel (idempotence). Le jeton est encodé.
 */
function withTrackingParam(url: string, token: string): string {
  const trimmed = (url ?? "").trim();
  if (!trimmed || !token) return trimmed;
  const hashIndex = trimmed.indexOf("#");
  const base = hashIndex === -1 ? trimmed : trimmed.slice(0, hashIndex);
  const hash = hashIndex === -1 ? "" : trimmed.slice(hashIndex);
  if (/([?&])ars=/.test(base) || /(^|[&?])ars=/.test(hash.slice(1))) return trimmed;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}ars=${encodeURIComponent(token)}${hash}`;
}

export const affiliateTrackRoutes: App = new Hono<{ Bindings: Env }>().post(
  "/api/track/affiliate-click",
  async (c) => {
    let body: { code?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ ok: false, error: "JSON invalide." }, 400);
    }
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    if (!code) {
      return c.json({ ok: false, error: "Code de lien requis." }, 400);
    }

    const target = await resolveLinkTarget(c.env.DB, code);
    if (!target) {
      return c.json({ ok: false, error: "Lien inconnu." }, 404);
    }
    if (target.affiliate.status === "suspended") {
      return c.json({ ok: false, error: "Affilié suspendu." }, 409);
    }
    if (Number(target.product.affiliate_enabled ?? 0) !== 1) {
      return c.json({ ok: false, error: "Produit non éligible à l'affiliation." }, 409);
    }
    // Destination : URL du tunnel externe, sinon page produit du site (`/produit?id=…`,
    // format du catalogue) — repli pour un produit 100 % A, promouvable sans tunnel.
    // Vague 4 : un lien INACTIF ou SATURÉ n'accepte plus de clic (le plafond de
    // ventes ou la désactivation volontaire l'ont retiré du circuit).
    if (target.link.status && target.link.status !== "active") {
      return c.json({ ok: false, error: "Ce lien affilié n'est plus actif." }, 409);
    }

    // PARCOURS ATTENDU (cahier des charges QA §3, corrigé le 04/10/2026) :
    // lien affilié → PAGE PRODUIT d'Arsenal → découverte → puis achat.
    // L'ancien comportement (rediriger vers `action_url` = tunnel Chariow ou
    // site externe) faisait quitter Arsenal immédiatement : le jeton de suivi
    // n'était jamais mémorisé, donc le pont de tracking et le parrainage étaient
    // inopérants, et l'affilié perdait son attribution.
    // La destination est donc TOUJOURS la page produit du site (format query :
    // la query survit à la normalisation trailingSlash, contrairement au chemin).
    const origin = firstValidFrontOrigin(c.env.FRONT_ORIGINS);
    if (!origin) {
      return c.json({ ok: false, error: "Produit sans URL de destination." }, 409);
    }
    const destination = `${origin}/produit/?id=${encodeURIComponent(target.product.id)}`;

    // Empreinte JOURNALIÈRE : dédup des clics (un même visiteur = 1 clic/jour).
    const visitorHash = visitorHashOf(
      c.req.header("cf-connecting-ip"),
      c.req.header("user-agent")
    );
    // Le clic est enregistré dans les DEUX issues (tunnel externe ou repli page produit) ;
    // dédupliqué sur 24 h : le doublon n'incrémente aucun compteur et ne crédite rien.
    // `clickId` non nul = clic réellement compté (garde anti-abus de la récompense).
    const clickId = await recordAffiliateClickId(c.env.DB, { link: target.link, visitorHash });

    // Récompense de clic (vague 2) : UNIQUEMENT pour un clic compté, un affilié
    // ACTIF et un utilisateur MEMBRE. Montant issu du RÉGLAGE, jamais du client ;
    // clé `click:<clickId>` → un seul crédit par clic compté (INSERT OR IGNORE).
    // Toute la suite est BEST-EFFORT : une récompense ne doit JAMAIS faire échouer
    // la redirection publique du visiteur.
    if (clickId && target.affiliate.status === "active") {
      try {
        const affiliateUser = await c.env.DB
          .prepare("SELECT * FROM users WHERE id = ?")
          .bind(target.affiliate.user_id)
          .first<UserRow>();
        if (affiliateUser && isMember(affiliateUser)) {
          const settings = await readAffiliateSettings(c.env.DB);
          if (settings.rewardClickA > 0) {
            await aTransactionStatement(c.env.DB, {
              userId: affiliateUser.id,
              delta: settings.rewardClickA,
              type: "reward_click",
              label: "Récompense clic",
              refType: "click",
              refId: clickId,
              idempotencyKey: `click:${clickId}`,
            }).run();
          }
        }
      } catch (err) {
        // Jamais bloquant : le clic est déjà compté, la redirection prime.
        console.error("reward_click:", err);
      }
    }

    // PONT DE TRACKING (vague 1) — BEST-EFFORT : jamais bloquant. Le jeton est
    // OPAQUE (UUID serveur), ANONYME (aucune IP ; `visitor_hash` seul, comme
    // partout). Règle DERNIER TOUCHER : la session récente de la MÊME empreinte
    // est réécrite (affilié/lien/produit), l'entrée précédente restant TRACÉE
    // dans `tracking_links_history` ; sinon une nouvelle session est créée.
    let trackingToken: string | null = null;
    try {
      // ⚠️ Empreinte DURABLE (sans le jour) : le suivi doit reconnaître le même
      // visiteur d'un jour à l'autre sur 30 j — l'empreinte journalière ci-dessus
      // ne sert qu'à la dédup des clics.
      const trackHash = trackingVisitorHash(
        c.req.header("cf-connecting-ip"),
        c.req.header("user-agent")
      );
      const previous = await latestTrackingTouch(c.env.DB, trackHash);
      if (previous) {
        await recordTrackingLinkHistory(c.env.DB, {
          token: previous.token,
          affiliateId: previous.affiliate_id,
          linkId: previous.link_id,
          productId: previous.product_id,
        });
        await refreshTrackingTouch(c.env.DB, previous.token, {
          visitorHash,
          affiliateId: target.affiliate.id,
          linkId: target.link.id,
          productId: target.product.id,
          campaignId: target.link.campaign_id,
        });
        trackingToken = previous.token;
      } else {
        trackingToken = await createTrackingSession(c.env.DB, {
          visitorHash: trackHash,
          affiliateId: target.affiliate.id,
          linkId: target.link.id,
          productId: target.product.id,
          campaignId: target.link.campaign_id,
        });
      }
    } catch (err) {
      console.error("tracking:", err);
      trackingToken = null; // la redirection reste prioritaire, sans jeton
    }

    const finalUrl = trackingToken
      ? withTrackingParam(destination, trackingToken)
      : destination;

    return c.json({ ok: true, url: finalUrl, trackingToken });
  }
);
