import { Hono } from "hono";
import {
  getProducts,
  saveProducts,
  deleteProduct,
  getAnalytics,
  catalogVersion,
} from "../../src/lib/server/store";
import { isAdmin, unauthorized } from "../../src/lib/server/auth";
import { notifyProductAffiliates } from "../../src/lib/server/notifications";
import { PRODUCT_LANGUAGE_CODES, type Product, type ProductLanguage } from "../../src/lib/server/types";
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
    // Langues (migration 0007) : création ⇒ tableau vide si absent du corps.
    languages: languagesOf(body),
  };
  if (!data.imageUrl) errors.push("Une image de couverture est requise.");
  // L'URL est requise sauf produit 100 % A : type « chariow » ET vendable en A
  // (sans tunnel externe, le produit n'aurait aucun canal de vente).
  if (!actionUrl && !(data.actionType === "chariow" && data.purchasable === true)) {
    errors.push("L'URL d'action est requise (ou activez la vente en A pour un produit sans tunnel externe).");
  }
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
const CHARIOW_DISCOUNT_CODE_MAX = 60;
/** Code promo Chariow : majuscules, chiffres et tirets uniquement (bornes du backend). */
const CHARIOW_DISCOUNT_CODE_PATTERN = /^[A-Z0-9-]+$/;

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

/**
 * Code promo Chariow (méthode `chariow_discount_checkout`) : chaîne ≤ 60
 * caractères, MAJUSCULES/chiffres/tirets, ou `null`. Une valeur hors bornes est
 * ramenée à `null` (jamais stockée telle quelle) ; l'invariant ci-dessous refuse
 * alors l'enregistrement si la méthode choisie en a besoin.
 */
function chariowDiscountCodeOf(
  body: Record<string, unknown>,
  existing?: Partial<Product>
): string | null {
  if (body.chariowDiscountCode === undefined) return existing?.chariowDiscountCode ?? null;
  if (body.chariowDiscountCode === null) return null; // effacement explicite
  const raw = typeof body.chariowDiscountCode === "string" ? body.chariowDiscountCode.trim() : "";
  if (!raw) return null;
  const normalized = raw.toUpperCase();
  if (normalized.length > CHARIOW_DISCOUNT_CODE_MAX) return null;
  return CHARIOW_DISCOUNT_CODE_PATTERN.test(normalized) ? normalized : null;
}

function fulfillmentMethodOf(
  body: Record<string, unknown>,
  existing?: Partial<Product>
): Product["fulfillmentMethod"] {
  if (body.fulfillmentMethod === undefined) return existing?.fulfillmentMethod ?? "manual";
  if (body.fulfillmentMethod === "chariow_free_checkout") return "chariow_free_checkout";
  if (body.fulfillmentMethod === "chariow_discount_checkout") return "chariow_discount_checkout";
  return "manual";
}

/**
 * Mode de livraison Arsenal du canal A (`delivery_kind`) : `file` (fichier
 * hébergé sur GitHub), `license` (clé générée) ou `null` (via Chariow/manuelle).
 * Absent du corps ⇒ valeur existante PRÉSERVÉE (même règle que les autres
 * champs de vente en A — le champ était silencieusement perdu avant ce correctif).
 */
function deliveryKindOf(
  body: Record<string, unknown>,
  existing?: Partial<Product>
): Product["deliveryKind"] {
  if (body.deliveryKind === undefined) return existing?.deliveryKind ?? null;
  if (body.deliveryKind === "file") return "file";
  if (body.deliveryKind === "license") return "license";
  return null;
}

/**
 * Langues du produit (migration 0007) : tableau de codes connus, filtré sur la
 * liste FIGÉE (donc dédoublonné et borné à 7 codes). Absent du corps ⇒ valeur
 * existante PRÉSERVÉE en modification (PUT) ; en création, tableau vide —
 * jamais de langue devinée à partir d'une valeur invalide.
 */
function languagesOf(
  body: Record<string, unknown>,
  existing?: Partial<Product>
): ProductLanguage[] {
  if (body.languages === undefined) return existing?.languages ?? [];
  if (!Array.isArray(body.languages)) return [];
  const raw = (body.languages as unknown[]).map(String);
  return PRODUCT_LANGUAGE_CODES.filter((code) => raw.includes(code));
}

/**
 * Champs de vente en A (Phase 2.6) — validés dans les bornes du contrat :
 * `priceA` entier 0…1 000 000, `purchasable` booléen, `chariowProductId`
 * chaîne ≤ 120 caractères, `chariowDiscountCode` chaîne ≤ 60 (majuscules/
 * chiffres/tirets), `fulfillmentMethod` ∈ manual | chariow_free_checkout |
 * chariow_discount_checkout, `deliveryKind` ∈ file | license | null.
 *
 * INVARIANTS :
 * - `purchasable` exige `priceA > 0` (sinon ramené à false — contrat
 *   « price_a > 0 si purchasable ») ;
 * - `chariow_free_checkout` exige un `chariowProductId` non vide (constat C7 :
 *   sans lui, chaque achat échouerait en configuration… en débitant les A) ;
 * - `chariow_discount_checkout` exige un `chariowProductId` ET un
 *   `chariowDiscountCode` (le code porte la gratuité du produit d'origine) ;
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
  const chariowDiscountCode = chariowDiscountCodeOf(body, existing);
  const fulfillmentMethod = fulfillmentMethodOf(body, existing);
  const deliveryKind = deliveryKindOf(body, existing);
  const purchasable = purchasableOf(body, existing) && priceA > 0;
  if (purchasable && fulfillmentMethod === "chariow_free_checkout" && !chariowProductId) {
    errors.push(
      "Identifiant produit Chariow requis : un produit achetable avec livraison automatique " +
        "(fulfillmentMethod « chariow_free_checkout ») doit avoir un chariowProductId."
    );
  }
  if (purchasable && fulfillmentMethod === "chariow_discount_checkout") {
    if (!chariowProductId) {
      errors.push(
        "Identifiant produit Chariow requis : la livraison automatique par code promo " +
          "(fulfillmentMethod « chariow_discount_checkout ») doit viser le produit Chariow d'origine " +
          "(chariowProductId)."
      );
    }
    if (!chariowDiscountCode) {
      errors.push(
        "Code promo Chariow requis : la livraison automatique par code promo " +
          "(fulfillmentMethod « chariow_discount_checkout ») doit avoir un chariowDiscountCode " +
          "(≤ 60 caractères, majuscules/chiffres/tirets)."
      );
    }
  }
  return { purchasable, priceA, chariowProductId, chariowDiscountCode, fulfillmentMethod, deliveryKind };
}

/**
 * Catalogue PUBLIC : `chariowProductId` et `chariowDiscountCode` sont des
 * identifiants d'intégration internes (constat C9 de l'audit) — ils ne sont
 * renvoyés qu'aux requêtes admin authentifiées (X-Admin-Auth), dont le
 * formulaire produit a besoin pour éditer un produit à fulfillment Chariow.
 * Le code promo est en outre un SECRET opérationnel : sa fuite offrirait le
 * produit gratuitement à quiconque lit le catalogue.
 *
 * DEUX clés à retirer par champ : `getProducts()` étale la ligne SQL brute puis
 * ajoute les alias camelCase, donc la valeur existe aussi en `chariow_product_id`
 * / `chariow_discount_code` (fuite constatée en test).
 *
 * `priceA` est retiré pour la même raison de fond : la monnaie A est réservée
 * aux MEMBRES (décision du 03/10/2026). L'interface ne l'affichait pas, mais la
 * VALEUR restait lisible dans la réponse JSON publique (constat de l'audit de la
 * vague 5) — un prix réservé ne doit pas circuler dans le catalogue public.
 * L'admin reçoit toujours la valeur complète (requête authentifiée).
 */
type PublicProduct = Omit<Product, "chariowProductId" | "chariowDiscountCode" | "priceA">;

function withoutIntegrationFields(product: Product): PublicProduct {
  const copy: Record<string, unknown> = { ...product };
  delete copy.chariowProductId;
  delete copy.chariow_product_id;
  delete copy.chariowDiscountCode;
  delete copy.chariow_discount_code;
  delete copy.priceA;
  delete copy.price_a;
  // Fichier livrable : l'URL GitHub brute n'est JAMAIS publique (le téléchargement
  // passe par la route vérifiée). L'audit vague 5 a constaté la fuite.
  delete copy.productFileUrl;
  delete copy.product_file_url;
  return copy as PublicProduct;
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
    const visible = isAdminRequest ? merged : merged.map(withoutIntegrationFields);
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
    const previous = products[index];

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
      // Cycle de vie : disponibilité pilotée par la case « disponible » du
      // formulaire admin. Absente du corps ⇒ état existant PRÉSERVÉ (même
      // règle que les autres champs, constat C7).
      unavailableAt:
        body.available === undefined
          ? previous.unavailableAt ?? null
          : body.available === true
            ? null
            : previous.unavailableAt ?? Date.now(),
      // Langues (migration 0007) : absent du corps ⇒ langues existantes préservées.
      languages: languagesOf(body, products[index]),
      updatedAt: Date.now(),
    };

    // Même garde « au moins un canal de vente » qu'à la création (autorité serveur).
    if (!updated.actionUrl && !(updated.actionType === "chariow" && updated.purchasable === true)) {
      return c.json({ ok: false, error: "L'URL d'action est requise (ou activez la vente en A pour un produit sans tunnel externe)." }, 400);
    }

    products[index] = updated;
    await saveProducts(c.env.DB, products);

    // Cycle de vie (audit §B2) : informer les affiliés qui ont un lien sur ce
    // produit quand sa disponibilité vis-à-vis de l'affiliation CHANGE.
    const wasEnabled = products[index] && Boolean(previous.affiliateEnabled);
    if (wasEnabled !== Boolean(updated.affiliateEnabled)) {
      await notifyProductAffiliates(c.env.DB, {
        productId: id,
        type: updated.affiliateEnabled ? "product_reeligible" : "product_ineligible",
        message: updated.affiliateEnabled
          ? `« ${updated.title} » est de nouveau éligible à l'affiliation — vos liens reprennent effet.`
          : `« ${updated.title} » a été retiré du programme d'affiliation — vos liens ne génèrent plus de commission.`,
      });
    }
    const wasAvailable = previous.unavailableAt == null;
    if (wasAvailable && updated.unavailableAt != null) {
      await notifyProductAffiliates(c.env.DB, {
        productId: id,
        type: "product_unavailable",
        message: `« ${updated.title} » a été marqué indisponible — les visiteurs de vos liens ne peuvent plus l'acheter.`,
      });
    } else if (!wasAvailable && updated.unavailableAt == null) {
      await notifyProductAffiliates(c.env.DB, {
        productId: id,
        type: "product_available",
        message: `« ${updated.title} » est de nouveau disponible — vos liens reprennent effet.`,
      });
    }

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
    // Cycle de vie (audit §B4) : suppression douce ⇒ les affiliés ayant un lien
    // sont prévenus dans leur espace (jamais d'email — §37).
    await notifyProductAffiliates(c.env.DB, {
      productId: id,
      type: "product_deleted",
      message: "Un produit sur lequel vous aviez un lien a été retiré du catalogue. Vos liens associés ne sont plus actifs.",
    });
    return c.json({ ok: true, deleted: id });
  });
