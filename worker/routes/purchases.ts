import { Hono } from "hono";
import { requireAuth } from "./me";
import { aBalance } from "../../src/lib/server/ledger";
import { isUniqueViolation } from "../../src/lib/server/affiliation";
import { FULFILLMENT_MAX_ATTEMPTS, canAttemptFulfillment, fulfillPurchase, getFulfillmentByPurchase } from "../../src/lib/server/fulfillment";
import {
  computePurchaseCommission,
  createPurchase,
  getActivePurchase,
  getProductForPurchase,
  getPurchaseDetail,
  getPurchaseForUser,
  isPurchasableProduct,
  isRetryablePurchaseStatus,
  listUserPurchases,
  productPriceA,
  purchaseToJson,
  resolvePurchaseAttribution,
} from "../../src/lib/server/purchases";
import type { PurchaseJoinRow } from "../../src/lib/server/purchases";
import type { AuthedApp, AuthedEnv } from "../env";

/** Réponse 500 de repli : l'achat existe mais sa relecture a échoué (très improbable). */
function detailMissing(): Response {
  return Response.json({ ok: false, error: "Erreur serveur inattendue." }, { status: 500 });
}

/**
 * Phase 2.6 — achats en A (Bearer requis, `requireAuth` de me.ts).
 * Contrat FIGÉ : docs/chantier/07-contrat-paiement-a.md.
 *
 * - POST /api/purchases            → 201 {ok, purchase} (débit A atomique + fulfillment déclenché)
 * - GET  /api/purchases            → {ok, purchases} (« Mes produits », created_at DESC)
 * - POST /api/purchases/:id/retry  → {ok, purchase} (relance du fulfillment, idempotent)
 *
 * Aucun montant, prix, solde ou statut ne vient du client : le prix est lu en
 * base, le solde recalculé, les statuts posés serveur.
 */
export const purchaseRoutes: AuthedApp = new Hono<AuthedEnv>()
  /** Achat avec ses A : 400 non achetable, 402 solde insuffisant, 409 déjà possédé. */
  .post("/api/purchases", requireAuth, async (c) => {
    const { user } = c.get("authUser");
    let body: Record<string, unknown>;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return c.json({ ok: false, error: "JSON invalide." }, 400);
    }

    const productId = typeof body?.productId === "string" ? body.productId.trim() : "";
    if (!productId) return c.json({ ok: false, error: "productId requis." }, 400);

    const db = c.env.DB;
    const product = await getProductForPurchase(db, productId);
    if (!product) return c.json({ ok: false, error: "Produit introuvable." }, 400);
    if (!isPurchasableProduct(product)) {
      return c.json({ ok: false, error: "Ce produit n'est pas achetable avec des A." }, 400);
    }

    // Garde-fou « possède déjà » (même prédicat que l'index unique partiel).
    if (await getActivePurchase(db, user.id, product.id)) {
      return c.json({ ok: false, error: "Vous possédez déjà ce produit." }, 409);
    }

    const priceA = productPriceA(product);
    const balanceA = await aBalance(db, user.id);
    if (balanceA < priceA) {
      return c.json(
        {
          ok: false,
          error: "Solde A insuffisant.",
          balanceA,
          priceA,
          missingA: priceA - balanceA,
        },
        402
      );
    }

    // Attribution affiliation : code de parrainage < 30 j, ignoré silencieusement s'il est invalide.
    const affiliateCode = typeof body?.affiliateCode === "string" ? body.affiliateCode : "";
    const attribution = await resolvePurchaseAttribution(db, affiliateCode, product.id);
    const commission = attribution ? await computePurchaseCommission(db, product) : null;

    let created;
    try {
      created = await createPurchase(db, {
        userId: user.id,
        product,
        attribution,
        commission,
      });
    } catch (err) {
      // Course entre deux achats simultanés : l'index unique annule tout le batch
      // (débit compris) → même réponse que la détection préalable.
      if (isUniqueViolation(err)) {
        return c.json({ ok: false, error: "Vous possédez déjà ce produit." }, 409);
      }
      throw err;
    }

    // Fulfillment immédiat : le statut renvoyé reflète le résultat RÉEL
    // (aucune erreur de livraison ne doit faire perdre la réponse d'achat).
    try {
      await fulfillPurchase(db, created.purchase);
    } catch (err) {
      console.error("Fulfillment error:", err);
    }

    const detail = await getPurchaseDetail(db, created.purchase.id);
    if (!detail) return detailMissing();
    return c.json({ ok: true, purchase: purchaseToJson(detail, { email: user.email }) }, 201);
  })
  /** « Mes produits » : les achats de la session, plus récents d'abord. */
  .get("/api/purchases", requireAuth, async (c) => {
    const { user } = c.get("authUser");
    const rows = await listUserPurchases(c.env.DB, user.id);
    return c.json({
      ok: true,
      purchases: rows.map((row: PurchaseJoinRow) => purchaseToJson(row, { email: user.email })),
    });
  })
  /** Relance du fulfillment (idempotent) : 409 si le statut ne s'y prête pas. */
  .post("/api/purchases/:id/retry", requireAuth, async (c) => {
    const { user } = c.get("authUser");
    const db = c.env.DB;
    // Lecture scopée par la session : un achat d'autrui est introuvable.
    const purchase = await getPurchaseForUser(db, user.id, c.req.param("id") ?? "");
    if (!purchase) return c.json({ ok: false, error: "Achat introuvable." }, 404);
    if (!isRetryablePurchaseStatus(purchase.status)) {
      return c.json({ ok: false, error: "Cet achat n'est pas en attente de livraison." }, 409);
    }

    const fulfillment = await getFulfillmentByPurchase(db, purchase.id);
    if (!canAttemptFulfillment(fulfillment)) {
      return c.json(
        { ok: false, error: `Nombre maximal de tentatives atteint (${FULFILLMENT_MAX_ATTEMPTS}).` },
        409
      );
    }

    const outcome = await fulfillPurchase(db, purchase);
    if (outcome.exhausted) {
      return c.json({ ok: false, error: outcome.error ?? "Trop de tentatives." }, 409);
    }

    const detail = await getPurchaseDetail(db, purchase.id);
    if (!detail) return detailMissing();
    return c.json({ ok: true, purchase: purchaseToJson(detail, { email: user.email }) });
  });
