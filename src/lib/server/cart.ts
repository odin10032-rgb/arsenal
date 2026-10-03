/**
 * Arsenal — Panier (migration 0010). Fonctions pures recevant `D1Database`
 * (même style que store.ts / user-auth.ts : le Worker fournit `env.DB`).
 *
 * Principes :
 * • Un panier a UN porteur : `visitor_token` (visiteur) ou `user_id` (connecté).
 *   Le rattachement visiteur → compte est une FUSION SIMPLE : on réassigne la
 *   ligne `carts` (user_id = <compte>, visitor_token = NULL). Pas de fusion
 *   d'articles : un visiteur qui se connecte n'a, dans la pratique, qu'un seul
 *   panier — celui de son navigateur (voir `resolveCart`).
 * • Aucune confiance au client pour les PRIX : ils sont relus de `products` à
 *   chaque lecture (`getCartView`). Seule la QUANTITÉ est fournie par le client,
 *   normalisée ici (entier 1..99).
 * • Le prix en A (`priceA`) n'est renvoyé QUE si le porteur est membre ; les
 *   visiteurs et simples utilisateurs ne voient que le prix public (`price`).
 */
import { isMember } from "./user-auth";

/* -------------------------------- Constantes -------------------------------- */

/** Quantité maximale par article (bornes du contrat). */
export const CART_MAX_QUANTITY = 99;
/** Taille attendue d'un visitor_token (opaque, base64url sans padding sur 24 o). */
export const VISITOR_TOKEN_LENGTH = 32;
/** Longueur maximale tolérée d'un visitor_token reçu (défense en profondeur). */
export const VISITOR_TOKEN_MAX_LENGTH = 128;

/* --------------------------------- Types --------------------------------- */

export interface CartRow {
  id: string;
  user_id: string | null;
  visitor_token: string | null;
  created_at: number;
  updated_at: number;
}

export interface CartItemRow {
  id: string;
  cart_id: string;
  product_id: string;
  quantity: number;
  added_at: number;
}

/** Article affiché : le prix vient TOUJOURS de `products`, jamais du client. */
export interface CartItemView {
  id: string;
  productId: string;
  title: string;
  imageUrl: string;
  /** Prix public affiché (FCFA, chaîne telle que saisie par l'admin). */
  price: string;
  /**
   * Prix en A — UNIQUEMENT pour un porteur membre (sinon absent). Le front ne
   * doit jamais s'en servir comme montant à débiter : l'achat en A passe par
   * le canal existant (POST /api/purchases).
   */
  priceA?: number;
  quantity: number;
  addedAt: number;
  /** Sous-total en A (membre uniquement) — confort d'affichage, jamais débité. */
  subtotalA?: number;
}

export interface CartView {
  cartId: string;
  itemCount: number;
  items: CartItemView[];
}

/* ------------------------------ Validation ------------------------------ */

/**
 * Normalisation d'une quantité reçue : entier 1..99, ou `null` si invalide
 * (l'appelant décide alors de la réponse — jamais de valeur inventée).
 */
export function normalizeQuantity(raw: unknown, fallback = 1): number | null {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return Number.isFinite(fallback) ? Math.trunc(fallback) : null;
  const q = Math.trunc(n);
  if (q < 1 || q > CART_MAX_QUANTITY) return null;
  return q;
}

/**
 * Le visitor_token est OPAQUE : on ne vérifie ni sa sémantique ni son origine,
 * seulement sa forme (chaîne non vide, bornée, sans espaces). Un token trop
 * long est refusé (défense en profondeur : il devient une clé d'index).
 */
export function isValidVisitorToken(raw: unknown): raw is string {
  return (
    typeof raw === "string" &&
    raw.length > 0 &&
    raw.length <= VISITOR_TOKEN_MAX_LENGTH &&
    /^[A-Za-z0-9_-]+$/.test(raw)
  );
}

/** Identifiant de produit plausible (uuid Arsenal) — borné, jamais interprété. */
export function normalizeProductId(raw: unknown): string | null {
  const id = typeof raw === "string" ? raw.trim() : "";
  if (!id || id.length > 64) return null;
  return id;
}

/* ---------------------------- Chargement panier ---------------------------- */

/** Panier d'un visiteur (par visitor_token), ou null. */
export async function getCartByVisitorToken(
  db: D1Database,
  visitorToken: string
): Promise<CartRow | null> {
  const row = await db
    .prepare("SELECT * FROM carts WHERE visitor_token = ?")
    .bind(visitorToken)
    .first<CartRow>();
  return row ?? null;
}

/** Panier d'un utilisateur connecté (par user_id), ou null. */
export async function getCartByUserId(db: D1Database, userId: string): Promise<CartRow | null> {
  const row = await db
    .prepare("SELECT * FROM carts WHERE user_id = ?")
    .bind(userId)
    .first<CartRow>();
  return row ?? null;
}

/**
 * Crée un panier pour un porteur. `visitorToken` est ignoré si `userId` est
 * fourni (un connecté n'a jamais de panier visiteur). Retourne la ligne créée.
 */
export async function createCart(
  db: D1Database,
  owner: { userId?: string | null; visitorToken?: string | null }
): Promise<CartRow> {
  const now = Date.now();
  const cart: CartRow = {
    id: crypto.randomUUID(),
    user_id: owner.userId ?? null,
    visitor_token: owner.userId ? null : (owner.visitorToken ?? null),
    created_at: now,
    updated_at: now,
  };
  await db
    .prepare(
      "INSERT INTO carts (id, user_id, visitor_token, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(cart.id, cart.user_id, cart.visitor_token, cart.created_at, cart.updated_at)
    .run();
  return cart;
}

/** Touche `updated_at` (marqueur d'activité, aussi base des abandons). */
async function touchCart(db: D1Database, cartId: string): Promise<void> {
  await db
    .prepare("UPDATE carts SET updated_at = ? WHERE id = ?")
    .bind(Date.now(), cartId)
    .run();
}

/**
 * Résout (crée au besoin) le panier du porteur. C'est LA fonction de fusion :
 *
 * • Connecté (`userId`) → s'il a déjà un panier, on le retourne ; sinon, si un
 *   panier visiteur existe pour ce navigateur, on le RÉASSIGNE au compte
 *   (fusion simple : la ligne garde ses articles, seul le porteur change) ;
 *   sinon on crée un panier vide.
 * • Visiteur → s'il a déjà un panier, on le retourne ; sinon on le crée.
 *
 * ⚠️ Limite connue : si un utilisateur connecté possédait DÉJÀ un panier et
 * qu'un panier visiteur subsiste pour le même navigateur, le panier visiteur
 * n'est PAS fusionné dans celui du compte (on ne mélange pas deux contenants
 * sans règle métier explicite). Il reste orphelin, sans impact (il expirera
 * comme un abandon).
 */
export async function resolveCart(
  db: D1Database,
  owner: { userId?: string | null; visitorToken?: string | null }
): Promise<CartRow> {
  const userId = owner.userId ?? null;
  const visitorToken = owner.visitorToken ?? null;

  if (userId) {
    const mine = await getCartByUserId(db, userId);
    if (mine) return mine;

    // Récupération du panier visiteur du même navigateur (si le token est fourni).
    if (visitorToken) {
      const orphan = await getCartByVisitorToken(db, visitorToken);
      if (orphan && !orphan.user_id) {
        await db
          .prepare("UPDATE carts SET user_id = ?, visitor_token = NULL, updated_at = ? WHERE id = ?")
          .bind(userId, Date.now(), orphan.id)
          .run();
        return { ...orphan, user_id: userId, visitor_token: null, updated_at: Date.now() };
      }
    }
    return createCart(db, { userId });
  }

  if (!visitorToken) throw new Error("visitor_token requis pour un porteur visiteur.");

  const existing = await getCartByVisitorToken(db, visitorToken);
  if (existing) return existing;
  return createCart(db, { visitorToken });
}

/* ------------------------------ Articles ------------------------------ */

/** Un produit existe-t-il ? (le client ne peut pas ajouter un id inventé) */
export async function productExists(db: D1Database, productId: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS one FROM products WHERE id = ?")
    .bind(productId)
    .first<{ one: number }>();
  return row != null;
}

/**
 * Ajoute un article au panier (ou incrémente la quantité existante).
 * Retourne `null` si le produit n'existe pas ou si la quantité est invalide.
 * La quantité finale est bornée à CART_MAX_QUANTITY.
 */
export async function addItem(
  db: D1Database,
  cartId: string,
  productId: string,
  quantity: number
): Promise<CartItemRow | null> {
  if (!(await productExists(db, productId))) return null;

  const existing = await db
    .prepare("SELECT * FROM cart_items WHERE cart_id = ? AND product_id = ?")
    .bind(cartId, productId)
    .first<CartItemRow>();

  const now = Date.now();
  if (existing) {
    const next = Math.min(CART_MAX_QUANTITY, Number(existing.quantity) + quantity);
    await db
      .prepare("UPDATE cart_items SET quantity = ? WHERE id = ?")
      .bind(next, existing.id)
      .run();
    await touchCart(db, cartId);
    return { ...existing, quantity: next };
  }

  const item: CartItemRow = {
    id: crypto.randomUUID(),
    cart_id: cartId,
    product_id: productId,
    quantity,
    added_at: now,
  };
  await db
    .prepare(
      "INSERT INTO cart_items (id, cart_id, product_id, quantity, added_at) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(item.id, item.cart_id, item.product_id, item.quantity, item.added_at)
    .run();
  await touchCart(db, cartId);
  return item;
}

/** Retire un article — false si l'article n'appartient pas à ce panier. */
export async function removeItem(
  db: D1Database,
  cartId: string,
  itemId: string
): Promise<boolean> {
  const res = await db
    .prepare("DELETE FROM cart_items WHERE id = ? AND cart_id = ?")
    .bind(itemId, cartId)
    .run();
  const removed = Number(res.meta?.changes ?? 0) > 0;
  if (removed) await touchCart(db, cartId);
  return removed;
}

/**
 * Fixe la quantité d'un article (1..99). `quantity <= 0` = suppression.
 * Retourne `removed` si l'article n'existe plus / n'appartient pas au panier.
 */
export async function setItemQuantity(
  db: D1Database,
  cartId: string,
  itemId: string,
  quantity: number
): Promise<"updated" | "removed" | "missing"> {
  const existing = await db
    .prepare("SELECT id FROM cart_items WHERE id = ? AND cart_id = ?")
    .bind(itemId, cartId)
    .first<{ id: string }>();
  if (!existing) return "missing";

  if (quantity <= 0) {
    await removeItem(db, cartId, itemId);
    return "removed";
  }

  const q = Math.min(CART_MAX_QUANTITY, Math.trunc(quantity));
  await db.prepare("UPDATE cart_items SET quantity = ? WHERE id = ?").bind(q, itemId).run();
  await touchCart(db, cartId);
  return "updated";
}

/* ------------------------------- Lecture ------------------------------- */

interface CartProductRow {
  id: string;
  title: string;
  image_url: string;
  price: string;
  price_a: number | null;
}

/**
 * Contenu du panier enrichi des données PRODUIT (titre, image, prix relus de
 * la base). `priceA` n'est inclus que pour un porteur MEMBRE : c'est ici, et
 * nulle part ailleurs, que se décide l'exposition du prix en A.
 */
export async function getCartView(
  db: D1Database,
  cartId: string,
  user: { membership?: string | null } | null
): Promise<CartView> {
  const { results = [] } = await db
    .prepare(
      `SELECT ci.id AS item_id, ci.quantity, ci.added_at,
              p.id AS product_id, p.title, p.image_url, p.price, p.price_a
         FROM cart_items ci
         JOIN products p ON p.id = ci.product_id
        WHERE ci.cart_id = ?
        ORDER BY ci.added_at ASC`
    )
    .bind(cartId)
    .all<{
      item_id: string;
      quantity: number;
      added_at: number;
      product_id: string;
      title: string;
      image_url: string;
      price: string;
      price_a: number | null;
    }>();

  const member = user != null && isMember(user);
  const items: CartItemView[] = results.map((r) => {
    const quantity = Number(r.quantity) || 1;
    const item: CartItemView = {
      id: r.item_id,
      productId: r.product_id,
      title: r.title,
      imageUrl: r.image_url,
      price: r.price,
      quantity,
      addedAt: Number(r.added_at),
    };
    if (member) {
      const priceA = Number(r.price_a ?? 0) || 0;
      item.priceA = priceA;
      item.subtotalA = priceA * quantity;
    }
    return item;
  });

  return {
    cartId,
    itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
    items,
  };
}

/* ------------------------------ Abandons ------------------------------ */

export interface AbandonedCartRow extends CartRow {
  item_count: number;
}

/**
 * Paniers inactifs depuis `idleSince` (ms epoch) — base des « achats
 * abandonnés » (admin, vague 5). Aucune table dédiée : un panier non converti
 * EST un abandon (voir migration 0010). Fonction fournie pour que la vague 5
 * n'invente pas un second accès aux données.
 */
export async function listAbandonedCarts(
  db: D1Database,
  idleSince: number,
  limit = 100
): Promise<AbandonedCartRow[]> {
  const { results = [] } = await db
    .prepare(
      `SELECT c.*, COUNT(ci.id) AS item_count
         FROM carts c
         LEFT JOIN cart_items ci ON ci.cart_id = c.id
        WHERE c.updated_at < ?
        GROUP BY c.id
       HAVING item_count > 0
        ORDER BY c.updated_at DESC
        LIMIT ?`
    )
    .bind(idleSince, Math.trunc(limit))
    .all<AbandonedCartRow>();
  return results.map((r) => ({ ...r, item_count: Number(r.item_count) }));
}
