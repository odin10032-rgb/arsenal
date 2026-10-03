/**
 * Arsenal Tools — panier côté client (visiteurs ET membres).
 *
 * Le panier doit marcher SANS compte : le visiteur est identifié par un
 * `visitorToken` opaque, généré une seule fois côté client
 * (crypto.getRandomValues → base64url) et conservé en localStorage. Il est
 * transmis à l'API :
 *  • en corps JSON pour POST ;
 *  • en en-tête `X-Visitor-Token` pour GET/PATCH/DELETE (un GET n'a pas de corps).
 *
 * Un cache localStorage (« arsenal_cart_cache ») permet l'affichage immédiat
 * (compteur d'articles pour un badge, contenu de la page panier) avant la
 * revalidation réseau, et un événement DOM « arsenal-cart-changed » synchronise
 * les composants (pattern identique à lib/user-auth.ts).
 *
 * ⚠️ Aucun prix n'est calculé ici : le serveur relit toujours `products`. Le
 * `priceA` n'est renvoyé par l'API QUE pour un membre — pour un visiteur ou un
 * simple utilisateur, il est simplement absent des réponses.
 */

import { API_URL, ApiError, apiFetch } from "./api";
import { getToken } from "./user-auth";

export const VISITOR_TOKEN_KEY = "arsenal_visitor_token";
export const CART_CACHE_KEY = "arsenal_cart_cache";
export const CART_ID_KEY = "arsenal_cart_id";
export const CART_CHANGED_EVENT = "arsenal-cart-changed";

/* -------------------------------- Types -------------------------------- */

/** Article du panier tel que renvoyé par l'API (prix relus côté serveur). */
export interface CartItem {
  id: string;
  productId: string;
  title: string;
  imageUrl: string;
  /** Prix public affiché (FCFA). */
  price: string;
  /** Prix en A — présent UNIQUEMENT pour un porteur membre. */
  priceA?: number;
  quantity: number;
  addedAt: number;
  /** Sous-total en A (membre) — confort d'affichage, jamais débité. */
  subtotalA?: number;
}

export interface Cart {
  cartId: string;
  itemCount: number;
  items: CartItem[];
}

const EMPTY_CART: Cart = { cartId: "", itemCount: 0, items: [] };

/* ------------------------------ Visitor token ------------------------------ */

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Token visiteur : généré UNE SEULE fois (24 o aléatoires → 32 caractères
 * base64url, format accepté par l'API) puis conservé en localStorage.
 */
export function getVisitorToken(): string {
  try {
    const existing = localStorage.getItem(VISITOR_TOKEN_KEY);
    if (existing) return existing;
    const token = toBase64Url(crypto.getRandomValues(new Uint8Array(24)));
    localStorage.setItem(VISITOR_TOKEN_KEY, token);
    return token;
  } catch {
    // Storage indisponible (navigation privée stricte) : token éphémère en
    // mémoire — le panier fonctionne le temps de l'onglet, sans persistance.
    return toBase64Url(crypto.getRandomValues(new Uint8Array(24)));
  }
}

/* --------------------------------- Cache --------------------------------- */

export function readCartCache(): Cart | null {
  try {
    const raw = localStorage.getItem(CART_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cart;
    return parsed && Array.isArray(parsed.items) ? parsed : null;
  } catch {
    return null;
  }
}

function writeCartCache(cart: Cart): void {
  try {
    localStorage.setItem(CART_CACHE_KEY, JSON.stringify(cart));
    if (cart.cartId) localStorage.setItem(CART_ID_KEY, cart.cartId);
  } catch {
    /* on ignore */
  }
}

function readCartId(): string {
  try {
    return localStorage.getItem(CART_ID_KEY) || "";
  } catch {
    return "";
  }
}

/** Notifie les composants (compteur du badge, page panier) d'un changement. */
export function emitCartChanged(): void {
  try {
    window.dispatchEvent(new CustomEvent(CART_CHANGED_EVENT));
  } catch {
    /* hors navigateur : on ignore */
  }
}

/** Compteur d'articles depuis le cache (pour un badge immédiat, sans réseau). */
export function cachedItemCount(): number {
  return readCartCache()?.itemCount ?? 0;
}

/* ------------------------------ Appels API ------------------------------ */

interface CartApiResponse {
  ok: boolean;
  cartId: string;
  visitorToken?: string | null;
  itemCount: number;
  items: CartItem[];
}

function toCart(res: CartApiResponse): Cart {
  return { cartId: res.cartId, itemCount: res.itemCount, items: res.items };
}

/** En-têtes porteur pour un fetch direct : Bearer si connecté, sinon le token visiteur. */
function cartHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "X-Visitor-Token": getVisitorToken() };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

/**
 * POST /api/cart/resolve — crée/retourne le panier du porteur.
 * Si un Bearer valide est présent, le serveur rattache le panier visiteur au
 * compte (fusion simple). À appeler à l'arrivée sur le panier et après connexion.
 */
export async function resolveCart(): Promise<Cart> {
  const res = await apiFetch<CartApiResponse>("/api/cart/resolve", {
    method: "POST",
    body: { visitorToken: getVisitorToken() },
    bearer: true,
    timeoutMs: 5000,
  });
  const cart = toCart(res);
  writeCartCache(cart);
  emitCartChanged();
  return cart;
}

/** Appel d'écriture (POST/PATCH/DELETE) avec en-têtes porteur + corps JSON.
 *  `apiFetch` n'autorise ni PATCH ni en-tête libre : on passe donc par fetch. */
async function mutate(
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  body?: Record<string, unknown>
): Promise<Cart> {
  const headers = cartHeaders();
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new ApiError(
      typeof json.error === "string" ? json.error : `Erreur ${res.status}`,
      res.status,
      json
    );
  }
  const cart = toCart(json as unknown as CartApiResponse);
  writeCartCache(cart);
  emitCartChanged();
  return cart;
}

/** GET /api/cart — contenu relu côté serveur (nécessite le cartId résolu). */
export async function fetchCart(): Promise<Cart> {
  const cartId = readCartId();
  if (!cartId) return resolveCart();
  const res = await fetch(`${API_URL}/api/cart?cartId=${encodeURIComponent(cartId)}`, {
    headers: cartHeaders(),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new ApiError(
      typeof json.error === "string" ? json.error : `Erreur ${res.status}`,
      res.status,
      json
    );
  }
  const cart = toCart(json as unknown as CartApiResponse);
  writeCartCache(cart);
  emitCartChanged();
  return cart;
}

/** POST /api/cart/items — ajoute (ou incrémente) un article. */
export async function addToCart(productId: string, quantity = 1): Promise<Cart> {
  return mutate("POST", "/api/cart/items", {
    productId,
    quantity,
    visitorToken: getVisitorToken(),
  });
}

/** PATCH /api/cart/items/:id — quantité (0 = suppression). */
export async function setItemQuantity(itemId: string, quantity: number): Promise<Cart> {
  return mutate("PATCH", `/api/cart/items/${encodeURIComponent(itemId)}`, {
    quantity,
    visitorToken: getVisitorToken(),
  });
}

/** DELETE /api/cart/items/:id — retire un article. */
export async function removeItem(itemId: string): Promise<Cart> {
  return mutate("DELETE", `/api/cart/items/${encodeURIComponent(itemId)}`);
}

/** Vide le cache local (après un échec de session, par exemple). */
export function clearCartCache(): void {
  try {
    localStorage.removeItem(CART_CACHE_KEY);
    localStorage.removeItem(CART_ID_KEY);
  } catch {
    /* on ignore */
  }
  emitCartChanged();
}

export { EMPTY_CART };
