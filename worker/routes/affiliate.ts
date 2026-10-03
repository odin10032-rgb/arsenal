import { Hono } from "hono";
import { requireAuth } from "./me";
import {
  activateAffiliateLink,
  computeAffiliateStats,
  countActiveLinks,
  createAffiliate,
  deactivateAffiliateLink,
  effectiveLimits,
  getAffiliateByUserId,
  getAffiliateLink,
  getProductById,
  isSuperAffiliate,
  isUniqueViolation,
  linkUrl,
  listEligibleProducts,
  listLinksByAffiliate,
  normalizeLinkStatus,
  productPerformanceMap,
  readAffiliateSettings,
  toPublicAffiliate,
} from "../../src/lib/server/affiliation";
import type { AffiliateLinkRow, AffiliateLimits } from "../../src/lib/server/affiliation";
import { createProductRequest } from "../../src/lib/server/product-requests";
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

/** Lien d'affiliation sérialisé pour le front (état réel + URl/ code). */
function linkToJson(link: AffiliateLinkRow | null) {
  if (!link) return null;
  return {
    id: link.id,
    productId: link.product_id,
    link: linkUrl(link.code),
    linkCode: link.code,
    status: normalizeLinkStatus(link.status),
    salesCount: Math.trunc(Number(link.sales_count) || 0),
    createdAt: Number(link.created_at ?? 0),
  };
}

/** Plafonds sérialisés (camelCase) pour le front. */
function limitsToJson(limits: AffiliateLimits) {
  return {
    maxActiveLinks: limits.maxActiveLinks,
    maxSalesPerLink: limits.maxSalesPerLink,
    activeCount: limits.activeCount,
    isSuper: limits.isSuper,
  };
}

/**
 * Phase 2 — espace affilié (Bearer requis, `requireAuth` de me.ts) :
 * - POST /api/affiliate/apply                     → 201 {ok, affiliate} (statut pending)
 * - GET  /api/affiliate/me                        → {ok, affiliate|null} (état + statistiques)
 * - GET  /api/affiliate/me/products               → {ok, products, limits} (état réel, SANS création)
 * - POST /api/affiliate/me/products/:productId/link      → (re)génère le lien (régénération)
 * - POST /api/affiliate/me/products/:productId/activate  → active/réactive (plafonds appliqués)
 * - POST /api/affiliate/me/links/:linkId/deactivate      → désactive (libère un emplacement)
 * - POST /api/affiliate/me/products/:productId/request   → demande produit (Super uniquement)
 * - POST /api/affiliate/me/withdraw                      → retrait volontaire du programme
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

    const [products, settings, performance, links, activeCount] = await Promise.all([
      listEligibleProducts(c.env.DB),
      readAffiliateSettings(c.env.DB),
      productPerformanceMap(c.env.DB, affiliate.id),
      listLinksByAffiliate(c.env.DB, affiliate.id),
      countActiveLinks(c.env.DB, affiliate.id),
    ]);
    const linksByProduct = new Map(links.map((l) => [l.product_id, l]));
    const isSuper = isSuperAffiliate(user.role, await computeAffiliateStats(c.env.DB, affiliate), settings);
    const limits = effectiveLimits(settings, isSuper, activeCount);

    const entries = await Promise.all(
      products.map(async (product) => {
        const campaign = await getActiveCampaign(c.env.DB, product.id);
        const rule = resolveCommissionRule(product, campaign, settings);
        const stats = performance.get(product.id);
        const link = linksByProduct.get(product.id) ?? null;
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
          // ⚠️ AUCUNE création de lien ici : la simple consultation n'attribue rien.
          // `link` n'est renseigné que si un lien existe DÉJÀ pour ce produit.
          link: link ? linkUrl(link.code) : "",
          linkCode: link?.code ?? "",
          linkId: link?.id ?? null,
          linkStatus: link ? normalizeLinkStatus(link.status) : null,
          salesCount: Math.trunc(Number(link?.sales_count) || 0),
        };
      })
    );

    return c.json({ ok: true, products: entries, limits: limitsToJson(limits) });
  })
  /**
   * Activation (ou réactivation) du lien d'un produit — acte VOLONTAIRE.
   * Ordre de vérification serveur : affilié actif ; produit éligible ; lien déjà
   * actif → idempotent ; plafond de liens actifs atteint → 409 avec la liste des
   * liens actifs (le front propose : désactiver lequel, ou abandonner) ;
   * sinon activation. Le serveur décide, le front ne choisit pas à sa place.
   */
  .post("/api/affiliate/me/products/:productId/activate", requireAuth, async (c) => {
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

    const [settings, activeCount, stats] = await Promise.all([
      readAffiliateSettings(c.env.DB),
      countActiveLinks(c.env.DB, affiliate.id),
      computeAffiliateStats(c.env.DB, affiliate),
    ]);
    const isSuper = isSuperAffiliate(user.role, stats, settings);
    const limits = effectiveLimits(settings, isSuper, activeCount);

    const outcome = await activateAffiliateLink(c.env.DB, affiliate, product, limits);
    if (!outcome.ok) {
      // 409 : le front doit proposer un CHOIX (désactiver quel lien, ou abandonner).
      return c.json(
        {
          ok: false,
          error: "Plafond de liens actifs atteint.",
          reason: "limit",
          limits: limitsToJson(outcome.limits),
          activeLinks: outcome.activeLinks.map((l) => linkToJson(l)),
        },
        409
      );
    }
    return c.json({ ok: true, link: linkToJson(outcome.link), limits: limitsToJson(outcome.limits) });
  })
  /** Désactivation d'un lien (libère un emplacement) — propriété vérifiée. */
  .post("/api/affiliate/me/links/:linkId/deactivate", requireAuth, async (c) => {
    const { user } = c.get("authUser");
    const affiliate = await getAffiliateByUserId(c.env.DB, user.id);
    if (!affiliate || affiliate.status !== "active") {
      return forbidden("Espace affilié réservé aux affiliés actifs.");
    }

    const linkId = String(c.req.param("linkId") ?? "");
    // Propriété : le lien doit appartenir à CET affilié (jamais d'id d'affilié client).
    const link = await c.env.DB
      .prepare("SELECT * FROM affiliate_links WHERE id = ? AND affiliate_id = ?")
      .bind(linkId, affiliate.id)
      .first<AffiliateLinkRow>();
    if (!link) return c.json({ ok: false, error: "Lien introuvable." }, 404);

    const changed = await deactivateAffiliateLink(c.env.DB, link.id);
    if (!changed) {
      // Déjà inactif/saturé : idempotent côté client, on renvoie l'état courant.
      const refreshed = await getAffiliateLink(c.env.DB, affiliate.id, link.product_id);
      return c.json({ ok: true, link: linkToJson(refreshed) });
    }
    const refreshed = await getAffiliateLink(c.env.DB, affiliate.id, link.product_id);
    return c.json({ ok: true, link: linkToJson(refreshed) });
  })
  /**
   * Demande de disponibilité produit — RÉSERVÉE au Super-affilié.
   * Idempotente : une seule demande `pending` par (affilié, produit).
   */
  .post("/api/affiliate/me/products/:productId/request", requireAuth, async (c) => {
    const { user } = c.get("authUser");
    const affiliate = await getAffiliateByUserId(c.env.DB, user.id);
    if (!affiliate || affiliate.status !== "active") {
      return forbidden("Espace affilié réservé aux affiliés actifs.");
    }

    const [settings, stats] = await Promise.all([
      readAffiliateSettings(c.env.DB),
      computeAffiliateStats(c.env.DB, affiliate),
    ]);
    if (!isSuperAffiliate(user.role, stats, settings)) {
      return forbidden("Réservé au Super-affilié.");
    }

    const productId = String(c.req.param("productId") ?? "");
    const product = await getProductById(c.env.DB, productId);
    if (!product) return c.json({ ok: false, error: "Produit introuvable." }, 404);
    if (Number(product.affiliate_enabled ?? 0) === 1) {
      return c.json({ ok: false, error: "Ce produit est déjà ouvert à l'affiliation." }, 409);
    }

    let note: string | null = null;
    try {
      const body = (await c.req.json()) as { note?: unknown };
      note = typeof body?.note === "string" ? body.note : null;
    } catch {
      note = null;
    }

    const { request, created } = await createProductRequest(c.env.DB, {
      affiliateId: affiliate.id,
      userId: user.id,
      productId: product.id,
      note,
    });
    if (created) {
      // Journalisation directe : l'union `SecurityEventAction` (user-auth.ts, hors
      // périmètre de cette vague) n'expose pas encore d'action dédiée aux demandes
      // de produit non-admin. On écrit donc l'événement avec le même format de table.
      await c.env.DB
        .prepare(
          "INSERT INTO security_events (id, at, actor, action, ip_hash, meta) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .bind(
          crypto.randomUUID(),
          Date.now(),
          user.id,
          "product_request_create",
          null,
          JSON.stringify({ affiliateId: affiliate.id, productId: product.id, requestId: request.id })
        )
        .run();
    }
    return c.json(
      {
        ok: true,
        created,
        request: {
          id: request.id,
          productId: request.product_id,
          status: request.status,
          createdAt: Number(request.created_at),
        },
      },
      created ? 201 : 200
    );
  })
  /**
   * Retrait volontaire du programme d'affiliation — état `withdrawn` (distinct
   * d'une sanction `suspended`). Le rôle `users.role` redevient `user` ;
   * `membership` est CONSERVÉ (la monnaie A ne dépend pas de l'affiliation).
   */
  .post("/api/affiliate/me/withdraw", requireAuth, async (c) => {
    const { user } = c.get("authUser");
    const affiliate = await getAffiliateByUserId(c.env.DB, user.id);
    if (!affiliate) return forbidden("Vous n'êtes pas affilié.");
    if (affiliate.status === "withdrawn") {
      return c.json({ ok: true, status: "withdrawn" });
    }

    const now = Date.now();
    await c.env.DB.batch([
      // Statut de l'affilié + libération des emplacements (tous les liens actifs
      // du retraité cessent d'attribuer — les ventes acquises restent comptées).
      c.env.DB
        .prepare("UPDATE affiliates SET status = 'withdrawn', updated_at = ? WHERE id = ?")
        .bind(now, affiliate.id),
      c.env.DB
        .prepare("UPDATE affiliate_links SET status = 'inactive' WHERE affiliate_id = ? AND status = 'active'")
        .bind(affiliate.id),
      // Le rôle redevient `user` (jamais depuis admin) — membership NON touché.
      c.env.DB
        .prepare("UPDATE users SET role = 'user', updated_at = ? WHERE id = ? AND role = 'affiliate'")
        .bind(now, user.id),
      statusHistoryStatement(c.env.DB, {
        userId: user.id,
        fromRole: user.role,
        toRole: "user",
        reason: "withdraw",
        now,
      }),
      // Même remarque que pour la demande de produit : action non whitelistée,
      // insérée directement au format de `security_events`.
      c.env.DB
        .prepare(
          "INSERT INTO security_events (id, at, actor, action, ip_hash, meta) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .bind(
          crypto.randomUUID(),
          now,
          user.id,
          "affiliate_withdraw",
          null,
          JSON.stringify({ affiliateId: affiliate.id })
        ),
    ]);
    return c.json({ ok: true, status: "withdrawn" });
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

    // ⚠️ Cette route historique crée/renvoie le lien SANS appliquer le plafond :
    // elle est conservée pour compatibilité (régénération), mais l'activation
    // officielle passe par `…/activate`. On délègue donc à l'activation idempotente
    // pour ne pas laisser un moyen de contourner les plafonds.
    const [settings, activeCount, stats] = await Promise.all([
      readAffiliateSettings(c.env.DB),
      countActiveLinks(c.env.DB, affiliate.id),
      computeAffiliateStats(c.env.DB, affiliate),
    ]);
    const limits = effectiveLimits(settings, isSuperAffiliate(user.role, stats, settings), activeCount);
    const outcome = await activateAffiliateLink(c.env.DB, affiliate, product, limits);
    if (!outcome.ok || !outcome.link) {
      return c.json(
        {
          ok: false,
          error: "Plafond de liens actifs atteint.",
          reason: "limit",
          limits: limitsToJson(outcome.limits),
          activeLinks: outcome.activeLinks.map((l) => linkToJson(l)),
        },
        409
      );
    }
    return c.json({
      ok: true,
      // Format du contrat : `link` = URL publique (même format que dans la liste des produits).
      link: linkUrl(outcome.link.code),
      linkCode: outcome.link.code,
      productId: product.id,
    });
  });
