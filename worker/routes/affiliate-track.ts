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
 * - 404 `{ok:false,error:"Lien inconnu."}` si le code est inconnu,
 *   409 si l'affilié est suspendu ou le produit non éligible.
 */
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
    const url = (target.product.action_url || "").trim();
    if (!url) {
      // Le produit existe mais n'a pas de destination : rien de sûr à rediriger.
      return c.json({ ok: false, error: "Produit sans URL de destination." }, 409);
    }

    const visitorHash = visitorHashOf(
      c.req.header("cf-connecting-ip"),
      c.req.header("user-agent")
    );
    // Le clic est dédupliqué sur 24 h : le doublon n'incrémente aucun compteur.
    await recordAffiliateClick(c.env.DB, { link: target.link, visitorHash });

    return c.json({ ok: true, url });
  }
);
