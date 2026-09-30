import { Hono } from "hono";
import { getAnalytics, getProducts } from "../../src/lib/server/store";
import { isAdmin, unauthorized } from "../../src/lib/server/auth";
import type { App, Env } from "../env";

/** GET /api/analytics (admin) — tableau de bord analytique. */
export const analyticsRoutes: App = new Hono<{ Bindings: Env }>().get(
  "/api/analytics",
  async (c) => {
    if (!(await isAdmin(c.req.raw, c.env))) return unauthorized();
    const [analytics, products] = await Promise.all([
      getAnalytics(c.env.DB),
      getProducts(c.env.DB),
    ]);
    const titles: Record<string, string> = {};
    const images: Record<string, string> = {};
    for (const p of products) {
      titles[p.id] = p.title;
      images[p.id] = p.imageUrl;
    }
    const onlineNow = analytics.recentVisits.filter((t) => Date.now() - t < 60_000).length;
    return c.json({
      ok: true,
      visits: analytics.visits,
      actionsTotal: analytics.actionsTotal,
      clicksByProduct: analytics.clicksByProduct,
      visitsByDay: analytics.visitsByDay,
      productTitles: titles,
      productImages: images,
      productCount: products.length,
      onlineNow,
      updatedAt: analytics.updatedAt,
    });
  }
);
