import { Hono } from "hono";
import type { Context } from "hono";
import { isAdmin, unauthorized, sha256hex } from "../../src/lib/server/auth";
import { securityEventStatement } from "../../src/lib/server/user-auth";
import { getSetting, setSetting } from "../../src/lib/server/store";
import {
  isSuperRequested,
  statusHistoryStatement,
  unlockEventStatement,
} from "../../src/lib/server/super-affiliate";
import {
  AFFILIATE_STATUSES,
  CHARIOW_WEBHOOK_SECRET_KEY,
  affiliateStatsMap,
  getAffiliateById,
  getAffiliateByCode,
  getAffiliateWithUserById,
  getProductById,
  isAffiliateSettingKey,
  isUniqueViolation,
  listAffiliatesAdmin,
  readAffiliateSettings,
  readChariowWebhookSecret,
  round2,
  writeAffiliateSetting,
} from "../../src/lib/server/affiliation";
import type { AffiliateStats, AffiliateWithUser } from "../../src/lib/server/affiliation";
import {
  COMMISSION_STATES,
  CommissionStateError,
  SALE_STATES,
  assertCommissionTransition,
  changesOf,
  commissionStateStatement,
  computeCommissionAmount,
  createSaleWithCommission,
  getActiveCampaign,
  getAdminCommissionById,
  getAdminSaleById,
  getCommissionBySaleId,
  getPaymentById,
  getSaleById,
  getSaleByRef,
  isCommissionState,
  isSaleState,
  listCommissionsAdmin,
  listPaymentsAdmin,
  listSalesAdmin,
  recordPayment,
  resolveCommissionRule,
} from "../../src/lib/server/commissions";
import type {
  AdminCommissionRow,
  AdminSaleRow,
  AdminPaymentRow,
  CommissionRow,
} from "../../src/lib/server/commissions";
import { readChariowApiKey } from "../../src/lib/server/chariow-checkout";
import { isPurchaseSettingKey, readPurchaseMaxPerMin, writePurchaseSetting } from "../../src/lib/server/purchases";
// Chantier B — pages légales : clés et validation partagées avec la route publique GET /api/legal.
import { LEGAL_SETTING_KEYS, isLegalSettingKey } from "./legal";
// Affichage du site public : clés et normalisation partagées avec GET /api/site-config.
import { SITE_SETTING_KEYS, isSiteSettingKey, normalizeSiteSetting } from "./site-config";
import type { App, Env } from "../env";

/* --------------------------------- Utilitaires --------------------------------- */

type AdminContext = Context<{ Bindings: Env }, any, any>;

/** X-Admin-Auth réutilisé tel quel (isAdmin + unauthorized de auth.ts). */
async function requireAdmin(c: AdminContext): Promise<Response | null> {
  if (await isAdmin(c.req.raw, c.env)) return null;
  return unauthorized();
}

/** Minimisation : seule l'empreinte sha256 de l'IP est journalisée. */
function ipHashOf(header: string | undefined): string {
  return sha256hex(header || "unknown");
}

function badRequest(error: string): Response {
  return Response.json({ ok: false, error }, { status: 400 });
}

function notFound(error: string): Response {
  return Response.json({ ok: false, error }, { status: 404 });
}

function conflict(error: string): Response {
  return Response.json({ ok: false, error }, { status: 409 });
}

async function readJson(c: AdminContext): Promise<Record<string, unknown> | null> {
  try {
    const body = await c.req.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

const EMPTY_STATS: AffiliateStats = {
  clicks: 0,
  sales: 0,
  conversion: 0,
  aEarned: 0,
  commissionTotal: 0,
  pending: 0,
  payable: 0,
  paid: 0,
};

/* ------------------------------- Sérialisation ------------------------------- */

function affiliateToJson(row: AffiliateWithUser, stats: AffiliateStats) {
  return {
    id: row.id,
    userId: row.user_id,
    pseudo: row.pseudo,
    email: row.email,
    role: row.role,
    code: row.code,
    status: row.status,
    note: row.note,
    appliedAt: Number(row.applied_at ?? 0),
    activatedAt: row.activated_at != null ? Number(row.activated_at) : 0,
    updatedAt: Number(row.updated_at ?? 0),
    clicks: stats.clicks,
    sales: stats.sales,
    conversion: stats.conversion,
    aEarned: stats.aEarned,
    commissionTotal: stats.commissionTotal,
    pending: stats.pending,
    payable: stats.payable,
    paid: stats.paid,
  };
}

function saleToJson(row: AdminSaleRow) {
  return {
    id: row.id,
    saleRef: row.sale_ref,
    affiliateId: row.affiliate_id,
    affiliateCode: row.affiliate_code ?? null,
    affiliatePseudo: row.affiliate_pseudo ?? null,
    productId: row.product_id,
    productTitle: row.product_title ?? null,
    linkId: row.link_id,
    source: row.source,
    amount: Number(row.amount),
    currency: row.currency,
    state: row.state,
    occurredAt: Number(row.occurred_at),
    createdAt: Number(row.created_at),
    confirmedBy: row.confirmed_by,
    confirmedAt: row.confirmed_at != null ? Number(row.confirmed_at) : null,
  };
}

function commissionToJson(row: AdminCommissionRow | CommissionRow) {
  const joined = row as AdminCommissionRow;
  return {
    id: row.id,
    saleId: row.sale_id,
    saleRef: joined.sale_ref ?? null,
    saleSource: joined.sale_source ?? null,
    saleState: joined.sale_state ?? null,
    affiliateId: row.affiliate_id,
    affiliateCode: joined.affiliate_code ?? null,
    affiliatePseudo: joined.affiliate_pseudo ?? null,
    productId: joined.product_id ?? null,
    productTitle: joined.product_title ?? null,
    amount: Number(row.amount),
    currency: row.currency,
    ratePercent: row.rate_percent != null ? Number(row.rate_percent) : null,
    state: row.state,
    rewardA: Math.trunc(Number(row.reward_a) || 0),
    paymentId: row.payment_id,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function paymentToJson(row: AdminPaymentRow) {
  return {
    id: row.id,
    affiliateId: row.affiliate_id,
    affiliateCode: row.affiliate_code ?? null,
    affiliatePseudo: row.affiliate_pseudo ?? null,
    amount: Number(row.amount),
    currency: row.currency,
    reference: row.reference,
    state: row.state,
    note: row.note,
    createdAt: Number(row.created_at),
    paidAt: row.paid_at != null ? Number(row.paid_at) : null,
  };
}

/**
 * Réglages effectifs pour l'admin : ni le secret du webhook ni la clé API
 * Chariow ne sont JAMAIS renvoyés en clair (un booléen `*_configured` suffit).
 * Chantier B : les textes des pages légales sont PUBLICS — renvoyés BRUTS
 * (défaut "" tant que l'admin ne les a pas renseignés).
 */
async function settingsJson(db: D1Database) {
  const [settings, secret, apiKey, purchaseMaxPerMin, legalPrivacy, legalTerms, legalNotice, homeShowStats] =
    await Promise.all([
      readAffiliateSettings(db),
      readChariowWebhookSecret(db),
      readChariowApiKey(db),
      readPurchaseMaxPerMin(db),
      getSetting(db, LEGAL_SETTING_KEYS.privacy),
      getSetting(db, LEGAL_SETTING_KEYS.terms),
      getSetting(db, LEGAL_SETTING_KEYS.notice),
      getSetting(db, SITE_SETTING_KEYS.homeShowStats),
    ]);
  return {
    ...settings,
    chariow_webhook_secret: "",
    chariow_webhook_secret_configured: Boolean(secret),
    // Phase 2.6 — vente en A : clé API Chariow (masquée) et plafond d'achats/min.
    chariow_api_key: "",
    chariow_api_key_configured: Boolean(apiKey),
    purchase_max_per_min: purchaseMaxPerMin,
    // Chantier B — pages légales : textes publics, jamais masqués.
    legal_privacy: legalPrivacy ?? "",
    legal_terms: legalTerms ?? "",
    legal_notice: legalNotice ?? "",
    // Affichage public : « 1 » (défaut) = statistiques visibles sur l'accueil.
    home_show_stats: homeShowStats ?? "1",
  };
}

/** Transitions administrables du contrat : pending→active, active→suspended, suspended→active. */
const AFFILIATE_TRANSITIONS: Record<string, string[]> = {
  pending: ["active"],
  active: ["suspended"],
  suspended: ["active"],
};

/**
 * Phase 2 — administration de l'affiliation (X-Admin-Auth) :
 * - GET  /api/admin/affiliates?status=       liste (user, code, statut, clics, ventes, commissions, dates)
 * - POST /api/admin/affiliates/:id/status    pending→active | active→suspended | suspended→active
 * - GET  /api/admin/sales?state=&affiliate_id=   ventes + attribution + état
 * - POST /api/admin/sales                    ajout manuel d'une vente (repli si webhook indisponible)
 * - POST /api/admin/sales/:id/state          confirmed | rejected (idempotent, jamais de double commission)
 * - GET  /api/admin/commissions?state=&affiliate_id=
 * - POST /api/admin/commissions/:id/state    transitions STRICTES (409 sinon)
 * - GET  /api/admin/payments?affiliate_id=
 * - POST /api/admin/payments                 paiement manuel + payable→paid dans le même batch
 * - GET  /api/admin/settings                 réglages (clés whitelistées, secrets masqués)
 * - POST /api/admin/settings                 écriture des réglages whitelistés
 *   (Phase 2.6 : `chariow_api_key` masquée et `purchase_max_per_min` ajoutées à la whitelist)
 *   (Chantier B : `legal_privacy`, `legal_terms`, `legal_notice` — textes PUBLICS,
 *    une valeur vide EFFACE volontairement le contenu)
 *
 * Chaque MUTATION écrit un `security_events` (action `admin_*`) dans le même
 * batch que l'écriture métier.
 */
export const adminAffiliationRoutes: App = new Hono<{ Bindings: Env }>()
  .get("/api/admin/affiliates", async (c) => {
    const denied = await requireAdmin(c);
    if (denied) return denied;

    const status = c.req.query("status")?.trim() || null;
    if (status && !(AFFILIATE_STATUSES as readonly string[]).includes(status)) {
      return badRequest("Statut d'affilié invalide.");
    }
    const affiliates = await listAffiliatesAdmin(c.env.DB, status);
    const stats = await affiliateStatsMap(c.env.DB, affiliates);
    // Phase 3 : demande de promotion Super Affiliate en cours ?
    const superRequestedMap = new Map<string, boolean>();
    await Promise.all(
      affiliates.map(async (a) => {
        superRequestedMap.set(a.id, await isSuperRequested(c.env.DB, a.user_id));
      })
    );
    return c.json({
      ok: true,
      affiliates: affiliates.map((a) => ({
        ...affiliateToJson(a, stats.get(a.id) ?? EMPTY_STATS),
        superRequested: superRequestedMap.get(a.id) ?? false,
      })),
    });
  })
  /**
   * Phase 3 — promotion Super Affiliate (action ADMIN, §19) : rôle
   * `super_affiliate` + historique + événement d'animation (une seule fois).
   */
  .post("/api/admin/affiliates/:id/promote-super", async (c) => {
    const denied = await requireAdmin(c);
    if (denied) return denied;

    let body: { reason?: unknown } = {};
    try {
      body = (await c.req.json()) as { reason?: unknown };
    } catch {
      body = {};
    }
    const reason = typeof body.reason === "string" ? body.reason.slice(0, 200) : null;

    const affiliate = await getAffiliateById(c.env.DB, c.req.param("id"));
    if (!affiliate) return notFound("Affilié introuvable.");

    const userRow = await c.env.DB
      .prepare("SELECT id, role FROM users WHERE id = ?")
      .bind(affiliate.user_id)
      .first<{ id: string; role: string }>();
    if (!userRow) return notFound("Utilisateur introuvable pour cet affilié.");

    const alreadySuper = userRow.role === "super_affiliate";
    const now = Date.now();
    await c.env.DB.batch([
      // Rôle (aucun effet si déjà super) + historique + animation (OR IGNORE).
      c.env.DB
        .prepare(`UPDATE users SET role = 'super_affiliate', updated_at = ? WHERE id = ?`)
        .bind(now, userRow.id),
      statusHistoryStatement(c.env.DB, {
        userId: userRow.id,
        fromRole: userRow.role,
        toRole: "super_affiliate",
        reason: reason ?? "admin_promotion",
        now,
      }),
      unlockEventStatement(c.env.DB, { userId: userRow.id, status: "super_affiliate", now }),
      securityEventStatement(c.env.DB, {
        actor: "admin",
        action: "admin_super_promote",
        ipHash: ipHashOf(c.req.header("cf-connecting-ip")),
        meta: { affiliateId: affiliate.id, userId: userRow.id, alreadySuper, reason },
      }),
    ]);

    return c.json({
      ok: true,
      user: { id: userRow.id, role: "super_affiliate" },
      unlocked: !alreadySuper,
    });
  })
  .post("/api/admin/affiliates/:id/status", async (c) => {
    const denied = await requireAdmin(c);
    if (denied) return denied;

    const body = await readJson(c);
    if (!body) return badRequest("JSON invalide.");
    const target = String(body.status ?? "").trim();
    const reason =
      typeof body.reason === "string" && body.reason.trim()
        ? body.reason.trim().slice(0, 300)
        : null;
    if (target !== "active" && target !== "suspended") {
      return badRequest("Statut cible invalide (active ou suspended).");
    }

    const db = c.env.DB;
    const affiliate = await getAffiliateWithUserById(db, c.req.param("id"));
    if (!affiliate) return notFound("Affilié introuvable.");

    const allowed = AFFILIATE_TRANSITIONS[affiliate.status] ?? [];
    if (!allowed.includes(target)) {
      return conflict(`Transition de statut invalide : ${affiliate.status} → ${target}.`);
    }

    const now = Date.now();
    const activating = target === "active";
    const activatedAt = activating ? (affiliate.activated_at ?? now) : affiliate.activated_at;

    const statements: D1PreparedStatement[] = [
      // UPDATE gardé par le statut lu : deux validations concurrentes ne peuvent pas se doubler.
      db
        .prepare(
          "UPDATE affiliates SET status = ?, updated_at = ?, activated_at = ? WHERE id = ? AND status = ?"
        )
        .bind(target, now, activatedAt, affiliate.id, affiliate.status),
    ];
    if (activating) {
      // Le rôle `affiliate` n'est posé qu'à l'activation — et jamais sur un super_affiliate/admin.
      statements.push(
        db
          .prepare("UPDATE users SET role = 'affiliate', updated_at = ? WHERE id = ? AND role = 'user'")
          .bind(now, affiliate.user_id)
      );
      statements.push(
        db
          .prepare(
            "INSERT OR IGNORE INTO status_unlock_events (id, user_id, status, created_at) VALUES (?, ?, 'affiliate', ?)"
          )
          .bind(crypto.randomUUID(), affiliate.user_id, now)
      );
    }
    statements.push(
      db
        .prepare(
          "INSERT INTO status_history (id, user_id, from_role, to_role, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .bind(
          crypto.randomUUID(),
          affiliate.user_id,
          activating ? affiliate.status : "affiliate",
          activating ? "affiliate" : "suspended",
          reason,
          now
        )
    );
    statements.push(
      securityEventStatement(db, {
        actor: "admin",
        action: "admin_affiliate_status",
        ipHash: ipHashOf(c.req.header("cf-connecting-ip")),
        meta: { affiliateId: affiliate.id, from: affiliate.status, to: target, reason },
      })
    );

    const results = await db.batch(statements);
    if (changesOf(results[0]) === 0) {
      return conflict("Statut modifié entre-temps.");
    }

    const updated = await getAffiliateWithUserById(db, affiliate.id);
    if (!updated) return notFound("Affilié introuvable.");
    const stats = (await affiliateStatsMap(db, [updated])).get(updated.id) ?? EMPTY_STATS;
    return c.json({ ok: true, affiliate: affiliateToJson(updated, stats) });
  })
  .get("/api/admin/sales", async (c) => {
    const denied = await requireAdmin(c);
    if (denied) return denied;

    const state = c.req.query("state")?.trim() || null;
    if (state && !(SALE_STATES as readonly string[]).includes(state)) {
      return badRequest("État de vente invalide.");
    }
    const affiliateId = c.req.query("affiliate_id")?.trim() || null;
    const sales = await listSalesAdmin(c.env.DB, { state, affiliateId });
    return c.json({ ok: true, sales: sales.map(saleToJson) });
  })
  .post("/api/admin/sales", async (c) => {
    const denied = await requireAdmin(c);
    if (denied) return denied;

    const body = await readJson(c);
    if (!body) return badRequest("JSON invalide.");
    const affiliateCode = String(body.affiliateCode ?? "").trim();
    const productId = String(body.productId ?? "").trim();
    const saleRef = String(body.saleRef ?? "").trim();
    const amount = Number(body.amount);
    if (!affiliateCode) return badRequest("affiliateCode requis.");
    if (!productId) return badRequest("productId requis.");
    if (!saleRef) return badRequest("saleRef requis.");
    if (!Number.isFinite(amount) || amount < 0) return badRequest("Montant invalide.");
    const currency =
      typeof body.currency === "string" && body.currency.trim()
        ? body.currency.trim().toUpperCase().slice(0, 8)
        : "FCFA";
    const occurredAt =
      Number.isFinite(Number(body.occurredAt)) && Number(body.occurredAt) > 0
        ? Math.trunc(Number(body.occurredAt))
        : Date.now();

    const db = c.env.DB;
    const affiliate = await getAffiliateByCode(db, affiliateCode);
    if (!affiliate) return notFound("Affilié introuvable.");
    const affiliateWithUser = await getAffiliateWithUserById(db, affiliate.id);
    const product = await getProductById(db, productId);
    if (!product) return notFound("Produit introuvable.");

    if (await getSaleByRef(db, saleRef)) {
      return conflict("Cette référence de vente existe déjà.");
    }

    const [campaign, settings] = await Promise.all([
      getActiveCampaign(db, product.id),
      readAffiliateSettings(db),
    ]);
    const rule = resolveCommissionRule(product, campaign, settings);
    const { amount: commissionAmount, ratePercent } = computeCommissionAmount(amount, rule);

    let created;
    try {
      created = await createSaleWithCommission(
        db,
        {
          saleRef,
          productId: product.id,
          affiliateId: affiliate.id,
          linkId: null,
          source: "manual",
          amount,
          currency,
          occurredAt,
          commission: { amount: commissionAmount, ratePercent, rewardA: rule.rewardA },
          rewardUserId: affiliate.user_id,
          confirmedBy: "admin",
        },
        [
          securityEventStatement(db, {
            actor: "admin",
            action: "admin_sale_create",
            ipHash: ipHashOf(c.req.header("cf-connecting-ip")),
            meta: {
              saleRef,
              affiliateId: affiliate.id,
              productId: product.id,
              amount: round2(amount),
              currency,
              commissionAmount,
              rewardA: rule.rewardA,
            },
          }),
        ]
      );
    } catch (err) {
      if (isUniqueViolation(err)) return conflict("Cette référence de vente existe déjà.");
      throw err;
    }

    const [saleRow, commissionRow] = await Promise.all([
      getAdminSaleById(db, created.saleId),
      created.commissionId
        ? getAdminCommissionById(db, created.commissionId)
        : Promise.resolve(null),
    ]);
    const saleJson = saleRow
      ? saleToJson({
          ...saleRow,
          affiliate_code: affiliate.code,
          affiliate_pseudo: affiliateWithUser?.pseudo ?? null,
          product_title: product.title,
        })
      : null;
    return c.json(
      { ok: true, sale: saleJson, commission: commissionRow ? commissionToJson(commissionRow) : null },
      201
    );
  })
  .post("/api/admin/sales/:id/state", async (c) => {
    const denied = await requireAdmin(c);
    if (denied) return denied;

    const body = await readJson(c);
    if (!body) return badRequest("JSON invalide.");
    const target = String(body.state ?? "").trim();
    const reason =
      typeof body.reason === "string" && body.reason.trim()
        ? body.reason.trim().slice(0, 300)
        : null;
    // Le contrat n'autorise que confirmed | rejected (pending reste l'état par défaut en base).
    if (!isSaleState(target) || target === "pending") {
      return badRequest("État cible invalide (confirmed ou rejected).");
    }

    const db = c.env.DB;
    const now = Date.now();
    const sale = await getSaleById(db, c.req.param("id"));
    if (!sale) return notFound("Vente introuvable.");
    const commission = await getCommissionBySaleId(db, sale.id);

    const statements: D1PreparedStatement[] = [];
    if (target === "rejected") {
      // Un rejet n'annule JAMAIS une commission déjà payée (argent versé à l'affilié).
      if (commission?.state === "paid") {
        return conflict("Commission déjà payée — rejet impossible.");
      }
      statements.push(
        db
          .prepare("UPDATE sales SET state = 'rejected' WHERE id = ? AND state != 'rejected'")
          .bind(sale.id)
      );
      if (commission && commission.state !== "cancelled") {
        statements.push(commissionStateStatement(db, commission, "cancelled", null, now));
      }
    } else {
      statements.push(
        db
          .prepare(
            "UPDATE sales SET state = 'confirmed', confirmed_by = 'admin', confirmed_at = ? WHERE id = ? AND state != 'confirmed'"
          )
          .bind(now, sale.id)
      );
      if (commission && commission.state === "cancelled") {
        // Réactivation : la commission redevient due (et le tracé du paiement est purgé).
        statements.push(
          db
            .prepare(
              "UPDATE commissions SET state = 'pending', updated_at = ?, payment_id = NULL WHERE id = ? AND state = 'cancelled'"
            )
            .bind(now, commission.id)
        );
      } else if (!commission && sale.affiliate_id) {
        // Vente attribuée sans commission (anomalie) : on la crée, jamais en double.
        const product = await getProductById(db, sale.product_id);
        if (product) {
          const [campaign, settings] = await Promise.all([
            getActiveCampaign(db, sale.product_id),
            readAffiliateSettings(db),
          ]);
          const rule = resolveCommissionRule(product, campaign, settings);
          const computed = computeCommissionAmount(Number(sale.amount) || 0, rule);
          statements.push(
            db
              .prepare(
                `INSERT OR IGNORE INTO commissions
                   (id, sale_id, affiliate_id, amount, currency, rate_percent, state, reward_a, created_at, updated_at, payment_id)
                 VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, NULL)`
              )
              .bind(
                crypto.randomUUID(),
                sale.id,
                sale.affiliate_id,
                computed.amount,
                sale.currency,
                computed.ratePercent,
                rule.rewardA,
                now,
                now
              )
          );
        }
      }
    }
    statements.push(
      securityEventStatement(db, {
        actor: "admin",
        action: "admin_sale_state",
        ipHash: ipHashOf(c.req.header("cf-connecting-ip")),
        meta: { saleId: sale.id, from: sale.state, to: target, reason },
      })
    );

    await db.batch(statements);

    const [saleRow, refreshedCommission] = await Promise.all([
      getAdminSaleById(db, sale.id),
      getCommissionBySaleId(db, sale.id),
    ]);
    const commissionRow = refreshedCommission
      ? await getAdminCommissionById(db, refreshedCommission.id)
      : null;
    return c.json({
      ok: true,
      sale: saleRow ? saleToJson(saleRow) : null,
      commission: commissionRow ? commissionToJson(commissionRow) : null,
    });
  })
  .get("/api/admin/commissions", async (c) => {
    const denied = await requireAdmin(c);
    if (denied) return denied;

    const state = c.req.query("state")?.trim() || null;
    if (state && !(COMMISSION_STATES as readonly string[]).includes(state)) {
      return badRequest("État de commission invalide.");
    }
    const affiliateId = c.req.query("affiliate_id")?.trim() || null;
    const commissions = await listCommissionsAdmin(c.env.DB, { state, affiliateId });
    return c.json({ ok: true, commissions: commissions.map(commissionToJson) });
  })
  .post("/api/admin/commissions/:id/state", async (c) => {
    const denied = await requireAdmin(c);
    if (denied) return denied;

    const body = await readJson(c);
    if (!body) return badRequest("JSON invalide.");
    const target = String(body.state ?? "").trim();
    if (!isCommissionState(target)) {
      return badRequest("État cible invalide.");
    }
    const paymentId =
      typeof body.paymentId === "string" && body.paymentId.trim() ? body.paymentId.trim() : null;

    const db = c.env.DB;
    const commission = await getAdminCommissionById(db, c.req.param("id"));
    if (!commission) return notFound("Commission introuvable.");

    try {
      // Machine à états stricte : transition invalide ou `paymentId` manquant → erreur typée → 409.
      assertCommissionTransition(commission.state, target, paymentId);
    } catch (err) {
      if (err instanceof CommissionStateError) return conflict(err.message);
      throw err;
    }
    if (target === "paid") {
      const payment = paymentId ? await getPaymentById(db, paymentId) : null;
      if (!payment) return badRequest("Paiement introuvable.");
      if (payment.affiliate_id !== commission.affiliate_id) {
        return badRequest("Ce paiement n'appartient pas à l'affilié de la commission.");
      }
    }

    const results = await db.batch([
      commissionStateStatement(db, commission, target, paymentId),
      securityEventStatement(db, {
        actor: "admin",
        action: "admin_commission_state",
        ipHash: ipHashOf(c.req.header("cf-connecting-ip")),
        meta: { commissionId: commission.id, from: commission.state, to: target, paymentId },
      }),
    ]);
    if (changesOf(results[0]) === 0) {
      return conflict("État de la commission modifié entre-temps.");
    }

    const updated = await getAdminCommissionById(db, commission.id);
    return c.json({ ok: true, commission: updated ? commissionToJson(updated) : null });
  })
  .get("/api/admin/payments", async (c) => {
    const denied = await requireAdmin(c);
    if (denied) return denied;

    const affiliateId = c.req.query("affiliate_id")?.trim() || null;
    const payments = await listPaymentsAdmin(c.env.DB, affiliateId);
    return c.json({ ok: true, payments: payments.map(paymentToJson) });
  })
  .post("/api/admin/payments", async (c) => {
    const denied = await requireAdmin(c);
    if (denied) return denied;

    const body = await readJson(c);
    if (!body) return badRequest("JSON invalide.");
    const affiliateId = String(body.affiliateId ?? "").trim();
    const amount = Number(body.amount);
    if (!affiliateId) return badRequest("affiliateId requis.");
    if (!Number.isFinite(amount) || amount <= 0) return badRequest("Montant invalide.");
    const currency =
      typeof body.currency === "string" && body.currency.trim()
        ? body.currency.trim().toUpperCase().slice(0, 8)
        : "FCFA";
    const reference = typeof body.reference === "string" ? body.reference : null;
    const note = typeof body.note === "string" ? body.note : null;

    const db = c.env.DB;
    const affiliate = await getAffiliateWithUserById(db, affiliateId);
    if (!affiliate) return notFound("Affilié introuvable.");

    const paymentId = crypto.randomUUID();
    const result = await recordPayment(
      db,
      { id: paymentId, affiliateId: affiliate.id, amount, currency, reference, note },
      [
        securityEventStatement(db, {
          actor: "admin",
          action: "admin_payment_create",
          ipHash: ipHashOf(c.req.header("cf-connecting-ip")),
          meta: { paymentId, affiliateId: affiliate.id, amount: round2(amount), currency, reference },
        }),
      ]
    );

    return c.json(
      {
        ok: true,
        payment: paymentToJson({
          ...result.payment,
          affiliate_code: affiliate.code,
          affiliate_pseudo: affiliate.pseudo,
        }),
        // Commissions soldées par ce paiement (plus anciennes d'abord) et reliquat
        // non affecté — l'allocation ne dépasse jamais le montant payé.
        paidCommissions: result.paidCommissionIds,
        paidTotal: result.paidTotal,
        remaining: result.remaining,
      },
      201
    );
  })
  .get("/api/admin/settings", async (c) => {
    const denied = await requireAdmin(c);
    if (denied) return denied;
    return c.json({ ok: true, settings: await settingsJson(c.env.DB) });
  })
  .post("/api/admin/settings", async (c) => {
    const denied = await requireAdmin(c);
    if (denied) return denied;

    const body = await readJson(c);
    if (!body) return badRequest("JSON invalide.");

    // Deux formes acceptées : {key, value} (une clé) ou un objet plat de clés whitelistées.
    const entries: [string, unknown][] =
      body.key !== undefined ? [[String(body.key), body.value]] : Object.entries(body);

    if (!entries.length) return badRequest("Aucun réglage fourni.");
    for (const [key] of entries) {
      if (
        !isAffiliateSettingKey(key) &&
        key !== CHARIOW_WEBHOOK_SECRET_KEY &&
        !isPurchaseSettingKey(key) &&
        !isLegalSettingKey(key) &&
        !isSiteSettingKey(key)
      ) {
        return badRequest(`Réglage inconnu : ${key}.`);
      }
    }

    const written: string[] = [];
    for (const [key, value] of entries) {
      if (key === CHARIOW_WEBHOOK_SECRET_KEY) {
        if (typeof value !== "string") return badRequest("Le secret du webhook doit être une chaîne.");
        // Une valeur vide est ignorée : la clé masquée renvoyée par GET ne peut donc
        // pas effacer accidentellement le secret déjà configuré.
        if (!value.trim()) continue;
        await setSetting(c.env.DB, CHARIOW_WEBHOOK_SECRET_KEY, value.trim());
      } else if (isPurchaseSettingKey(key)) {
        // Phase 2.6 : `chariow_api_key` (masquée, une valeur vide est ignorée) et
        // `purchase_max_per_min` (entier borné, défaut 5).
        const stored = await writePurchaseSetting(c.env.DB, key, value);
        if (stored === null) continue;
      } else if (isLegalSettingKey(key)) {
        // Chantier B — pages légales : texte BRUT multi-lignes. Contrairement aux
        // secrets ci-dessus, une valeur VIDE est significative : elle efface le
        // contenu (la page publique repasse en « non renseignée »).
        if (typeof value !== "string") {
          return badRequest(`Le contenu de « ${key} » doit être une chaîne.`);
        }
        await setSetting(c.env.DB, key, value);
      } else if (isSiteSettingKey(key)) {
        // Affichage public : « 1 »/« 0 » uniquement (booléens tolérés côté client).
        const normalized = normalizeSiteSetting(key, value);
        if (normalized === null) {
          return badRequest(`Valeur invalide pour « ${key} » (attendu : 1 ou 0).`);
        }
        await setSetting(c.env.DB, key, normalized);
      } else if (isAffiliateSettingKey(key)) {
        await writeAffiliateSetting(c.env.DB, key, value);
      }
      written.push(key);
    }

    // Journalisé uniquement si un réglage a réellement été écrit.
    if (written.length) {
      await securityEventStatement(c.env.DB, {
        actor: "admin",
        action: "admin_settings_update",
        ipHash: ipHashOf(c.req.header("cf-connecting-ip")),
        meta: { keys: written },
      }).run();
    }

    return c.json({ ok: true, settings: await settingsJson(c.env.DB) });
  });
