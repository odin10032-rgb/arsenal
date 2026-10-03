import { Hono } from "hono";
import {
  isSuccessfulSaleEvent,
  parseChariowPulse,
  verifyChariowSignature,
} from "../../src/lib/server/chariow";
import { readArsenalPurchaseRef } from "../../src/lib/server/chariow-checkout";
import { completeFulfillmentForPurchase } from "../../src/lib/server/fulfillment";
import { getPurchaseById } from "../../src/lib/server/purchases";
import {
  findProductByExternalRef,
  getAffiliateByCode,
  getAffiliateById,
  getAffiliateLinkByCode,
  getProductById,
  isUniqueViolation,
  readAffiliateSettings,
  readChariowWebhookSecret,
} from "../../src/lib/server/affiliation";
import {
  computeCommissionAmount,
  createSaleWithCommission,
  getActiveCampaign,
  getSaleByRef,
  resolveCommissionRule,
} from "../../src/lib/server/commissions";
import type { AffiliateProductRow } from "../../src/lib/server/affiliation";
import type { App, Env } from "../env";

/**
 * Phase 2 — webhook Chariow (Pulse), public mais SIGNÉ :
 * POST /api/webhooks/chariow
 *
 * - 503 si `settings.chariow_webhook_secret` n'est pas configuré ;
 * - 401 si la signature `x-chariow-signature: sha256=<hex>` (HMAC-SHA256 du corps BRUT) est invalide ;
 * - 200 `{ok:true,duplicate:true}` si `sale_ref` est déjà en base (aucune double commission) ;
 * - sur `successful.sale` : vente `confirmed` + commission `pending` + récompense A éventuelle
 *   en UN SEUL batch ; attribution par `custom_metadata.arsenal_link` puis `affiliate.code`,
 *   sinon vente NON ATTRIBUÉE (`affiliate_id` NULL, visible admin) ;
 * - Phase 2.6 : si `custom_metadata.arsenal_purchase` est présent, la vente est la
 *   LIVRAISON d'un achat déjà payé en A → ni commission ni récompense, fulfillment
 *   marqué `completed` (idempotent) et réponse `{ok:true,fulfilled:true}` ;
 * - tout autre événement : 200 `{ok:true,ignored:true}`.
 */
export const chariowWebhookRoutes: App = new Hono<{ Bindings: Env }>().post(
  "/api/webhooks/chariow",
  async (c) => {
    const db = c.env.DB;

    const secret = await readChariowWebhookSecret(db);
    if (!secret) {
      return c.json({ ok: false, error: "Webhook non configuré." }, 503);
    }

    // Corps BRUT indispensable à la vérification HMAC (avant tout parsing).
    const rawBody = await c.req.arrayBuffer();
    const signatureValid = await verifyChariowSignature(
      rawBody,
      c.req.header("x-chariow-signature"),
      secret
    );
    if (!signatureValid) {
      return c.json({ ok: false, error: "Signature invalide." }, 401);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(new TextDecoder().decode(rawBody));
    } catch {
      return c.json({ ok: false, error: "JSON invalide." }, 400);
    }

    const pulse = parseChariowPulse(payload, {
      deliveryId: c.req.header("x-pulse-delivery-id") ?? null,
    });

    if (!isSuccessfulSaleEvent(pulse)) {
      return c.json({ ok: true, ignored: true });
    }

    // --- Phase 2.6 : la vente EST la livraison d'un achat déjà payé en A ---
    // `custom_metadata.arsenal_purchase` présent → AUCUNE commission, AUCUNE
    // récompense (les A ont déjà été débités côté Arsenal) : on marque seulement
    // le fulfillment `completed` s'il ne l'est pas déjà (idempotent).
    const arsenalPurchase = readArsenalPurchaseRef(payload);
    if (arsenalPurchase) {
      const purchase = await getPurchaseById(db, arsenalPurchase);
      if (purchase) {
        await completeFulfillmentForPurchase(db, {
          purchaseId: purchase.id,
          reference: pulse.saleId,
        });
      }
      return c.json({ ok: true, fulfilled: true });
    }

    // Idempotence : `sale.id` puis repli sur l'identifiant de livraison du Pulse.
    const saleRef = pulse.saleId ?? (pulse.deliveryId ? `pulse:${pulse.deliveryId}` : null);
    if (!saleRef) {
      return c.json({ ok: false, error: "Référence de vente manquante." }, 400);
    }
    if (await getSaleByRef(db, saleRef)) {
      return c.json({ ok: true, duplicate: true });
    }

    // --- Attribution : code de lien Arsenal → code affilié → vente non attribuée ---
    const link = pulse.arsenalLink ? await getAffiliateLinkByCode(db, pulse.arsenalLink) : null;
    let affiliate = link
      ? await getAffiliateById(db, link.affiliate_id)
      : pulse.affiliateCode
        ? await getAffiliateByCode(db, pulse.affiliateCode)
        : null;
    // Un affilié non actif ne peut pas générer de commission ni de récompense.
    if (affiliate && affiliate.status !== "active") affiliate = null;
    // Vague 4 : un lien INACTIF ou SATURÉ (plafond de ventes atteint) n'attribue
    // plus rien — la vente reste enregistrée, mais non attribuée (visible admin).
    if (link && link.status && link.status !== "active") affiliate = null;

    let product: AffiliateProductRow | null = null;
    if (link) product = await getProductById(db, link.product_id);
    if (!product) product = await findProductByExternalRef(db, pulse.productId, pulse.productName);

    // Le produit reste identifié par la référence Chariow brute si aucune
    // correspondance Arsenal n'existe (vente visible telle quelle côté admin).
    const productId = product?.id ?? pulse.productId ?? "";
    const amount = Math.max(0, Number(pulse.amount ?? 0) || 0);
    const currency = pulse.currency ?? "FCFA";
    const occurredAt = pulse.occurredAt ?? Date.now();

    let commission: { amount: number; ratePercent: number | null; rewardA: number } | null = null;
    // Seuil de saturation par lien (vague 4) — lu même sans affilié attribué,
    // pour rester dans la même requête que la règle de commission.
    let maxSalesPerLink = 0;
    if (affiliate) {
      const [campaign, settings] = await Promise.all([
        getActiveCampaign(db, productId),
        readAffiliateSettings(db),
      ]);
      const rule = resolveCommissionRule(
        product ?? { commission_type: null, commission_value: null, reward_a: 0 },
        campaign,
        settings
      );
      commission = { ...computeCommissionAmount(amount, rule), rewardA: rule.rewardA };
      maxSalesPerLink = Math.max(0, Math.trunc(Number(settings.maxSalesPerLink) || 0));
    }

    try {
      const created = await createSaleWithCommission(db, {
        saleRef,
        productId,
        affiliateId: affiliate?.id ?? null,
        // Le lien ne compte que si la vente est réellement attribuée.
        linkId: affiliate ? link?.id ?? null : null,
        source: "chariow_webhook",
        amount,
        currency,
        occurredAt,
        commission,
        rewardUserId: affiliate?.user_id ?? null,
        confirmedBy: "chariow_webhook",
        maxSalesPerLink,
      });
      return c.json({
        ok: true,
        duplicate: false,
        saleId: created.saleId,
        commissionId: created.commissionId,
        attributed: Boolean(affiliate),
      });
    } catch (err) {
      // Double livraison concurrente du même Pulse : UNIQUE(sale_ref) → idempotent.
      if (isUniqueViolation(err)) {
        return c.json({ ok: true, duplicate: true });
      }
      throw err;
    }
  }
);
