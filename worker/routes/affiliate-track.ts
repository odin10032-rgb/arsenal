import { Hono } from "hono";
import {
  recordAffiliateClick,
  resolveLinkTarget,
  visitorHashOf,
} from "../../src/lib/server/affiliation";
import type { App, Env } from "../env";

/**
 * Phase 2 — tracking public d'un clic affilié (page `/r/` de l'export statique) :
 * POST /api/track/affiliate-click {code} → 200 {ok, url}
 *
 * - dédup : au plus 1 clic compté par (lien, empreinte visiteur) sur 24 h ;
 * - `visitor_hash = sha256(ip + user-agent + jour)` — l'IP BRUTE n'est jamais stockée ;
 * - le compteur global `clicks_by_product` existant est incrémenté dans le même batch ;
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
    // dédupliqué sur 24 h : le doublon n'incrémente aucun compteur.
    await recordAffiliateClick(c.env.DB, { link: target.link, visitorHash });

    return c.json({ ok: true, url: destination });
  }
);
