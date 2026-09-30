import { Hono } from "hono";
import { isAdmin, unauthorized, sha256hex } from "../../src/lib/server/auth";
import { saveConfig, getConfig } from "../../src/lib/server/store";
import type { App, Env } from "../env";

/**
 * POST /api/admin/password {next} (X-Admin-Auth) — change le mot de passe
 * administrateur et renvoie le nouveau token. Contrat inchangé.
 */
export const adminRoutes: App = new Hono<{ Bindings: Env }>().post(
  "/api/admin/password",
  async (c) => {
    if (!(await isAdmin(c.req.raw, c.env))) return unauthorized();
    let body: { next?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ ok: false, error: "JSON invalide." }, 400);
    }
    const next = String(body.next || "");
    if (next.length < 8) {
      return c.json(
        { ok: false, error: "Le nouveau mot de passe doit contenir au moins 8 caractères." },
        400
      );
    }
    const config = await getConfig(c.env.DB);
    const newToken = sha256hex(next);
    await saveConfig(c.env.DB, { ...config, adminToken: newToken });
    return c.json({ ok: true, token: newToken });
  }
);
