/**
 * Arsenal Tools — session utilisateur Phase 1 (contrat : docs/chantier/02-contrat-api-phase1.md)
 * - Token opaque en localStorage « arsenal_session_token » (header Bearer — pas de cookie,
 *   front et API sur des domaines différents)
 * - Cache profil « arsenal_user_cache » ({user, fetchedAt}), toujours revalidé par GET /api/me
 * - Événement DOM « arsenal-user-changed » émis après login / logout / refresh
 */

import { API_URL, apiFetch, ApiError } from "./api";

export const SESSION_TOKEN_KEY = "arsenal_session_token";
export const USER_CACHE_KEY = "arsenal_user_cache";
export const USER_CHANGED_EVENT = "arsenal-user-changed";

export type UserRole = "user" | "affiliate" | "super_affiliate" | "admin";

/** Adhésion au programme : `none` (simple utilisateur) | `member` (accès monnaie A). */
export type Membership = "none" | "member";

/** Objet user du contrat (définition unique, partagée avec le Worker) */
export interface User {
  id: string;
  pseudo: string;
  email: string;
  role: UserRole;
  /**
   * Adhésion au programme (migration 0008). C'est ELLE — et non le rôle — qui
   * ouvre la monnaie A. Le champ peut manquer d'un cache localStorage écrit
   * avant son ajout : lire via `isMember()` (défensif).
   */
  membership?: Membership;
  balanceA: number;
  createdAt: number;
}

/** L'utilisateur a-t-il accès à la monnaie A ? (adhésion, jamais le rôle) */
export function isMember(user: { membership?: Membership } | null | undefined): boolean {
  return user?.membership === "member";
}

/* ---------- Token de session (localStorage) ---------- */

export function getToken(): string {
  try {
    return localStorage.getItem(SESSION_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(SESSION_TOKEN_KEY, token);
  } catch {
    /* storage indisponible : on ignore */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(SESSION_TOKEN_KEY);
  } catch {
    /* on ignore */
  }
}

/* ---------- Cache profil (stale-while-revalidate, même esprit que le catalogue) ---------- */

interface UserCache {
  user: User;
  fetchedAt: number;
}

export function readUserCache(): User | null {
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserCache;
    return parsed?.user?.id ? parsed.user : null;
  } catch {
    return null;
  }
}

function writeUserCache(user: User): void {
  try {
    localStorage.setItem(
      USER_CACHE_KEY,
      JSON.stringify({ user, fetchedAt: Date.now() } satisfies UserCache),
    );
  } catch {
    /* on ignore */
  }
}

function clearUserCache(): void {
  try {
    localStorage.removeItem(USER_CACHE_KEY);
  } catch {
    /* on ignore */
  }
}

/* ---------- Événement de synchronisation ---------- */

export function emitUserChanged(): void {
  try {
    window.dispatchEvent(new CustomEvent(USER_CHANGED_EVENT));
  } catch {
    /* hors navigateur : on ignore */
  }
}

/* ---------- Appels API (contrat Phase 1) ---------- */

interface AuthResponse {
  ok: boolean;
  token: string;
  user: User;
}

/** POST /api/auth/register — inscription (le +100 A de bienvenue est créé côté serveur) */
export async function register(pseudo: string, email: string, password: string): Promise<User> {
  const res = await apiFetch<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: { pseudo: pseudo.trim(), email: email.trim().toLowerCase(), password },
    timeoutMs: 8000,
  });
  setToken(res.token);
  writeUserCache(res.user);
  emitUserChanged();
  return res.user;
}

/** POST /api/auth/session — connexion utilisateur (email OU pseudo). ⚠️ /api/auth/login reste le login admin. */
export async function userLogin(identifiant: string, password: string): Promise<User> {
  const res = await apiFetch<AuthResponse>("/api/auth/session", {
    method: "POST",
    body: { identifiant: identifiant.trim(), password },
    timeoutMs: 8000,
  });
  setToken(res.token);
  writeUserCache(res.user);
  emitUserChanged();
  return res.user;
}

/**
 * DELETE /api/auth/session — déconnexion.
 * Le local (token + cache) est nettoyé immédiatement ; la révocation serveur part en
 * fire-and-forget via un fetch dédié (le token étant déjà retiré du storage,
 * apiFetch({ bearer }) ne pourrait plus le relire). Idempotent côté API : en cas d'échec
 * réseau, la session expirera par TTL (30 j) sans conséquence locale.
 */
export async function logout(): Promise<void> {
  const token = getToken();
  clearToken();
  clearUserCache();
  emitUserChanged();
  if (!token) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  fetch(`${API_URL}/api/auth/session`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
    signal: controller.signal,
  })
    .catch(() => undefined)
    .finally(() => clearTimeout(timer));
}

/**
 * GET /api/me — profil + solde.
 * force=false : cache local d'abord (peinture instantanée) ; force=true : revalidation réseau.
 * 401 → session invalide ou expirée : nettoyage local + événement.
 */
export async function fetchMe(force = false): Promise<User | null> {
  if (!getToken()) {
    clearUserCache();
    return null;
  }
  if (!force) {
    return readUserCache();
  }
  try {
    const res = await apiFetch<{ ok: boolean; user: User }>("/api/me", {
      bearer: true,
      timeoutMs: 4000,
    });
    writeUserCache(res.user);
    emitUserChanged();
    return res.user;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      clearToken();
      clearUserCache();
      emitUserChanged();
      return null;
    }
    // Erreur réseau : on retombe sur le cache éventuel (jamais de déconnexion abusive)
    return readUserCache();
  }
}
