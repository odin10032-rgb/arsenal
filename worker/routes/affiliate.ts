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
import {
  isEligible,
  isSuperRequested,
  markUnlockSeenStatement,
  readCampaignProgressForAffiliate,
  readSuperProgress,
  readUnlockPending,
  statusHistoryStatement,
  superCriteria,
  unlockEventStatement,
} from "../../src/lib/server/super-affiliate";
import { securityEventStatement } from "../../src/lib/server/user-auth";
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

    // Phase 3 — progression Super Affiliate + animation de déblocage en attente.
    const criteria = superCriteria(settings);
    const progress = await readSuperProgress(c.env.DB, affiliate.id);
    const [requested, unlockPending] = await Promise.all([
      isSuperRequested(c.env.DB, user.id),
      readUnlockPending(c.env.DB, user.id),
    ]);

    return c.json({
      ok: true,
      affiliate: toPublicAffiliate(affiliate, stats, isSuperAffiliate(user.role, stats, settings)),
      super: {
        requested,
        eligible: isEligible(criteria, progress),
        criteria,
        progress,
      },
      unlockPending: unlockPending ? unlockPending.status : null,
    });
  })
  /**
   * Historique de statut de l'affilié (la table `status_history` était écrite
   * mais jamais lue). Scopé par la session : aucun identifiant d'affilié ne
   * vient du client. `from_role`/`to_role` portent tantôt des RÔLES, tantôt des
   * STATUTS (dualité historique du schéma) — le front mappe les deux.
   */
  .get("/api/affiliate/me/history", requireAuth, async (c) => {
    const { user } = c.get("authUser");
    if (!(await getAffiliateByUserId(c.env.DB, user.id))) {
      return c.json({ ok: true, history: [] });
    }
    const { results = [] } = await c.env.DB
      .prepare(
        `SELECT id, from_role, to_role, reason, created_at
           FROM status_history
          WHERE user_id = ?
          ORDER BY created_at DESC, id DESC
          LIMIT 100`
      )
      .bind(user.id)
      .all<{ id: string; from_role: string | null; to_role: string; reason: string | null; created_at: number }>();
    return c.json({
      ok: true,
      history: (results || []).map((row) => ({
        id: row.id,
        fromRole: row.from_role ?? null,
        toRole: row.to_role,
        reason: row.reason ?? null,
        createdAt: Number(row.created_at),
      })),
    });
  })
  /** Phase 3 — candidature Super Affiliate (validation ADMIN ultérieure, §19). */
  .post("/api/affiliate/me/upgrade", requireAuth, async (c) => {
    const { user } = c.get("authUser");
    const affiliate = await getAffiliateByUserId(c.env.DB, user.id);
    if (!affiliate || affiliate.status !== "active") {
      return forbidden("Espace affilié réservé aux affiliés actifs.");
    }
    if (user.role === "super_affiliate") {
      return c.json({ ok: false, error: "Vous êtes déjà Super Affiliate." }, 409);
    }

    const settings = await readAffiliateSettings(c.env.DB);
    const criteria = superCriteria(settings);
    const progress = await readSuperProgress(c.env.DB, affiliate.id);
    if (!isEligible(criteria, progress)) {
      return c.json(
        { ok: false, error: "Critères non atteints pour devenir Super Affiliate.", criteria, progress },
        403
      );
    }

    const requested = await isSuperRequested(c.env.DB, user.id);
    if (!requested) {
      await c.env.DB.batch([
        statusHistoryStatement(c.env.DB, {
          userId: user.id,
          fromRole: user.role,
          toRole: "super_affiliate",
          reason: "request",
        }),
        securityEventStatement(c.env.DB, {
          actor: user.id,
          action: "super_upgrade_request",
          meta: { affiliateId: affiliate.id },
        }),
      ]);
    }
    return c.json({ ok: true, requested: true }, requested ? 200 : 201);
  })
  /** Phase 3 — campagnes actives visibles par l'affilié. */
  .get("/api/affiliate/me/campaigns", requireAuth, async (c) => {
    const { user } = c.get("authUser");
    const affiliate = await getAffiliateByUserId(c.env.DB, user.id);
    if (!affiliate || affiliate.status !== "active") {
      return forbidden("Espace affilié réservé aux affiliés actifs.");
    }

    const now = Date.now();
    const { results = [] } = await c.env.DB
      .prepare(
        `SELECT c.*, p.title AS product_title
           FROM campaigns c LEFT JOIN products p ON p.id = c.product_id
          WHERE c.status = 'active'
          ORDER BY c.created_at DESC, c.id DESC
          LIMIT 100`
      )
      .all<any>();

    const campaigns = await Promise.all(
      (results || []).map(async (row) => {
        const progress = await readCampaignProgressForAffiliate(c.env.DB, {
          campaignId: row.id,
          productId: row.product_id,
          affiliateId: affiliate.id,
        });
        const joined = await c.env.DB
          .prepare("SELECT 1 AS ok FROM campaign_participants WHERE campaign_id = ? AND affiliate_id = ?")
          .bind(row.id, affiliate.id)
          .first<{ ok: number }>();
        return {
          id: row.id,
          name: row.name,
          productName: row.product_title ?? null,
          endsAt: row.ends_at != null ? Number(row.ends_at) : null,
          commissionType: row.commission_type,
          commissionValue: row.commission_value != null ? Number(row.commission_value) : null,
          rewardA: Math.trunc(Number(row.reward_a) || 0),
          goalSales: row.goal_sales != null ? Math.trunc(Number(row.goal_sales)) : null,
          mySales: progress.mySales,
          myClicks: progress.myClicks,
          joined: Boolean(joined),
          // Une campagne dont la période est expirée reste visible mais marquée.
          expired: row.ends_at != null && Number(row.ends_at) < now,
        };
      })
    );
    return c.json({ ok: true, campaigns });
  })
  .post("/api/affiliate/me/campaigns/:id/join", requireAuth, async (c) => {
    const { user } = c.get("authUser");
    const affiliate = await getAffiliateByUserId(c.env.DB, user.id);
    if (!affiliate || affiliate.status !== "active") {
      return forbidden("Espace affilié réservé aux affiliés actifs.");
    }
    const campaignId = String(c.req.param("id") ?? "");
    const campaign = await c.env.DB
      .prepare("SELECT id, status FROM campaigns WHERE id = ?")
      .bind(campaignId)
      .first<{ id: string; status: string }>();
    if (!campaign || campaign.status !== "active") {
      return c.json({ ok: false, error: "Campagne introuvable ou inactive." }, 404);
    }
    await c.env.DB
      .prepare(
        `INSERT OR IGNORE INTO campaign_participants (campaign_id, affiliate_id, joined_at) VALUES (?, ?, ?)`
      )
      .bind(campaignId, affiliate.id, Date.now())
      .run();
    return c.json({ ok: true, joined: true });
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
