import { Hono } from "hono";
import { bearerToken, getAuthContext } from "../../src/lib/server/user-auth";
import {
  addItem,
  getCartView,
  isValidVisitorToken,
  normalizeProductId,
  normalizeQuantity,
  removeItem,
  resolveCart,
  setItemQuantity,
} from "../../src/lib/server/cart";
import type { App, Env } from "../env";

/**
 * Panier (migration 0010) — routes PUBLIQUES, identifiées par le PORTEUR.
 *
 * Aucune authentification n'est exigée : un visiteur sans compte doit pouvoir
 * remplir un panier. Chaque requête ne peut agir que sur SON panier :
 * • porteur visiteur → `visitorToken` (corps pour POST, en-tête `X-Visitor-Token`
 *   pour GET/PATCH/DELETE, qu'on ne peut pas mettre dans un corps de GET) ;
 * • porteur connecté → `Authorization: Bearer` (facultatif : un utilisateur
 *   connecté qui n'envoie pas de Bearer reste traité comme visiteur).
 *
 * Règle de sécurité : un panier n'est jamais accessible par son seul `cartId` —
 * le porteur est TOUJOURS revérifié, item par item (voir `requireCart`).
 */

/** Extrait le visitorToken selon la méthode (corps JSON ou en-tête). */
async function readVisitorToken(c: {
  req: { header: (n: string) => string | undefined; json: () => Promise<unknown> };
}): Promise<string | null> {
  const header = c.req.header("x-visitor-token");
  if (header) return header;
  try {
    const body = (await c.req.json()) as { visitorToken?: unknown };
    if (typeof body?.visitorToken === "string") return body.visitorToken;
  } catch {
    /* corps absent ou non-JSON : pas de token */
  }
  return null;
}

/**
 * Contexte porteur d'une requête : `userId` si un Bearer valide est présent
 * (silencieux en cas d'absence/expiration — le visiteur n'est pas rejeté),
 * `visitorToken` sinon. Exige au moins l'un des deux.
 */
async function readOwner(
  db: D1Database,
  c: { req: { header: (n: string) => string | undefined; json: () => Promise<unknown> } }
): Promise<{ userId: string | null; visitorToken: string | null } | null> {
  const token = bearerToken(c.req.header("authorization"));
  let userId: string | null = null;
  if (token) {
    const auth = await getAuthContext(db, token);
    if (auth) userId = auth.user.id;
  }
  const visitorToken = await readVisitorToken(c);
  if (!userId && !isValidVisitorToken(visitorToken)) return null;
  return { userId, visitorToken: userId ? null : (visitorToken as string) };
}

/** Lecture de l'adhésion du porteur connecté (décide de l'exposition du prix A). */
async function readMembership(
  db: D1Database,
  userId: string
): Promise<{ membership?: string | null } | null> {
  return (
    (await db
      .prepare("SELECT membership FROM users WHERE id = ?")
      .bind(userId)
      .first<{ membership: string | null }>()) ?? null
  );
}

const INVALID_OWNER = { ok: false, error: "Panier introuvable ou porteur invalide." } as const;

/** Réponse commune : contenu du panier relu (prix produits côté serveur). */
async function cartResponse(
  db: D1Database,
  cartId: string,
  user: { membership?: string | null } | null,
  status: 200 | 201 = 200
) {
  const view = await getCartView(db, cartId, user);
  return { status, body: { ok: true, cartId, itemCount: view.itemCount, items: view.items } };
}

export const cartRoutes: App = new Hono<{ Bindings: Env }>()
  /** POST /api/cart/resolve — crée/retourne le panier du porteur (fusion visiteur → compte). */
  .post("/api/cart/resolve", async (c) => {
    const owner = await readOwner(c.env.DB, c);
    if (!owner) return c.json(INVALID_OWNER, 400);

    const user = owner.userId ? await readMembership(c.env.DB, owner.userId) : null;
    const cart = await resolveCart(c.env.DB, owner);
    const view = await getCartView(c.env.DB, cart.id, user);
    return c.json({
      ok: true,
      cartId: cart.id,
      // Le client réutilise ce token : un visiteur le conserve ; un connecté
      // reçoit null (son panier suit désormais le compte).
      visitorToken: cart.visitor_token,
      itemCount: view.itemCount,
      items: view.items,
    });
  })
  /** GET /api/cart?cartId=… — contenu + prix PRODUIT relus côté serveur. */
  .get("/api/cart", async (c) => {
    const routeCartId = c.req.query("cartId");
    if (!routeCartId) return c.json(INVALID_OWNER, 400);

    const owner = await readOwner(c.env.DB, c);
    if (!owner) return c.json(INVALID_OWNER, 400);

    const cart = await resolveCart(c.env.DB, owner);
    if (cart.id !== routeCartId) return c.json(INVALID_OWNER, 404);

    const user = owner.userId ? await readMembership(c.env.DB, owner.userId) : null;
    const { body } = await cartResponse(c.env.DB, cart.id, user);
    return c.json(body);
  })
  /** POST /api/cart/items — ajoute (ou incrémente) un article. */
  .post("/api/cart/items", async (c) => {
    const owner = await readOwner(c.env.DB, c);
    if (!owner) return c.json(INVALID_OWNER, 400);

    let body: { productId?: unknown; quantity?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ ok: false, error: "JSON invalide." }, 400);
    }

    const productId = normalizeProductId(body.productId);
    if (!productId) return c.json({ ok: false, error: "Produit invalide." }, 400);

    const quantity = normalizeQuantity(body.quantity, 1);
    if (quantity === null) {
      return c.json({ ok: false, error: "Quantité invalide (entier de 1 à 99)." }, 400);
    }

    const cart = await resolveCart(c.env.DB, owner);
    const item = await addItem(c.env.DB, cart.id, productId, quantity);
    if (!item) return c.json({ ok: false, error: "Produit introuvable." }, 404);

    const user = owner.userId ? await readMembership(c.env.DB, owner.userId) : null;
    const { status, body: res } = await cartResponse(c.env.DB, cart.id, user, 201);
    return c.json(res, status);
  })
  /** PATCH /api/cart/items/:id — quantité (0 = suppression). */
  .patch("/api/cart/items/:id", async (c) => {
    const owner = await readOwner(c.env.DB, c);
    if (!owner) return c.json(INVALID_OWNER, 400);

    let body: { quantity?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ ok: false, error: "JSON invalide." }, 400);
    }

    const raw = typeof body.quantity === "number" ? body.quantity : Number(body.quantity);
    // 0 = suppression explicite ; toute valeur hors [0, 99] est refusée.
    if (!Number.isFinite(raw) || raw < 0 || raw > 99) {
      return c.json({ ok: false, error: "Quantité invalide (0 à 99)." }, 400);
    }

    const cart = await resolveCart(c.env.DB, owner);
    const result = await setItemQuantity(c.env.DB, cart.id, c.req.param("id"), Math.trunc(raw));
    if (result === "missing") return c.json({ ok: false, error: "Article introuvable." }, 404);

    const user = owner.userId ? await readMembership(c.env.DB, owner.userId) : null;
    const { body: res } = await cartResponse(c.env.DB, cart.id, user);
    return c.json(res);
  })
  /** DELETE /api/cart/items/:id — retire un article. */
  .delete("/api/cart/items/:id", async (c) => {
    const owner = await readOwner(c.env.DB, c);
    if (!owner) return c.json(INVALID_OWNER, 400);

    const cart = await resolveCart(c.env.DB, owner);
    const removed = await removeItem(c.env.DB, cart.id, c.req.param("id"));
    if (!removed) return c.json({ ok: false, error: "Article introuvable." }, 404);

    const user = owner.userId ? await readMembership(c.env.DB, owner.userId) : null;
    const { body } = await cartResponse(c.env.DB, cart.id, user);
    return c.json(body);
  });
