/**
 * Arsenal — LECTURES de l'API Chariow (onglet admin « Chariow »).
 *
 * Audit des capacités réelles : docs/chantier/06-audit-chariow-fulfillment.md.
 * L'API Chariow est en **LECTURE SEULE** sur les produits (19 chemins, aucun
 * POST/PUT/PATCH/DELETE sur `/products`) : Arsenal peut donc uniquement LISTER,
 * VÉRIFIER et LIER un produit existant — jamais le créer ni l'éditer.
 *
 * Seuls des endpoints OFFICIELS sont appelés (OpenAPI 3.1.0, base
 * `https://api.chariow.com/v1`) :
 * - `GET /store`                      → `{ message, data: Store }` ;
 * - `GET /products?per_page=&cursor=` → `{ message, data: { data: Product[], pagination } }` ;
 * - `GET /products/{productId}`       → `{ message, data: Product }` (404 si absent).
 *
 * Lecture DÉFENSIVE et AUCUNE exception qui remonte : toute anomalie (réseau,
 * timeout, JSON illisible, HTTP non-2xx, champ manquant) devient un résultat
 * typé. Les valeurs absentes restent `null` — jamais devinées.
 */

import { CHARIOW_API_BASE, CHARIOW_TIMEOUT_MS } from "./chariow-checkout";

/* -------------------------------- Types -------------------------------- */

/** Montant Chariow (`Amount` de l'OpenAPI) — lu tel quel, jamais recalculé. */
export interface ChariowAmount {
  value: number | null;
  formatted: string | null;
  currency: string | null;
}

/** Boutique Chariow (sous-ensemble de `Store`). */
export interface ChariowStoreSummary {
  id: string | null;
  name: string | null;
  /** URL officielle de la boutique (`Store.url`) — le « domain » de l'admin. */
  domain: string | null;
  status: string | null;
}

/** Produit Chariow (sous-ensemble de `Product`). */
export interface ChariowProductSummary {
  id: string;
  name: string;
  slug: string | null;
  /** downloadable | course | license | service | bundle | coaching (OpenAPI). */
  type: string | null;
  status: string | null;
  isFree: boolean | null;
  price: ChariowAmount | null;
  /** Tarification par variantes : Arsenal n'envoie pas `price_variant_id`. */
  hasVariantPricing: boolean | null;
}

/** Résultat typé d'une lecture — jamais d'exception. */
export type ChariowRead<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; httpStatus: number | null };

/* --------------------------- Lecture défensive --------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Lecture d'un chemin `a.b.c` — undefined si un maillon manque. */
function readPath(source: unknown, path: string): unknown {
  let current: unknown = source;
  for (const segment of path.split(".")) {
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }
  return current;
}

/** Première valeur NON VIDE parmi plusieurs chemins (aucun champ déduit du néant). */
function readFirst(source: unknown, paths: string[]): unknown {
  for (const path of paths) {
    const value = readPath(source, path);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function readString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === 0) return value === 1;
  return null;
}

/** `Amount` de l'OpenAPI : `{ value, formatted, currency }` — null si absent. */
function readAmount(value: unknown): ChariowAmount | null {
  if (!isRecord(value)) return null;
  const formatted = readString(value.formatted);
  const currency = readString(value.currency);
  const numeric = readNumber(value.value);
  if (formatted === null && currency === null && numeric === null) return null;
  return { value: numeric, formatted, currency };
}

/**
 * Montant « effectif » d'un produit : ordre de préférence EXPLICITE
 * (`pricing.effective` → `pricing.current_price` → `pricing.price`), toutes
 * issues de l'OpenAPI. `null` si aucun n'est exploitable.
 */
function readProductPrice(product: Record<string, unknown>): ChariowAmount | null {
  return (
    readAmount(readPath(product, "pricing.effective")) ??
    readAmount(readPath(product, "pricing.current_price")) ??
    readAmount(readPath(product, "pricing.price"))
  );
}

function readProduct(value: unknown): ChariowProductSummary | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id) ?? readString(value.uuid);
  if (!id) return null; // sans id, aucun lien possible : entrée ignorée
  const slug = readString(value.slug);
  return {
    id,
    name: readString(value.name) ?? slug ?? id,
    slug,
    type: readString(value.type),
    status: readString(value.status),
    isFree: readBoolean(value.is_free),
    price: readProductPrice(value),
    hasVariantPricing: readBoolean(value.has_variant_pricing),
  };
}

/* ------------------------------- Appel HTTP ------------------------------- */

function messageForHttp(status: number, data: unknown): string {
  const detail = readString(readFirst(data, ["message", "error.message", "error", "detail"]));
  const suffix = detail ? ` — ${detail.slice(0, 200)}` : "";
  if (status === 401 || status === 403) return `Clé API Chariow refusée (HTTP ${status}).${suffix}`;
  if (status === 404) return `Produit Chariow introuvable (HTTP 404).${suffix}`;
  if (status === 429) return `Limite de requêtes Chariow atteinte (HTTP 429).${suffix}`;
  return `Chariow a répondu HTTP ${status}.${suffix}`;
}

/**
 * `GET` authentifié sur l'API Chariow (Bearer = clé API), timeout 10 s.
 * Retourne TOUJOURS un résultat typé ; la clé n'est jamais journalisée ni
 * renvoyée par l'appelant.
 */
async function chariowGet(
  apiKey: string,
  path: string
): Promise<ChariowRead<unknown>> {
  const key = (apiKey ?? "").trim();
  if (!key) {
    return { ok: false, error: "Clé API Chariow non configurée.", httpStatus: null };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHARIOW_TIMEOUT_MS);
  try {
    const res = await fetch(`${CHARIOW_API_BASE}${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    if (!res.ok) {
      return { ok: false, error: messageForHttp(res.status, data), httpStatus: res.status };
    }
    return { ok: true, data };
  } catch (err) {
    const aborted =
      err instanceof Error && (err.name === "AbortError" || /abort/i.test(err.message));
    return {
      ok: false,
      error: aborted
        ? `Délai dépassé (${Math.round(CHARIOW_TIMEOUT_MS / 1000)} s) — Chariow n'a pas répondu.`
        : "Erreur réseau lors de l'appel à Chariow.",
      httpStatus: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

/* -------------------------------- Lectures -------------------------------- */

/** `GET /store` — identité de la boutique connectée à la clé API. */
export async function readChariowStore(apiKey: string): Promise<ChariowRead<ChariowStoreSummary>> {
  const res = await chariowGet(apiKey, "/store");
  if (!res.ok) return res;

  // `StoreResponse` : `{ message, data: Store }` (tolérance si le contenu est à la racine).
  const store = isRecord(readPath(res.data, "data")) ? (readPath(res.data, "data") as Record<string, unknown>) : null;
  const source = store ?? (isRecord(res.data) ? (res.data as Record<string, unknown>) : null);
  if (!source) {
    return { ok: false, error: "Réponse Chariow inattendue (boutique illisible).", httpStatus: null };
  }
  return {
    ok: true,
    data: {
      id: readString(source.id),
      name: readString(source.name),
      domain: readString(source.url),
      status: readString(source.status),
    },
  };
}

/** `GET /products/{productId}` (id public OU slug) — vérification d'existence. */
export async function readChariowProduct(
  apiKey: string,
  productId: string
): Promise<ChariowRead<ChariowProductSummary>> {
  const id = (productId ?? "").trim();
  if (!id) {
    return { ok: false, error: "Identifiant produit Chariow manquant.", httpStatus: null };
  }
  const res = await chariowGet(apiKey, `/products/${encodeURIComponent(id)}`);
  if (!res.ok) return res;

  // `ProductResponse` : `{ message, data: Product }` (tolérance si à la racine).
  const product = readProduct(readFirst(res.data, ["data", "product"])) ?? readProduct(res.data);
  if (!product) {
    return { ok: false, error: "Réponse Chariow inattendue (produit illisible).", httpStatus: null };
  }
  return { ok: true, data: product };
}

/**
 * `GET /products?per_page=…` — liste de la boutique (une page, `per_page` ≤ 100
 * conformément à l'OpenAPI). `hasMore` indique qu'il reste des produits au-delà.
 */
export async function readChariowProducts(
  apiKey: string,
  opts: { perPage?: number } = {}
): Promise<ChariowRead<{ items: ChariowProductSummary[]; hasMore: boolean }>> {
  const perPage = Math.min(Math.max(Math.trunc(opts.perPage ?? 100) || 100, 1), 100);
  const res = await chariowGet(apiKey, `/products?per_page=${perPage}`);
  if (!res.ok) return res;

  // `ProductListResponse` : `{ data: { data: Product[], pagination } }` — la
  // racine `data` peut aussi être directement le tableau (tolérance).
  const nested = readPath(res.data, "data.data");
  const candidate = Array.isArray(nested) ? nested : Array.isArray(readPath(res.data, "data")) ? readPath(res.data, "data") : null;
  if (!Array.isArray(candidate)) {
    return { ok: false, error: "Réponse Chariow inattendue (liste de produits illisible).", httpStatus: null };
  }

  const items: ChariowProductSummary[] = [];
  for (const raw of candidate) {
    const product = readProduct(raw);
    if (product) items.push(product);
  }
  return {
    ok: true,
    data: { items, hasMore: readBoolean(readPath(res.data, "data.pagination.has_more")) === true },
  };
}
