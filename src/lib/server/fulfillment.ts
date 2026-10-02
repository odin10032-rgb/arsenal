/**
 * Arsenal — Fulfillment des achats en A (Phase 2.6).
 * Contrat FIGÉ : docs/chantier/07-contrat-paiement-a.md (§ Fulfillment).
 *
 * Un fulfillment = UNE ligne `fulfillments` par purchase. États :
 * `pending` → `processing` → `completed` | `failed`.
 *
 * Garde de 5 tentatives (FULFILLMENT_MAX_ATTEMPTS) : au-delà, plus aucune
 * relance automatique (ni utilisateur, ni admin). Les erreurs de CONFIGURATION
 * (clé API absente, `chariow_product_id` manquant, `chariow_discount_code`
 * manquant pour la méthode « code promo », email introuvable) échouent
 * immédiatement SANS consommer de tentative — contractuellement « aucune
 * tentative réseau ».
 *
 * Résultats (audit du module « Paiement en A + Fulfillment ») :
 * - `step: completed` → succès ;
 * - `step: already_purchased` → SUCCÈS aussi (l'accès existe déjà côté Chariow
 *   pour cet email : l'acheteur a le produit) — constat C3 ;
 * - issue incertaine (délai dépassé, réseau, 5xx) → tentative comptée, message
 *   conservé, fulfillment remis `pending` : la commande reste relançable, elle
 *   n'est JAMAIS marquée `failed` sur un résultat incertain — constat C3 ;
 * - `step: payment` (produit Chariow payant) et erreurs HTTP définitives
 *   (4xx) → `failed` avec message explicite, les A restent débités.
 *
 * Les A ne sont JAMAIS perdus : un échec laisse la purchase
 * `fulfillment_pending` (relançable via retry, remboursable par l'admin) — et
 * surtout jamais `failed`, sinon l'index unique partiel autoriserait un second
 * achat du même produit (double débit).
 *
 * Style store.ts : fonctions pures recevant D1Database en paramètre.
 */

import { createChariowCheckout, readChariowApiKey } from "./chariow-checkout";
import { getSetting } from "./store";
import { licenseStatementsIfApplicable } from "./delivery-license";
import type { PurchaseRow } from "./purchases";

/* -------------------------------- Constantes -------------------------------- */

/** Nombre maximal de tentatives automatiques (contrat : « limite : 5 tentatives »). */
export const FULFILLMENT_MAX_ATTEMPTS = 5;

export type FulfillmentMethod = "manual" | "chariow_free_checkout" | "chariow_discount_checkout";
export const FULFILLMENT_METHODS: readonly FulfillmentMethod[] = [
  "manual",
  "chariow_free_checkout",
  "chariow_discount_checkout",
];
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

/**
 * Message d'un résultat INCERTAIN (délai dépassé / réseau / 5xx) : l'accès a
 * peut-être été accordé côté Chariow, la commande reste relançable.
 */
export const UNCERTAIN_FULFILLMENT_MESSAGE =
  "Délai dépassé côté Chariow — l'accès a peut-être été accordé : relancez la livraison ou vérifiez le portail Chariow.";

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
  chariow_discount_code: string | null;
  fulfillment_method: string | null;
  /** Nature de la livraison Arsenal : `file` (fichier hébergé) ou `license`. */
  delivery_kind: string | null;
}

/** Résultat d'une tentative (ou d'un constat) de fulfillment. */
export interface FulfillmentOutcome {
  /** true si un appel fournisseur a réellement été tenté. */
  attempted: boolean;
  /** true si la garde de 5 tentatives a bloqué la tentative. */
  exhausted: boolean;
  /**
   * true si l'issue est INCERTAINE (délai dépassé/réseau/5xx) : la tentative est
   * comptée, l'erreur conservée, mais la commande reste `pending`/relançable —
   * jamais marquée `failed` définitivement.
   */
  uncertain?: boolean;
  /** État du fulfillment après l'opération. */
  status: FulfillmentStatus;
  provider: string;
  /** État de la purchase après l'opération (`fulfilled` uniquement en cas de succès). */
  purchaseStatus: string;
  error: string | null;
}

/* ------------------------------- Normalisation ------------------------------- */

/**
 * `manual` | `chariow_free_checkout` | `chariow_discount_checkout` — toute
 * valeur inconnue retombe sur `manual` (jamais de méthode devinée).
 */
export function normalizeFulfillmentMethod(raw: unknown): FulfillmentMethod {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (value === "chariow_free_checkout") return "chariow_free_checkout";
  if (value === "chariow_discount_checkout") return "chariow_discount_checkout";
  return "manual";
}

/** Méthodes livrées par Chariow (checkout API) — les autres sont manuelles. */
export function isChariowFulfillmentMethod(method: unknown): boolean {
  const normalized = normalizeFulfillmentMethod(method);
  return normalized === "chariow_free_checkout" || normalized === "chariow_discount_checkout";
}

/** Fournisseur posé sur la ligne `fulfillments` selon la méthode produit. */
export function fulfillmentProviderForMethod(method: string): FulfillmentProvider {
  return isChariowFulfillmentMethod(method) ? "chariow" : "manual";
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
    .prepare(
      `SELECT id, title, chariow_product_id, chariow_discount_code, fulfillment_method,
              delivery_kind
         FROM products WHERE id = ?`
    )
    .bind(productId)
    .first<FulfillmentProductRow>();
  return row ?? null;
}

/**
 * Identité transmise au prestataire : email (porte l'accès) et pseudo (Arsenal
 * ne collecte ni nom ni prénom — le pseudo sert de prénom côté Chariow, qui
 * exige `first_name`/`last_name`, et un libellé neutre complète le nom).
 */
async function readUserIdentity(
  db: D1Database,
  userId: string
): Promise<{ email: string; pseudo: string }> {
  const row = await db
    .prepare("SELECT email, pseudo FROM users WHERE id = ?")
    .bind(userId)
    .first<{ email: string; pseudo: string }>();
  return { email: (row?.email ?? "").trim(), pseudo: (row?.pseudo ?? "").trim() };
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

/**
 * INSERT d'un fulfillment `pending` prêt pour un db.batch (idempotent par `id`).
 * `requiresDebitKey` : clé d'idempotence du débit d'achat — la ligne de
 * livraison n'est alors créée QUE si ce débit existe (achat payé), pour que le
 * batch d'achat reste annulable sans second aller-retour (constat C1 de l'audit).
 */
export function createFulfillmentStatement(
  db: D1Database,
  input: {
    purchaseId: string;
    provider: string;
    now?: number;
    id?: string;
    requiresDebitKey?: string | null;
  }
): D1PreparedStatement {
  const now = input.now ?? Date.now();
  const id = input.id ?? crypto.randomUUID();
  if (input.requiresDebitKey) {
    return db
      .prepare(
        `INSERT INTO fulfillments
           (id, purchase_id, provider, status, provider_reference, attempts, last_error, created_at, completed_at)
         SELECT ?, ?, ?, 'pending', NULL, 0, NULL, ?, NULL
          WHERE EXISTS (SELECT 1 FROM a_transactions WHERE idempotency_key = ?)`
      )
      .bind(id, input.purchaseId, input.provider, now, input.requiresDebitKey);
  }
  return db
    .prepare(
      `INSERT INTO fulfillments
         (id, purchase_id, provider, status, provider_reference, attempts, last_error, created_at, completed_at)
       VALUES (?, ?, ?, 'pending', NULL, 0, NULL, ?, NULL)`
    )
    .bind(id, input.purchaseId, input.provider, now);
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

/**
 * Résultat INCERTAIN (délai dépassé, réseau, 5xx) : l'appel a peut-être abouti
 * côté Chariow. La relance est donc laissée possible — l'état passe à
 * `pending` (jamais `failed`), la tentative est comptée et le message conservé
 * (constat C3 de l'audit : ne jamais conclure à un échec définitif sur un
 * résultat incertain).
 */
export function failUncertainFulfillmentStatement(
  db: D1Database,
  fulfillment: Pick<FulfillmentRow, "id">,
  opts: { provider?: string | null; error: string; now?: number }
): D1PreparedStatement {
  const error = (opts.error || UNCERTAIN_FULFILLMENT_MESSAGE).slice(0, MAX_ERROR_LENGTH);
  return db
    .prepare(
      `UPDATE fulfillments
          SET status = 'pending',
              provider = COALESCE(?, provider),
              last_error = ?,
              attempts = attempts + 1
        WHERE id = ? AND status != 'completed'`
    )
    .bind(opts.provider ?? null, error, fulfillment.id);
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
 * - `manual` : rien d'automatique SAUF la livraison AUTONOME (`delivery_kind`
 *   `file` ou `license`), complétée immédiatement à l'achat sans confirmation
 *   humaine ni tentative réseau ; sinon la ligne reste `pending`, l'admin livre
 *   puis marque la commande (`POST /api/admin/purchases/:id/fulfill`) ;
 * - `chariow_free_checkout` : appel `POST /v1/checkout` sur un produit Chariow
 *   DUPLIQUÉ en modèle « Gratuit » (`chariow_product_id`) ;
 * - `chariow_discount_checkout` (méthode recommandée) : appel `POST /v1/checkout`
 *   sur le produit d'ORIGINE payant, rendu gratuit par le code promo Arsenal
 *   (`discount_code` officiel, `products.chariow_discount_code`).
 *
 * Pour les deux méthodes Chariow : `step: completed` ou `already_purchased` →
 * fulfillment `completed` + purchase `fulfilled` (l'accès existe) ;
 * issue incertaine (délai dépassé, réseau, 5xx) → tentative comptée, message
 * conservé, fulfillment remis `pending` (RELANÇABLE, jamais `failed`) ;
 * `step: payment` et erreurs HTTP définitives → échec motivé (`failed`).
 *
 * Gardes de CONFIGURATION (aucun appel réseau émis, tentative non comptée) :
 * clé API absente · `chariow_product_id` manquant · `chariow_discount_code`
 * manquant pour la méthode « code promo » · email de l'acheteur introuvable.
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

  /** Succès : livraison effective → fulfillment `completed`, purchase `fulfilled`.
   *  Si le produit est `delivery_kind = 'license'`, la clé est générée dans le
   *  même lot (idempotent : rejouer ne crée pas de seconde clé). */
  const succeed = async (reference: string | null): Promise<FulfillmentOutcome> => {
    const licenseStatements = await licenseStatementsIfApplicable(db, {
      purchaseId: purchase.id,
      userId: purchase.user_id,
      productId: purchase.product_id,
    });
    await db.batch([
      completeFulfillmentStatement(db, fulfillment, {
        provider,
        providerReference: reference,
        countAttempt: true,
        now,
      }),
      markPurchaseFulfilledStatement(db, purchase.id, now),
      ...licenseStatements,
    ]);
    return {
      attempted: true,
      exhausted: false,
      status: "completed",
      provider,
      purchaseStatus: "fulfilled",
      error: null,
    };
  };

  // Livraison AUTONOME (fichier hébergé par Arsenal, ou clé de licence générée
  // par Arsenal) : la livraison est effective dès l'achat — aucune confirmation
  // humaine, aucune tentative réseau. La clé de licence éventuelle est générée
  // dans `succeed()` (même lot idempotent).
  if (method === "manual" && (product?.delivery_kind === "file" || product?.delivery_kind === "license")) {
    return succeed(null);
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

  // Les DEUX méthodes Chariow passent par `POST /v1/checkout` : `product_id` est
  // un champ obligatoire du CheckoutRequest — sans lui, échec de configuration
  // immédiat (aucun appel réseau, tentative non comptée).
  const chariowProductId = (product?.chariow_product_id ?? "").trim();
  if (!chariowProductId) {
    return configFailure("Produit Chariow non configuré (chariow_product_id manquant).");
  }

  // Méthode « code promo » : le code est la clé de la gratuité du produit
  // d'origine — sans lui, l'appel aboutirait à un `step: payment` (le client
  // serait invité à payer). Échec de configuration explicite, sans réseau.
  const chariowDiscountCode = (product?.chariow_discount_code ?? "").trim();
  if (method === "chariow_discount_checkout" && !chariowDiscountCode) {
    return configFailure(
      "Code promo Chariow non configuré (chariow_discount_code manquant)."
    );
  }

  const { email, pseudo } = await readUserIdentity(db, purchase.user_id);
  if (!email) return configFailure("Email de l'acheteur introuvable.");

  // Téléphone exigé par l'API Chariow : réglages `chariow_default_phone` /
  // `chariow_default_phone_country` (code ISO 2 lettres, ex. « CI »). Le champ
  // est une contrainte du prestataire de livraison, pas une donnée Arsenal.
  const [phoneSetting, phoneCountrySetting, lastNameSetting] = await Promise.all([
    getSetting(db, "chariow_default_phone"),
    getSetting(db, "chariow_default_phone_country"),
    getSetting(db, "chariow_default_last_name"),
  ]);

  const result = await createChariowCheckout({
    apiKey,
    productId: chariowProductId,
    // `discount_code` (champ officiel du CheckoutRequest) : envoyé uniquement par
    // la méthode « code promo » — le produit d'origine reste payant pour le
    // public, seul ce code ouvre l'accès gratuit aux achats réglés en A.
    discountCode: method === "chariow_discount_checkout" ? chariowDiscountCode : null,
    email,
    // `first_name`/`last_name` sont exigés par Chariow : le pseudo fait office
    // de prénom, le nom reste neutre (Arsenal ne collecte pas l'état civil).
    firstName: pseudo || "Membre",
    lastName: lastNameSetting || "Arsenal",
    phoneNumber: phoneSetting,
    phoneCountry: phoneCountrySetting,
    arsenalPurchase: purchase.id,
    arsenalUser: purchase.user_id,
  });

  if (result.status === "completed") {
    return succeed(result.purchaseId ?? result.transactionId ?? null);
  }

  // `already_purchased` = l'accès existe DÉJÀ côté Chariow pour cet email :
  // l'acheteur a bien le produit, ce n'est PAS un échec (constat C3 de l'audit).
  // Aucune référence fournisseur dans ce cas (rien n'a été créé par l'appel).
  if (result.status === "already_purchased") return succeed(null);

  // Issue INCERTAINE (aucune réponse HTTP exploitable : délai dépassé, réseau ou
  // 5xx) : l'appel a peut-être abouti. On compte la tentative et on conserve le
  // message, mais la commande reste relançable — jamais `failed` définitivement.
  if (result.status === "error" && (result.httpStatus === null || result.httpStatus >= 500)) {
    const error = `${UNCERTAIN_FULFILLMENT_MESSAGE} (${result.error})`;
    await failUncertainFulfillmentStatement(db, fulfillment, { provider, error, now }).run();
    return {
      attempted: true,
      exhausted: false,
      uncertain: true,
      status: "pending",
      provider,
      purchaseStatus: purchase.status,
      error,
    };
  }

  // `step: payment` = Chariow a calculé un reste à payer : soit le produit n'est
  // pas en modèle « Gratuit » (méthode chariow_free_checkout), soit le code promo
  // n'a pas rendu la commande gratuite (inexistant, expiré, plafonné, ou valeur
  // < prix du produit — méthode chariow_discount_checkout). Les A restent
  // débités, la commande est relançable/remboursable par l'admin.
  const paymentMessage =
    method === "chariow_discount_checkout"
      ? "Le code promo Chariow n'a pas rendu la commande gratuite (step « payment ») : vérifiez qu'il existe, qu'il cible ce produit, qu'il est actif et qu'il vaut 100 % ou le montant exact du prix."
      : "Le produit Chariow n'est pas en modèle de tarification « Gratuit » (step « payment »).";
  const error = result.status === "payment" ? paymentMessage : result.error;

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
