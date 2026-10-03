import { Hono } from "hono";
import type { Context } from "hono";
import { isAdmin, unauthorized, sha256hex } from "../../src/lib/server/auth";
import { securityEventStatement } from "../../src/lib/server/user-auth";
import { changesOf } from "../../src/lib/server/commissions";
import {
  PRODUCT_REQUEST_STATUSES,
  decideProductRequestStatement,
  getProductRequestById,
  listProductRequestsAdmin,
} from "../../src/lib/server/product-requests";
import type { ProductRequestWithContext } from "../../src/lib/server/product-requests";
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

/** Demande sérialisée (camelCase) pour l'admin. */
function requestToJson(row: ProductRequestWithContext) {
  return {
    id: row.id,
    affiliateId: row.affiliate_id,
    affiliateCode: row.affiliate_code ?? null,
    affiliatePseudo: row.affiliate_pseudo ?? null,
    userId: row.user_id,
    productId: row.product_id,
    productTitle: row.product_title ?? null,
    status: row.status,
    note: row.note ?? null,
    createdAt: Number(row.created_at),
    decidedAt: row.decided_at != null ? Number(row.decided_at) : null,
    decidedBy: row.decided_by ?? null,
  };
}

/**
 * Vague 4 — validation ADMIN des demandes de disponibilité produit
 * (X-Admin-Auth, même style que les autres routeurs admin) :
 * - GET  /api/admin/product-requests?status=        liste (filtre pending|approved|rejected)
 * - POST /api/admin/product-requests/:id/decide     { decision: 'approved'|'rejected', note? }
 *
 * En cas d'approbation : le produit passe en `affiliate_enabled = 1` ET la
 * demande est décidée dans le MÊME batch (aucune éligibilité sans trace).
 * Jamais d'éligibilité auto-attribuée par le client : ici, seul l'admin décide.
 */
export const adminProductRequestRoutes: App = new Hono<{ Bindings: Env }>()
  .get("/api/admin/product-requests", async (c) => {
    const denied = await requireAdmin(c);
    if (denied) return denied;

    const status = c.req.query("status")?.trim() || null;
    if (status && !(PRODUCT_REQUEST_STATUSES as readonly string[]).includes(status)) {
      return badRequest("Statut de demande invalide.");
    }
    const requests = await listProductRequestsAdmin(c.env.DB, status);
    return c.json({ ok: true, requests: requests.map(requestToJson) });
  })
  .post("/api/admin/product-requests/:id/decide", async (c) => {
    const denied = await requireAdmin(c);
    if (denied) return denied;

    const body = await readJson(c);
    if (!body) return badRequest("JSON invalide.");
    const decision = String(body.decision ?? "").trim();
    if (decision !== "approved" && decision !== "rejected") {
      return badRequest("Décision invalide (approved ou rejected).");
    }
    const note = typeof body.note === "string" ? body.note : null;

    const db = c.env.DB;
    const id = String(c.req.param("id") ?? "");
    const request = await getProductRequestById(db, id);
    if (!request) return notFound("Demande introuvable.");
    if (request.status !== "pending") {
      return conflict("Cette demande a déjà été traitée.");
    }

    const now = Date.now();
    const statements: D1PreparedStatement[] = [
      decideProductRequestStatement(db, {
        id: request.id,
        status: decision,
        decidedBy: "admin",
        note,
        now,
      }),
    ];
    if (decision === "approved") {
      // Produit rendu éligible à l'affiliation — gardé sur la décision (le batch
      // échoue si la demande n'est plus pending, grâce à l'index/UPDATE ci-dessus).
      statements.push(
        db
          .prepare("UPDATE products SET affiliate_enabled = 1, updated_at = ? WHERE id = ?")
          .bind(now, request.product_id)
      );
    }
    statements.push(
      securityEventStatement(db, {
        actor: "admin",
        action: decision === "approved" ? "admin_product_request_approve" : "admin_product_request_reject",
        ipHash: ipHashOf(c.req.header("cf-connecting-ip")),
        meta: { requestId: request.id, productId: request.product_id, affiliateId: request.affiliate_id, note },
      })
    );

    const results = await db.batch(statements);
    if (changesOf(results[0]) === 0) {
      return conflict("Cette demande a déjà été traitée.");
    }

    return c.json({
      ok: true,
      request: { id: request.id, status: decision },
      productEligible: decision === "approved",
    });
  });
