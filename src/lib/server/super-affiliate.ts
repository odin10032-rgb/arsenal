/**
 * Arsenal — Super Affiliate, animations de statut et campagnes (Phase 3).
 * Contrat : docs/chantier/08-contrat-phase3.md.
 *
 * - Super Affiliate : progression vers les critères configurables
 *   (settings super_min_sales / super_min_clicks), demande de promotion,
 *   validation ADMIN uniquement (§19) — le client ne s'attribue jamais le rôle.
 * - Animations : l'état « déjà vue » vit en base (status_unlock_events,
 *   UNIQUE(user_id, status)) — rejouer ou marquer vu artificiellement est
 *   impossible depuis le client.
 * - Campagnes : CRUD admin ; les affiliés actifs voient les campagnes actives
 *   et rejoignent (INSERT OR IGNORE). Les agrégats restent défensifs.
 *
 * Style maison : fonctions pures recevant D1Database en paramètre.
 */

import { AFFILIATE_SETTING_DEFAULTS, AffiliateSettings } from "./affiliation";

/* ------------------------------ Types partagés ------------------------------ */

export type UnlockStatus = "affiliate" | "super_affiliate";
export const UNLOCK_STATUSES: readonly UnlockStatus[] = ["affiliate", "super_affiliate"];

export interface SuperCriteria {
  minSales: number;
  minClicks: number;
}

export interface SuperProgress {
  requested: boolean;
  eligible: boolean;
  criteria: SuperCriteria;
  progress: { sales: number; clicks: number };
}

export type UnlockPending = {
  status: UnlockStatus;
  seenAt: number | null;
} | null;

function isUnlockStatus(raw: unknown): raw is UnlockStatus {
  return typeof raw === "string" && (UNLOCK_STATUSES as readonly string[]).includes(raw);
}

export function normalizeUnlockStatus(raw: unknown): UnlockStatus | null {
  return isUnlockStatus(raw) ? raw : null;
}

/* --------------------------------- Critères --------------------------------- */

export function superCriteria(settings: AffiliateSettings): SuperCriteria {
  return {
    minSales: Math.max(0, Math.trunc(settings.superMinSales ?? AFFILIATE_SETTING_DEFAULTS.super_min_sales)),
    minClicks: Math.max(0, Math.trunc(settings.superMinClicks ?? AFFILIATE_SETTING_DEFAULTS.super_min_clicks)),
  };
}

/** Ventes confirmées + clics réels de l'affilié (source : click_events / sales). */
export async function readSuperProgress(
  db: D1Database,
  affiliateId: string
): Promise<{ sales: number; clicks: number }> {
  const [salesRow, clicksRow] = await Promise.all([
    db
      .prepare("SELECT COUNT(*) AS n FROM sales WHERE affiliate_id = ? AND state = 'confirmed'")
      .bind(affiliateId)
      .first<{ n: number }>(),
    db
      .prepare("SELECT COUNT(*) AS n FROM click_events WHERE affiliate_id = ?")
      .bind(affiliateId)
      .first<{ n: number }>(),
  ]);
  return {
    sales: Math.trunc(Number(salesRow?.n) || 0),
    clicks: Math.trunc(Number(clicksRow?.n) || 0),
  };
}

export function isEligible(criteria: SuperCriteria, progress: { sales: number; clicks: number }): boolean {
  return progress.sales >= criteria.minSales && progress.clicks >= criteria.minClicks;
}

/** Une demande est « en cours » si une ligne to_role='super_affiliate' (reason 'request') existe sans promotion effective. */
export async function isSuperRequested(db: D1Database, userId: string): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM status_history
        WHERE user_id = ? AND to_role = 'super_affiliate'
          AND NOT EXISTS (SELECT 1 FROM users WHERE id = ? AND role = 'super_affiliate')`
    )
    .bind(userId, userId)
    .first<{ n: number }>();
  return Math.trunc(Number(row?.n) || 0) > 0;
}

/* ----------------------- Animations (status_unlock_events) ----------------------- */

/** Premier événement d'unlock non vu de l'utilisateur (le plus récent). */
export async function readUnlockPending(db: D1Database, userId: string): Promise<UnlockPending> {
  const row = await db
    .prepare(
      `SELECT status, seen_at FROM status_unlock_events
        WHERE user_id = ? AND seen_at IS NULL
        ORDER BY created_at DESC, id DESC LIMIT 1`
    )
    .bind(userId)
    .first<{ status: string; seen_at: number | null }>();
  const status = normalizeUnlockStatus(row?.status);
  if (!status) return null;
  return { status, seenAt: row!.seen_at != null ? Number(row!.seen_at) : null };
}

export function markUnlockSeenStatement(
  db: D1Database,
  userId: string,
  status: UnlockStatus,
  now: number = Date.now()
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE status_unlock_events SET seen_at = ?
        WHERE user_id = ? AND status = ? AND seen_at IS NULL`
    )
    .bind(now, userId, status);
}

/* ---------------------------- Historique de statut ---------------------------- */

export function statusHistoryStatement(
  db: D1Database,
  input: {
    userId: string;
    fromRole: string | null;
    toRole: string;
    reason?: string | null;
    now?: number;
  }
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO status_history (id, user_id, from_role, to_role, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      crypto.randomUUID(),
      input.userId,
      input.fromRole,
      input.toRole,
      input.reason ?? null,
      input.now ?? Date.now()
    );
}

export function unlockEventStatement(
  db: D1Database,
  input: { userId: string; status: UnlockStatus; now?: number }
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT OR IGNORE INTO status_unlock_events (id, user_id, status, created_at) VALUES (?, ?, ?, ?)`
    )
    .bind(crypto.randomUUID(), input.userId, input.status, input.now ?? Date.now());
}

/* --------------------------------- Campagnes --------------------------------- */

export const CAMPAIGN_STATUSES = ["draft", "active", "ended"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export interface CampaignRow {
  id: string;
  name: string;
  product_id: string;
  starts_at: number | null;
  ends_at: number | null;
  commission_type: string | null;
  commission_value: number | null;
  reward_a: number;
  goal_sales: number | null;
  status: string;
  created_at: number;
}

export function normalizeCampaignStatus(raw: unknown): CampaignStatus | null {
  return typeof raw === "string" && (CAMPAIGN_STATUSES as readonly string[]).includes(raw)
    ? (raw as CampaignStatus)
    : null;
}

export function normalizeCampaignCommission(
  rawType: unknown,
  rawValue: unknown
): { type: "percent" | "fixed"; value: number } | null {
  const type = rawType === "percent" || rawType === "fixed" ? rawType : null;
  const value = Number(rawValue);
  if (!type) return null;
  if (!Number.isFinite(value) || value < 0) return null;
  if (type === "percent" && value > 100) return null;
  return { type, value };
}

/** Campagne au format public (camelCase). */
export function campaignToJson(row: CampaignRow, productTitle?: string | null) {
  return {
    id: row.id,
    name: row.name,
    productId: row.product_id,
    productName: productTitle ?? null,
    startsAt: row.starts_at != null ? Number(row.starts_at) : null,
    endsAt: row.ends_at != null ? Number(row.ends_at) : null,
    commissionType: row.commission_type,
    commissionValue: row.commission_value != null ? Number(row.commission_value) : null,
    rewardA: Math.trunc(Number(row.reward_a) || 0),
    goalSales: row.goal_sales != null ? Math.trunc(Number(row.goal_sales)) : null,
    status: row.status,
    createdAt: Number(row.created_at),
  };
}

/** Agrégat défensif : clics/ventes d'une campagne pour un affilié donné. */
export async function readCampaignProgressForAffiliate(
  db: D1Database,
  input: { campaignId: string; productId: string; affiliateId: string }
): Promise<{ myClicks: number; mySales: number }> {
  const [clickRow, saleRow] = await Promise.all([
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM click_events
          WHERE affiliate_id = ? AND campaign_id = ?`
      )
      .bind(input.affiliateId, input.campaignId)
      .first<{ n: number }>()
      .catch(() => ({ n: 0 })),
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM sales
          WHERE affiliate_id = ? AND product_id = ? AND state = 'confirmed'`
      )
      .bind(input.affiliateId, input.productId)
      .first<{ n: number }>()
      .catch(() => ({ n: 0 })),
  ]);
  return {
    myClicks: Math.trunc(Number(clickRow?.n) || 0),
    mySales: Math.trunc(Number(saleRow?.n) || 0),
  };
}
