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
    ...normalizeAffiliation(body),
    // Création : aucun champ de vente en A préexistant (défauts du contrat).
    ...normalizePurchaseFields(body, errors),
  };
  if (!data.imageUrl) errors.push("Une image de couverture est requise.");
  return { errors, data };
}

/** Champs d'affiliation (Phase 2) — validés, jamais imposés par le client au-delà de ces bornes. */
function normalizeAffiliation(body: Record<string, unknown>): Partial<Product> {
  const enabled = body.affiliateEnabled === true || body.affiliateEnabled === 1 || body.affiliateEnabled === "1";
  const rawType = String(body.commissionType || "");
  const commissionType = rawType === "percent" || rawType === "fixed" ? rawType : null;
  const rawValue = Number(body.commissionValue);
  const commissionValue =
    Number.isFinite(rawValue) && rawValue >= 0 && rawValue <= 1_000_000 ? rawValue : null;
  const rawReward = Number(body.rewardA);
  const rewardA = Number.isFinite(rawReward) && rawReward >= 0 && rawReward <= 100_000 ? Math.trunc(rawReward) : 0;
  return { affiliateEnabled: enabled, commissionType, commissionValue, rewardA };
}

/** Bornes du contrat (docs/chantier/07-contrat-paiement-a.md) pour la vente en A. */
const PRICE_A_MAX = 1_000_000;
const CHARIOW_PRODUCT_ID_MAX = 120;

/* Champs de vente en A : chacun est lu séparément — ABSENT du corps ⇒ valeur
 * existante PRÉSERVÉE en modification (PUT), défaut du contrat en création. */

function priceAOf(body: Record<string, unknown>, existing?: Partial<Product>): number {
  const raw = body.priceA === undefined ? Number(existing?.priceA ?? 0) : Number(body.priceA);
  return Number.isFinite(raw) && raw >= 0 && raw <= PRICE_A_MAX ? Math.trunc(raw) : 0;
}

function purchasableOf(body: Record<string, unknown>, existing?: Partial<Product>): boolean {
  if (body.purchasable === undefined) return existing?.purchasable === true;
  return body.purchasable === true || body.purchasable === 1 || body.purchasable === "1";
}

function chariowProductIdOf(body: Record<string, unknown>, existing?: Partial<Product>): string | null {
  if (body.chariowProductId === undefined) return existing?.chariowProductId ?? null;
  const raw = typeof body.chariowProductId === "string" ? body.chariowProductId.trim() : "";
  return raw && raw.length <= CHARIOW_PRODUCT_ID_MAX ? raw : null;
}

function fulfillmentMethodOf(
  body: Record<string, unknown>,
  existing?: Partial<Product>
): Product["fulfillmentMethod"] {
  if (body.fulfillmentMethod === undefined) return existing?.fulfillmentMethod ?? "manual";
  return body.fulfillmentMethod === "chariow_free_checkout" ? "chariow_free_checkout" : "manual";
}

/**
 * Champs de vente en A (Phase 2.6) — validés dans les bornes du contrat :
 * `priceA` entier 0…1 000 000, `purchasable` booléen, `chariowProductId`
 * chaîne ≤ 120 caractères, `fulfillmentMethod` ∈ manual | chariow_free_checkout.
 *
 * INVARIANTS :
 * - `purchasable` exige `priceA > 0` (sinon ramené à false — contrat
 *   « price_a > 0 si purchasable ») ;
 * - `chariow_free_checkout` exige un `chariowProductId` non vide (constat C7 :
 *   sans lui, chaque achat échouerait en configuration… en débitant les A) ;
 * - en MODIFICATION, tout champ de vente en A absent du corps est PRÉSERVÉ
 *   (au lieu d'être silencieusement réinitialisé — constat C7).
 */
function normalizePurchaseFields(
  body: Record<string, unknown>,
  errors: string[],
  existing?: Partial<Product>
): Partial<Product> {
  const priceA = priceAOf(body, existing);
  const chariowProductId = chariowProductIdOf(body, existing);
  const fulfillmentMethod = fulfillmentMethodOf(body, existing);
  const purchasable = purchasableOf(body, existing) && priceA > 0;
  if (purchasable && fulfillmentMethod === "chariow_free_checkout" && !chariowProductId) {
    errors.push(
      "Identifiant produit Chariow requis : un produit achetable avec livraison automatique " +
        "(fulfillmentMethod « chariow_free_checkout ») doit avoir un chariowProductId."
    );
  }
  return { purchasable, priceA, chariowProductId, fulfillmentMethod };
}

/**
 * Catalogue PUBLIC : `chariowProductId` est un identifiant d'intégration
 * interne (constat C9 de l'audit) — il n'est renvoyé qu'aux requêtes admin
 * authentifiées (X-Admin-Auth), dont le formulaire produit a besoin pour
 * éditer un produit `chariow_free_checkout`.
 *
 * DEUX clés à retirer : `getProducts()` étale la ligne SQL brute puis ajoute
 * les alias camelCase, donc la valeur existe aussi en `chariow_product_id`
 * (fuite constatée en test).
 */
function withoutIntegrationId(product: Product): Omit<Product, "chariowProductId"> {
  const copy: Record<string, unknown> = { ...product };
  delete copy.chariowProductId;
  delete copy.chariow_product_id;
  return copy as Omit<Product, "chariowProductId">;
}

export const productRoutes: App = new Hono<{ Bindings: Env }>()
  /** GET /api/products — catalogue public (clics fusionnés, version pour cache client). */
  .get("/api/products", async (c) => {
    const [products, analytics] = await Promise.all([
      getProducts(c.env.DB),
      getAnalytics(c.env.DB),
    ]);
    const isAdminRequest = await isAdmin(c.req.raw, c.env);
    const merged = products.map((p) => ({
      ...p,
      clicks: p.clicks + (analytics.clicksByProduct[p.id] || 0),
    }));
    const visible = isAdminRequest ? merged : merged.map(withoutIntegrationId);
    return c.json({
      ok: true,
      version: catalogVersion(products, analytics.clicksByProduct),
      count: visible.length,
      products: visible,
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

    // Champs de vente en A : validés dans les bornes du contrat, PRÉSERVÉS quand
    // le corps ne les contient pas (constat C7), et invariants vérifiés.
    const purchaseErrors: string[] = [];
    const purchaseFields = normalizePurchaseFields(body, purchaseErrors, products[index]);
    if (purchaseErrors.length) {
      return c.json({ ok: false, error: purchaseErrors.join(" ") }, 400);
    }

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
      ...normalizeAffiliation(body),
      ...purchaseFields,
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
