import { Hono } from "hono";
import {
  getProducts,
  saveProducts,
  deleteProduct,
  getAnalytics,
  catalogVersion,
} from "../../src/lib/server/store";
import { isAdmin, unauthorized } from "../../src/lib/server/auth";
import type { Product } from "../../src/lib/server/types";
import type { App, Env } from "../env";

const CATEGORIES = ["saas", "desktop", "mobile", "ebook", "prompts"];
const ACTION_TYPES = ["chariow", "terminal", "mobile"];
const BADGES = ["gratuit", "premium", "beta", "nouveau"];

function sanitizeUrl(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return "";
  if (/^(https?:\/\/|\/|data:image\/)/i.test(s)) return s;
  return "";
}

/** Portage fidèle du POST /api/products (validation identique à la prod). */
function normalize(body: Record<string, unknown>): { errors: string[]; data: Partial<Product> } {
  const errors: string[] = [];
  const title = String(body.title || "").trim();
  if (title.length < 2) errors.push("Le titre est requis (2 caractères minimum).");

  const category = String(body.category || "");
  if (!CATEGORIES.includes(category)) errors.push("Catégorie invalide.");

  const actionType = String(body.actionType || "");
  if (!ACTION_TYPES.includes(actionType)) errors.push("Type d'action invalide.");

  const actionUrl = sanitizeUrl(body.actionUrl);
  if (actionType !== "chariow" && !actionUrl) errors.push("L'URL d'action est requise.");

  const badges = Array.isArray(body.badges)
    ? (body.badges as unknown[]).map(String).filter((b) => BADGES.includes(b))
    : [];

  const data: Partial<Product> = {
    title,
    shortDescription: String(body.shortDescription || "").trim().slice(0, 140),
    description: String(body.description || "").trim(),
    category: category as Product["category"],
    actionType: actionType as Product["actionType"],
    badges,
    price: String(body.price || "").trim().slice(0, 24),
    actionUrl,
    apkUrl: sanitizeUrl(body.apkUrl) || undefined,
    pwaUrl: sanitizeUrl(body.pwaUrl) || undefined,
    command: body.command ? String(body.command).trim().slice(0, 500) : null,
    videoUrl: sanitizeUrl(body.videoUrl) || null,
    imageUrl: sanitizeUrl(body.imageUrl) || "",
  };
  if (!data.imageUrl) errors.push("Une image de couverture est requise.");
  return { errors, data };
}

export const productRoutes: App = new Hono<{ Bindings: Env }>()
  /** GET /api/products — catalogue public (clics fusionnés, version pour cache client). */
  .get("/api/products", async (c) => {
    const [products, analytics] = await Promise.all([
      getProducts(c.env.DB),
      getAnalytics(c.env.DB),
    ]);
    const merged = products.map((p) => ({
      ...p,
      clicks: p.clicks + (analytics.clicksByProduct[p.id] || 0),
    }));
    return c.json({
      ok: true,
      version: catalogVersion(products, analytics.clicksByProduct),
      count: merged.length,
      products: merged,
    });
  })

  /** POST /api/products — création (admin). */
  .post("/api/products", async (c) => {
    if (!(await isAdmin(c.req.raw, c.env))) return unauthorized();
    let body: Record<string, unknown>;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ ok: false, error: "JSON invalide." }, 400);
    }
    const { errors, data } = normalize(body);
    if (errors.length) {
      return c.json({ ok: false, error: errors.join(" ") }, 400);
    }
    const now = Date.now();
    const product: Product = {
      id: crypto.randomUUID(),
      ...(data as Required<Omit<Product, "id" | "clicks" | "createdAt" | "updatedAt">>),
      clicks: 0,
      createdAt: now,
      updatedAt: now,
    };
    await saveProducts(c.env.DB, [product]);
    return c.json({ ok: true, product }, 201);
  })

  /** PUT /api/products/:id — modification (admin). */
  .put("/api/products/:id", async (c) => {
    if (!(await isAdmin(c.req.raw, c.env))) return unauthorized();
    const id = c.req.param("id");
    let body: Record<string, unknown>;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ ok: false, error: "JSON invalide." }, 400);
    }

    const title = String(body.title || "").trim();
    const category = String(body.category || "");
    const actionType = String(body.actionType || "");
    if (title.length < 2) return c.json({ ok: false, error: "Titre requis." }, 400);
    if (!CATEGORIES.includes(category) || !ACTION_TYPES.includes(actionType)) {
      return c.json({ ok: false, error: "Catégorie ou type d'action invalide." }, 400);
    }
    const actionUrl = sanitizeUrl(body.actionUrl);

    const products = await getProducts(c.env.DB);
    const index = products.findIndex((p) => p.id === id);
    if (index === -1) return c.json({ ok: false, error: "Produit introuvable." }, 404);

    const updated: Product = {
      ...products[index],
      title,
      shortDescription: String(body.shortDescription || "").trim().slice(0, 140),
      description: String(body.description || "").trim(),
      category: category as Product["category"],
      actionType: actionType as Product["actionType"],
      badges: Array.isArray(body.badges)
        ? (body.badges as unknown[]).map(String).filter((b) => BADGES.includes(b))
        : [],
      price: String(body.price || "").trim().slice(0, 24),
      actionUrl,
      apkUrl: sanitizeUrl(body.apkUrl) || undefined,
      pwaUrl: sanitizeUrl(body.pwaUrl) || undefined,
      command: body.command ? String(body.command).trim().slice(0, 500) : null,
      videoUrl: sanitizeUrl(body.videoUrl) || null,
      imageUrl: sanitizeUrl(body.imageUrl) || products[index].imageUrl,
      updatedAt: Date.now(),
    };

    products[index] = updated;
    await saveProducts(c.env.DB, products);
    return c.json({ ok: true, product: updated });
  })

  /** DELETE /api/products/:id — suppression (admin). */
  .delete("/api/products/:id", async (c) => {
    if (!(await isAdmin(c.req.raw, c.env))) return unauthorized();
    const id = c.req.param("id");
    const success = await deleteProduct(c.env.DB, id);
    if (!success) {
      return c.json({ ok: false, error: "Produit introuvable." }, 404);
    }
    return c.json({ ok: true, deleted: id });
  });
