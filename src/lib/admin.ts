/**
 * Arsenal Tools — couche API admin (auth, CRUD, upload, analytics)
 * Contrats identiques à l'API prod : X-Admin-Auth, {ok, token}, {ok, version, products}
 */

import { apiFetch, ApiError } from "./api";
import { Product } from "./products";

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
