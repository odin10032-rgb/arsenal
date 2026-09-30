import { Hono } from "hono";
import { getAdminToken, sha256hex, timingSafeEqualStr } from "../../src/lib/server/auth";
import type { App, Env } from "../env";

/**
 * POST /api/auth/login {password} → {ok, token}.
 * Contrat inchangé : le token (sha256 du mot de passe) est stocké côté client
 * en sessionStorage puis transmis via X-Admin-Auth. Comparaison à temps constant.
 */
export const authRoutes: App = new Hono<{ Bindings: Env }>().post("/api/auth/login", async (c) => {
  let body: { password?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: "JSON invalide." }, 400);
  }
  const password = String(body.password || "");
  if (!password) {
    return c.json({ ok: false, error: "Mot de passe requis." }, 400);
  }
  const expected = await getAdminToken(c.env);
  if (!timingSafeEqualStr(sha256hex(password), expected)) {
    return c.json({ ok: false, error: "Mot de passe incorrect. Accès refusé." }, 401);
  }
  return c.json({ ok: true, token: sha256hex(password) });
});
