import { Hono } from "hono";
import { isAdmin, unauthorized } from "../../src/lib/server/auth";
import { securityEventStatement, bearerToken, getAuthContext } from "../../src/lib/server/user-auth";
import {
  listUserLicenses,
  listLicensesAdmin,
  licenseToJson,
  licenseToAdminJson,
  verifyLicense,
  revokeLicenseStatement,
  normalizeLicenseKey,
  looksLikeLicenseKey,
  MAX_DEVICE_ID_LENGTH,
} from "../../src/lib/server/licenses";
import type { App, Env } from "../env";

/** Route publique : vérification d'une clé depuis une app ou un CLI. */
export const licenseVerifyRoutes: App = new Hono<{ Bindings: Env }>().post(
  "/api/licenses/verify",
  async (c) => {
    let body: { licenseKey?: unknown; deviceId?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ ok: true, valid: false, reason: "unknown" });
    }
    const licenseKey = normalizeLicenseKey(body.licenseKey);
    const deviceId = String(body.deviceId ?? "").trim().slice(0, MAX_DEVICE_ID_LENGTH);
    if (!licenseKey || !deviceId) {
      return c.json({ ok: true, valid: false, reason: "unknown" });
    }
    const result = await verifyLicense(c.env.DB, { licenseKey, deviceId });
    // Réponse minimaliste : jamais de donnée utilisateur (la clé EST le secret).
    return c.json({ ok: true, ...result });
  }
);

/** Routes utilisateur : mes clés de licence (authentification Bearer manuelle). */
export const licenseUserRoutes: App = new Hono<{ Bindings: Env }>().get(
  "/api/me/licenses",
  async (c) => {
    const token = bearerToken(c.req.header("authorization"));
    if (!token) return c.json({ ok: false, error: "Authentification requise." }, 401);
    const auth = await getAuthContext(c.env.DB, token);
    if (!auth) return c.json({ ok: false, error: "Session invalide ou expirée." }, 401);
    const rows = await listUserLicenses(c.env.DB, auth.user.id);
    return c.json({ ok: true, licenses: rows.map(licenseToJson) });
  }
);

/** Routes admin : liste et révocation. */
export const licenseAdminRoutes: App = new Hono<{ Bindings: Env }>()
  .get("/api/admin/licenses", async (c) => {
    if (!(await isAdmin(c.req.raw, c.env))) return unauthorized();
    const rows = await listLicensesAdmin(c.env.DB, {
      status: c.req.query("status") || null,
      productId: c.req.query("product_id") || null,
    });
    return c.json({ ok: true, licenses: rows.map(licenseToAdminJson) });
  })
  .post("/api/admin/licenses/:id/revoke", async (c) => {
    if (!(await isAdmin(c.req.raw, c.env))) return unauthorized();
    const id = c.req.param("id");
    await c.env.DB.batch([
      revokeLicenseStatement(c.env.DB, id),
      securityEventStatement(c.env.DB, {
        actor: "admin",
        action: "admin_license_revoke",
        meta: { licenseId: id },
      }),
    ]);
    return c.json({ ok: true });
  });
