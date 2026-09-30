import { Hono } from "hono";
import { incrementClick, incrementVisit } from "../../src/lib/server/store";
import type { App, Env } from "../env";

function dayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** POST /api/track (public) — {type:"visit"} ou {type:"click", productId, action?}. */
export const trackRoutes: App = new Hono<{ Bindings: Env }>().post("/api/track", async (c) => {
  let body: { type?: string; productId?: string; action?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: "JSON invalide." }, 400);
  }
  const type = String(body.type || "");

  if (type === "visit") {
    await incrementVisit(c.env.DB, dayKey(), Date.now());
    return c.json({ ok: true });
  }

  if (type === "click") {
    const productId = String(body.productId || "");
    if (!productId) {
      return c.json({ ok: false, error: "productId requis." }, 400);
    }
    await incrementClick(c.env.DB, productId);
    return c.json({ ok: true });
  }

  return c.json({ ok: false, error: "Type de suivi inconnu." }, 400);
});
