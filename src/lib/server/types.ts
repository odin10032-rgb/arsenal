export interface Product {
  id: string;
  title: string;
  shortDescription: string;
  description: string;
  category: "saas" | "desktop" | "mobile" | "ebook" | "prompts";
  actionType: "chariow" | "terminal" | "mobile";
  badges: string[];
  price: string;
  actionUrl: string;
  apkUrl?: string;
  pwaUrl?: string;
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
  /* --- Vente en A (Phase 2.6 — migration 0004) --- */
  /** Achetable avec des A (exige `priceA > 0`). */
  purchasable?: boolean;
  /** Prix en A (entier ≥ 0) — le prix affiché en FCFA reste `price`. */
  priceA?: number;
  /** Id du produit Chariow « Gratuit » utilisé par le fulfillment. */
  chariowProductId?: string | null;
  /** manual | chariow_free_checkout */
  fulfillmentMethod?: FulfillmentMethod;
}

/** Méthodes de livraison d'un produit (contrat § Fulfillment). */
export type FulfillmentMethod = "manual" | "chariow_free_checkout";

export interface Analytics {
  visits: number;
  actionsTotal: number;
  clicksByProduct: Record<string, number>;
  visitsByDay: Record<string, number>;
  recentVisits: number[];
  updatedAt: number;
}

export interface MediaItem {
  name: string;
  url: string;
  kind: "image";
  size: number;
  /** base64 — uniquement pour les médias hébergés en D1 (hosted === "d1"). */
  data?: string;
  mime?: string;
  hosted?: "github" | "d1";
  uploadedAt: number;
}
