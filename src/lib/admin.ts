/**
 * Arsenal Tools — couche API admin (auth, CRUD, upload, analytics)
 * Contrats identiques à l'API prod : X-Admin-Auth, {ok, token}, {ok, version, products}
 */

import { apiFetch, ApiError } from "./api";
import type { AffiliateStatus } from "./affiliate";
import { Product } from "./products";
import {
  normalizePurchase,
  type FulfillmentInfo,
  type PurchaseStatus,
} from "./purchases";

/** sha256 hex (crypto.subtle) — le token admin est le hash du mot de passe */
export async function sha256hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function adminLogin(password: string): Promise<string> {
  const res = await apiFetch<{ ok: boolean; token: string }>("/api/auth/login", {
    method: "POST",
    body: { password },
    timeoutMs: 6000,
  });
  return res.token;
}

export async function changeAdminPassword(next: string): Promise<string> {
  const res = await apiFetch<{ ok: boolean; token: string }>("/api/admin/password", {
    method: "POST",
    body: { next },
    auth: true,
    timeoutMs: 8000,
  });
  return res.token;
}

export async function productCreate(data: Partial<Product>): Promise<Product> {
  const res = await apiFetch<{ ok: boolean; product: Product }>("/api/products", {
    method: "POST",
    body: data,
    auth: true,
    timeoutMs: 8000,
  });
  return res.product;
}

export async function productUpdate(id: string, data: Partial<Product>): Promise<void> {
  await apiFetch(`/api/products/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: data,
    auth: true,
    timeoutMs: 8000,
  });
}

export async function productDelete(id: string): Promise<void> {
  await apiFetch(`/api/products/${encodeURIComponent(id)}`, {
    method: "DELETE",
    auth: true,
    timeoutMs: 8000,
  });
}

export interface Analytics {
  visits: number;
  actionsTotal: number;
  clicksByProduct: Record<string, number>;
  visitsByDay: Record<string, number>;
  productTitles: Record<string, string>;
  productImages: Record<string, string>;
  productCount: number;
  onlineNow: number;
  updatedAt: number;
}

export async function fetchAnalytics(): Promise<Analytics> {
  return apiFetch<Analytics>("/api/analytics", { auth: true, timeoutMs: 4000 });
}

export interface MediaItem {
  url: string;
  hosted?: boolean;
  filename?: string;
  uploadedAt?: number;
}

export async function fetchUploads(): Promise<MediaItem[]> {
  const res = await apiFetch<{ uploads: MediaItem[] }>("/api/media", { auth: true, timeoutMs: 4000 });
  return res.uploads || [];
}

/**
 * DELETE /api/admin/media/:name — retire le média de la BIBLIOTHÈQUE.
 * Le fichier et son lien ne sont pas touchés (le blob GitHub reste en ligne) ;
 * les médias stockés en base sont refusés par le serveur (409).
 */
export async function deleteAdminMedia(name: string): Promise<void> {
  await apiFetch(`/api/admin/media/${encodeURIComponent(name)}`, {
    method: "DELETE",
    auth: true,
    timeoutMs: 6000,
  });
}

/**
 * Upload d'image : POST /api/media (multipart) → { url }
 * Repli local : compression canvas → data URL (jamais d'échec bloquant)
 */
export async function uploadImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  try {
    const res = await apiFetch<{ url: string }>("/api/media", {
      method: "POST",
      formData,
      auth: true,
      timeoutMs: 12000,
    });
    if (res.url) return res.url;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) throw e; // session expirée : bloquant
  }
  return compressImage(file);
}

/* ============================================================
   Phase 2 — affiliation (contrat : docs/chantier/05-contrat-api-phase2.md)
   ============================================================ */

/** Filtre de la liste admin des affiliés */
export type AffiliateStatusFilter = "all" | "pending" | "active" | "suspended";

/** Ligne de GET /api/admin/affiliates (user pseudo/email + stats + dates) */
export interface AdminAffiliate {
  id: string;
  code: string;
  status: AffiliateStatus;
  /** Rôle du compte (user | affiliate | super_affiliate) — Phase 3. */
  role?: string | null;
  /** Une demande de promotion Super Affiliate est en attente. */
  superRequested?: boolean;
  pseudo: string;
  email: string;
  clicks: number;
  sales: number;
  payable: number;
  paid: number;
  appliedAt: number | null;
  activatedAt: number | null;
}

const affiliateNum = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const affiliateStr = (v: unknown): string => (typeof v === "string" ? v : "");
const affiliateTs = (v: unknown): number | null => (typeof v === "number" ? v : null);

/**
 * GET /api/admin/affiliates?status= — liste avec user (pseudo/email), code, statut,
 * clics, ventes, commissions (payable/payé) et dates.
 * Tolérant sur la forme du pseudo/email (plat ou nested `user`) : seule la mise en
 * forme est normalisée, aucune valeur n'est inventée.
 */
export async function fetchAdminAffiliates(
  status: AffiliateStatusFilter = "all",
): Promise<AdminAffiliate[]> {
  const query = status === "all" ? "" : `?status=${encodeURIComponent(status)}`;
  const res = await apiFetch<{ ok: boolean; affiliates?: unknown[] }>(
    `/api/admin/affiliates${query}`,
    { auth: true, timeoutMs: 6000 },
  );
  return (res.affiliates || []).map((raw) => {
    const item = (raw || {}) as Record<string, unknown> & {
      user?: { pseudo?: unknown; email?: unknown } | null;
    };
    return {
      id: affiliateStr(item.id),
      code: affiliateStr(item.code),
      status:
        item.status === "active" || item.status === "suspended"
          ? (item.status as AdminAffiliate["status"])
          : "pending",
      pseudo: affiliateStr(item.pseudo) || affiliateStr(item.user?.pseudo),
      email: affiliateStr(item.email) || affiliateStr(item.user?.email),
      clicks: affiliateNum(item.clicks),
      sales: affiliateNum(item.sales),
      payable: affiliateNum(item.payable ?? item.commissionsPayable),
      paid: affiliateNum(item.paid ?? item.commissionsPaid),
      appliedAt: affiliateTs(item.appliedAt),
      activatedAt: affiliateTs(item.activatedAt),
      role: typeof item.role === 'string' ? item.role : null,
      superRequested: item.superRequested === true,
    };
  });
}

/**
 * POST /api/admin/affiliates/:id/status — `pending→active` (pose le rôle affilié),
 * `active→suspended`, `suspended→active`.
 */
export async function setAffiliateStatus(
  id: string,
  status: "active" | "suspended",
  reason?: string,
): Promise<void> {
  await apiFetch(`/api/admin/affiliates/${encodeURIComponent(id)}/status`, {
    method: "POST",
    body: reason ? { status, reason } : { status },
    auth: true,
    timeoutMs: 8000,
  });
}

/**
 * POST /api/admin/sales — repli admin : enregistre une vente confirmée + commission
 * en attente (409 si la référence existe déjà). `affiliateCode` est le code public.
 */
export async function createManualSale(data: {
  affiliateCode: string;
  productId: string;
  saleRef: string;
  amount: number;
  currency?: string;
}): Promise<void> {
  await apiFetch("/api/admin/sales", {
    method: "POST",
    body: data,
    auth: true,
    timeoutMs: 8000,
  });
}

/* ============================================================
   Phase 2.6 — achats en A (contrat : docs/chantier/07-contrat-paiement-a.md)
   ============================================================ */

/** Filtre de la liste admin des commandes (statuts du schéma serveur) */
export type AdminPurchaseStatusFilter = "all" | PurchaseStatus;

/** Ligne de GET /api/admin/purchases (user pseudo/email + produit + fulfillment + dates) */
export interface AdminPurchase {
  id: string;
  userId: string;
  productId: string;
  productTitle: string;
  amountA: number;
  status: PurchaseStatus;
  pseudo: string;
  email: string;
  /** provider/status/attempts/last_error — null si le serveur n'en renvoie pas */
  fulfillment: FulfillmentInfo | null;
  /** Code du lien affilié attribué à l'achat (facultatif) */
  linkCode: string | null;
  createdAt: number;
  updatedAt: number | null;
  fulfilledAt: number | null;
  refundedAt: number | null;
}

/**
 * GET /api/admin/purchases?status=&limit= — liste des achats en A.
 * Tolérant sur la forme (user/produit imbriqués ou plats) : seule la mise en forme est
 * normalisée, aucune valeur métier n'est inventée (les helpers de coercition `affiliateStr`
 * & co, définis plus haut, sont réutilisés).
 */
export async function fetchAdminPurchases(
  status: AdminPurchaseStatusFilter = "all",
): Promise<AdminPurchase[]> {
  const query = status === "all" ? "" : `?status=${encodeURIComponent(status)}`;
  const res = await apiFetch<{ ok: boolean; purchases?: unknown[] }>(
    `/api/admin/purchases${query}`,
    { auth: true, timeoutMs: 6000 },
  );
  return (res.purchases || []).map((raw) => {
    const item = (raw || {}) as Record<string, unknown> & {
      user?: { pseudo?: unknown; email?: unknown; id?: unknown } | null;
      product?: { title?: unknown } | null;
    };
    const base = normalizePurchase(item);
    return {
      id: base.id,
      userId: affiliateStr(item.userId) || affiliateStr(item.user_id) || affiliateStr(item.user?.id),
      productId: base.productId,
      productTitle: base.product.title || affiliateStr(item.productTitle),
      amountA: base.amountA,
      status: base.status,
      pseudo: affiliateStr(item.pseudo) || affiliateStr(item.user?.pseudo),
      email: affiliateStr(item.email) || affiliateStr(item.user?.email),
      fulfillment: base.fulfillment,
      linkCode:
        affiliateStr(item.linkCode) ||
        affiliateStr(item.link_code) ||
        affiliateStr(item.affiliateCode) ||
        null,
      createdAt: base.createdAt,
      updatedAt: affiliateTs(item.updatedAt) ?? affiliateTs(item.updated_at),
      fulfilledAt: base.fulfilledAt,
      refundedAt: base.refundedAt ?? affiliateTs(item.refunded_at),
    };
  });
}

/** POST /api/admin/purchases/:id/fulfill — livraison manuelle (référence + note facultatives) */
export async function fulfillPurchase(
  id: string,
  data: { reference?: string; note?: string } = {},
): Promise<void> {
  const body: Record<string, string> = {};
  if (data.reference?.trim()) body.reference = data.reference.trim();
  if (data.note?.trim()) body.note = data.note.trim();
  await apiFetch(`/api/admin/purchases/${encodeURIComponent(id)}/fulfill`, {
    method: "POST",
    body,
    auth: true,
    timeoutMs: 8000,
  });
}

/** POST /api/admin/purchases/:id/retry — relance le fulfillment automatique (idempotent, ≤ 5 essais) */
export async function retryAdminPurchase(id: string): Promise<void> {
  await apiFetch(`/api/admin/purchases/${encodeURIComponent(id)}/retry`, {
    method: "POST",
    auth: true,
    timeoutMs: 9000,
  });
}

/** POST /api/admin/purchases/:id/refund — rembourse en A (transaction `refund:<id>`, irréversible) */
export async function refundPurchase(id: string, reason?: string): Promise<void> {
  const trimmed = (reason || "").trim();
  await apiFetch(`/api/admin/purchases/${encodeURIComponent(id)}/refund`, {
    method: "POST",
    body: trimmed ? { reason: trimmed } : {},
    auth: true,
    timeoutMs: 8000,
  });
}

/* ============================================================
   Phase 2.7 — livraison : fichier du produit & licences (admin)
   ============================================================ */

/** Taille maximale acceptée par POST /api/admin/products/:id/file (contrat : 25 Mo) */
export const MAX_PRODUCT_FILE_BYTES = 25 * 1024 * 1024;

/** Extensions acceptées par l'endpoint d'upload (contrat figé) */
export const PRODUCT_FILE_EXTENSIONS = ["pdf", "epub", "mobi", "zip", "mp4", "apk"] as const;

/** Fichier livré tel que renvoyé par l'upload `{file:{name,size,mime,url}}` */
export interface ProductFileInfo {
  name: string;
  size: number;
  mime: string;
  url: string;
}

/**
 * Message explicite des erreurs d'upload du contrat :
 * 413 trop volumineux · 400 type refusé · 503 stockage GitHub non configuré.
 */
export function productFileErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 413) return "Fichier trop volumineux (25 Mo maximum).";
    if (err.status === 400)
      return err.message || `Type de fichier refusé (acceptés : ${PRODUCT_FILE_EXTENSIONS.join(", ")}).`;
    if (err.status === 503)
      return "Stockage des fichiers non configuré côté serveur (jeton GitHub manquant).";
    if (err.status === 401) return "Session admin expirée — reconnectez-vous.";
    return err.message || "Téléversement impossible.";
  }
  return err instanceof Error ? err.message : "Téléversement impossible.";
}

/**
 * POST /api/admin/products/:id/file (multipart, champ `file`) — fichier livré du produit.
 * Le produit doit exister (édition). Limite 25 Mo, formats pdf/epub/mobi/zip/mp4/apk.
 */
export async function uploadProductFile(productId: string, file: File): Promise<ProductFileInfo> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await apiFetch<{ ok: boolean; file?: Partial<ProductFileInfo> }>(
    `/api/admin/products/${encodeURIComponent(productId)}/file`,
    // apiFetch multiplie le délai par 4 hors GET : 30 000 ms ⇒ 120 s pour un envoi de 25 Mo
    { method: "POST", formData, auth: true, timeoutMs: 30_000 },
  );
  const info = res.file || {};
  return {
    name: affiliateStr(info.name) || file.name,
    size: affiliateNum(info.size) || file.size,
    mime: affiliateStr(info.mime) || file.type,
    url: affiliateStr(info.url),
  };
}

/** DELETE /api/admin/products/:id/file — retire le fichier livré du produit */
export async function deleteProductFile(productId: string): Promise<void> {
  await apiFetch(`/api/admin/products/${encodeURIComponent(productId)}/file`, {
    method: "DELETE",
    auth: true,
    timeoutMs: 9000,
  });
}

/** Filtre de la liste admin des licences */
export type AdminLicenseStatusFilter = "all" | "active" | "revoked";

/** Ligne de GET /api/admin/licenses (user pseudo/email + produit + activations + dates) */
export interface AdminLicense {
  id: string;
  productId: string;
  productTitle: string;
  pseudo: string;
  email: string;
  licenseKey: string;
  /** Statut brut du serveur (« active » / « revoked ») */
  status: string;
  activationsCount: number;
  maxActivations: number;
  createdAt: number | null;
  revokedAt: number | null;
}

export function isAdminLicenseRevoked(license: AdminLicense): boolean {
  return license.status === "revoked" || license.revokedAt !== null;
}

/**
 * GET /api/admin/licenses?status=&product_id= — clés de licence générées par les achats.
 * Tolérant sur la forme (produit/user imbriqués ou plats) : seule la mise en forme est
 * normalisée, aucune valeur métier n'est inventée.
 */
export async function fetchAdminLicenses(
  status: AdminLicenseStatusFilter = "all",
  productId?: string,
): Promise<AdminLicense[]> {
  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  if (productId) params.set("product_id", productId);
  const query = params.toString();
  const res = await apiFetch<{ ok: boolean; licenses?: unknown[] }>(
    `/api/admin/licenses${query ? `?${query}` : ""}`,
    { auth: true, timeoutMs: 6000 },
  );
  return (res.licenses || []).map((raw) => {
    const item = (raw || {}) as Record<string, unknown> & {
      user?: { pseudo?: unknown; email?: unknown } | null;
      product?: { id?: unknown; title?: unknown } | null;
    };
    return {
      id: affiliateStr(item.id),
      productId: affiliateStr(item.productId) || affiliateStr(item.product_id) || affiliateStr(item.product?.id),
      productTitle:
        affiliateStr(item.productTitle) ||
        affiliateStr(item.product_title) ||
        affiliateStr(item.product?.title),
      pseudo: affiliateStr(item.pseudo) || affiliateStr(item.user?.pseudo),
      email: affiliateStr(item.email) || affiliateStr(item.user?.email),
      licenseKey: affiliateStr(item.licenseKey) || affiliateStr(item.license_key),
      status: affiliateStr(item.status) || "active",
      activationsCount: affiliateNum(item.activationsCount ?? item.activations_count),
      maxActivations: affiliateNum(item.maxActivations ?? item.max_activations),
      createdAt: affiliateTs(item.createdAt ?? item.created_at),
      revokedAt: affiliateTs(item.revokedAt ?? item.revoked_at),
    } satisfies AdminLicense;
  });
}

/** POST /api/admin/licenses/:id/revoke — révoque définitivement une clé (irréversible) */
export async function revokeLicense(id: string): Promise<void> {
  await apiFetch(`/api/admin/licenses/${encodeURIComponent(id)}/revoke`, {
    method: "POST",
    auth: true,
    timeoutMs: 8000,
  });
}

/* ---------- Réglages (GET/POST /api/admin/settings) ---------- */

export interface AdminSettings {
  /**
   * Clé API Chariow configurée ? `true`/`false` quand le backend l'indique (drapeau
   * `chariow_api_key_configured` ou valeur masquée), `null` si l'information n'est pas exposée.
   * La valeur en clair n'est JAMAIS renvoyée par l'API.
   */
  chariowApiKeyConfigured: boolean | null;
  /**
   * Chantier B — textes des pages légales (PUBLICS côté API, jamais masqués) :
   * politique de confidentialité, conditions générales, mentions légales.
   * `""` tant que l'admin ne les a pas renseignés (jamais de contenu inventé).
   */
  legal_privacy?: string;
  legal_terms?: string;
  legal_notice?: string;
}

export async function fetchAdminSettings(): Promise<AdminSettings> {
  const res = await apiFetch<{ ok: boolean; settings?: Record<string, unknown> }>(
    "/api/admin/settings",
    { auth: true, timeoutMs: 4000 },
  );
  const settings = res.settings || {};
  const flag = settings.chariow_api_key_configured;
  let configured: boolean | null = null;
  if (typeof flag === "boolean") configured = flag;
  else if (typeof settings.chariow_api_key === "string") {
    configured = settings.chariow_api_key.trim().length > 0;
  }
  // Chantier B — textes légaux relayés bruts (publics : jamais masqués côté API).
  const legalText = (value: unknown): string | undefined =>
    typeof value === "string" ? value : undefined;
  return {
    chariowApiKeyConfigured: configured,
    legal_privacy: legalText(settings.legal_privacy),
    legal_terms: legalText(settings.legal_terms),
    legal_notice: legalText(settings.legal_notice),
  };
}

/** POST /api/admin/settings — écrit une clé whitelistée ({key, value}), jamais relue en clair */
export async function saveAdminSetting(key: string, value: string): Promise<void> {
  await apiFetch("/api/admin/settings", {
    method: "POST",
    body: { key, value },
    auth: true,
    timeoutMs: 8000,
  });
}

/* ============================================================
   Onglet « Chariow » — pilotage de la boutique (API Chariow en LECTURE SEULE
   sur les produits : lister, vérifier, lier — jamais créer ni éditer).
   ============================================================ */

/** Montant Chariow (`{value, formatted, currency}`) — null si non fourni */
export interface ChariowAmount {
  value: number | null;
  formatted: string | null;
  currency: string | null;
}

/** Ligne de GET /api/admin/chariow/products — un produit de la boutique Chariow */
export interface ChariowProduct {
  id: string;
  name: string;
  /** Modèle de tarification « Gratuit » côté Chariow (null si non communiqué) */
  isFree: boolean | null;
  price: ChariowAmount | null;
  /** Statut brut renvoyé par Chariow (chaîne libre) */
  status: string | null;
  /** downloadable | course | license | service | bundle | coaching */
  type: string | null;
  /** Produit Arsenal lié (via products.chariow_product_id), sinon null */
  linkedArsenalProductId: string | null;
}

/** Réponse de GET /api/admin/chariow/status */
export interface ChariowStatus {
  /** Intégration opérationnelle : clé enregistrée ET boutique joignable */
  configured: boolean;
  /** Boutique connectée à la clé API (null si absente ou illisible) */
  store: { name: string | null; domain: string | null } | null;
  /** Une clé API Chariow est enregistrée (la valeur n'est jamais renvoyée) */
  apiKeyConfigured: boolean;
  /** Le secret du webhook Chariow est enregistré */
  webhookSecretConfigured: boolean;
  /** Motif d'échec de la lecture de la boutique (réseau, clé refusée…) */
  error?: string;
}

/** Diagnostic de POST /api/admin/products/:id/chariow-link (succès) */
export interface ChariowLinkDiagnostic {
  ok: boolean;
  product: {
    id: string;
    name: string;
    slug: string | null;
    type: string | null;
    status: string | null;
    isFree: boolean | null;
    price: ChariowAmount | null;
    hasVariantPricing: boolean | null;
  } | null;
  /** `null` = non déterminable (statut absent) — jamais deviné */
  checks: { exists: boolean; isFree: boolean | null; isPublished: boolean | null };
  warnings: string[];
}

/** GET /api/admin/chariow/status — état de la connexion Chariow (jamais d'exception) */
export async function fetchChariowStatus(): Promise<ChariowStatus> {
  const res = await apiFetch<Partial<ChariowStatus> & { ok?: boolean }>("/api/admin/chariow/status", {
    auth: true,
    timeoutMs: 9000,
  });
  const store = res.store as ChariowStatus["store"];
  return {
    configured: res.configured === true,
    store: store && typeof store === "object" ? { name: store.name ?? null, domain: store.domain ?? null } : null,
    apiKeyConfigured: res.apiKeyConfigured === true,
    webhookSecretConfigured: res.webhookSecretConfigured === true,
    ...(typeof res.error === "string" && res.error ? { error: res.error } : {}),
  };
}

/**
 * GET /api/admin/chariow/products — produits de la boutique Chariow.
 * `hasMore` : la page est plafonnée à 100 produits par l'API Chariow.
 */
export async function fetchChariowProducts(): Promise<{
  products: ChariowProduct[];
  hasMore: boolean;
}> {
  const res = await apiFetch<{ ok: boolean; products?: unknown[]; hasMore?: boolean }>(
    "/api/admin/chariow/products",
    { auth: true, timeoutMs: 9000 },
  );
  const products = (res.products || []).map((raw) => {
    const item = (raw || {}) as Record<string, unknown>;
    const price = item.price as Record<string, unknown> | null | undefined;
    return {
      id: affiliateStr(item.id),
      name: affiliateStr(item.name),
      isFree: typeof item.isFree === "boolean" ? item.isFree : null,
      price:
        price && typeof price === "object"
          ? {
              value: typeof price.value === "number" ? price.value : null,
              formatted: affiliateStr(price.formatted) || null,
              currency: affiliateStr(price.currency) || null,
            }
          : null,
      status: affiliateStr(item.status) || null,
      type: affiliateStr(item.type) || null,
      linkedArsenalProductId: affiliateStr(item.linkedArsenalProductId) || null,
    } satisfies ChariowProduct;
  });
  return { products, hasMore: res.hasMore === true };
}

/**
 * POST /api/admin/products/:id/chariow-link — lie un produit Arsenal à un produit
 * Chariow, APRÈS vérification réelle côté Chariow.
 *
 * En cas d'échec (produit inexistant → 400, vérification impossible → 502/503),
 * l'erreur `ApiError` porte le diagnostic dans `err.data` (mêmes clés
 * `checks` / `warnings` que le succès) : à lire pour afficher le détail.
 */
export async function linkChariowProduct(
  arsenalProductId: string,
  chariowProductId: string,
): Promise<ChariowLinkDiagnostic> {
  return apiFetch<ChariowLinkDiagnostic>(
    `/api/admin/products/${encodeURIComponent(arsenalProductId)}/chariow-link`,
    {
      method: "POST",
      body: { chariowProductId: chariowProductId.trim() },
      auth: true,
      timeoutMs: 12000,
    },
  );
}

/** Repli local : canvas max 1100px, JPEG q 0.82 → data URL */
function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 1100 / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => reject(new Error("Image illisible"));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error("Fichier illisible"));
    reader.readAsDataURL(file);
  });
}

/* ---------------- Phase 3 — campagnes & Super Affiliate ---------------- */

export interface AdminCampaign {
  id: string;
  name: string;
  productId: string;
  productName: string | null;
  startsAt: number | null;
  endsAt: number | null;
  commissionType: "percent" | "fixed";
  commissionValue: number | null;
  rewardA: number;
  goalSales: number | null;
  status: "draft" | "active" | "ended";
  participants: number;
  createdAt: number;
}

export async function fetchAdminCampaigns(status?: "draft" | "active" | "ended"): Promise<AdminCampaign[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  const res = await apiFetch<{ ok: boolean; campaigns?: unknown[] }>(`/api/admin/campaigns${query}`, {
    auth: true,
    timeoutMs: 6000,
  });
  return (res.campaigns || []).map((raw) => {
    const c = (raw || {}) as Record<string, unknown>;
    return {
      id: String(c.id ?? ""),
      name: String(c.name ?? ""),
      productId: String(c.productId ?? ""),
      productName: typeof c.productName === "string" ? c.productName : null,
      startsAt: typeof c.startsAt === "number" ? c.startsAt : null,
      endsAt: typeof c.endsAt === "number" ? c.endsAt : null,
      commissionType: (c.commissionType === "fixed" ? "fixed" : "percent") as "percent" | "fixed",
      commissionValue: typeof c.commissionValue === "number" ? c.commissionValue : null,
      rewardA: typeof c.rewardA === "number" ? Math.trunc(c.rewardA) : 0,
      goalSales: typeof c.goalSales === "number" ? Math.trunc(c.goalSales) : null,
      status: (["draft", "active", "ended"].includes(String(c.status))
        ? String(c.status)
        : "draft") as AdminCampaign["status"],
      participants: typeof c.participants === "number" ? Math.trunc(c.participants) : 0,
      createdAt: typeof c.createdAt === "number" ? c.createdAt : 0,
    };
  });
}

export interface AdminCampaignInput {
  name: string;
  productId: string;
  startsAt?: number | null;
  endsAt?: number | null;
  commissionType: "percent" | "fixed";
  commissionValue: number;
  rewardA?: number;
  goalSales?: number | null;
}

export async function createAdminCampaign(input: AdminCampaignInput): Promise<AdminCampaign> {
  const res = await apiFetch<{ ok: boolean; campaign: AdminCampaign }>("/api/admin/campaigns", {
    method: "POST",
    body: input,
    auth: true,
    timeoutMs: 8000,
  });
  return res.campaign;
}

export async function setCampaignState(
  id: string,
  status: "draft" | "active" | "ended"
): Promise<void> {
  await apiFetch(`/api/admin/campaigns/${encodeURIComponent(id)}/state`, {
    method: "POST",
    body: { status },
    auth: true,
    timeoutMs: 6000,
  });
}

export async function deleteAdminCampaign(id: string): Promise<void> {
  await apiFetch(`/api/admin/campaigns/${encodeURIComponent(id)}`, {
    method: "DELETE",
    auth: true,
    timeoutMs: 6000,
  });
}

/** POST /api/admin/affiliates/:id/promote-super — promotion Super Affiliate (irréversible). */
export async function promoteSuperAffiliate(id: string, reason?: string): Promise<void> {
  await apiFetch(`/api/admin/affiliates/${encodeURIComponent(id)}/promote-super`, {
    method: "POST",
    body: reason ? { reason } : {},
    auth: true,
    timeoutMs: 8000,
  });
}
