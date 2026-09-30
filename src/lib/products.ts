/**
 * Arsenal Tools — Types et constantes métier (miroir de l'API prod)
 */

export type Category = "saas" | "desktop" | "mobile" | "ebook" | "prompts";
export type ActionType = "chariow" | "terminal" | "mobile";
export type Badge = "gratuit" | "premium" | "beta" | "nouveau";

export interface Product {
  id: string;
  title: string;
  shortDescription: string;
  description: string;
  category: Category;
  actionType: ActionType;
  badges: Badge[];
  price: string;
  actionUrl: string;
  apkUrl?: string;
  pwaUrl?: string | null;
  command?: string | null;
  videoUrl?: string | null;
  imageUrl: string;
  clicks: number;
  createdAt: number;
  updatedAt: number;
  /* --- Affiliation (Phase 2) --- */
  affiliateEnabled?: boolean;
  commissionType?: "percent" | "fixed" | null;
  commissionValue?: number | null;
  rewardA?: number;
  /* --- Paiement en A (Phase 2.6 — miroir du backend) --- */
  /** Achetable avec des A (products.purchasable) */
  purchasable?: boolean;
  /** Prix en A (> 0 requis si purchasable) — montant lu de l'API, jamais recalculé */
  priceA?: number;
  /** Id du produit Chariow utilisé par le fulfillment automatique (produit « Gratuit » ou produit d'origine) */
  chariowProductId?: string | null;
  /** manual | chariow_free_checkout | chariow_discount_checkout */
  fulfillmentMethod?: string | null;
  /** Code promo Chariow réservé aux achats en A (méthode chariow_discount_checkout) */
  chariowDiscountCode?: string | null;
}

export const CATEGORIES: Record<Category, string> = {
  saas: "SaaS",
  desktop: "Desktop App",
  mobile: "Mobile App/PWA",
  ebook: "E-book",
  prompts: "Prompts & Automations",
};

export const ACTION_TYPES: Record<ActionType, string> = {
  chariow: "Abonnement / Tunnel (Chariow)",
  terminal: "Terminal / Commande (Desktop & CLI)",
  mobile: "App mobile (APK + PWA)",
};

export const BADGES: Badge[] = ["gratuit", "premium", "beta", "nouveau"];

export const BADGE_LABELS: Record<Badge, string> = {
  gratuit: "Gratuit",
  premium: "Premium",
  beta: "Bêta",
  nouveau: "Nouveau",
};

export type SortMode = "popular" | "recent";

export interface ProductFilters {
  q: string;
  category: Category | "all";
  badges: Badge[];
  sort: SortMode;
}

export const DEFAULT_FILTERS: ProductFilters = {
  q: "",
  category: "all",
  badges: [],
  sort: "popular",
};

/** URLs autorisées uniquement : http(s), data:image, chemins relatifs — bloque javascript: */
export function safeUrl(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return "";
  if (/^(https?:\/\/|data:image\/|\/)/i.test(s)) return s;
  return "";
}

/**
 * Pipeline filtre + tri identique au site validé :
 * - catégorie mono-sélect
 * - badges multi-sélect en ET logique (tous présents)
 * - recherche insensible à la casse sur titre, descriptions, catégorie, type, badges
 * - tri "recent" (date desc) ou "popular" (clics desc, tie-break date desc)
 */
export function filterProducts(
  products: Product[],
  { q, category, badges, sort }: ProductFilters,
): Product[] {
  const query = q.trim().toLowerCase();
  const filtered = products.filter((p) => {
    if (category !== "all" && p.category !== category) return false;
    if (badges.length > 0 && !badges.every((b) => p.badges.includes(b))) return false;
    if (query) {
      const haystack = [
        p.title,
        p.shortDescription,
        p.description,
        CATEGORIES[p.category],
        ACTION_TYPES[p.actionType],
        p.badges.join(" "),
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  return filtered.sort((a, b) => {
    if (sort === "recent") return b.createdAt - a.createdAt;
    if (b.clicks !== a.clicks) return b.clicks - a.clicks;
    return b.createdAt - a.createdAt;
  });
}

/* ---------- Cache local (stale-while-revalidate) ---------- */

const CACHE_KEY = "arsenal_catalog_cache_v3";
const LOCAL_PRODUCTS_KEY = "arsenal_products_v3";
const ADMIN_TOKEN_KEY = "arsenal_admin_token";

export interface CatalogCache {
  version: string;
  products: Product[];
  ts: number;
}

export function readCatalogCache(): CatalogCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CatalogCache;
    if (Array.isArray(parsed?.products) && typeof parsed?.version === "string") return parsed;
    return null;
  } catch {
    return null;
  }
}

export function writeCatalogCache(products: Product[], version: string): void {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ version, products, ts: Date.now() } satisfies CatalogCache),
    );
  } catch {
    /* quota dépassé : on ignore */
  }
}

export function readLocalProducts(): Product[] | null {
  try {
    const raw = localStorage.getItem(LOCAL_PRODUCTS_KEY);
    return raw ? (JSON.parse(raw) as Product[]) : null;
  } catch {
    return null;
  }
}

export function writeLocalProducts(products: Product[]): void {
  try {
    localStorage.setItem(LOCAL_PRODUCTS_KEY, JSON.stringify(products));
    writeCatalogCache(products, `local-${Date.now()}`);
  } catch {
    /* on ignore */
  }
}

/* ---------- Token admin (sessionStorage) ---------- */

export function readAdminToken(): string {
  try {
    return sessionStorage.getItem(ADMIN_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function writeAdminToken(token: string): void {
  try {
    sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
  } catch {
    /* on ignore */
  }
}

export function clearAdminToken(): void {
  try {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {
    /* on ignore */
  }
}
