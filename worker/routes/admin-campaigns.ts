import { Hono } from "hono";
import { isAdmin, unauthorized, sha256hex } from "../../src/lib/server/auth";
import { securityEventStatement } from "../../src/lib/server/user-auth";
import {
  CAMPAIGN_STATUSES,
  campaignToJson,
  normalizeCampaignCommission,
  normalizeCampaignStatus,
} from "../../src/lib/server/super-affiliate";
import type { App, Env } from "../env";

/** Minimisation : seule l'empreinte sha256 de l'IP est journalisée. */
function ipHashOf(header: string | undefined): string {
  return sha256hex(header || "unknown");
}

function notFound(error: string): Response {
  return Response.json({ ok: false, error }, { status: 404 });
}
function conflict(error: string): Response {
  return Response.json({ ok: false, error }, { status: 409 });
}

const CAMPAIGN_SELECT = `
  SELECT c.*, p.title AS product_title
    FROM campaigns c LEFT JOIN products p ON p.id = c.product_id`;

/** Agrégat défensif de participation (jamais d'erreur 500 pour des stats). */
async function participationCounts(db: D1Database, campaignIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!campaignIds.length) return map;
  const placeholders = campaignIds.map(() => "?").join(",");
  try {
    const { results = [] } = await db
      .prepare(
        `SELECT campaign_id, COUNT(*) AS n FROM campaign_participants
          WHERE campaign_id IN (${placeholders}) GROUP BY campaign_id`
      )
      .bind(...campaignIds)
      .all<{ campaign_id: string; n: number }>();
    for (const row of results) map.set(row.campaign_id, Math.trunc(Number(row.n) || 0));
  } catch {
    /* stats seulement */
  }
  return map;
}

export const adminCampaignRoutes: App = new Hono<{ Bindings: Env }>()
  .get("/api/admin/campaigns", async (c) => {
    if (!(await isAdmin(c.req.raw, c.env))) return unauthorized();
    const status = normalizeCampaignStatus(c.req.query("status"));
    const { results = [] } = status
      ? await c.env.DB
          .prepare(`${CAMPAIGN_SELECT} WHERE c.status = ? ORDER BY c.created_at DESC, c.id DESC LIMIT 200`)
          .bind(status)
          .all<any>()
      : await c.env.DB
          .prepare(`${CAMPAIGN_SELECT} ORDER BY c.created_at DESC, c.id DESC LIMIT 200`)
          .all<any>();
    const counts = await participationCounts(
      c.env.DB,
      (results || []).map((r: any) => r.id)
    );
    return c.json({
      ok: true,
      campaigns: (results || []).map((row: any) => ({
        ...campaignToJson(row, row.product_title),
        participants: counts.get(row.id) ?? 0,
      })),
    });
  })
  .post("/api/admin/campaigns", async (c) => {
    if (!(await isAdmin(c.req.raw, c.env))) return unauthorized();
    let body: Record<string, unknown>;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ ok: false, error: "JSON invalide." }, 400);
    }

    const name = String(body.name ?? "").trim();
    if (name.length < 3) return c.json({ ok: false, error: "Le nom de la campagne est requis (3 caractères minimum)." }, 400);
    const productId = String(body.productId ?? "").trim();
    if (!productId) return c.json({ ok: false, error: "Produit requis." }, 400);
    const product = await c.env.DB
      .prepare("SELECT id, title FROM products WHERE id = ?")
      .bind(productId)
      .first<{ id: string; title: string }>();
    if (!product) return c.json({ ok: false, error: "Produit introuvable." }, 404);

    const commission = normalizeCampaignCommission(body.commissionType, body.commissionValue);
    if (!commission) {
      return c.json({ ok: false, error: "Commission invalide — pourcentage 0-100 ou montant fixe positif." }, 400);
    }
    const rewardA = Math.max(0, Math.trunc(Number(body.rewardA ?? 0)) || 0);
    const goalSales =
      body.goalSales != null && Number.isFinite(Number(body.goalSales))
        ? Math.max(0, Math.trunc(Number(body.goalSales)))
        : null;
    const startsAt = Number.isFinite(Number(body.startsAt)) ? Math.trunc(Number(body.startsAt)) : null;
    const endsAt = Number.isFinite(Number(body.endsAt)) ? Math.trunc(Number(body.endsAt)) : null;
    if (startsAt != null && endsAt != null && endsAt < startsAt) {
      return c.json({ ok: false, error: "La date de fin précède la date de début." }, 400);
    }

    const id = crypto.randomUUID();
    const now = Date.now();
    await c.env.DB.batch([
      c.env.DB
        .prepare(
          `INSERT INTO campaigns (id, name, product_id, starts_at, ends_at, commission_type, commission_value, reward_a, goal_sales, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`
        )
        .bind(id, name, productId, startsAt, endsAt, commission.type, commission.value, rewardA, goalSales, now),
      securityEventStatement(c.env.DB, {
        actor: "admin",
        action: "admin_campaign_create",
        ipHash: ipHashOf(c.req.header("cf-connecting-ip")),
        meta: { campaignId: id, name, productId },
      }),
    ]);

    const row = await c.env.DB
      .prepare(`${CAMPAIGN_SELECT} WHERE c.id = ?`)
      .bind(id)
      .first<any>();
    return c.json({ ok: true, campaign: row ? campaignToJson(row, row.product_title) : null }, 201);
  })
  .post("/api/admin/campaigns/:id/state", async (c) => {
    if (!(await isAdmin(c.req.raw, c.env))) return unauthorized();
    let body: { status?: unknown };
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }
    const status = normalizeCampaignStatus(body.status);
    if (!status) return c.json({ ok: false, error: "Statut invalide (draft, active, ended)." }, 400);

    const id = c.req.param("id");
    const existing = await c.env.DB
      .prepare("SELECT id, status FROM campaigns WHERE id = ?")
      .bind(id)
      .first<{ id: string; status: string }>();
    if (!existing) return notFound("Campagne introuvable.");
    if (existing.status === status) return c.json({ ok: true, campaign: { id, status } });

    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE campaigns SET status = ? WHERE id = ?`).bind(status, id),
      securityEventStatement(c.env.DB, {
        actor: "admin",
        action: "admin_campaign_state",
        ipHash: ipHashOf(c.req.header("cf-connecting-ip")),
        meta: { campaignId: id, from: existing.status, to: status },
      }),
    ]);
    return c.json({ ok: true, campaign: { id, status } });
  })
  .delete("/api/admin/campaigns/:id", async (c) => {
    if (!(await isAdmin(c.req.raw, c.env))) return unauthorized();
    const id = c.req.param("id");
    const existing = await c.env.DB
      .prepare("SELECT id, status, product_id FROM campaigns WHERE id = ?")
      .bind(id)
      .first<{ id: string; status: string; product_id: string }>();
    if (!existing) return notFound("Campagne introuvable.");

    // Suppression réservée aux campagnes jamais diffusées (§38 : pas d'historique détruit).
    const clicksRow = await c.env.DB
      .prepare("SELECT COUNT(*) AS n FROM click_events WHERE campaign_id = ?")
      .bind(id)
      .first<{ n: number }>()
      .catch(() => ({ n: 1 }));
    if (existing.status !== "draft" || Math.trunc(Number(clicksRow?.n) || 0) > 0) {
      return conflict("Seule une campagne en brouillon sans clic peut être supprimée — terminez-la plutôt.");
    }
    const participants = await c.env.DB
      .prepare("SELECT COUNT(*) AS n FROM campaign_participants WHERE campaign_id = ?")
      .bind(id)
      .first<{ n: number }>()
      .catch(() => ({ n: 0 }));
    if (Math.trunc(Number(participants?.n) || 0) > 0) {
      return conflict("Des affiliés participent déjà — terminez la campagne plutôt.");
    }

    await c.env.DB.batch([
      c.env.DB.prepare(`DELETE FROM campaigns WHERE id = ?`).bind(id),
      securityEventStatement(c.env.DB, {
        actor: "admin",
        action: "admin_campaign_delete",
        ipHash: ipHashOf(c.req.header("cf-connecting-ip")),
        meta: { campaignId: id },
      }),
    ]);
    return c.json({ ok: true, deleted: id });
  });
