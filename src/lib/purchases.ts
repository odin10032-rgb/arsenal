/**
 * Arsenal Tools — couche API « achats en A » + référence d'affiliation
 * Contrat figé : docs/chantier/07-contrat-paiement-a.md (audit : docs/chantier/06-audit-chariow-fulfillment.md)
 *
 * Routes en Bearer (session utilisateur, lib/user-auth.ts) :
 *   POST /api/purchases              acheter avec ses A (201)
 *   GET  /api/purchases              mes produits (tri created_at DESC)
 *   POST /api/purchases/:id/retry    relancer un fulfillment en échec (idempotent)
 *   GET  /api/purchases/:id/download fichier livré (Blob, livraison terminée requise)
 *   GET  /api/me/licenses            mes clés de licence (produits en mode « licence »)
 *
 * Règle : le serveur est seul maître du solde, du prix, du statut d'achat et du fulfillment.
 * Rien n'est recalculé ici : les normalisations rendent seulement les champs absents
 * inoffensifs (0 / null) sans jamais inventer une valeur métier.
 */

import { API_URL, ApiError, apiFetch } from "./api";
import { getToken } from "./user-auth";

/* ---------- Types du contrat ---------- */

export type PurchaseStatus =
  | "pending"
  | "paid"
  | "fulfillment_pending"
  | "fulfilled"
  | "failed"
  | "cancelled"
  | "refunded";

const PURCHASE_STATUSES: PurchaseStatus[] = [
  "pending",
  "paid",
  "fulfillment_pending",
  "fulfilled",
  "failed",
  "cancelled",
  "refunded",
];

/** Statuts d'un achat considérés comme « possédés » (miroir de l'index unique serveur) */
const ACTIVE_PURCHASE_STATUSES: PurchaseStatus[] = [
  "pending",
  "paid",
  "fulfillment_pending",
  "fulfilled",
];

/** Statuts dont le fulfillment peut être relancé (contrat : 409 sinon, ≤ 5 tentatives) */
const RETRYABLE_PURCHASE_STATUSES: PurchaseStatus[] = ["fulfillment_pending", "failed"];

/** Portail d'accès Chariow (accès clé par email, contrat : app.ateliat.com) */
export const CHARIOW_PORTAL_URL = "https://app.ateliat.com/";

/** Accès renvoyé par le serveur (jamais déduit d'un statut côté client) */
export type PurchaseAccess =
  | { mode: "chariow_portal"; email: string }
  | { mode: "manual"; instructions?: string };

export interface FulfillmentInfo {
  /** chariow | manual | arsonal_link */
  provider: string;
  /** pending | processing | completed | failed */
  status: string;
  providerReference: string | null;
  attempts: number;
  lastError: string | null;
  completedAt: number | null;
}

export interface PurchaseProduct {
  id: string;
  title: string;
  imageUrl: string;
  category?: string;
  /**
   * Mode de livraison du produit (miroir backend) : `'file'` = fichier téléchargeable via
   * GET /api/purchases/:id/download, `'license'` = clé lue via GET /api/me/licenses.
   * Champ absent / null → comportement existant (portail Chariow ou livraison manuelle).
   */
  deliveryKind?: "file" | "license" | null;
}

export interface Purchase {
  id: string;
  productId: string;
  amountA: number;
  status: PurchaseStatus;
  createdAt: number;
  fulfilledAt: number | null;
  refundedAt: number | null;
  product: PurchaseProduct;
  /** Fulfillment de l'achat (provider/status/completedAt côté utilisateur) */
  fulfillment: FulfillmentInfo | null;
  /** Instructions d'accès renvoyées par le serveur (portail Chariow ou livraison manuelle) */
  access: PurchaseAccess | null;
}

/* ---------- Normalisations défensives (aucune valeur inventée) ---------- */

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const numOrNull = (v: unknown): number | null => (typeof v === "number" ? v : null);

/** Mode de livraison tolérant : seule une valeur connue est retenue, sinon null (comportement actuel) */
function normalizeDeliveryKind(raw: unknown): "file" | "license" | null {
  return raw === "file" || raw === "license" ? raw : null;
}

function normalizeStatus(raw: unknown): PurchaseStatus {
  return PURCHASE_STATUSES.includes(raw as PurchaseStatus) ? (raw as PurchaseStatus) : "pending";
}

function normalizeAccess(raw: unknown): PurchaseAccess | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as { mode?: unknown; email?: unknown; instructions?: unknown; note?: unknown };
  if (obj.mode === "chariow_portal") {
    return { mode: "chariow_portal", email: str(obj.email) };
  }
  if (obj.mode === "manual") {
    const instructions = str(obj.instructions) || str(obj.note);
    return instructions ? { mode: "manual", instructions } : { mode: "manual" };
  }
  return null;
}

function normalizeFulfillment(raw: unknown): FulfillmentInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const f = raw as Record<string, unknown>;
  const provider = str(f.provider);
  const status = str(f.status);
  if (!provider && !status) return null;
  return {
    provider: provider || "manual",
    status: status || "pending",
    providerReference:
      typeof f.providerReference === "string"
        ? f.providerReference
        : typeof f.provider_reference === "string"
          ? f.provider_reference
          : typeof f.reference === "string"
            ? f.reference
            : null,
    attempts: num(f.attempts),
    lastError:
      typeof f.lastError === "string" ? f.lastError : typeof f.last_error === "string" ? f.last_error : null,
    completedAt: numOrNull(f.completedAt ?? f.completed_at),
  };
}

/** Normalise un achat (champs plats ou snake_case tolérés, `product` nested ou plat) */
export function normalizePurchase(raw: unknown): Purchase {
  const p = (raw || {}) as Record<string, unknown> & {
    product?: Record<string, unknown> | null;
  };
  const product = (p.product || {}) as Record<string, unknown>;
  return {
    id: str(p.id),
    productId: str(p.productId) || str(p.product_id) || str(product.id),
    amountA: num(p.amountA ?? p.amount_a),
    status: normalizeStatus(p.status),
    createdAt: num(p.createdAt ?? p.created_at),
    fulfilledAt: numOrNull(p.fulfilledAt ?? p.fulfilled_at),
    refundedAt: numOrNull(p.refundedAt ?? p.refunded_at),
    product: {
      id: str(product.id) || str(p.productId) || str(p.product_id),
      title: str(product.title) || str(p.productTitle) || str(p.product_title),
      imageUrl: str(product.imageUrl) || str(product.image_url) || str(p.productImage),
      category: str(product.category) || undefined,
      // Tolérant : le backend peut le porter sur le produit imbriqué ou à plat sur l'achat
      deliveryKind: normalizeDeliveryKind(
        product.deliveryKind ?? product.delivery_kind ?? p.deliveryKind ?? p.delivery_kind,
      ),
    },
    fulfillment: normalizeFulfillment(p.fulfillment),
    access: normalizeAccess(p.access),
  };
}

/* ---------- Lectures d'état (dérivées du statut renvoyé par l'API) ---------- */

/** Achat actif : ni annulé, ni en échec, ni remboursé (l'utilisateur « possède » le produit) */
export function isActivePurchase(purchase: Purchase): boolean {
  return ACTIVE_PURCHASE_STATUSES.includes(purchase.status);
}

/** Fulfillment relançable (le serveur arbitre : 409 si le statut n'est pas éligible) */
export function canRetryPurchase(purchase: Purchase): boolean {
  return RETRYABLE_PURCHASE_STATUSES.includes(purchase.status);
}

/** Livraison encore en cours (aucun accès utilisable à afficher) */
export function isDeliveryPending(purchase: Purchase): boolean {
  return purchase.status === "pending" || purchase.status === "paid" || purchase.status === "fulfillment_pending";
}

/** Livraison en échec : les A ne sont jamais perdus (relance ou remboursement par l'admin) */
export function isDeliveryFailed(purchase: Purchase): boolean {
  return purchase.status === "failed" || purchase.fulfillment?.status === "failed";
}

/**
 * Accès affichable d'un achat.
 * Priorité à l'accès renvoyé par le serveur ; à défaut, déduction d'affichage depuis le
 * provider de fulfillment (chariow → portail app.ateliat.com clé par l'email de session).
 */
export function resolveAccess(purchase: Purchase, sessionEmail = ""): PurchaseAccess | null {
  if (purchase.access) {
    if (purchase.access.mode === "chariow_portal" && !purchase.access.email) {
      return { mode: "chariow_portal", email: sessionEmail };
    }
    return purchase.access;
  }
  const provider = purchase.fulfillment?.provider || "";
  if (provider === "chariow") return { mode: "chariow_portal", email: sessionEmail };
  if (provider === "manual") return { mode: "manual" };
  return null;
}

/* ---------- Routes utilisateur (Bearer) ---------- */

/**
 * POST /api/purchases — acheter un produit avec ses A.
 * Le prix, le débit et le statut sont posés par le serveur : aucun montant n'est envoyé.
 * `affiliateCode` (facultatif) : référence lue via readAffiliateRef() (fenêtre 30 j).
 * Erreurs du contrat : 401 non connecté · 402 solde insuffisant (payload balanceA/priceA/missingA)
 * · 409 déjà possédé · 429 rate limit.
 */
export async function buyProduct(productId: string, affiliateCode?: string): Promise<Purchase> {
  const code = (affiliateCode || "").trim();
  const res = await apiFetch<{ ok: boolean; purchase?: unknown }>("/api/purchases", {
    method: "POST",
    body: code ? { productId, affiliateCode: code } : { productId },
    bearer: true,
    timeoutMs: 8000,
  });
  const purchase = normalizePurchase(res.purchase);
  if (!purchase.id) throw new Error("Réponse inattendue du serveur.");
  return purchase;
}

/** GET /api/purchases — mes produits (triés du plus récent au plus ancien par le serveur) */
export async function fetchMyPurchases(): Promise<Purchase[]> {
  const res = await apiFetch<{ ok: boolean; purchases?: unknown[] }>("/api/purchases", {
    bearer: true,
    timeoutMs: 6000,
  });
  return (res.purchases || []).map(normalizePurchase);
}

/** POST /api/purchases/:id/retry — relancer un fulfillment en échec (idempotent) */
export async function retryPurchase(id: string): Promise<Purchase> {
  const res = await apiFetch<{ ok: boolean; purchase?: unknown }>(
    `/api/purchases/${encodeURIComponent(id)}/retry`,
    { method: "POST", bearer: true, timeoutMs: 8000 },
  );
  return normalizePurchase(res.purchase);
}

/**
 * Champs du refus 402, lus tels quels dans la réponse du serveur (`{balanceA, priceA, missingA}`).
 * Aucun de ces montants n'est recalculé côté client.
 */
export function insufficientBalanceInfo(
  err: unknown,
): { balanceA: number | null; priceA: number | null; missingA: number | null } | null {
  if (!(err instanceof ApiError) || err.status !== 402) return null;
  return {
    balanceA: numOrNull(err.data?.balanceA),
    priceA: numOrNull(err.data?.priceA),
    missingA: numOrNull(err.data?.missingA),
  };
}

/* ---------- Fichier livré & clés de licence (Phase 2.7) ---------- */

/** Extensions de repli quand `Content-Disposition` n'est pas lisible (en-tête non exposé par CORS) */
const MIME_EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "application/epub+zip": "epub",
  "application/x-mobipocket-ebook": "mobi",
  "application/zip": "zip",
  "application/x-zip-compressed": "zip",
  "application/octet-stream": "",
  "video/mp4": "mp4",
  "application/vnd.android.package-archive": "apk",
};

/** Nom de fichier sûr (pas de chemin, pas de caractère réservé) */
function sanitizeFileName(raw: string): string {
  return raw
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90);
}

/** `filename*` (RFC 5987) puis `filename` — chaîne vide si l'en-tête est absent ou illisible */
function fileNameFromDisposition(disposition: string | null): string {
  if (!disposition) return "";
  const extended = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(disposition);
  if (extended?.[1]) {
    try {
      return sanitizeFileName(decodeURIComponent(extended[1].trim().replace(/^"|"$/g, "")));
    } catch {
      return sanitizeFileName(extended[1]);
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(disposition);
  return plain?.[1] ? sanitizeFileName(plain[1]) : "";
}

/** Nom de repli : titre du produit + extension déduite du type MIME (le serveur reste prioritaire) */
function fallbackFileName(base: string, mime: string): string {
  const clean = sanitizeFileName(base) || "fichier";
  if (/\.[a-z0-9]{2,5}$/i.test(clean)) return clean;
  const ext = MIME_EXTENSIONS[(mime || "").split(";")[0].trim().toLowerCase()];
  return ext ? `${clean}.${ext}` : clean;
}

/** Déclenche le téléchargement navigateur d'un Blob (aucun stockage, URL libérée ensuite) */
function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * GET /api/purchases/:id/download (Bearer) — renvoie le FICHIER, pas du JSON.
 * Fetch direct (apiFetch ne sait lire que du JSON) : Blob puis téléchargement navigateur.
 * Erreurs du contrat remontées en `ApiError` : 404 (non possédé / sans fichier),
 * 409 (livraison non terminée), 401 (session expirée).
 * `fallbackName` : titre du produit, utilisé si `Content-Disposition` n'est pas lisible.
 */
export async function downloadPurchaseFile(purchaseId: string, fallbackName = ""): Promise<void> {
  const token = getToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/purchases/${encodeURIComponent(purchaseId)}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
    });
  } catch {
    throw new ApiError("Téléchargement impossible — vérifiez votre connexion.", 0);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const message =
      res.status === 404
        ? "Fichier indisponible pour cet achat."
        : res.status === 409
          ? "La livraison n'est pas terminée : le téléchargement s'activera dès qu'elle sera confirmée."
          : res.status === 401
            ? "Votre session a expiré. Reconnectez-vous pour télécharger."
            : `Téléchargement refusé (erreur ${res.status}).`;
    throw new ApiError(message, res.status);
  }

  const blob = await res.blob();
  const name =
    fileNameFromDisposition(res.headers.get("content-disposition")) ||
    fallbackFileName(fallbackName, blob.type);
  saveBlob(blob, name);
}

/** Ligne de GET /api/me/licenses (une clé par achat de produit en mode « licence ») */
export interface UserLicense {
  id: string;
  productId: string;
  licenseKey: string;
  /** Statut brut renvoyé par le serveur (« active » / « revoked ») */
  status: string;
  activationsCount: number;
  maxActivations: number;
  createdAt: number | null;
  revokedAt: number | null;
  /** Titre du produit (produit imbriqué ou titre plat, tolérant) */
  productTitle: string;
}

/** Une clé est révoquée si le serveur le dit (statut ou date de révocation) */
export function isLicenseRevoked(license: UserLicense): boolean {
  return license.status === "revoked" || license.revokedAt !== null;
}

/** GET /api/me/licenses (Bearer) — mes clés de licence, normalisées sans inventer de valeur */
export async function fetchMyLicenses(): Promise<UserLicense[]> {
  const res = await apiFetch<{ ok: boolean; licenses?: unknown[] }>("/api/me/licenses", {
    bearer: true,
    timeoutMs: 6000,
  });
  return (res.licenses || []).map((raw) => {
    const l = (raw || {}) as Record<string, unknown> & { product?: { id?: unknown; title?: unknown } | null };
    return {
      id: str(l.id),
      productId: str(l.productId) || str(l.product_id) || str(l.product?.id),
      licenseKey: str(l.licenseKey) || str(l.license_key),
      status: str(l.status) || "active",
      activationsCount: num(l.activationsCount ?? l.activations_count),
      maxActivations: num(l.maxActivations ?? l.max_activations),
      createdAt: numOrNull(l.createdAt ?? l.created_at),
      revokedAt: numOrNull(l.revokedAt ?? l.revoked_at),
      productTitle: str(l.productTitle) || str(l.product_title) || str(l.product?.title),
    } satisfies UserLicense;
  });
}

/* ---------- Référence d'affiliation (localStorage, fenêtre 30 jours) ---------- */

/** Clé localStorage — contrat : `arsenal_affiliate_ref = {code, at}` (30 jours) */
export const AFFILIATE_REF_KEY = "arsenal_affiliate_ref";
export const AFFILIATE_REF_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

interface AffiliateRef {
  code: string;
  at: number;
}

/**
 * Code de parrainage mémorisé par /r/<code> — renvoyé uniquement s'il est dans la fenêtre
 * de 30 jours (l'entrée expirée est purgée ; le serveur revérifie de toute façon).
 */
export function readAffiliateRef(): string {
  try {
    const raw = localStorage.getItem(AFFILIATE_REF_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw) as AffiliateRef;
    const code = typeof parsed?.code === "string" ? parsed.code.trim() : "";
    const at = typeof parsed?.at === "number" ? parsed.at : 0;
    if (!code || Date.now() - at > AFFILIATE_REF_WINDOW_MS) {
      localStorage.removeItem(AFFILIATE_REF_KEY);
      return "";
    }
    return code;
  } catch {
    return "";
  }
}

/** Mémorise le code d'un lien affilié (appelé par /r avant la redirection) */
export function storeAffiliateRef(code: string): void {
  const clean = (code || "").trim();
  if (!clean) return;
  try {
    localStorage.setItem(
      AFFILIATE_REF_KEY,
      JSON.stringify({ code: clean, at: Date.now() } satisfies AffiliateRef),
    );
  } catch {
    /* storage indisponible : on ignore (le clic reste décompté côté serveur) */
  }
}
