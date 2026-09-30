import { Hono } from "hono";
import type { Context } from "hono";
import { isAdmin, unauthorized, sha256hex } from "../../src/lib/server/auth";
import { securityEventStatement } from "../../src/lib/server/user-auth";
import { changesOf } from "../../src/lib/server/commissions";
import { getProducts } from "../../src/lib/server/store";
import { readChariowApiKey } from "../../src/lib/server/chariow-checkout";import {
  readChariowProduct,
  readChariowProducts,
  readChariowStore,
} from "../../src/lib/server/chariow-api";
import { normalizeFulfillmentMethod } from "../../src/lib/server/fulfillment";
import { readChariowWebhookSecret } from "../../src/lib/server/affiliation";
import type { App, Env } from "../env";

/**
 * Onglet admin « Chariow » (X-Admin-Auth) — piloter la boutique depuis Arsenal.
 *
 * ⚠️ L'API Chariow est en LECTURE SEULE sur les produits (19 chemins, `/products`
 * en GET uniquement) : Arsenal ne peut donc PAS créer ni éditer un produit
 * Chariow. Ces routes se limitent à ce qui est réellement possible :
 * - `GET  /api/admin/chariow/status`          état de la connexion (clé + boutique) ;
 * - `GET  /api/admin/chariow/products`        produits de la boutique + lien vers un produit Arsenal ;
 * - `POST /api/admin/products/:id/chariow-link`  enregistre le lien APRÈS vérification réelle.
 *
 * Endpoints officiels appelés (OpenAPI 3.1.0) : `GET /v1/store`,
 * `GET /v1/products`, `GET /v1/products/{id}`. Aucun autre.
 *
 * La clé API Chariow n'est JAMAIS renvoyée (seuls des booléens `*_configured`).
 */

/* --------------------------------- Utilitaires --------------------------------- */

type AdminContext = Context<{ Bindings: Env }, any, any>;

/** X-Admin-Auth réutilisé tel quel (isAdmin + unauthorized de auth.ts). */
async function requireAdmin(c: AdminContext): Promise<Response | null> {
  if (await isAdmin(c.req.raw, c.env)) return null;
  return unauthorized();
}

/** Minimisation : seule l'empreinte sha256 de l'IP est journalisée. */
function ipHashOf(header: string | undefined): string {
  return sha256hex(header || "unknown");
}

function badRequest(error: string): Response {
  return Response.json({ ok: false, error }, { status: 400 });
}

function notFound(error: string): Response {
  return Response.json({ ok: false, error }, { status: 404 });
}

/** Dépendance externe indisponible ou refusée (réseau, 5xx, clé refusée, quota). */
function upstreamError(error: string): Response {
  return Response.json({ ok: false, error }, { status: 502 });
}

/** Clé API absente : état de configuration, pas une erreur de la requête. */
function notConfigured(error: string): Response {
  return Response.json({ ok: false, error }, { status: 503 });
}

async function readJson(c: AdminContext): Promise<Record<string, unknown> | null> {
  try {
    const body = await c.req.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Bornes du backend Arsenal (mêmes valeurs que la validation produit). */
const CHARIOW_PRODUCT_ID_MAX = 120;

/**
 * Un produit Chariow est-il publié ? Le `status` de l'OpenAPI est une chaîne
 * LIBRE (aucune énumération publiée) : on ne peut donc l'affirmer que par
 * élimination. `null` = indéterminable (statut absent) — jamais deviné.
 */
function isPublishedStatus(status: string | null): boolean | null {
  if (status === null) return null;
  return !/draft|unpublish|inactive|archiv|disabled|hidden|private/i.test(status);
}

/** Types Chariow refusés par l'API checkout (422) — audit `06-…`, § A. */
const CHECKOUT_UNSUPPORTED_TYPES = ["service", "coaching"];

/* ------------------------------------ Routes ------------------------------------ */

export const adminChariowRoutes: App = new Hono<{ Bindings: Env }>()
  /**
   * GET /api/admin/chariow/status — état de la connexion Chariow.
   * Lecture DÉFENSIVE : jamais d'exception, l'erreur éventuelle est renvoyée
   * dans `error` (la clé API, elle, n'est jamais renvoyée).
   */
  .get("/api/admin/chariow/status", async (c) => {
    const denied = await requireAdmin(c);
    if (denied) return denied;

    const db = c.env.DB;
    const apiKey = await readChariowApiKey(db);
    const secret = await readChariowWebhookSecret(db);

    // Boutique : lue seulement si une clé existe (aucun appel réseau sinon).
    const storeResult = apiKey ? await readChariowStore(apiKey) : null;

    return c.json({
      ok: true,
      // « Configuration opérationnelle » = clé enregistrée ET boutique joignable.
      // `apiKeyConfigured` reste le drapeau brut (clé enregistrée ou non).
      configured: Boolean(apiKey) && storeResult?.ok === true,
      store: storeResult?.ok
        ? { name: storeResult.data.name, domain: storeResult.data.domain }
        : null,
      apiKeyConfigured: Boolean(apiKey),
      webhookSecretConfigured: Boolean(secret),
      ...(storeResult && !storeResult.ok ? { error: storeResult.error } : {}),
    });
  })
  /**
   * GET /api/admin/chariow/products — produits de la boutique Chariow, avec le
   * lien vers un produit Arsenal calculé en comparant `products.chariow_product_id`
   * (id public OU slug Chariow, comme le permet `product_id` du CheckoutRequest).
   */
  .get("/api/admin/chariow/products", async (c) => {
    const denied = await requireAdmin(c);
    if (denied) return denied;

    const db = c.env.DB;
    const apiKey = await readChariowApiKey(db);
    if (!apiKey) return notConfigured("Clé API Chariow non configurée.");

    const [list, arsenalProducts] = await Promise.all([
      readChariowProducts(apiKey, { perPage: 100 }),
      getProducts(db),
    ]);
    if (!list.ok) {
      // Lecture impossible (réseau, clé refusée, quota, 5xx) : aucune liste inventée.
      return upstreamError(list.error);
    }

    // Lien Arsenal : index des produits ayant un `chariow_product_id` (id ou slug).
    const linkByChariowRef = new Map<string, string>();
    for (const product of arsenalProducts) {
      const ref = (product.chariowProductId ?? "").trim();
      if (ref && !linkByChariowRef.has(ref)) linkByChariowRef.set(ref, product.id);
    }

    const products = list.data.items.map((item) => ({
      id: item.id,
      name: item.name,
      isFree: item.isFree,
      price: item.price,
      status: item.status,
      type: item.type,
      linkedArsenalProductId:
        linkByChariowRef.get(item.id) ?? (item.slug ? linkByChariowRef.get(item.slug) ?? null : null),
    }));

    return c.json({
      ok: true,
      count: products.length,
      // `per_page` est plafonné à 100 par l'OpenAPI : au-delà, d'autres produits existent.
      hasMore: list.data.hasMore,
      products,
    });
  })
  /**
   * POST /api/admin/products/:id/chariow-link `{ chariowProductId }` — enregistre
   * le lien APRÈS vérification réelle (`GET /v1/products/{id}`) :
   * - produit inexistant côté Chariow → **400**, aucun lien enregistré ;
   * - Chariow injoignable / clé refusée / quota → **502**, aucun lien enregistré ;
   * - sinon le lien est enregistré (UPDATE ciblé, une seule colonne) et la route
   *   renvoie le diagnostic `{ ok, product, checks, warnings }`.
   */
  .post("/api/admin/products/:id/chariow-link", async (c) => {
    const denied = await requireAdmin(c);
    if (denied) return denied;

    const body = await readJson(c);
    if (!body) return badRequest("JSON invalide.");
    const chariowProductId =
      typeof body.chariowProductId === "string" ? body.chariowProductId.trim() : "";
    if (!chariowProductId || chariowProductId.length > CHARIOW_PRODUCT_ID_MAX) {
      return badRequest("Identifiant produit Chariow invalide (chaîne non vide, 120 caractères maximum).");
    }

    const db = c.env.DB;
    const productId = c.req.param("id");
    const arsenalProduct = await db
      .prepare(
        `SELECT id, title, fulfillment_method, chariow_product_id, chariow_discount_code
           FROM products WHERE id = ?`
      )
      .bind(productId)
      .first<{
        id: string;
        title: string;
        fulfillment_method: string | null;
        chariow_product_id: string | null;
        chariow_discount_code: string | null;
      }>();
    if (!arsenalProduct) return notFound("Produit Arsenal introuvable.");

    const apiKey = await readChariowApiKey(db);
    if (!apiKey) return notConfigured("Clé API Chariow non configurée — vérification impossible.");

    // Vérification RÉELLE avant tout enregistrement (aucun lien sur une supposition).
    const check = await readChariowProduct(apiKey, chariowProductId);
    const checks = {
      exists: check.ok,
      isFree: check.ok ? check.data.isFree : null,
      isPublished: check.ok ? isPublishedStatus(check.data.status) : null,
    };
    if (!check.ok) {
      // 404 Chariow = produit inexistant → 400 (le lien est refusé).
      // Toute autre anomalie (réseau, 401, 429, 5xx) → 502 : on n'enregistre rien.
      if (check.httpStatus !== 404) return upstreamError(check.error);
      return c.json(
        {
          ok: false,
          error: check.error,
          product: null,
          checks,
          warnings: ["Aucun lien enregistré : la vérification du produit Chariow a échoué."],
        },
        400
      );
    }

    const chariowProduct = check.data;
    const method = normalizeFulfillmentMethod(arsenalProduct.fulfillment_method);
    const warnings: string[] = [];

    // Contraintes RÉELLES du checkout API (audit `06-…`) — avertissements factuels.
    if (checks.isPublished === false) {
      warnings.push(
        `Le produit Chariow n'est pas publié (statut « ${chariowProduct.status} ») : ` +
          "le checkout API exige un produit publié (404 sinon)."
      );
    }
    if (chariowProduct.type && CHECKOUT_UNSUPPORTED_TYPES.includes(chariowProduct.type)) {
      warnings.push(
        `Type Chariow « ${chariowProduct.type} » : refusé par l'API checkout (422). ` +
          "Utilisez la méthode de fulfillment « manuelle » pour ce produit."
      );
    }
    if (method === "chariow_free_checkout" && checks.isFree !== true) {
      warnings.push(
        "La méthode de fulfillment de ce produit est « chariow_free_checkout » : le produit " +
          "Chariow doit être en modèle de tarification « Gratuit », sinon chaque achat échouera " +
          "avec le motif « step payment »."
      );
    }
    if (method === "chariow_discount_checkout") {
      if (checks.isFree === true) {
        warnings.push(
          "La méthode de fulfillment de ce produit est « chariow_discount_checkout » (code promo), " +
            "mais ce produit Chariow est en modèle « Gratuit » : aucun code promo n'est nécessaire — " +
            "la méthode « chariow_free_checkout » correspond à ce cas."
        );
      } else if (!(arsenalProduct.chariow_discount_code ?? "").trim()) {
        warnings.push(
          "Aucun code promo n'est renseigné dans le formulaire produit : renseignez " +
            "« Code promo Chariow » (créé manuellement dans Chariow → Marketing → Réductions), " +
            "sinon chaque achat échouera en échec de configuration."
        );
      }
    }
    if (method === "manual") {
      warnings.push(
        "La méthode de fulfillment de ce produit est « manuelle » : lier un produit Chariow " +
          "n'active pas la livraison automatique (l'admin marque la commande livrée)."
      );
    }
    if (chariowProduct.hasVariantPricing === true) {
      warnings.push(
        "Ce produit Chariow a une tarification par variantes : Arsenal n'envoie pas " +
          "« price_variant_id », la commande peut viser la variante par défaut."
      );
    }
    if ((arsenalProduct.chariow_product_id ?? "").trim() === chariowProductId) {
      warnings.push("Ce produit Arsenal est déjà lié à ce produit Chariow (aucun changement).");
    }

    // Autre produit Arsenal déjà lié à la même référence Chariow ?
    const others = await db
      .prepare("SELECT id, title FROM products WHERE chariow_product_id = ? AND id != ? LIMIT 1")
      .bind(chariowProductId, productId)
      .first<{ id: string; title: string }>();
    if (others) {
      warnings.push(
        `Le produit Arsenal « ${others.title} » est déjà lié à ce produit Chariow : ` +
          "deux produits Arsenal peuvent pointer vers le même produit Chariow, vérifiez que c'est voulu."
      );
    }

    const now = Date.now();
    // UPDATE ciblé : une seule colonne modifiée, le reste de la fiche est préservé.
    const results = await db.batch([
      db
        .prepare("UPDATE products SET chariow_product_id = ?, updated_at = ? WHERE id = ?")
        .bind(chariowProductId, now, productId),
      securityEventStatement(db, {
        actor: "admin",
        action: "admin_chariow_link",
        ipHash: ipHashOf(c.req.header("cf-connecting-ip")),
        meta: {
          productId,
          chariowProductId,
          previousChariowProductId: arsenalProduct.chariow_product_id ?? null,
          checks,
          warnings: warnings.length,
        },
      }),
    ]);
    // 0 ligne modifiée : soit le produit a disparu entre la lecture et
    // l'écriture, soit D1 ne compte pas une ré-écriture à l'identique —
    // on revérifie l'existence pour ne jamais refuser un lien idempotent.
    if (changesOf(results[0]) === 0) {
      const stillThere = await db
        .prepare("SELECT id FROM products WHERE id = ?")
        .bind(productId)
        .first<{ id: string }>();
      if (!stillThere) return notFound("Produit Arsenal introuvable.");
    }

    return c.json({
      ok: true,
      product: chariowProduct,
      checks,
      warnings,
    });
  });
