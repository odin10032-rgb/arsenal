import { Hono } from "hono";
import { isAdmin, unauthorized, sha256hex } from "../../src/lib/server/auth";
import { securityEventStatement } from "../../src/lib/server/user-auth";
import { notifyCampaignParticipants } from "../../src/lib/server/notifications";
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
  /**
   * GET /api/admin/campaigns/eligibility — « avant de lancer une campagne ».
   * Pour CHAQUE produit éligible à l'affiliation : sa règle de commission
   * actuelle, la campagne active éventuelle, et l'activité RÉELLE des liens
   * (combien d'affiliés en ont un, combien sont actifs, ventes cumulées).
   * Permet à l'admin de choisir un produit en connaissance de cause au lieu de
   * découvrir après coup que personne ne le promeut.
   * Lecture défensive : une table absente/vide ne fait jamais échouer la route.
   */
  .get("/api/admin/campaigns/eligibility", async (c) => {
    if (!(await isAdmin(c.req.raw, c.env))) return unauthorized();
    const db = c.env.DB;

    // Une seule requête agrégée : liens par produit (total, actifs, ventes).
    let linkRows: { product_id: string; n: number; actifs: number; ventes: number }[] = [];
    try {
      const res = await db
        .prepare(
          `SELECT product_id,
                  COUNT(*) AS n,
                  SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS actifs,
                  COALESCE(SUM(sales_count), 0) AS ventes
             FROM affiliate_links
            GROUP BY product_id`
        )
        .all<any>();
      linkRows = (res.results || []) as any;
    } catch {
      /* table absente (base ancienne) : aucune activité connue */
    }
    const byProduct = new Map(linkRows.map((r) => [r.product_id, r]));

    const { results = [] } = await db
      .prepare(
        `SELECT id, title, affiliate_enabled, commission_type, commission_value, reward_a
           FROM products
          WHERE affiliate_enabled = 1
          ORDER BY title COLLATE NOCASE`
      )
      .all<any>();

    const campaigns = await db
      .prepare(
        `SELECT c.*, p.title AS product_title FROM campaigns c
           LEFT JOIN products p ON p.id = c.product_id
          WHERE c.status = 'active'`
      )
      .all<any>()
      .then((r) => (r.results || []) as any[])
      .catch(() => [] as any[]);
    const activeByProduct = new Map(campaigns.map((c) => [c.product_id, c]));

    const now = Date.now();
    return c.json({
      ok: true,
      products: (results || []).map((p: any) => {
        const links = byProduct.get(p.id);
        const campaign = activeByProduct.get(p.id) ?? null;
        return {
          id: p.id,
          title: p.title,
          // Règle de commission ACTUELLE du produit (peut être nulle → défaut).
          commissionType: p.commission_type ?? null,
          commissionValue: p.commission_value != null ? Number(p.commission_value) : null,
          rewardA: Math.trunc(Number(p.reward_a) || 0),
          // Campagne déjà active ? (une seule à la fois par produit)
          activeCampaign: campaign
            ? {
                id: campaign.id,
                name: campaign.name,
                commissionType: campaign.commission_type ?? null,
                commissionValue:
                  campaign.commission_value != null ? Number(campaign.commission_value) : null,
                rewardA: Math.trunc(Number(campaign.reward_a) || 0),
                endsAt: campaign.ends_at != null ? Number(campaign.ends_at) : null,
                expired: campaign.ends_at != null && Number(campaign.ends_at) < now,
              }
            : null,
          // Activité réelle des liens affiliés sur ce produit.
          links: {
            total: Math.trunc(Number(links?.n) || 0),
            active: Math.trunc(Number(links?.actifs) || 0),
            sales: Math.trunc(Number(links?.ventes) || 0),
          },
        };
      }),
    });
  })
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
      .prepare("SELECT id, name, status FROM campaigns WHERE id = ?")
      .bind(id)
      .first<{ id: string; name: string; status: string }>();
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

    // Cycle de vie (audit §B4) : les participants sont PRÉVENUS quand la
    // campagne cesse d'être active — la commission de campagne et l'exemption
    // de plafond tombent immédiatement avec le statut. Notification dans
    // l'espace affilié uniquement (§37 : jamais d'email).
    if (status !== "active" && existing.status === "active") {
      await notifyCampaignParticipants(c.env.DB, {
        campaignId: id,
        type: status === "ended" ? "campaign_ended" : "campaign_paused",
        message:
          status === "ended"
            ? `La campagne « ${existing.name} » est terminée — les ventes de ce produit repassent aux conditions standards.`
            : `La campagne « ${existing.name} » a été mise en pause — ses conditions s'appliquent de nouveau dès sa réactivation.`,
      });
    }
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
