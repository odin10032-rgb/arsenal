/**
 * Arsenal — Comptes utilisateurs & sessions (Phase 1).
 * Contrat : docs/chantier/02-contrat-api-phase1.md
 *
 * - Mots de passe : PBKDF2-SHA-256 via WebCrypto (aucune dépendance) —
 *   100 000 itérations, salt 16 o aléatoire, 32 o dérivés, format stocké
 *   `pbkdf2$100000$<saltB64>$<hashB64>`.
 * - Sessions : token opaque = 32 o aléatoires (base64url) remis au client ;
 *   SEUL sha256(token) est stocké en base (PK). TTL 30 j, renouvellement
 *   glissant (restant < 15 j à l'accès → repoussé à 30 j), révocables.
 * - Style store.ts : fonctions pures recevant D1Database en paramètre.
 *   sha256hex / timingSafeEqualStr sont réutilisés de auth.ts (admin).
 */
import { sha256hex, timingSafeEqualStr } from "./auth";

/* ----------------------------- Constantes ----------------------------- */

export const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_SALT_BYTES = 16;
const PBKDF2_HASH_BITS = 256;

/** Durée de vie d'une session : 30 jours. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Renouvellement glissant : sous 15 jours restants, la session repart à 30 j. */
export const SESSION_RENEW_THRESHOLD_MS = SESSION_TTL_MS / 2;

/* -------------------------------- Types -------------------------------- */

export interface UserRow {
  id: string;
  pseudo: string;
  email: string;
  password_hash: string;
  role: string;
  /**
   * Adhésion au programme (migration 0008) : `none` (simple utilisateur) ou
   * `member`. C'est l'adhésion — et non le rôle — qui ouvre la monnaie A, le
   * portefeuille et les récompenses (décision propriétaire du 03/10/2026).
   */
  membership?: string | null;
  created_at: number;
  updated_at: number;
}

export interface SessionRow {
  token_hash: string;
  user_id: string;
  created_at: number;
  expires_at: number;
  last_used_at: number;
  revoked_at: number | null;
}

/** Variables Hono posées par le middleware requireAuth (worker/routes/me.ts). */
export interface AuthContext {
  user: UserRow;
  session: SessionRow;
}

/** Objet `user` du contrat (définition unique, partagée avec le front). */
export interface PublicUser {
  id: string;
  pseudo: string;
  email: string;
  role: string; // "user" | "affiliate" | "super_affiliate" | "admin"
  /** Adhésion au programme : ouvre la monnaie A et le portefeuille. */
  membership: Membership;
  balanceA: number;
  createdAt: number;
}

/* ------------------------------- Adhésion ------------------------------- */

export type Membership = "none" | "member";

export const MEMBERSHIPS: readonly Membership[] = ["none", "member"];

/** Normalisation défensive : toute valeur inconnue retombe sur « none ». */
export function normalizeMembership(raw: unknown): Membership {
  return raw === "member" ? "member" : "none";
}

/** L'utilisateur a-t-il accès à la monnaie A ? (adhésion, jamais le rôle). */
export function isMember(user: { membership?: string | null }): boolean {
  return normalizeMembership(user.membership) === "member";
}

export type SecurityEventAction =
  | "register"
  | "user_login_ok"
  | "user_login_fail"
  | "logout"
  /** Phase 2 : mutations administrateur (`admin_affiliate_status`, `admin_sale_create`, …). */
  | `admin_${string}`
  /** Phase 2.6 : téléchargement d'un fichier produit (traçabilité). */
  | "purchase_download"
  /** Phase 2.6 : un affilié a tenté d'acheter avec son propre code. */
  | "self_affiliation_blocked"
  /** Phase 3 : demande de promotion Super Affiliate. */
  | "super_upgrade_request";

export interface SecurityEventInput {
  /** user_id, "admin" ou null. */
  actor?: string | null;
  action: SecurityEventAction;
  /** sha256 de l'IP — jamais l'IP brute. */
  ipHash?: string | null;
  meta?: Record<string, unknown> | null;
}

/* ---------------------- Mots de passe (PBKDF2 WebCrypto) ---------------------- */

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** Uint8Array<ArrayBuffer> (et non ArrayBufferLike) : requis par WebCrypto BufferSource. */
function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex;
}

async function deriveBits(
  password: string,
  salt: BufferSource,
  iterations: number
): Promise<Uint8Array> {
  const keyMaterial = new TextEncoder().encode(password);
  const key = await crypto.subtle.importKey("raw", keyMaterial, "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    PBKDF2_HASH_BITS
  );
  return new Uint8Array(bits);
}

/** Hash au format contrat `pbkdf2$100000$<saltB64>$<hashB64>` (salt 16 o aléatoire). */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES));
  const hash = await deriveBits(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

/**
 * Vérification timing-safe : re-dérivation PBKDF2 puis comparaison des hex
 * à temps constant (timingSafeEqualStr de auth.ts).
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  if (!Number.isSafeInteger(iterations) || iterations < 1) return false;
  let expectedHex: string;
  let salt: Uint8Array<ArrayBuffer>;
  try {
    salt = fromBase64(parts[2]);
    expectedHex = toHex(fromBase64(parts[3]));
  } catch {
    return false; // hash stocké malformé
  }
  const derived = await deriveBits(password, salt, iterations);
  return timingSafeEqualStr(toHex(derived), expectedHex);
}

/* ------------------------- Sessions (token opaque) ------------------------- */

function toBase64Url(b64: string): string {
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Token de session opaque : 32 o aléatoires (crypto.getRandomValues) en base64url. */
export function generateSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return toBase64Url(toBase64(bytes));
}

/**
 * INSERT de session prêt pour un db.batch — seul sha256(token) est stocké.
 * (Le token en clair n'est jamais persisté.)
 */
export function sessionStatement(db: D1Database, userId: string, token: string): D1PreparedStatement {
  const now = Date.now();
  return db
    .prepare(
      "INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_used_at) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(sha256hex(token), userId, now, now + SESSION_TTL_MS, now);
}

/** Création autonome de session (hors batch). */
export async function createSession(
  db: D1Database,
  userId: string
): Promise<{ token: string; expiresAt: number }> {
  const token = generateSessionToken();
  const expiresAt = Date.now() + SESSION_TTL_MS;
  await sessionStatement(db, userId, token).run();
  return { token, expiresAt };
}

/**
 * Résout un token Bearer : lookup sessions par sha256(token), vérifie
 * non révoquée + non expirée, charge le user, puis applique le
 * renouvellement glissant (< 15 j restants → expires_at = now + 30 j)
 * et rafraîchit last_used_at. Retourne null si la session est invalide.
 */
export async function getAuthContext(db: D1Database, token: string): Promise<AuthContext | null> {
  const tokenHash = sha256hex(token);
  const now = Date.now();

  const session = await db
    .prepare("SELECT * FROM sessions WHERE token_hash = ?")
    .bind(tokenHash)
    .first<SessionRow>();
  if (!session || session.revoked_at != null || Number(session.expires_at) <= now) return null;

  const user = await db
    .prepare("SELECT * FROM users WHERE id = ?")
    .bind(session.user_id)
    .first<UserRow>();
  if (!user) return null;

  const expiresAt = Number(session.expires_at);
  const newExpiresAt =
    expiresAt - now < SESSION_RENEW_THRESHOLD_MS ? now + SESSION_TTL_MS : expiresAt;
  await db
    .prepare("UPDATE sessions SET expires_at = ?, last_used_at = ? WHERE token_hash = ?")
    .bind(newExpiresAt, now, tokenHash)
    .run();

  return { user, session: { ...session, expires_at: newExpiresAt, last_used_at: now } };
}

/**
 * Révoque la session liée au token (idempotent). Retourne l'user_id de la
 * session révoquée, ou null si elle était déjà invalide/inconnue.
 */
export async function revokeSession(db: D1Database, token: string): Promise<string | null> {
  const tokenHash = sha256hex(token);
  const active = await db
    .prepare("SELECT user_id FROM sessions WHERE token_hash = ? AND revoked_at IS NULL")
    .bind(tokenHash)
    .first<{ user_id: string }>();
  if (!active) return null;
  await db
    .prepare("UPDATE sessions SET revoked_at = ? WHERE token_hash = ?")
    .bind(Date.now(), tokenHash)
    .run();
  return active.user_id;
}

/* ------------------------------ Utilisateurs ------------------------------ */

export interface NewUserRecord {
  id: string;
  pseudo: string;
  /** Stocké en minuscules (unicité insensible à la casse via COLLATE NOCASE). */
  email: string;
  passwordHash: string;
  role?: string;
  /** Timestamp epoch ms (created_at = updated_at). */
  now: number;
}

/** INSERT user prêt pour un db.batch. */
export function insertUserStatement(db: D1Database, user: NewUserRecord): D1PreparedStatement {
  return db
    .prepare(
      "INSERT INTO users (id, pseudo, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(user.id, user.pseudo, user.email, user.passwordHash, user.role ?? "user", user.now, user.now);
}

/**
 * Recherche par pseudo OU email, insensible à la casse (COLLATE NOCASE
 * explicite ; les colonnes sont de toute façon UNIQUE COLLATE NOCASE).
 */
export async function getUserByLogin(db: D1Database, identifiant: string): Promise<UserRow | null> {
  const id = identifiant.trim();
  if (!id) return null;
  const row = await db
    .prepare("SELECT * FROM users WHERE pseudo = ? COLLATE NOCASE OR email = ? COLLATE NOCASE")
    .bind(id, id.toLowerCase())
    .first<UserRow>();
  return row ?? null;
}

/**
 * Détecte une violation UNIQUE D1 et identifie la colonne fautive.
 * L'unicité insensible à la casse est gérée par les colonnes
 * `UNIQUE COLLATE NOCASE` (pseudo, email) ; cette fonction sert à
 * renvoyer un 409 avec le bon message (voir route register).
 */
export function uniqueViolationColumn(err: unknown): "pseudo" | "email" | null {
  const message = err instanceof Error ? err.message : String(err);
  if (!/unique constraint failed/i.test(message)) return null;
  if (/users\.pseudo/i.test(message)) return "pseudo";
  if (/users\.email/i.test(message)) return "email";
  return null;
}

/** Sérialise vers l'objet `user` du contrat (balanceA recalculée serveur, ENTIER). */
export function toPublicUser(user: UserRow, balanceA: number): PublicUser {
  return {
    id: user.id,
    pseudo: user.pseudo,
    email: user.email,
    role: user.role,
    membership: normalizeMembership(user.membership),
    balanceA: Math.trunc(Number(balanceA)),
    createdAt: Number(user.created_at),
  };
}

/* --------------------------- security_events --------------------------- */

/** INSERT d'un événement de sécurité prêt pour un db.batch. */
export function securityEventStatement(
  db: D1Database,
  ev: SecurityEventInput
): D1PreparedStatement {
  return db
    .prepare(
      "INSERT INTO security_events (id, at, actor, action, ip_hash, meta) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(
      crypto.randomUUID(),
      Date.now(),
      ev.actor ?? null,
      ev.action,
      ev.ipHash ?? null,
      ev.meta ? JSON.stringify(ev.meta) : null
    );
}

export async function recordSecurityEvent(db: D1Database, ev: SecurityEventInput): Promise<void> {
  await securityEventStatement(db, ev).run();
}

/* ------------------------------- Divers ------------------------------- */

/** Extrait le token d'un en-tête `Authorization: Bearer <token>` (sinon null). */
export function bearerToken(header: string | undefined | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}
