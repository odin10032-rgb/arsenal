/**
 * Arsenal — Achats en A (Phase 2.6).
 * Contrat FIGÉ : docs/chantier/07-contrat-paiement-a.md — implémenté à la lettre.
 * Audit des capacités Chariow : docs/chantier/06-audit-chariow-fulfillment.md.
 *
 * Règle d'or : le serveur est seul maître du prix, du solde et des statuts.
 * - le prix vient de `products.price_a` (jamais du client) ;
 * - le solde est TOUJOURS recalculé (`SUM(delta)` de `a_transactions`, jamais stocké) ;
 * - l'achat est ATOMIQUE : un SEUL db.batch (débit A + purchase + fulfillment
 *   [+ vente affiliée / commission / récompense A]). D1 exécute un batch en
 *   transaction : l'échec de l'INSERT purchase (index unique partiel
 *   `idx_purchases_owner`) annule aussi le débit → ni double achat, ni A perdus ;
 * - idempotence : `purchase:<id>` (débit), `refund:<id>` (remboursement),
 *   `sale:purchase:<id>` (récompense affiliée), `sales.sale_ref` unique.
 *
 * Style store.ts : fonctions pures recevant D1Database en paramètre.
 */

import { aTransactionStatement } from "./ledger";
import { getSetting, setSetting } from "./store";
import { CHARIOW_API_KEY_SETTING } from "./chariow-checkout";
import {
  getAffiliateById,
  getAffiliateLinkByCode,
  readAffiliateSettings,
  round2,
} from "./affiliation";
import type { AffiliateProductRow } from "./affiliation";
import { computeCommissionAmount, getActiveCampaign, resolveCommissionRule } from "./commissions";
import { createFulfillmentStatement, normalizeFulfillmentMethod } from "./fulfillment";
import type { FulfillmentMethod } from "./fulfillment";

/* -------------------------------- Constantes -------------------------------- */

export type PurchaseStatus =
  | "pending"
  | "paid"
  | "fulfillment_pending"
  | "fulfilled"
  | "failed"
  | "cancelled"
  | "refunded";

export const PURCHASE_STATUSES: readonly PurchaseStatus[] = [
  "pending",
  "paid",
  "fulfillment_pending",
  "fulfilled",
  "failed",
  "cancelled",
  "refunded",
];

/**
 * Statuts « actifs » : un seul achat actif par (user_id, product_id) — miroir
 * exact de l'index unique partiel `idx_purchases_owner` (migration 0004).
 */
export const ACTIVE_PURCHASE_STATUSES: readonly PurchaseStatus[] = [
  "pending",
  "paid",
  "fulfillment_pending",
  "fulfilled",
];

/** Liste SQL des statuts actifs (valeurs figées par le type — aucune injection). */
const ACTIVE_STATUSES_SQL = ACTIVE_PURCHASE_STATUSES.map((s) => `'${s}'`).join(", ");

/** Statuts relançables (`POST /api/purchases/:id/retry`, contrat). */
export const RETRYABLE_PURCHASE_STATUSES: readonly PurchaseStatus[] = [
  "fulfillment_pending",
  "failed",
];

/** Fenêtre de parrainage d'un achat : 30 jours (contrat). */
export const AFFILIATE_REF_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** Réglage du plafond d'achats par minute et par IP (défaut du contrat : 5). */
export const PURCHASE_MAX_PER_MIN_KEY = "purchase_max_per_min";
export const PURCHASE_MAX_PER_MIN_DEFAULT = 5;
const PURCHASE_MAX_PER_MIN_MAX = 120;

/* ---------------------------------- Types ---------------------------------- */

export interface PurchaseRow {
  id: string;
  user_id: string;
  product_id: string;
  amount_a: number;
  status: string;
  affiliate_id: string | null;
  link_code: string | null;
  created_at: number;
  updated_at: number;
  fulfilled_at: number | null;
  refunded_at: number | null;
}

/**
 * Produit lu pour l'achat : colonnes du catalogue + affiliation (règle de
 * commission) + vente en A (migration 0004). Aucune donnée n'est fournie par
 * le client.
 */
export interface PurchasableProductRow extends AffiliateProductRow {
  category: string;
  purchasable: number;
  price_a: number;
  chariow_product_id: string | null;
  fulfillment_method: string | null;
}

/** Purchase + jointures produit/fulfillment (réponses utilisateur). */
export interface PurchaseJoinRow extends PurchaseRow {
  product_title: string | null;
  product_image_url: string | null;
  product_category: string | null;
  product_fulfillment_method: string | null;
  fulfillment_id: string | null;
  fulfillment_provider: string | null;
  fulfillment_status: string | null;
  fulfillment_reference: string | null;
  fulfillment_attempts: number | null;
  fulfillment_last_error: string | null;
  fulfillment_completed_at: number | null;
}

/** Purchase + jointures utilisateur/produit/fulfillment (réponses admin). */
export interface AdminPurchaseRow extends PurchaseJoinRow {
  user_pseudo: string | null;
  user_email: string | null;
}

/** Attribution d'affiliation résolue côté serveur (jamais fournie telle quelle). */
export interface PurchaseAttribution {
  affiliateId: string;
  affiliateUserId: string;
  linkId: string | null;
  linkCode: string;
}

/** Commission affiliée calculée serveur pour un achat en A. */
export interface PurchaseCommission {
  amount: number;
  ratePercent: number | null;
  rewardA: number;
}

/** Objet `access` du contrat (mode d'accès du produit obtenu). */
export type PurchaseAccess =
  | { mode: "chariow_portal"; email: string }
  | { mode: "manual"; instructions: string };

/** Purchase au format API (utilisateur) — contrat § Routes utilisateur. */
export interface PurchaseJson {
  id: string;
  productId: string;
  amountA: number;
  status: string;
  createdAt: number;
  fulfilledAt: number | null;
  refundedAt: number | null;
  product: { id: string; title: string; imageUrl: string; category: string } | null;
  fulfillment: { provider: string | null; status: string | null; completedAt: number | null } | null;
  access: PurchaseAccess | null;
}

/* ------------------------------- Lecture produit ------------------------------- */

const PRODUCT_PURCHASE_COLUMNS = `
  id, title, price, image_url, category, action_url, affiliate_enabled,
  commission_type, commission_value, reward_a,
  purchasable, price_a, chariow_product_id, fulfillment_method
`;

export async function getProductForPurchase(
  db: D1Database,
  productId: string
): Promise<PurchasableProductRow | null> {
  const id = (productId ?? "").trim();
  if (!id) return null;
  const row = await db
    .prepare(`SELECT ${PRODUCT_PURCHASE_COLUMNS} FROM products WHERE id = ?`)
    .bind(id)
    .first<PurchasableProductRow>();
  return row ?? null;
}

/** Prix en A du produit (entier ≥ 0, lu en base — jamais transmis par le client). */
export function productPriceA(product: Pick<PurchasableProductRow, "price_a">): number {
  const value = Math.trunc(Number(product.price_a ?? 0));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** Produit achetable = `purchasable = 1` ET `price_a > 0` (contrat). */
export function isPurchasableProduct(product: Pick<PurchasableProductRow, "purchasable" | "price_a">): boolean {
  return Number(product.purchasable) === 1 && productPriceA(product) > 0;
}

/* ------------------------------- Lecture purchases ------------------------------- */

/** Achat ACTIF d'un utilisateur pour un produit (garde-fou « possède déjà »). */
export async function getActivePurchase(
  db: D1Database,
  userId: string,
  productId: string
): Promise<PurchaseRow | null> {
  const row = await db
    .prepare(
      `SELECT * FROM purchases
        WHERE user_id = ? AND product_id = ? AND status IN (${ACTIVE_STATUSES_SQL})
        LIMIT 1`
    )
    .bind(userId, productId)
    .first<PurchaseRow>();
  return row ?? null;
}

export async function getPurchaseById(db: D1Database, id: string): Promise<PurchaseRow | null> {
  const row = await db.prepare("SELECT * FROM purchases WHERE id = ?").bind(id).first<PurchaseRow>();
  return row ?? null;
}

/** Achat d'un utilisateur précis — toute lecture utilisateur est scopée par la session. */
export async function getPurchaseForUser(
  db: D1Database,
  userId: string,
  purchaseId: string
): Promise<PurchaseRow | null> {
  const row = await db
    .prepare("SELECT * FROM purchases WHERE id = ? AND user_id = ?")
    .bind(purchaseId, userId)
    .first<PurchaseRow>();
  return row ?? null;
}

/** Statut relançable (contrat : `fulfillment_pending` | `failed`). */
export function isRetryablePurchaseStatus(status: string): boolean {
  return (RETRYABLE_PURCHASE_STATUSES as readonly string[]).includes(status);
}

/* ------------------------------- Jointures ------------------------------- */

const PURCHASE_JOIN_COLUMNS = `
  p.id, p.user_id, p.product_id, p.amount_a, p.status, p.affiliate_id, p.link_code,
  p.created_at, p.updated_at, p.fulfilled_at, p.refunded_at,
  pr.title AS product_title, pr.image_url AS product_image_url, pr.category AS product_category,
  pr.fulfillment_method AS product_fulfillment_method,
  f.id AS fulfillment_id, f.provider AS fulfillment_provider, f.status AS fulfillment_status,
  f.provider_reference AS fulfillment_reference, f.attempts AS fulfillment_attempts,
  f.last_error AS fulfillment_last_error, f.completed_at AS fulfillment_completed_at
`;

const PURCHASE_JOIN_FROM = `
  FROM purchases p
  LEFT JOIN products pr ON pr.id = p.product_id
  LEFT JOIN fulfillments f ON f.purchase_id = p.id
`;

/** Achat d'un utilisateur avec produit + fulfillment (réponse unitaire). */
export async function getPurchaseDetail(
  db: D1Database,
  purchaseId: string
): Promise<PurchaseJoinRow | null> {
  const row = await db
    .prepare(`SELECT ${PURCHASE_JOIN_COLUMNS} ${PURCHASE_JOIN_FROM} WHERE p.id = ?`)
    .bind(purchaseId)
    .first<PurchaseJoinRow>();
  return row ?? null;
}

/** « Mes produits » : achats de l'utilisateur, plus récents d'abord (contrat). */
export async function listUserPurchases(
  db: D1Database,
  userId: string
): Promise<PurchaseJoinRow[]> {
  const { results = [] } = await db
    .prepare(
      `SELECT ${PURCHASE_JOIN_COLUMNS} ${PURCHASE_JOIN_FROM}
        WHERE p.user_id = ?
        ORDER BY p.created_at DESC, p.id DESC`
    )
    .bind(userId)
    .all<PurchaseJoinRow>();
  return results || [];
}

/** Liste admin (filtre statut optionnel, plafonnée) — utilisateur + produit + fulfillment. */
export async function listPurchasesAdmin(
  db: D1Database,
  filters: { status?: string | null; limit?: number } = {}
): Promise<AdminPurchaseRow[]> {
  const limit = Math.min(Math.max(Math.trunc(filters.limit ?? 100) || 100, 1), 500);
  const where = filters.status ? " WHERE p.status = ?" : "";
  const statement = db.prepare(
    `SELECT ${PURCHASE_JOIN_COLUMNS},
            u.pseudo AS user_pseudo, u.email AS user_email
       ${PURCHASE_JOIN_FROM}
       LEFT JOIN users u ON u.id = p.user_id
       ${where}
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT ?`
  );
  const { results = [] } = filters.status
    ? await statement.bind(filters.status, limit).all<AdminPurchaseRow>()
    : await statement.bind(limit).all<AdminPurchaseRow>();
  return results || [];
}

/** Achat d'un utilisateur avec ses coordonnées (réponses admin après mutation). */
export async function getAdminPurchaseDetail(
  db: D1Database,
  purchaseId: string
): Promise<AdminPurchaseRow | null> {
  const row = await db
    .prepare(
      `SELECT ${PURCHASE_JOIN_COLUMNS},
              u.pseudo AS user_pseudo, u.email AS user_email
         ${PURCHASE_JOIN_FROM}
         LEFT JOIN users u ON u.id = p.user_id
        WHERE p.id = ?`
    )
    .bind(purchaseId)
    .first<AdminPurchaseRow>();
  return row ?? null;
}

/* --------------------------- Attribution affiliation --------------------------- */

/**
 * Résout le code de parrainage transmis à l'achat (code de lien `/r/<code>`).
 * Vérifications du contrat : affilié `active`, lien existant, produit
 * correspondant, fenêtre ≤ 30 j. Tout code invalide est IGNORÉ silencieusement
 * (achat non attribué) — aucun message d'erreur, comme pour Chariow.
 *
 * La fenêtre de 30 j est matérialisée sur les données serveur disponibles :
 * le lien doit être récent OU avoir reçu un clic récent (le client, lui, ne
 * transmet que le code — `localStorage.arsenal_affiliate_ref` filtre déjà < 30 j).
 */
export async function resolvePurchaseAttribution(
  db: D1Database,
  code: string | null | undefined,
  productId: string,
  now: number = Date.now()
): Promise<PurchaseAttribution | null> {
  const trimmed = (code ?? "").trim();
  if (!trimmed) return null;

  const link = await getAffiliateLinkByCode(db, trimmed);
  if (!link || link.product_id !== productId) return null;

  const affiliate = await getAffiliateById(db, link.affiliate_id);
  if (!affiliate || affiliate.status !== "active") return null;

  if (Number(link.created_at) < now - AFFILIATE_REF_WINDOW_MS) {
    const click = await db
      .prepare("SELECT id FROM click_events WHERE link_id = ? AND ts > ? LIMIT 1")
      .bind(link.id, now - AFFILIATE_REF_WINDOW_MS)
      .first<{ id: string }>();
    if (!click) return null; // parrainage expiré (> 30 j sans clic) → non attribué
  }

  return {
    affiliateId: affiliate.id,
    affiliateUserId: affiliate.user_id,
    linkId: link.id,
    linkCode: link.code,
  };
}

/**
 * Commission + récompense A d'un achat en A attribué : même règle que le canal
 * Chariow (produit → campagne active → réglages par défaut), montant calculé
 * sur `amount_a` — toujours côté serveur.
 */
export async function computePurchaseCommission(
  db: D1Database,
  product: PurchasableProductRow,
  now: number = Date.now()
): Promise<PurchaseCommission> {
  const [campaign, settings] = await Promise.all([
    getActiveCampaign(db, product.id, now),
    readAffiliateSettings(db),
  ]);
  const rule = resolveCommissionRule(product, campaign, settings);
  const { amount, ratePercent } = computeCommissionAmount(productPriceA(product), rule);
  return { amount, ratePercent, rewardA: rule.rewardA };
}

/* ------------------------------- Création d'achat ------------------------------- */

export interface NewPurchaseInput {
  userId: string;
  product: PurchasableProductRow;
  /** Attribution affiliation résolue côté serveur (facultative). */
  attribution?: PurchaseAttribution | null;
  /** Commission calculée (requise si `attribution` est fournie). */
  commission?: PurchaseCommission | null;
  now?: number;
}

export interface PurchaseCreation {
  purchase: PurchaseRow;
  fulfillmentId: string;
  /** Id de la vente affiliée créée (null si achat non attribué). */
  saleId: string | null;
  statements: D1PreparedStatement[];
}

/**
 * Statements d'un achat en A — à exécuter en UN SEUL db.batch :
 * 1. débit A (type `spend`, clé `purchase:<id>`, INSERT OR IGNORE → idempotent) ;
 * 2. INSERT purchase (`fulfillment_pending`, index unique propriétaire) ;
 * 3. INSERT fulfillment (`pending`) ;
 * 4. si attribué : vente (`source='wallet_purchase'`, `sale_ref='purchase:<id>'`,
 *    devise `A`) + commission `pending` + récompense A (`sale:purchase:<id>`).
 */
export function purchaseStatements(db: D1Database, input: NewPurchaseInput): PurchaseCreation {
  const now = input.now ?? Date.now();
  const purchaseId = crypto.randomUUID();
  const fulfillmentId = crypto.randomUUID();
  const amountA = productPriceA(input.product);
  const method: FulfillmentMethod = normalizeFulfillmentMethod(input.product.fulfillment_method);
  const provider = method === "chariow_free_checkout" ? "chariow" : "manual";
  const attribution = input.attribution ?? null;

  const purchase: PurchaseRow = {
    id: purchaseId,
    user_id: input.userId,
    product_id: input.product.id,
    amount_a: amountA,
    status: "fulfillment_pending",
    affiliate_id: attribution?.affiliateId ?? null,
    link_code: attribution?.linkCode ?? null,
    created_at: now,
    updated_at: now,
    fulfilled_at: null,
    refunded_at: null,
  };

  const statements: D1PreparedStatement[] = [
    // 1. Débit en A — montant calculé serveur, idempotent par `purchase:<id>`.
    aTransactionStatement(db, {
      userId: input.userId,
      delta: -amountA,
      type: "spend",
      label: `Achat — ${String(input.product.title || "").slice(0, 80)}`,
      refType: "purchase",
      refId: purchaseId,
      idempotencyKey: `purchase:${purchaseId}`,
    }),
    // 2. Purchase (l'index unique partiel fait échouer tout doublon → rollback).
    db
      .prepare(
        `INSERT INTO purchases
           (id, user_id, product_id, amount_a, status, affiliate_id, link_code,
            created_at, updated_at, fulfilled_at, refunded_at)
         VALUES (?, ?, ?, ?, 'fulfillment_pending', ?, ?, ?, ?, NULL, NULL)`
      )
      .bind(
        purchase.id,
        purchase.user_id,
        purchase.product_id,
        purchase.amount_a,
        purchase.affiliate_id,
        purchase.link_code,
        purchase.created_at,
        purchase.updated_at
      ),
    // 3. Fulfillment (une ligne par purchase, relancée sur place).
    createFulfillmentStatement(db, { id: fulfillmentId, purchaseId, provider, now }),
  ];

  const commission = attribution ? (input.commission ?? null) : null;
  let saleId: string | null = null;
  if (attribution && commission) {
    saleId = crypto.randomUUID();
    const saleRef = `purchase:${purchaseId}`;
    // Vente attribuée : même table que le canal Chariow, source `wallet_purchase`,
    // devise `A` — `sale_ref` unique = idempotence.
    statements.push(
      db
        .prepare(
          `INSERT INTO sales
             (id, affiliate_id, product_id, link_id, source, sale_ref, amount, currency,
              state, occurred_at, created_at, confirmed_by, confirmed_at)
           VALUES (?, ?, ?, ?, 'wallet_purchase', ?, ?, 'A', 'confirmed', ?, ?, 'wallet_purchase', ?)`
        )
        .bind(
          saleId,
          attribution.affiliateId,
          input.product.id,
          attribution.linkId,
          saleRef,
          round2(amountA),
          now,
          now,
          now
        )
    );
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO commissions
             (id, sale_id, affiliate_id, amount, currency, rate_percent, state, reward_a,
              created_at, updated_at, payment_id)
           VALUES (?, ?, ?, ?, 'A', ?, 'pending', ?, ?, ?, NULL)`
        )
        .bind(
          crypto.randomUUID(),
          saleId,
          attribution.affiliateId,
          round2(commission.amount),
          commission.ratePercent,
          Math.trunc(commission.rewardA || 0),
          now,
          now
        )
    );
    if (commission.rewardA > 0) {
      statements.push(
        aTransactionStatement(db, {
          userId: attribution.affiliateUserId,
          delta: Math.trunc(commission.rewardA),
          type: "reward",
          label: `Récompense vente ${saleRef}`,
          refType: "sale",
          refId: saleId,
          idempotencyKey: `sale:purchase:${purchaseId}`,
        })
      );
    }
  }

  return { purchase, fulfillmentId, saleId, statements };
}

/**
 * Exécute l'achat en un seul batch atomique. Toute violation d'unicité
 * (achat déjà actif) fait échouer le batch ENTIER : le débit A est annulé.
 */
export async function createPurchase(
  db: D1Database,
  input: NewPurchaseInput
): Promise<PurchaseCreation> {
  const built = purchaseStatements(db, input);
  await db.batch(built.statements);
  return built;
}

/* -------------------------------- Remboursement -------------------------------- */

export interface RefundOptions {
  /** Motif admin (journalisé, jamais exposé à l'utilisateur). */
  reason?: string | null;
  now?: number;
}

/**
 * Statements d'un remboursement en A :
 * 1. transaction `adjustment` POSITIVE, clé `refund:<id>` (idempotente) ;
 * 2. purchase → `refunded` (garde `status NOT IN ('refunded','cancelled')`) ;
 * 3. fulfillment → `failed` (le message d'erreur d'origine est conservé).
 */
export function refundStatements(
  db: D1Database,
  purchase: Pick<PurchaseRow, "id" | "user_id" | "amount_a">,
  options: RefundOptions = {}
): D1PreparedStatement[] {
  const now = options.now ?? Date.now();
  const amountA = Math.trunc(Number(purchase.amount_a) || 0);
  const reason =
    typeof options.reason === "string" && options.reason.trim()
      ? options.reason.trim().slice(0, 300)
      : null;
  return [
    aTransactionStatement(db, {
      userId: purchase.user_id,
      delta: amountA,
      type: "adjustment",
      // Libellé neutre côté utilisateur : le motif reste dans security_events.
      label: "Remboursement d'un achat",
      refType: "purchase",
      refId: purchase.id,
      idempotencyKey: `refund:${purchase.id}`,
    }),
    db
      .prepare(
        `UPDATE purchases
            SET status = 'refunded', refunded_at = ?, updated_at = ?
          WHERE id = ? AND status NOT IN ('refunded','cancelled')`
      )
      .bind(now, now, purchase.id),
    db
      .prepare(
        "UPDATE fulfillments SET status = 'failed', last_error = COALESCE(last_error, ?) WHERE purchase_id = ?"
      )
      .bind(reason ? `Achat remboursé — ${reason}` : "Achat remboursé.", purchase.id),
  ];
}

/**
 * Rembourse un achat (le solde A de l'utilisateur remonte de `amount_a`).
 * Retourne les résultats du batch : l'index 1 est l'UPDATE de la purchase
 * (0 ligne = statut déjà terminal, course détectée par l'appelant).
 */
export async function refundPurchase(
  db: D1Database,
  purchase: PurchaseRow,
  extraStatements: D1PreparedStatement[] = []
): Promise<unknown[]> {
  return db.batch([...refundStatements(db, purchase), ...extraStatements]);
}

/* -------------------------------- Réglages -------------------------------- */

export function normalizePurchaseMaxPerMin(raw: unknown): number {
  if (raw === null || raw === undefined) return PURCHASE_MAX_PER_MIN_DEFAULT;
  const text = typeof raw === "string" ? raw.trim() : "";
  if (typeof raw === "string" && text === "") return PURCHASE_MAX_PER_MIN_DEFAULT;
  const value = typeof raw === "number" ? raw : Number(text);
  if (!Number.isFinite(value) || value <= 0) return PURCHASE_MAX_PER_MIN_DEFAULT;
  return Math.min(Math.trunc(value), PURCHASE_MAX_PER_MIN_MAX);
}

/** Plafond effectif d'achats par minute et par IP (défaut 5, réglable). */
export async function readPurchaseMaxPerMin(db: D1Database): Promise<number> {
  return normalizePurchaseMaxPerMin(await getSetting(db, PURCHASE_MAX_PER_MIN_KEY));
}

/** Clés de réglage de la Phase 2.6 (whitelist de `POST /api/admin/settings`). */
export function isPurchaseSettingKey(key: string): boolean {
  return key === PURCHASE_MAX_PER_MIN_KEY || key === CHARIOW_API_KEY_SETTING;
}

/**
 * Écrit un réglage de la Phase 2.6 et renvoie la valeur effectivement stockée
 * (null si la valeur a été ignorée : une clé API vide ne peut pas effacer la
 * clé déjà configurée — même règle que le secret du webhook Chariow).
 */
export async function writePurchaseSetting(
  db: D1Database,
  key: string,
  raw: unknown
): Promise<string | null> {
  if (key === CHARIOW_API_KEY_SETTING) {
    if (typeof raw !== "string" || !raw.trim()) return null;
    const value = raw.trim();
    await setSetting(db, CHARIOW_API_KEY_SETTING, value);
    return value;
  }
  const value = normalizePurchaseMaxPerMin(raw);
  await setSetting(db, PURCHASE_MAX_PER_MIN_KEY, String(value));
  return String(value);
}

/* ------------------------------- Sérialisation ------------------------------- */

/** Instructions d'accès d'une livraison manuelle (aucune donnée client). */
function manualInstructions(row: PurchaseJoinRow): string {
  if (row.status === "fulfilled") {
    return "Produit livré par l'équipe Arsenal — retrouvez-le depuis votre bibliothèque.";
  }
  if (row.fulfillment_status === "failed") {
    return "La livraison a échoué — relancez la livraison ou contactez le support Arsenal.";
  }
  return "Livraison en cours — l'équipe Arsenal vous livre ce produit.";
}

/**
 * Accès d'un achat : portail Chariow (accès clé par l'EMAIL de l'utilisateur
 * sur app.ateliat.com) uniquement quand la livraison est effective ; instructions
 * pour la méthode manuelle.
 */
export function purchaseAccess(row: PurchaseJoinRow, email: string): PurchaseAccess | null {
  const method = normalizeFulfillmentMethod(row.product_fulfillment_method);
  if (method === "chariow_free_checkout") {
    return row.status === "fulfilled" ? { mode: "chariow_portal", email } : null;
  }
  return { mode: "manual", instructions: manualInstructions(row) };
}

/** Purchase au format utilisateur (contrat § Routes utilisateur). */
export function purchaseToJson(row: PurchaseJoinRow, viewer: { email: string }): PurchaseJson {
  return {
    id: row.id,
    productId: row.product_id,
    amountA: Math.trunc(Number(row.amount_a) || 0),
    status: row.status,
    createdAt: Number(row.created_at),
    fulfilledAt: row.fulfilled_at != null ? Number(row.fulfilled_at) : null,
    refundedAt: row.refunded_at != null ? Number(row.refunded_at) : null,
    product: row.product_title
      ? {
          id: row.product_id,
          title: row.product_title,
          imageUrl: row.product_image_url ?? "",
          category: row.product_category ?? "",
        }
      : null,
    fulfillment: row.fulfillment_id
      ? {
          provider: row.fulfillment_provider,
          status: row.fulfillment_status,
          completedAt:
            row.fulfillment_completed_at != null ? Number(row.fulfillment_completed_at) : null,
        }
      : null,
    access: purchaseAccess(row, viewer.email),
  };
}

/** Purchase au format admin (utilisateur + produit + fulfillment détaillé). */
export function purchaseToAdminJson(row: AdminPurchaseRow) {
  return {
    id: row.id,
    userId: row.user_id,
    pseudo: row.user_pseudo ?? null,
    email: row.user_email ?? null,
    productId: row.product_id,
    productTitle: row.product_title ?? null,
    amountA: Math.trunc(Number(row.amount_a) || 0),
    status: row.status,
    affiliateId: row.affiliate_id,
    linkCode: row.link_code,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    fulfilledAt: row.fulfilled_at != null ? Number(row.fulfilled_at) : null,
    refundedAt: row.refunded_at != null ? Number(row.refunded_at) : null,
    fulfillment: row.fulfillment_id
      ? {
          id: row.fulfillment_id,
          provider: row.fulfillment_provider,
          status: row.fulfillment_status,
          reference: row.fulfillment_reference,
          attempts: Math.trunc(Number(row.fulfillment_attempts) || 0),
          lastError: row.fulfillment_last_error,
          completedAt:
            row.fulfillment_completed_at != null ? Number(row.fulfillment_completed_at) : null,
        }
      : null,
  };
}
