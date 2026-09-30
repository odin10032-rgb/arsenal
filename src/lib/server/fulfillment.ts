/**
 * Arsenal — Fulfillment des achats en A (Phase 2.6).
 * Contrat FIGÉ : docs/chantier/07-contrat-paiement-a.md (§ Fulfillment).
 *
 * Un fulfillment = UNE ligne `fulfillments` par purchase. États :
 * `pending` → `processing` → `completed` | `failed`.
 *
 * Garde de 5 tentatives (FULFILLMENT_MAX_ATTEMPTS) : au-delà, plus aucune
 * relance automatique (ni utilisateur, ni admin). Les erreurs de CONFIGURATION
 * (clé API absente, `chariow_product_id` manquant, email introuvable)
 * échouent immédiatement SANS consommer de tentative — contractuellement
 * « aucune tentative réseau ».
 *
 * Les A ne sont JAMAIS perdus : un échec laisse la purchase
 * `fulfillment_pending` (relançable via retry, remboursable par l'admin) — et
 * surtout jamais `failed`, sinon l'index unique partiel autoriserait un second
 * achat du même produit (double débit).
 *
 * Style store.ts : fonctions pures recevant D1Database en paramètre.
 */

import { createChariowCheckout, readChariowApiKey } from "./chariow-checkout";
import type { PurchaseRow } from "./purchases";

/* -------------------------------- Constantes -------------------------------- */

/** Nombre maximal de tentatives automatiques (contrat : « limite : 5 tentatives »). */
export const FULFILLMENT_MAX_ATTEMPTS = 5;

export type FulfillmentMethod = "manual" | "chariow_free_checkout";
export const FULFILLMENT_METHODS: readonly FulfillmentMethod[] = ["manual", "chariow_free_checkout"];
export const DEFAULT_FULFILLMENT_METHOD: FulfillmentMethod = "manual";

export type FulfillmentProvider = "chariow" | "manual" | "arsenal_link";
export type FulfillmentStatus = "pending" | "processing" | "completed" | "failed";
export const FULFILLMENT_STATUSES: readonly FulfillmentStatus[] = [
  "pending",
  "processing",
  "completed",
  "failed",
];

/** Message d'échec conservé dans `last_error` (jamais de perte d'information). */
const MAX_ERROR_LENGTH = 500;

/* ---------------------------------- Types ---------------------------------- */

export interface FulfillmentRow {
  id: string;
  purchase_id: string;
  provider: string;
  status: string;
  provider_reference: string | null;
  attempts: number;
  last_error: string | null;
  created_at: number;
  completed_at: number | null;
}

/** Produit minimal requis par le fulfillment (lecture locale, sans couplage). */
interface FulfillmentProductRow {
  id: string;
  title: string;
  chariow_product_id: string | null;
  fulfillment_method: string | null;
}

/** Résultat d'une tentative (ou d'un constat) de fulfillment. */
export interface FulfillmentOutcome {
  /** true si un appel fournisseur a réellement été tenté. */
  attempted: boolean;
  /** true si la garde de 5 tentatives a bloqué la tentative. */
  exhausted: boolean;
  /** État du fulfillment après l'opération. */
  status: FulfillmentStatus;
  provider: string;
  /** État de la purchase après l'opération (`fulfilled` uniquement en cas de succès). */
  purchaseStatus: string;
  error: string | null;
}

/* ------------------------------- Normalisation ------------------------------- */

/** `manual` | `chariow_free_checkout` — toute valeur inconnue retombe sur `manual`. */
export function normalizeFulfillmentMethod(raw: unknown): FulfillmentMethod {
  const value = typeof raw === "string" ? raw.trim() : "";
  return value === "chariow_free_checkout" ? "chariow_free_checkout" : "manual";
}

/** Fournisseur posé sur la ligne `fulfillments` selon la méthode produit. */
export function fulfillmentProviderForMethod(method: string): FulfillmentProvider {
  return normalizeFulfillmentMethod(method) === "chariow_free_checkout" ? "chariow" : "manual";
}

/* --------------------------------- Lecture --------------------------------- */

/** Fulfillment d'une purchase (le plus récent) — null si absent. */
export async function getFulfillmentByPurchase(
  db: D1Database,
  purchaseId: string
): Promise<FulfillmentRow | null> {
  const row = await db
    .prepare("SELECT * FROM fulfillments WHERE purchase_id = ? ORDER BY created_at DESC LIMIT 1")
    .bind(purchaseId)
    .first<FulfillmentRow>();
  return row ?? null;
}

async function readFulfillmentProduct(
  db: D1Database,
  productId: string
): Promise<FulfillmentProductRow | null> {
  const row = await db
    .prepare("SELECT id, title, chariow_product_id, fulfillment_method FROM products WHERE id = ?")
    .bind(productId)
    .first<FulfillmentProductRow>();
  return row ?? null;
}

async function readUserEmail(db: D1Database, userId: string): Promise<string> {
  const row = await db
    .prepare("SELECT email FROM users WHERE id = ?")
    .bind(userId)
    .first<{ email: string }>();
  return (row?.email ?? "").trim();
}

/**
 * Garde de tentatives : false si le fulfillment est déjà `completed` ou si les
 * 5 tentatives sont épuisées.
 */
export function canAttemptFulfillment(
  fulfillment: Pick<FulfillmentRow, "status" | "attempts"> | null | undefined
): boolean {
  if (!fulfillment) return true;
  if (fulfillment.status === "completed") return false;
  return Number(fulfillment.attempts ?? 0) < FULFILLMENT_MAX_ATTEMPTS;
}

/* -------------------------------- Statements -------------------------------- */

/** INSERT d'un fulfillment `pending` prêt pour un db.batch (idempotent par `id`). */
export function createFulfillmentStatement(
  db: D1Database,
  input: { purchaseId: string; provider: string; now?: number; id?: string }
): D1PreparedStatement {
  const now = input.now ?? Date.now();
  return db
    .prepare(
      `INSERT INTO fulfillments
         (id, purchase_id, provider, status, provider_reference, attempts, last_error, created_at, completed_at)
       VALUES (?, ?, ?, 'pending', NULL, 0, NULL, ?, NULL)`
    )
    .bind(input.id ?? crypto.randomUUID(), input.purchaseId, input.provider, now);
}

/**
 * Complétion d'un fulfillment — gardée par `status != 'completed'` (jamais de
 * double complétion, donc jamais de double transition de la purchase).
 */
export function completeFulfillmentStatement(
  db: D1Database,
  fulfillment: Pick<FulfillmentRow, "id">,
  opts: {
    provider?: string | null;
    providerReference?: string | null;
    /** true si la complétion résulte d'une tentative (comptée). */
    countAttempt?: boolean;
    now?: number;
  } = {}
): D1PreparedStatement {
  const now = opts.now ?? Date.now();
  return db
    .prepare(
      `UPDATE fulfillments
          SET status = 'completed',
              provider = COALESCE(?, provider),
              provider_reference = COALESCE(?, provider_reference),
              last_error = NULL,
              attempts = attempts + ?,
              completed_at = ?
        WHERE id = ? AND status != 'completed'`
    )
    .bind(
      opts.provider ?? null,
      opts.providerReference ?? null,
      opts.countAttempt ? 1 : 0,
      now,
      fulfillment.id
    );
}

/**
 * Échec d'un fulfillment avec message explicite conservé dans `last_error`.
 * `countAttempt` = false pour les erreurs de configuration (aucune tentative
 * réseau émise → la garde de 5 tentatives n'est pas consommée).
 */
export function failFulfillmentStatement(
  db: D1Database,
  fulfillment: Pick<FulfillmentRow, "id">,
  opts: { provider?: string | null; error: string; countAttempt?: boolean; now?: number }
): D1PreparedStatement {
  const error = (opts.error || "Échec du fulfillment.").slice(0, MAX_ERROR_LENGTH);
  return db
    .prepare(
      `UPDATE fulfillments
          SET status = 'failed',
              provider = COALESCE(?, provider),
              last_error = ?,
              attempts = attempts + ?
        WHERE id = ? AND status != 'completed'`
    )
    .bind(opts.provider ?? null, error, opts.countAttempt ? 1 : 0, fulfillment.id);
}

/** Passage de la purchase à `fulfilled` — idempotent, jamais depuis un état terminal. */
export function markPurchaseFulfilledStatement(
  db: D1Database,
  purchaseId: string,
  now: number = Date.now()
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE purchases
          SET status = 'fulfilled', fulfilled_at = COALESCE(fulfilled_at, ?), updated_at = ?
        WHERE id = ? AND status NOT IN ('fulfilled','refunded','cancelled')`
    )
    .bind(now, now, purchaseId);
}

/* ------------------------------- Fulfillment ------------------------------- */

/**
 * Route le fulfillment d'une purchase selon `products.fulfillment_method` :
 * - `manual` : rien d'automatique — la ligne reste `pending`, l'admin livre puis
 *   marque la commande (`POST /api/admin/purchases/:id/fulfill`) ;
 * - `chariow_free_checkout` : appel `POST /v1/checkout` (produit « Gratuit »),
 *   `step: completed` → fulfillment `completed` + purchase `fulfilled` ;
 *   tout le reste → échec motivé (`payment`, `already_purchased`, HTTP, réseau).
 *
 * Ne lève jamais : toute anomalie devient un FulfillmentOutcome.
 */
export async function fulfillPurchase(
  db: D1Database,
  purchase: PurchaseRow
): Promise<FulfillmentOutcome> {
  const now = Date.now();
  const product = await readFulfillmentProduct(db, purchase.product_id);
  const method = normalizeFulfillmentMethod(product?.fulfillment_method);
  const provider = fulfillmentProviderForMethod(method);

  let fulfillment = await getFulfillmentByPurchase(db, purchase.id);
  if (!fulfillment) {
    // Anomalie (la création d'achat insère toujours la ligne) : on la répare.
    await createFulfillmentStatement(db, { purchaseId: purchase.id, provider, now }).run();
    fulfillment = await getFulfillmentByPurchase(db, purchase.id);
  }
  if (!fulfillment) {
    return {
      attempted: false,
      exhausted: false,
      status: "failed",
      provider,
      purchaseStatus: purchase.status,
      error: "Fulfillment introuvable.",
    };
  }

  if (fulfillment.status === "completed") {
    return {
      attempted: false,
      exhausted: false,
      status: "completed",
      provider: fulfillment.provider,
      purchaseStatus: purchase.status,
      error: null,
    };
  }

  // Méthode manuelle : livraison humaine, aucune action serveur.
  if (method === "manual") {
    return {
      attempted: false,
      exhausted: false,
      status: fulfillment.status as FulfillmentStatus,
      provider,
      purchaseStatus: purchase.status,
      error: null,
    };
  }

  // Garde de 5 tentatives (contrat) — aucune relance au-delà.
  if (!canAttemptFulfillment(fulfillment)) {
    return {
      attempted: false,
      exhausted: true,
      status: fulfillment.status as FulfillmentStatus,
      provider,
      purchaseStatus: purchase.status,
      error: `Nombre maximal de tentatives atteint (${FULFILLMENT_MAX_ATTEMPTS}).`,
    };
  }

  /** Échec de configuration : immédiat, message conservé, tentative non comptée. */
  const target = fulfillment;
  const configFailure = async (error: string): Promise<FulfillmentOutcome> => {
    await failFulfillmentStatement(db, target, { provider, error, countAttempt: false, now }).run();
    return {
      attempted: false,
      exhausted: false,
      status: "failed",
      provider,
      purchaseStatus: purchase.status,
      error,
    };
  };

  const apiKey = await readChariowApiKey(db);
  if (!apiKey) return configFailure("Clé API Chariow non configurée.");

  const chariowProductId = (product?.chariow_product_id ?? "").trim();
  if (!chariowProductId) {
    return configFailure("Produit Chariow non configuré (chariow_product_id manquant).");
  }

  const email = await readUserEmail(db, purchase.user_id);
  if (!email) return configFailure("Email de l'acheteur introuvable.");

  const result = await createChariowCheckout({
    apiKey,
    productId: chariowProductId,
    email,
    arsenalPurchase: purchase.id,
    arsenalUser: purchase.user_id,
  });

  if (result.status === "completed") {
    const reference = result.purchaseId ?? result.transactionId ?? null;
    await db.batch([
      completeFulfillmentStatement(db, fulfillment, {
        provider,
        providerReference: reference,
        countAttempt: true,
        now,
      }),
      markPurchaseFulfilledStatement(db, purchase.id, now),
    ]);
    return {
      attempted: true,
      exhausted: false,
      status: "completed",
      provider,
      purchaseStatus: "fulfilled",
      error: null,
    };
  }

  // `step: payment` = produit Chariow payant (le contrat exige le modèle « Gratuit ») :
  // les A restent débités, la commande est relançable/remboursable par l'admin.
  const error =
    result.status === "payment"
      ? "Le produit Chariow n'est pas en modèle de tarification « Gratuit » (step « payment »)."
      : result.status === "already_purchased"
        ? "L'email possède déjà ce produit sur Chariow (already_purchased)."
        : result.error;

  await failFulfillmentStatement(db, fulfillment, {
    provider,
    error,
    countAttempt: true,
    now,
  }).run();

  return {
    attempted: true,
    exhausted: false,
    status: "failed",
    provider,
    purchaseStatus: purchase.status,
    error,
  };
}

/**
 * Complétion par le fournisseur : Pulse `successful.sale` portant
 * `custom_metadata.arsenal_purchase` (la vente Chariow EST la livraison d'un
 * achat déjà payé en A). Idempotent — retourne true si un état a changé.
 */
export async function completeFulfillmentForPurchase(
  db: D1Database,
  input: { purchaseId: string; reference?: string | null; now?: number }
): Promise<boolean> {
  const now = input.now ?? Date.now();
  const purchase = await db
    .prepare("SELECT id, status FROM purchases WHERE id = ?")
    .bind(input.purchaseId)
    .first<{ id: string; status: string }>();
  if (!purchase) return false;

  const fulfillment = await getFulfillmentByPurchase(db, input.purchaseId);
  const statements: D1PreparedStatement[] = [];

  if (fulfillment && fulfillment.status !== "completed") {
    statements.push(
      completeFulfillmentStatement(db, fulfillment, {
        providerReference: input.reference ?? null,
        countAttempt: false,
        now,
      })
    );
  }
  if (!["fulfilled", "refunded", "cancelled"].includes(purchase.status)) {
    statements.push(markPurchaseFulfilledStatement(db, input.purchaseId, now));
  }
  if (!statements.length) return false;

  await db.batch(statements);
  return true;
}
