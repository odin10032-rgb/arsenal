import { Hono } from "hono";
import type { Context } from "hono";
import { isAdmin, unauthorized, sha256hex } from "../../src/lib/server/auth";
import { securityEventStatement } from "../../src/lib/server/user-auth";
import { changesOf } from "../../src/lib/server/commissions";
import {
  FULFILLMENT_MAX_ATTEMPTS,
  canAttemptFulfillment,
  completeFulfillmentStatement,
  createFulfillmentStatement,
  fulfillPurchase,
  getFulfillmentByPurchase,
  markPurchaseFulfilledStatement,
} from "../../src/lib/server/fulfillment";
import {
  PURCHASE_STATUSES,
  REFUND_STATEMENT_INDEX,
  getAdminPurchaseDetail,
  getPurchaseById,
  isRetryablePurchaseStatus,
  listPurchasesAdmin,
  purchaseToAdminJson,
  refundPurchase,
} from "../../src/lib/server/purchases";
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

/**
 * Corps FACULTATIF (contrat : `{reference?, note?}`, `{reason?}`) : un corps
 * absent (`POST` sans corps) ou illisible est traité comme vide — les champs
 * sont tous optionnels, la mutation ne doit pas échouer pour autant.
 */
async function readOptionalJson(c: AdminContext): Promise<Record<string, unknown>> {
  return (await readJson(c)) ?? {};
}

function optionalText(raw: unknown, maxLength: number): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return value ? value.slice(0, maxLength) : null;
}

/** Entier borné depuis la query string (repli si absent/illisible). */
function parseClampedInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value), min), max);
}

/** États terminaux : plus aucune livraison possible. */
const TERMINAL_STATUSES = ["refunded", "cancelled"];

/**
 * Phase 2.6 — administration des achats en A (X-Admin-Auth).
 * Contrat FIGÉ : docs/chantier/07-contrat-paiement-a.md (§ Routes admin).
 *
 * - GET  /api/admin/purchases?status=&limit=       liste (utilisateur, produit, A, statut, fulfillment)
 * - POST /api/admin/purchases/:id/fulfill          livraison MANUELLE {reference?, note?}
 * - POST /api/admin/purchases/:id/retry            relance le fulfillment automatique (≤ 5 tentatives)
 * - POST /api/admin/purchases/:id/refund           rembourse en A {reason?}
 *
 * Chaque mutation journalise un `security_events` (`admin_purchase_*`).
 * Aucun réglage ici : les clés `chariow_api_key` / `purchase_max_per_min` sont
 * ajoutées à la whitelist de la route settings existante (worker/routes/admin-affiliation.ts).
 */
export const adminPurchaseRoutes: App = new Hono<{ Bindings: Env }>()
  .get("/api/admin/purchases", async (c) => {
    const denied = await requireAdmin(c);
    if (denied) return denied;

    const status = c.req.query("status")?.trim() || null;
    if (status && !(PURCHASE_STATUSES as readonly string[]).includes(status)) {
      return badRequest("Statut d'achat invalide.");
    }
    const limit = parseClampedInt(c.req.query("limit"), 100, 1, 500);
    const purchases = await listPurchasesAdmin(c.env.DB, { status, limit });
    return c.json({ ok: true, purchases: purchases.map(purchaseToAdminJson) });
  })
  /** Livraison manuelle : fulfillment `completed`, purchase `fulfilled` (idempotent). */
  .post("/api/admin/purchases/:id/fulfill", async (c) => {
    const denied = await requireAdmin(c);
    if (denied) return denied;

    const body = await readOptionalJson(c);
    const reference = optionalText(body.reference, 200);
    const note = optionalText(body.note, 500);

    const db = c.env.DB;
    const purchase = await getPurchaseById(db, c.req.param("id"));
    if (!purchase) return notFound("Achat introuvable.");
    if (TERMINAL_STATUSES.includes(purchase.status)) {
      return conflict("Cet achat ne peut plus être livré (remboursé ou annulé).");
    }

    let fulfillment = await getFulfillmentByPurchase(db, purchase.id);
    if (!fulfillment) {
      // Anomalie : la ligne de fulfillment est créée avec la purchase.
      await createFulfillmentStatement(db, { purchaseId: purchase.id, provider: "manual" }).run();
      fulfillment = await getFulfillmentByPurchase(db, purchase.id);
    }
    if (!fulfillment) return notFound("Fulfillment introuvable.");

    const now = Date.now();
    await db.batch([
      // provider = manual : la livraison qui aboutit est bien humaine.
      completeFulfillmentStatement(db, fulfillment, {
        provider: "manual",
        providerReference: reference,
        countAttempt: false,
        now,
      }),
      markPurchaseFulfilledStatement(db, purchase.id, now),
      securityEventStatement(db, {
        actor: "admin",
        action: "admin_purchase_fulfill",
        ipHash: ipHashOf(c.req.header("cf-connecting-ip")),
        meta: { purchaseId: purchase.id, reference, note },
      }),
    ]);

    const detail = await getAdminPurchaseDetail(db, purchase.id);
    return c.json({ ok: true, purchase: detail ? purchaseToAdminJson(detail) : null });
  })
  /** Relance du fulfillment automatique (idempotent, plafonné à 5 tentatives). */
  .post("/api/admin/purchases/:id/retry", async (c) => {
    const denied = await requireAdmin(c);
    if (denied) return denied;

    // Aucun corps attendu (appel admin direct : `POST` nu).
    const db = c.env.DB;
    const purchase = await getPurchaseById(db, c.req.param("id"));
    if (!purchase) return notFound("Achat introuvable.");
    if (!isRetryablePurchaseStatus(purchase.status)) {
      return conflict("Cet achat n'est pas en attente de livraison.");
    }

    const fulfillment = await getFulfillmentByPurchase(db, purchase.id);
    if (!canAttemptFulfillment(fulfillment)) {
      return conflict(`Nombre maximal de tentatives atteint (${FULFILLMENT_MAX_ATTEMPTS}).`);
    }

    const outcome = await fulfillPurchase(db, purchase);
    if (outcome.exhausted) {
      return conflict(outcome.error ?? "Trop de tentatives.");
    }

    // La mutation a lieu dans le batch interne du fulfillment : le journal suit.
    await securityEventStatement(db, {
      actor: "admin",
      action: "admin_purchase_retry",
      ipHash: ipHashOf(c.req.header("cf-connecting-ip")),
      meta: {
        purchaseId: purchase.id,
        attempted: outcome.attempted,
        status: outcome.status,
        // Issue incertaine (délai dépassé/réseau) : relançable, jamais `failed`.
        uncertain: outcome.uncertain === true,
        error: outcome.error,
      },
    }).run();

    const detail = await getAdminPurchaseDetail(db, purchase.id);
    return c.json({ ok: true, purchase: detail ? purchaseToAdminJson(detail) : null });
  })
  /**
   * Remboursement en A (un seul batch, clé `refund:<id>` — idempotent) :
   * crédit A + purchase `refunded` + fulfillment `failed`, ET (constat C2)
   * vente affiliée liée `rejected`, commission non payée `cancelled`, reprise
   * de la récompense A effectivement versée.
   */
  .post("/api/admin/purchases/:id/refund", async (c) => {
    const denied = await requireAdmin(c);
    if (denied) return denied;

    const body = await readOptionalJson(c);
    const reason = optionalText(body.reason, 300);

    const db = c.env.DB;
    const purchase = await getPurchaseById(db, c.req.param("id"));
    if (!purchase) return notFound("Achat introuvable.");
    if (purchase.status === "refunded") return conflict("Cet achat est déjà remboursé.");
    if (purchase.status === "cancelled") return conflict("Cet achat est annulé — remboursement impossible.");

    const results = await refundPurchase(db, purchase, [
      securityEventStatement(db, {
        actor: "admin",
        action: "admin_purchase_refund",
        ipHash: ipHashOf(c.req.header("cf-connecting-ip")),
        meta: {
          purchaseId: purchase.id,
          userId: purchase.user_id,
          amountA: Math.trunc(Number(purchase.amount_a) || 0),
          reason,
        },
      }),
    ]);

    // UPDATE de la purchase : 0 ligne = statut terminal posé entre-temps.
    // Le batch contient aussi le rejet de la vente, l'annulation de la
    // commission non payée et la reprise de la récompense (constat C2).
    if (changesOf(results[REFUND_STATEMENT_INDEX.purchase]) === 0) {
      return conflict("Statut de l'achat modifié entre-temps.");
    }

    const detail = await getAdminPurchaseDetail(db, purchase.id);
    return c.json({ ok: true, purchase: detail ? purchaseToAdminJson(detail) : null });
  });
