/**
 * Arsenal — Authentification admin.
 * Token = sha256(mot de passe), transmis via l'en-tête X-Admin-Auth.
 * NOTE chantier : schéma conservé pour compatibilité totale avec le front en
 * prod ; remplacé par des sessions utilisateurs en Phase 1
 * (voir docs/chantier/01-plan-chantier.md).
 */
import { createHash } from "node:crypto";
import { getSetting } from "./store";

interface AdminEnv {
  DB: D1Database;
  ADMIN_PASSWORD?: string;
}

export function sha256hex(input: string): string {
  return createHash("sha256").update(input, "utf-8").digest("hex");
}

/** Comparaison à temps constant (évite les fuites de timing sur le token). */
export function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Token admin attendu : `settings.admin_token` (écrit par le changement de mot
 * de passe) sinon repli sur la variable d'environnement ADMIN_PASSWORD.
 */
export async function getAdminToken(env: AdminEnv): Promise<string> {
  const stored = await getSetting(env.DB, "admin_token");
  const envPassword = env.ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD;
  if (!stored && !envPassword) {
    throw new Error("ADMIN_PASSWORD must be set in environment variables");
  }
  return stored || sha256hex(envPassword!);
}

/** Vérifie l'en-tête X-Admin-Auth de la requête. */
export async function isAdmin(request: Request, env: AdminEnv): Promise<boolean> {
  const token = (request.headers.get("x-admin-auth") || "").trim();
  if (!/^[a-f0-9]{64}$/i.test(token)) return false;
  const expected = await getAdminToken(env);
  return timingSafeEqualStr(token, expected);
}

export function unauthorized(): Response {
  return Response.json(
    { ok: false, error: "Non autorisé — clé administrateur invalide ou expirée." },
    { status: 401 }
  );
}
