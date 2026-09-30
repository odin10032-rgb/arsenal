/**
 * Arsenal — Licences des produits vendus en A (Phase 2.6, vente autonome).
 * Contrat : docs/chantier/07-contrat-paiement-a.md.
 *
 * Une licence est une CLÉ (`ARN-XXXX-XXXX-XXXX-XXXX`) rattachée à un achat
 * (`purchase_id` UNIQUE → idempotence : rejouer une livraison ne crée jamais de
 * seconde clé). Elle est activable par appareil (`license_activations`,
 * UNIQUE(license_id, device_id)) dans la limite de `max_activations`.
 *
 * Modèle de menace : la clé EST le secret (elle se vérifie sans session, depuis
 * une app ou un CLI). Les réponses de `verifyLicense` ne contiennent donc QUE le
 * strict nécessaire : aucune donnée utilisateur (ni email, ni id, ni achat).
 *
 * Style store.ts : fonctions pures recevant D1Database en paramètre.
 */

import { changesOf } from "./commissions";

/* -------------------------------- Constantes -------------------------------- */

export type LicenseStatus = "active" | "revoked";
export const LICENSE_STATUSES: readonly LicenseStatus[] = ["active", "revoked"];

/** Nombre maximal d'appareils activables par défaut (contrat). */
export const LICENSE_DEFAULT_MAX_ACTIVATIONS = 3;

/** Préfixe des clés Arsenal. */
export const LICENSE_KEY_PREFIX = "ARN";

/**
 * Alphabet SANS caractères ambigus (recopiés de travers à la main) : 0 et 1
 * (confondus avec O et I), ainsi que I et O, sont exclus — 32 symboles, ce qui
 * rend la sélection par modulo 256 parfaitement uniforme (256 = 8 × 32).
 */
const LICENSE_KEY_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const LICENSE_KEY_BLOCKS = 4;
const LICENSE_KEY_BLOCK_LENGTH = 4;

/** Borne du `deviceId` accepté (empreinte d'appareil côté client). */
export const MAX_DEVICE_ID_LENGTH = 128;

/** Motifs de refus exposés (jamais d'autre détail). */
export type LicenseVerificationReason = "unknown" | "revoked" | "limit_reached";

/* ---------------------------------- Types ---------------------------------- */

export interface LicenseRow {
  id: string;
  user_id: string;
  product_id: string;
  purchase_id: string;
  license_key: string;
  status: string;
  max_activations: number;
  activations_count: number;
  created_at: number;
  revoked_at: number | null;
}

/** Licence + titre du produit (réponses utilisateur). */
export interface LicenseJoinRow extends LicenseRow {
  product_title: string | null;
}

/** Licence + utilisateur + produit (réponses admin). */
export interface AdminLicenseRow extends LicenseJoinRow {
  user_pseudo: string | null;
  user_email: string | null;
  last_activation_at: number | null;
}

/** Résultat de `POST /api/licenses/verify` (aucune donnée sensible). */
export interface LicenseVerification {
  valid: boolean;
  reason?: LicenseVerificationReason;
  activationsRemaining?: number;
  /** Titre du produit — renvoyé UNIQUEMENT quand la clé est valide. */
  productTitle?: string;
}

/* ------------------------------ Clés de licence ------------------------------ */

/**
 * Clé `ARN-XXXX-XXXX-XXXX-XXXX` (16 symboles, ~10^24 combinaisons) tirée de
 * `crypto.getRandomValues`. Le format est stable : les clients (apps, CLI)
 * peuvent le valider côté leur propre interface.
 */
export function generateLicenseKey(): string {
  const bytes = new Uint8Array(LICENSE_KEY_BLOCKS * LICENSE_KEY_BLOCK_LENGTH);
  crypto.getRandomValues(bytes);
  const blocks: string[] = [];
  for (let b = 0; b < LICENSE_KEY_BLOCKS; b++) {
    let block = "";
    for (let i = 0; i < LICENSE_KEY_BLOCK_LENGTH; i++) {
      block += LICENSE_KEY_ALPHABET[bytes[b * LICENSE_KEY_BLOCK_LENGTH + i] % LICENSE_KEY_ALPHABET.length];
    }
    blocks.push(block);
  }
  return `${LICENSE_KEY_PREFIX}-${blocks.join("-")}`;
}

/** Clé normalisée pour la recherche (majuscules, sans espaces) ; jamais vide. */
export function normalizeLicenseKey(raw: unknown): string {
  const value = typeof raw === "string" ? raw.trim().toUpperCase().replace(/\s+/g, "") : "";
  return value.length <= 80 ? value : "";
}

/** `true` si la clé a la forme `ARN-XXXX-XXXX-XXXX-XXXX` (contrôle de forme seul). */
export function looksLikeLicenseKey(value: string): boolean {
  return /^ARN-[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]{4}$/.test(
    value
  );
}

/* ---------------------------- Génération (livraison) ---------------------------- */

/**
 * INSERT de la licence d'un achat — à exécuter dans le MÊME `db.batch` que la
 * complétion du fulfillment (la livraison et sa licence sont atomiques).
 *
 * IDEMPOTENT par construction : `INSERT OR IGNORE` + `licenses.purchase_id`
 * UNIQUE — rejouer la livraison (retry, webhook, double clic admin) ne crée
 * jamais de seconde clé. Aucune licence n'est créée si le produit n'a pas
 * `delivery_kind = 'license'` (WHERE EXISTS sur `products`).
 */
export function licenseStatementForPurchase(
  db: D1Database,
  input: {
    purchaseId: string;
    userId: string;
    productId: string;
    now?: number;
    /** Plafond d'appareils (défaut du contrat : 3). */
    maxActivations?: number;
  }
): D1PreparedStatement {
  const now = input.now ?? Date.now();
  const maxActivations = Math.max(1, Math.trunc(Number(input.maxActivations ?? LICENSE_DEFAULT_MAX_ACTIVATIONS) || LICENSE_DEFAULT_MAX_ACTIVATIONS));
  return db
    .prepare(
      `INSERT OR IGNORE INTO licenses
         (id, user_id, product_id, purchase_id, license_key, status, max_activations,
          activations_count, created_at, revoked_at)
       SELECT ?, ?, ?, ?, ?, 'active', ?, 0, ?, NULL
        WHERE EXISTS (SELECT 1 FROM products WHERE id = ? AND delivery_kind = 'license')`
    )
    .bind(
      crypto.randomUUID(),
      input.userId,
      input.productId,
      input.purchaseId,
      generateLicenseKey(),
      maxActivations,
      now,
      input.productId
    );
}

/** Révoque une licence — idempotent (jamais deux fois le même `revoked_at`). */
export function revokeLicenseStatement(
  db: D1Database,
  licenseId: string,
  now: number = Date.now()
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE licenses SET status = 'revoked', revoked_at = COALESCE(revoked_at, ?)
        WHERE id = ? AND status != 'revoked'`
    )
    .bind(now, licenseId);
}

/* --------------------------------- Lecture --------------------------------- */

const LICENSE_JOIN_COLUMNS = `
  l.id, l.user_id, l.product_id, l.purchase_id, l.license_key, l.status,
  l.max_activations, l.activations_count, l.created_at, l.revoked_at,
  p.title AS product_title
`;

const LICENSE_JOIN_FROM = `
  FROM licenses l LEFT JOIN products p ON p.id = l.product_id
`;

export async function getLicenseById(db: D1Database, id: string): Promise<LicenseRow | null> {
  const row = await db.prepare("SELECT * FROM licenses WHERE id = ?").bind(id).first<LicenseRow>();
  return row ?? null;
}

/** « Mes licences » : celles de l'utilisateur de la session, plus récentes d'abord. */
export async function listUserLicenses(db: D1Database, userId: string): Promise<LicenseJoinRow[]> {
  const { results = [] } = await db
    .prepare(
      `SELECT ${LICENSE_JOIN_COLUMNS} ${LICENSE_JOIN_FROM}
        WHERE l.user_id = ?
        ORDER BY l.created_at DESC, l.id DESC`
    )
    .bind(userId)
    .all<LicenseJoinRow>();
  return results || [];
}

/** Liste admin (filtres statut et/ou produit, plafonnée) — utilisateur + produit. */
export async function listLicensesAdmin(
  db: D1Database,
  filters: { status?: string | null; productId?: string | null; limit?: number } = {}
): Promise<AdminLicenseRow[]> {
  const limit = Math.min(Math.max(Math.trunc(filters.limit ?? 100) || 100, 1), 500);
  const conditions: string[] = [];
  const binds: unknown[] = [];
  if (filters.status) {
    conditions.push("l.status = ?");
    binds.push(filters.status);
  }
  if (filters.productId) {
    conditions.push("l.product_id = ?");
    binds.push(filters.productId);
  }
  const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
  const { results = [] } = await db
    .prepare(
      `SELECT ${LICENSE_JOIN_COLUMNS},
              u.pseudo AS user_pseudo, u.email AS user_email,
              (SELECT MAX(a.last_seen_at) FROM license_activations a WHERE a.license_id = l.id)
                AS last_activation_at
         ${LICENSE_JOIN_FROM}
         LEFT JOIN users u ON u.id = l.user_id
         ${where}
        ORDER BY l.created_at DESC, l.id DESC
        LIMIT ?`
    )
    .bind(...binds, limit)
    .all<AdminLicenseRow>();
  return results || [];
}

/* ----------------------------- Vérification publique ----------------------------- */

/**
 * Vérifie (et active) une clé pour un appareil donné — SANS session.
 *
 * Règles (contrat) :
 * - clé inconnue → `unknown` ;
 * - licence révoquée (tout statut ≠ `active`) → `revoked` ;
 * - appareil DÉJÀ activé → succès, simple rafraîchissement de `last_seen_at`
 *   (aucune place consommée) ;
 * - nouvel appareil au-delà de `max_activations` → `limit_reached` ;
 * - sinon : activation (`INSERT OR IGNORE` conditionné au plafond DANS le SQL —
 *   deux appareils concurrents ne peuvent pas le dépasser), puis succès.
 *
 * La réponse ne contient JAMAIS d'email, d'identifiant utilisateur ni d'achat.
 */
export async function verifyLicense(
  db: D1Database,
  input: { licenseKey: string; deviceId: string; now?: number }
): Promise<LicenseVerification> {
  const key = normalizeLicenseKey(input.licenseKey);
  const deviceId = typeof input.deviceId === "string" ? input.deviceId.trim().slice(0, MAX_DEVICE_ID_LENGTH) : "";
  const now = input.now ?? Date.now();
  // Une clé hors format ne peut exister : réponse immédiate, sans requête D1
  // (le format est aussi une barrière anti-énumération inutile).
  if (!key || !deviceId || !looksLikeLicenseKey(key)) return { valid: false, reason: "unknown" };

  const license = await db
    .prepare(
      `SELECT l.id, l.status, l.max_activations, l.activations_count,
              p.title AS product_title
         FROM licenses l LEFT JOIN products p ON p.id = l.product_id
        WHERE l.license_key = ?`
    )
    .bind(key)
    .first<{
      id: string;
      status: string;
      max_activations: number;
      activations_count: number;
      product_title: string | null;
    }>();
  if (!license) return { valid: false, reason: "unknown" };
  if (license.status !== "active") return { valid: false, reason: "revoked" };

  const max = Math.max(0, Math.trunc(Number(license.max_activations) || 0));
  const productTitle = license.product_title || undefined;

  const existing = await db
    .prepare("SELECT id FROM license_activations WHERE license_id = ? AND device_id = ?")
    .bind(license.id, deviceId)
    .first<{ id: string }>();
  if (existing) {
    await db
      .prepare("UPDATE license_activations SET last_seen_at = ? WHERE id = ?")
      .bind(now, existing.id)
      .run();
    return {
      valid: true,
      activationsRemaining: Math.max(0, max - Math.trunc(Number(license.activations_count) || 0)),
      productTitle,
    };
  }

  const [inserted] = await db.batch([
    // Activation conditionnée au plafond DANS le SQL : la place est vérifiée et
    // consommée atomiquement (jamais de 4e appareil sur un plafond de 3).
    db
      .prepare(
        `INSERT OR IGNORE INTO license_activations
           (id, license_id, device_id, created_at, last_seen_at)
         SELECT ?, ?, ?, ?, ?
          WHERE (SELECT activations_count FROM licenses WHERE id = ?)
              < (SELECT max_activations FROM licenses WHERE id = ?)`
      )
      .bind(crypto.randomUUID(), license.id, deviceId, now, now, license.id, license.id),
    // `activations_count` est RECALCULÉ depuis la table (jamais incrémenté à
    // l'aveugle) : une valeur dérivée ne peut pas dériver.
    db
      .prepare(
        "UPDATE licenses SET activations_count = (SELECT COUNT(*) FROM license_activations WHERE license_id = ?) WHERE id = ?"
      )
      .bind(license.id, license.id),
  ]);

  if (changesOf(inserted) === 0) {
    // Soit le plafond est atteint, soit un appareil identique vient d'être
    // activé en parallèle (INSERT OR IGNORE) — on tranche par une relecture.
    const raced = await db
      .prepare("SELECT id FROM license_activations WHERE license_id = ? AND device_id = ?")
      .bind(license.id, deviceId)
      .first<{ id: string }>();
    if (!raced) return { valid: false, reason: "limit_reached" };
  }

  const refreshed = await db
    .prepare("SELECT activations_count FROM licenses WHERE id = ?")
    .bind(license.id)
    .first<{ activations_count: number }>();
  return {
    valid: true,
    activationsRemaining: Math.max(0, max - Math.trunc(Number(refreshed?.activations_count ?? 0))),
    productTitle,
  };
}

/* ------------------------------- Sérialisation ------------------------------- */

/** Licence au format utilisateur (`GET /api/me/licenses`). */
export function licenseToJson(row: LicenseJoinRow) {
  return {
    id: row.id,
    productId: row.product_id,
    licenseKey: row.license_key,
    status: row.status,
    activationsCount: Math.trunc(Number(row.activations_count) || 0),
    maxActivations: Math.trunc(Number(row.max_activations) || 0),
    createdAt: Number(row.created_at),
    revokedAt: row.revoked_at != null ? Number(row.revoked_at) : null,
    product: { id: row.product_id, title: row.product_title ?? "" },
  };
}

/** Licence au format admin (utilisateur + produit + activations). */
export function licenseToAdminJson(row: AdminLicenseRow) {
  return {
    id: row.id,
    userId: row.user_id,
    pseudo: row.user_pseudo ?? null,
    email: row.user_email ?? null,
    productId: row.product_id,
    productTitle: row.product_title ?? null,
    purchaseId: row.purchase_id,
    licenseKey: row.license_key,
    status: row.status,
    activationsCount: Math.trunc(Number(row.activations_count) || 0),
    maxActivations: Math.trunc(Number(row.max_activations) || 0),
    createdAt: Number(row.created_at),
    revokedAt: row.revoked_at != null ? Number(row.revoked_at) : null,
    lastActivationAt:
      row.last_activation_at != null ? Number(row.last_activation_at) : null,
  };
}

/** Statut de licence valide (liste admin : `?status=`). */
export function isLicenseStatus(value: unknown): value is LicenseStatus {
  return typeof value === "string" && (LICENSE_STATUSES as readonly string[]).includes(value);
}
