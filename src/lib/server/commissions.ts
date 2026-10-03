/**
 * Arsenal — Ventes, commissions et paiements (Phase 2).
 * Contrat FIGÉ : docs/chantier/05-contrat-api-phase2.md
 *
 * Séparation stricte du vocabulaire :
 * - Commission = argent dû à l'affilié (table `commissions`) ;
 * - Paiement   = acte administratif MANUEL (table `payments`) — Arsenal n'est pas une banque ;
 * - Récompense = bonus en A (transaction `reward` du ledger append-only).
 *
 * Garanties :
 * - toute vente est créée en UN SEUL db.batch (vente + commission + récompense A) ;
 * - idempotence par contraintes UNIQUE : `sales.sale_ref`, `commissions.sale_id`,
 *   `a_transactions.idempotency_key = sale:<sale_ref>` (INSERT OR IGNORE) ;
 * - machine à états STRICTE des commissions, chaque UPDATE étant gardé par
 *   `WHERE state = <état lu>` (aucune transition concurrente possible).
 */
import { aTransactionStatement } from "./ledger";
import type { AffiliateProductRow, AffiliateSettings } from "./affiliation";
import { round2 } from "./affiliation";

/* ---------------------------------- Types ---------------------------------- */

export type SaleSource = "chariow_webhook" | "manual";
export type SaleState = "pending" | "confirmed" | "rejected";
export const SALE_STATES: readonly SaleState[] = ["pending", "confirmed", "rejected"];

export type CommissionState = "pending" | "validated" | "payable" | "paid" | "cancelled";

export const COMMISSION_STATES: readonly CommissionState[] = [
  "pending",
  "validated",
  "payable",
  "paid",
  "cancelled",
];

export interface SaleRow {
  id: string;
  affiliate_id: string | null;
  product_id: string;
  link_id: string | null;
  source: string;
  sale_ref: string;
  amount: number;
  currency: string;
  state: string;
  occurred_at: number;
  created_at: number;
  confirmed_by: string | null;
  confirmed_at: number | null;
}

export interface CommissionRow {
  id: string;
  sale_id: string;
  affiliate_id: string;
  amount: number;
  currency: string;
  rate_percent: number | null;
  state: string;
  reward_a: number;
  created_at: number;
  updated_at: number;
  payment_id: string | null;
}

export interface PaymentRow {
  id: string;
  affiliate_id: string;
  amount: number;
  currency: string;
  reference: string | null;
  state: string;
  note: string | null;
  created_at: number;
  paid_at: number | null;
}

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

/* --------------------------- Machine à états (stricte) --------------------------- */

/**
 * Transitions autorisées : pending → validated → payable → paid,
 * et `*` → cancelled (jamais depuis `cancelled`).
 */
export const COMMISSION_TRANSITIONS: Record<CommissionState, readonly CommissionState[]> = {
  pending: ["validated", "cancelled"],
  validated: ["payable", "cancelled"],
  payable: ["paid", "cancelled"],
  paid: ["cancelled"],
  cancelled: [],
};

export type CommissionErrorCode = "invalid_transition" | "payment_required" | "stale_state" | "not_found";

/** Erreur typée : les routes la traduisent en 409 (ou 404 pour `not_found`). */
export class CommissionStateError extends Error {
  readonly code: CommissionErrorCode;
  readonly from: string;
  readonly to: string;

  constructor(code: CommissionErrorCode, from: string, to: string, message: string) {
    super(message);
    this.name = "CommissionStateError";
    this.code = code;
    this.from = from;
    this.to = to;
  }
}

export function isCommissionState(value: unknown): value is CommissionState {
  return typeof value === "string" && (COMMISSION_STATES as readonly string[]).includes(value);
}

/**
 * Vérifie une transition `from → to` (et l'exigence de `paymentId` pour `paid`).
 * Lève une CommissionStateError typée si la transition est invalide.
 */
export function assertCommissionTransition(
  from: string,
  to: CommissionState,
  paymentId?: string | null
): void {
  const allowed = COMMISSION_TRANSITIONS[from as CommissionState];
  if (!allowed || !allowed.includes(to)) {
    throw new CommissionStateError(
      "invalid_transition",
      from,
      to,
      `Transition de commission invalide : ${from} → ${to}.`
    );
  }
  if (to === "paid" && !String(paymentId ?? "").trim()) {
    throw new CommissionStateError(
      "payment_required",
      from,
      to,
      "Un identifiant de paiement est requis pour marquer une commission payée."
    );
  }
}

/**
 * UPDATE gardé par l'état lu : garantit qu'une transition concurrente ne peut
 * ni doubler un paiement ni sauter une étape.
 */
export function commissionStateStatement(
  db: D1Database,
  commission: Pick<CommissionRow, "id" | "state">,
  to: CommissionState,
  paymentId: string | null = null,
  now: number = Date.now()
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE commissions SET state = ?, updated_at = ?, payment_id = COALESCE(?, payment_id)
       WHERE id = ? AND state = ?`
    )
    .bind(to, now, paymentId, commission.id, commission.state);
}

/** Nombre de lignes affectées par un D1Result (0 = état modifié entre-temps). */
export function changesOf(result: unknown): number {
  const meta = (result as { meta?: Record<string, unknown> } | null)?.meta;
  return Math.trunc(Number(meta?.changes ?? 0)) || 0;
}

export async function getCommissionById(db: D1Database, id: string): Promise<CommissionRow | null> {
  return (
    (await db.prepare("SELECT * FROM commissions WHERE id = ?").bind(id).first<CommissionRow>()) ?? null
  );
}

/**
 * Applique une transition d'état à une commission (lecture puis UPDATE gardé).
 * Lève CommissionStateError (code `stale_state`) si l'état a changé entre-temps.
 */
export async function applyCommissionState(
  db: D1Database,
  commissionId: string,
  to: CommissionState,
  options: { paymentId?: string | null; now?: number } = {}
): Promise<CommissionRow> {
  const commission = await getCommissionById(db, commissionId);
  if (!commission) {
    throw new CommissionStateError("not_found", "", to, "Commission introuvable.");
  }
  const paymentId = options.paymentId ?? null;
  assertCommissionTransition(commission.state, to, paymentId);
  const now = options.now ?? Date.now();
  const result = await commissionStateStatement(db, commission, to, paymentId, now).run();
  if (changesOf(result) === 0) {
    throw new CommissionStateError(
      "stale_state",
      commission.state,
      to,
      "État de la commission modifié entre-temps."
    );
  }
  return {
    ...commission,
    state: to,
    payment_id: paymentId ?? commission.payment_id,
    updated_at: now,
  };
}

/* -------------------------- Règles de commission (pures) -------------------------- */

export type CommissionRuleSource = "product" | "campaign" | "default";

export interface CommissionRule {
  /** percent (part de la vente) | fixed (montant par vente). */
  type: "percent" | "fixed";
  value: number;
  ratePercent: number | null;
  source: CommissionRuleSource;
  /** Récompense A associée (0 = aucune). */
  rewardA: number;
  rewardSource: CommissionRuleSource | "none";
}

function validRule(type: string | null | undefined, value: number | null | undefined): boolean {
  const t = String(type ?? "").trim().toLowerCase();
  return (t === "percent" || t === "fixed") && Number.isFinite(Number(value)) && Number(value) >= 0;
}

/**
 * Priorité du contrat : commission du produit → campagne active du produit →
 * réglage `default_commission_percent`. Idem pour la récompense A
 * (`reward_a` produit → campagne → réglage `default_reward_a`).
 */
export function resolveCommissionRule(
  product: Pick<AffiliateProductRow, "commission_type" | "commission_value" | "reward_a">,
  campaign: Pick<CampaignRow, "commission_type" | "commission_value" | "reward_a"> | null,
  settings: AffiliateSettings
): CommissionRule {
  let rule: CommissionRule;
  if (validRule(product.commission_type, product.commission_value)) {
    const type = String(product.commission_type).trim().toLowerCase() as "percent" | "fixed";
    const value = Number(product.commission_value);
    rule = { type, value, ratePercent: type === "percent" ? value : null, source: "product", rewardA: 0, rewardSource: "none" };
  } else if (campaign && validRule(campaign.commission_type, campaign.commission_value)) {
    const type = String(campaign.commission_type).trim().toLowerCase() as "percent" | "fixed";
    const value = Number(campaign.commission_value);
    rule = { type, value, ratePercent: type === "percent" ? value : null, source: "campaign", rewardA: 0, rewardSource: "none" };
  } else {
    const value = settings.defaultCommissionPercent;
    rule = { type: "percent", value, ratePercent: value, source: "default", rewardA: 0, rewardSource: "none" };
  }

  const productReward = Number(product.reward_a ?? 0);
  const campaignReward = Number(campaign?.reward_a ?? 0);
  if (Number.isFinite(productReward) && productReward > 0) {
    rule.rewardA = Math.trunc(productReward);
    rule.rewardSource = "product";
  } else if (Number.isFinite(campaignReward) && campaignReward > 0) {
    rule.rewardA = Math.trunc(campaignReward);
    rule.rewardSource = "campaign";
  } else if (settings.defaultRewardA > 0) {
    rule.rewardA = Math.trunc(settings.defaultRewardA);
    rule.rewardSource = "default";
  }
  return rule;
}

/**
 * Montant de la commission pour une vente. Jamais de montant transmis par le
 * client ; jamais de commission supérieure au montant de la vente.
 */
export function computeCommissionAmount(
  saleAmount: number,
  rule: CommissionRule
): { amount: number; ratePercent: number | null } {
  const base = Number.isFinite(saleAmount) ? Math.max(0, saleAmount) : 0;
  if (base <= 0 || rule.value <= 0) return { amount: 0, ratePercent: rule.ratePercent };
  const raw = rule.type === "percent" ? (base * rule.value) / 100 : rule.value;
  return { amount: Math.min(round2(raw), round2(base)), ratePercent: rule.ratePercent };
}

/** Campagne active d'un produit (statut `active` + fenêtre de dates si renseignée). */
export async function getActiveCampaign(
  db: D1Database,
  productId: string,
  now: number = Date.now()
): Promise<CampaignRow | null> {
  const row = await db
    .prepare(
      `SELECT * FROM campaigns
       WHERE product_id = ? AND status = 'active'
         AND (starts_at IS NULL OR starts_at <= ?)
         AND (ends_at IS NULL OR ends_at >= ?)
       ORDER BY created_at DESC LIMIT 1`
    )
    .bind(productId, now, now)
    .first<CampaignRow>();
  return row ?? null;
}

/* ------------------------------ Création d'une vente ------------------------------ */

export interface NewSaleInput {
  /** Référence unique : `sale.id` Chariow ou référence saisie par l'admin. */
  saleRef: string;
  productId: string;
  affiliateId: string | null;
  linkId: string | null;
  source: SaleSource;
  amount: number;
  currency: string;
  occurredAt: number;
  /** null = pas de commission (vente non attribuée à un affilié). */
  commission: { amount: number; ratePercent: number | null; rewardA: number } | null;
  /** Destinataire de la récompense A (= `affiliates.user_id`). */
  rewardUserId?: string | null;
  confirmedBy?: string | null;
  /**
   * Plafond de ventes par lien (vague 4) : au-delà, le lien est marqué
   * `saturated` et cesse d'attribuer (sa place se libère). `0` = illimité.
   */
  maxSalesPerLink?: number;
  now?: number;
}

export interface SaleStatements {
  saleId: string;
  commissionId: string | null;
  rewardA: number;
  statements: D1PreparedStatement[];
}

/**
 * Statements de création d'une vente confirmée (+ commission `pending` +
 * récompense A) — à exécuter en un SEUL db.batch.
 * Idempotence : `sales.sale_ref` UNIQUE, `commissions.sale_id` UNIQUE
 * (INSERT OR IGNORE), `a_transactions.idempotency_key` = `sale:<saleRef>`.
 */
export function saleStatements(db: D1Database, input: NewSaleInput): SaleStatements {
  const now = input.now ?? Date.now();
  const saleId = crypto.randomUUID();
  const commissionId = input.commission && input.affiliateId ? crypto.randomUUID() : null;
  const rewardA = input.commission && input.affiliateId ? Math.trunc(input.commission.rewardA || 0) : 0;
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO sales
           (id, affiliate_id, product_id, link_id, source, sale_ref, amount, currency,
            state, occurred_at, created_at, confirmed_by, confirmed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, ?)`
      )
      .bind(
        saleId,
        input.affiliateId,
        input.productId,
        input.linkId,
        input.source,
        input.saleRef,
        round2(Number(input.amount) || 0),
        input.currency,
        input.occurredAt,
        now,
        input.confirmedBy ?? null,
        now
      ),
  ];

  if (commissionId && input.commission && input.affiliateId) {
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO commissions
             (id, sale_id, affiliate_id, amount, currency, rate_percent, state, reward_a, created_at, updated_at, payment_id)
           VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, NULL)`
        )
        .bind(
          commissionId,
          saleId,
          input.affiliateId,
          round2(Number(input.commission.amount) || 0),
          input.currency,
          input.commission.ratePercent,
          rewardA,
          now,
          now
        )
    );

    if (rewardA > 0 && input.rewardUserId) {
      statements.push(
        aTransactionStatement(db, {
          userId: input.rewardUserId,
          delta: rewardA,
          type: "reward",
          label: `Récompense vente ${input.saleRef}`,
          refType: "sale",
          refId: saleId,
          idempotencyKey: `sale:${input.saleRef}`,
        })
      );
    }
  }

  // Plafond de ventes par lien (vague 4) : incrémente le compteur du lien
  // attribué et le marque `saturated` au seuil — il cessera alors d'attribuer
  // (sa place se libère). Dans le MÊME batch que la vente : soit tout, soit rien.
  // `maxSalesPerLink = 0` ⇒ illimité (aucune saturation).
  if (input.linkId) {
    const maxSales = Math.max(0, Math.trunc(Number(input.maxSalesPerLink) || 0));
    statements.push(
      db
        .prepare(
          `UPDATE affiliate_links
              SET sales_count = sales_count + 1,
                  status = CASE WHEN ? > 0 AND sales_count + 1 >= ? THEN 'saturated' ELSE status END
            WHERE id = ?`
        )
        .bind(maxSales, maxSales, input.linkId)
    );
  }

  return { saleId, commissionId, rewardA, statements };
}

/** Exécute la création d'une vente (+ statements additionnels) en un seul batch. */
export async function createSaleWithCommission(
  db: D1Database,
  input: NewSaleInput,
  extraStatements: D1PreparedStatement[] = []
): Promise<SaleStatements> {
  const built = saleStatements(db, input);
  await db.batch([...built.statements, ...extraStatements]);
  return built;
}

export async function getSaleById(db: D1Database, id: string): Promise<SaleRow | null> {
  return (await db.prepare("SELECT * FROM sales WHERE id = ?").bind(id).first<SaleRow>()) ?? null;
}

export async function getSaleByRef(db: D1Database, saleRef: string): Promise<SaleRow | null> {
  return (await db.prepare("SELECT * FROM sales WHERE sale_ref = ?").bind(saleRef).first<SaleRow>()) ?? null;
}

export async function getCommissionBySaleId(db: D1Database, saleId: string): Promise<CommissionRow | null> {
  return (
    (await db.prepare("SELECT * FROM commissions WHERE sale_id = ?").bind(saleId).first<CommissionRow>()) ??
    null
  );
}

export function isSaleState(value: unknown): value is SaleState {
  return typeof value === "string" && (SALE_STATES as readonly string[]).includes(value);
}

/* --------------------------------- Lecture admin --------------------------------- */

export interface AdminSaleRow extends SaleRow {
  affiliate_code: string | null;
  affiliate_pseudo: string | null;
  product_title: string | null;
}

const ADMIN_SALE_SELECT = `
  SELECT s.*, a.code AS affiliate_code, u.pseudo AS affiliate_pseudo, p.title AS product_title
  FROM sales s
  LEFT JOIN affiliates a ON a.id = s.affiliate_id
  LEFT JOIN users u ON u.id = a.user_id
  LEFT JOIN products p ON p.id = s.product_id
`;

export async function listSalesAdmin(
  db: D1Database,
  filters: { state?: string | null; affiliateId?: string | null } = {}
): Promise<AdminSaleRow[]> {
  const where: string[] = [];
  const binds: unknown[] = [];
  if (filters.state) {
    where.push("s.state = ?");
    binds.push(filters.state);
  }
  if (filters.affiliateId) {
    where.push("s.affiliate_id = ?");
    binds.push(filters.affiliateId);
  }
  const clause = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const { results = [] } = await db
    .prepare(`${ADMIN_SALE_SELECT}${clause} ORDER BY s.created_at DESC, s.id DESC`)
    .bind(...binds)
    .all<AdminSaleRow>();
  return results || [];
}

export interface AdminCommissionRow extends CommissionRow {
  affiliate_code: string | null;
  affiliate_pseudo: string | null;
  sale_ref: string | null;
  sale_source: string | null;
  sale_state: string | null;
  product_id: string | null;
  product_title: string | null;
}

const ADMIN_COMMISSION_SELECT = `
  SELECT c.*, a.code AS affiliate_code, u.pseudo AS affiliate_pseudo,
         s.sale_ref AS sale_ref, s.source AS sale_source, s.state AS sale_state,
         s.product_id AS product_id, p.title AS product_title
  FROM commissions c
  LEFT JOIN affiliates a ON a.id = c.affiliate_id
  LEFT JOIN users u ON u.id = a.user_id
  LEFT JOIN sales s ON s.id = c.sale_id
  LEFT JOIN products p ON p.id = s.product_id
`;

export async function listCommissionsAdmin(
  db: D1Database,
  filters: { state?: string | null; affiliateId?: string | null } = {}
): Promise<AdminCommissionRow[]> {
  const where: string[] = [];
  const binds: unknown[] = [];
  if (filters.state) {
    where.push("c.state = ?");
    binds.push(filters.state);
  }
  if (filters.affiliateId) {
    where.push("c.affiliate_id = ?");
    binds.push(filters.affiliateId);
  }
  const clause = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const { results = [] } = await db
    .prepare(`${ADMIN_COMMISSION_SELECT}${clause} ORDER BY c.created_at DESC, c.id DESC`)
    .bind(...binds)
    .all<AdminCommissionRow>();
  return results || [];
}

/** Commissions payables d'un affilié, les plus anciennes d'abord (allocation des paiements). */
export async function listPayableCommissions(db: D1Database, affiliateId: string): Promise<CommissionRow[]> {
  const { results = [] } = await db
    .prepare("SELECT * FROM commissions WHERE affiliate_id = ? AND state = 'payable' ORDER BY created_at ASC, id ASC")
    .bind(affiliateId)
    .all<CommissionRow>();
  return results || [];
}

/* ----------------------------------- Paiements ----------------------------------- */

export interface NewPaymentInput {
  id?: string;
  affiliateId: string;
  amount: number;
  currency: string;
  reference?: string | null;
  note?: string | null;
  now?: number;
}

export function paymentStatement(db: D1Database, payment: PaymentRow): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO payments (id, affiliate_id, amount, currency, reference, state, note, created_at, paid_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      payment.id,
      payment.affiliate_id,
      payment.amount,
      payment.currency,
      payment.reference,
      payment.state,
      payment.note,
      payment.created_at,
      payment.paid_at
    );
}

/**
 * Allocation d'un paiement sur les commissions payables, les plus anciennes
 * d'abord, sans jamais dépasser le montant payé (le reliquat éventuel est
 * renvoyé à l'admin, aucune commission n'est marquée payée « en trop »).
 */
export function allocatePayment(
  commissions: CommissionRow[],
  amount: number
): { ids: string[]; total: number; remaining: number } {
  const available = Math.max(0, round2(Number(amount) || 0));
  let remaining = available;
  const ids: string[] = [];
  for (const commission of commissions) {
    const value = round2(Number(commission.amount) || 0);
    if (value <= 0 || value > remaining + 1e-9) continue;
    ids.push(commission.id);
    remaining = round2(remaining - value);
  }
  return { ids, total: round2(available - remaining), remaining };
}

export interface PaymentResult {
  payment: PaymentRow;
  paidCommissionIds: string[];
  paidTotal: number;
  remaining: number;
}

/**
 * Enregistre un paiement manuel ET marque payable → paid dans le MÊME batch
 * (chaque UPDATE reste gardé par `state = 'payable'`).
 */
export async function recordPayment(
  db: D1Database,
  input: NewPaymentInput,
  extraStatements: D1PreparedStatement[] = []
): Promise<PaymentResult> {
  const now = input.now ?? Date.now();
  const payment: PaymentRow = {
    id: input.id ?? crypto.randomUUID(),
    affiliate_id: input.affiliateId,
    amount: round2(Number(input.amount) || 0),
    currency: input.currency || "FCFA",
    reference: input.reference?.trim() ? input.reference.trim().slice(0, 120) : null,
    state: "paid",
    note: input.note?.trim() ? input.note.trim().slice(0, 500) : null,
    created_at: now,
    paid_at: now,
  };

  const payable = await listPayableCommissions(db, input.affiliateId);
  const allocation = allocatePayment(payable, payment.amount);
  const byId = new Map(payable.map((c) => [c.id, c]));

  const statements: D1PreparedStatement[] = [paymentStatement(db, payment)];
  for (const id of allocation.ids) {
    const commission = byId.get(id);
    if (!commission) continue;
    statements.push(commissionStateStatement(db, commission, "paid", payment.id, now));
  }
  await db.batch([...statements, ...extraStatements]);

  return {
    payment,
    paidCommissionIds: allocation.ids,
    paidTotal: allocation.total,
    remaining: allocation.remaining,
  };
}

export interface AdminPaymentRow extends PaymentRow {
  affiliate_code: string | null;
  affiliate_pseudo: string | null;
}

/** Vente + attribution (écrans admin). */
export async function getAdminSaleById(db: D1Database, id: string): Promise<AdminSaleRow | null> {
  return (await db.prepare(`${ADMIN_SALE_SELECT} WHERE s.id = ?`).bind(id).first<AdminSaleRow>()) ?? null;
}

/** Commission + affilié + vente (écrans admin). */
export async function getAdminCommissionById(
  db: D1Database,
  id: string
): Promise<AdminCommissionRow | null> {
  return (
    (await db.prepare(`${ADMIN_COMMISSION_SELECT} WHERE c.id = ?`).bind(id).first<AdminCommissionRow>()) ??
    null
  );
}

export async function listPaymentsAdmin(
  db: D1Database,
  affiliateId?: string | null
): Promise<AdminPaymentRow[]> {
  const base = `
    SELECT pay.*, a.code AS affiliate_code, u.pseudo AS affiliate_pseudo
    FROM payments pay
    LEFT JOIN affiliates a ON a.id = pay.affiliate_id
    LEFT JOIN users u ON u.id = a.user_id
  `;
  const order = " ORDER BY pay.created_at DESC, pay.id DESC";
  const { results = [] } = affiliateId
    ? await db.prepare(`${base} WHERE pay.affiliate_id = ?${order}`).bind(affiliateId).all<AdminPaymentRow>()
    : await db.prepare(`${base}${order}`).all<AdminPaymentRow>();
  return results || [];
}

export async function getPaymentById(db: D1Database, id: string): Promise<PaymentRow | null> {
  return (await db.prepare("SELECT * FROM payments WHERE id = ?").bind(id).first<PaymentRow>()) ?? null;
}
