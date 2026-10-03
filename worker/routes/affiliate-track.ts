import { Hono } from "hono";
import {
  readAffiliateSettings,
  recordAffiliateClickId,
  resolveLinkTarget,
  visitorHashOf,
} from "../../src/lib/server/affiliation";
import { aTransactionStatement } from "../../src/lib/server/ledger";
import { isMember } from "../../src/lib/server/user-auth";
import type { UserRow } from "../../src/lib/server/user-auth";
import type { App, Env } from "../env";

/**
 * Phase 2 — tracking public d'un clic affilié (page `/r/` de l'export statique) :
 * POST /api/track/affiliate-click {code} → 200 {ok, url}
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
 * - produit sans URL (100 % A) : le clic est compté et le visiteur atterrit sur la page
 *   produit du site (`/produit?id=…`, première origine valide de FRONT_ORIGINS) ;
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

    const url = (target.product.action_url || "").trim();
    const origin = firstValidFrontOrigin(c.env.FRONT_ORIGINS);
    const destination =
      url || (origin ? `${origin}/produit?id=${encodeURIComponent(target.product.id)}` : "");
    if (!destination) {
      // Le produit existe mais aucune destination exploitable : rien de sûr à rediriger.
      return c.json({ ok: false, error: "Produit sans URL de destination." }, 409);
    }

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

    return c.json({ ok: true, url: destination });
  }
);
