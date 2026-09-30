import { Hono } from "hono";
import type { App, Env } from "../env";

/** GET /api/health — contrat prod : {ok, ts, service}. /health conservé pour compat. */
export const healthRoutes: App = new Hono<{ Bindings: Env }>()
  .get("/api/health", (c) => c.json({ ok: true, ts: Date.now(), service: "beta-arsenal" }))
  .get("/health", (c) => c.json({ ok: true, ts: Date.now(), service: "beta-arsenal" }));
