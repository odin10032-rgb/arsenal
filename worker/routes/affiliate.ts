import { Hono } from "hono";
import { requireAuth } from "./me";
import {
  computeAffiliateStats,
  createAffiliate,
  getAffiliateByUserId,
  getOrCreateAffiliateLink,
  getProductById,
  isSuperAffiliate,
  isUniqueViolation,
  linkUrl,
  listEligibleProducts,
  productPerformanceMap,
  readAffiliateSettings,
  toPublicAffiliate,
} from "../../src/lib/server/affiliation";
import { getActiveCampaign, resolveCommissionRule } from "../../src/lib/server/commissions";
import type { AuthedApp, AuthedEnv } from "../env";

/** 403 générique du contrat (« 403 si non affilié actif »). */
function forbidden(error: string): Response {
  return Response.json({ ok: false, error }, { status: 403 });
}

/**
 * Phase 2 — espace affilié (Bearer requis, `requireAuth` de me.ts) :
 * - POST /api/affiliate/apply                     → 201 {ok, affiliate} (statut pending)
 * - GET  /api/affiliate/me                        → {ok, affiliate|null} (état + statistiques)
 * - GET  /api/affiliate/me/products               → {ok, products} (produits éligibles + performance)
 * - POST /api/affiliate/me/products/:id/link      → {ok, link, linkCode} (lien (re)généré, idempotent)
 *
 * Toutes les lectures sont scopées par l'utilisateur de la SESSION (`authUser`) :
 * aucun identifiant d'affilié ne provient du client. Le rôle `affiliate` n'est pas
 * posé ici — il ne l'est qu'à l'activation par l'admin (contrat).
 */
export const affiliateRoutes: AuthedApp = new Hono<AuthedEnv>()
  .post("/api/affiliate/apply", requireAuth, async (c) => {
    const { user } = c.get("authUser");
    // Corps optionnel : `{ note?: string }` — une note absente ou illisible n'est pas une erreur.
    let raw: { note?: unknown } = {};
    try {
      raw = (await c.req.json()) as { note?: unknown };
    } catch {
      raw = {};
    }
    const note = typeof raw?.note === "string" ? raw.note : null;

    const existing = await getAffiliateByUserId(c.env.DB, user.id);
    if (existing) {
      return c.json({ ok: false, error: "Vous êtes déjà affilié." }, 409);
    }

    let affiliate;
    try {
      affiliate = await createAffiliate(c.env.DB, { userId: user.id, pseudo: user.pseudo, note });
    } catch (err) {
      // Course entre deux candidatures simultanées : UNIQUE(user_id) → même 409.
      if (isUniqueViolation(err)) {
        return c.json({ ok: false, error: "Vous êtes déjà affilié." }, 409);
      }
      throw err;
    }

    const [stats, settings] = await Promise.all([
      computeAffiliateStats(c.env.DB, affiliate),
      readAffiliateSettings(c.env.DB),
    ]);
    return c.json(
      { ok: true, affiliate: toPublicAffiliate(affiliate, stats, isSuperAffiliate(user.role, stats, settings)) },
      201
    );
  })
  .get("/api/affiliate/me", requireAuth, async (c) => {
    const { user } = c.get("authUser");
    const affiliate = await getAffiliateByUserId(c.env.DB, user.id);
    if (!affiliate) return c.json({ ok: true, affiliate: null });

    const [stats, settings] = await Promise.all([
      computeAffiliateStats(c.env.DB, affiliate),
      readAffiliateSettings(c.env.DB),
    ]);
    return c.json({
      ok: true,
      affiliate: toPublicAffiliate(affiliate, stats, isSuperAffiliate(user.role, stats, settings)),
    });
  })
  .get("/api/affiliate/me/products", requireAuth, async (c) => {
    const { user } = c.get("authUser");
    const affiliate = await getAffiliateByUserId(c.env.DB, user.id);
    if (!affiliate) return forbidden("Espace affilié réservé aux affiliés actifs.");
    // Contrat : un affilié suspendu obtient 200 avec une liste vide.
    if (affiliate.status === "suspended") return c.json({ ok: true, products: [] });
    if (affiliate.status !== "active") return forbidden("Espace affilié réservé aux affiliés actifs.");

    const [products, settings, performance] = await Promise.all([
      listEligibleProducts(c.env.DB),
      readAffiliateSettings(c.env.DB),
      productPerformanceMap(c.env.DB, affiliate.id),
    ]);

    const entries = await Promise.all(
      products.map(async (product) => {
        const [campaign, link] = await Promise.all([
          getActiveCampaign(c.env.DB, product.id),
          getOrCreateAffiliateLink(c.env.DB, affiliate, product),
        ]);
        const rule = resolveCommissionRule(product, campaign, settings);
        const stats = performance.get(product.id);
        return {
          id: product.id,
          title: product.title,
          imageUrl: product.image_url,
          price: product.price,
          commissionType: rule.type,
          commissionValue: rule.value,
          rewardA: rule.rewardA,
          clicks: stats?.clicks ?? 0,
          sales: stats?.sales ?? 0,
          conversion: stats?.conversion ?? 0,
          link: linkUrl(link.code),
          linkCode: link.code,
        };
      })
    );

    return c.json({ ok: true, products: entries });
  })
  .post("/api/affiliate/me/products/:productId/link", requireAuth, async (c) => {
    const { user } = c.get("authUser");
    const affiliate = await getAffiliateByUserId(c.env.DB, user.id);
    if (!affiliate || affiliate.status !== "active") {
      return forbidden("Espace affilié réservé aux affiliés actifs.");
    }

    const productId = String(c.req.param("productId") ?? "");
    const product = await getProductById(c.env.DB, productId);
    if (!product) return c.json({ ok: false, error: "Produit introuvable." }, 404);
    if (Number(product.affiliate_enabled ?? 0) !== 1) {
      return forbidden("Produit non éligible à l'affiliation.");
    }

    const link = await getOrCreateAffiliateLink(c.env.DB, affiliate, product);
    return c.json({
      ok: true,
      // Format du contrat : `link` = URL publique (même format que dans la liste des produits).
      link: linkUrl(link.code),
      linkCode: link.code,
      productId: product.id,
    });
  });
