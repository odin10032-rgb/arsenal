/**
 * Arsenal Tools — client API unique (miroir d'apiFetch du front vanilla)
 * API prod : https://beta-arsenal-api.aimane-project-api.workers.dev (CORS ouvert)
 */

import { readAdminToken } from "./products";

export const API_URL = (
  process.env.NEXT_PUBLIC_API_URL || "https://beta-arsenal-api.aimane-project-api.workers.dev"
).replace(/\/+$/, "");

export interface ApiOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  formData?: FormData;
  auth?: boolean;
  timeoutMs?: number;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T = Record<string, unknown>>(
  path: string,
  { method = "GET", body, formData, auth = false, timeoutMs }: ApiOptions = {},
): Promise<T> {
  const timeout = (timeoutMs ?? 2500) * (method === "GET" ? 1 : 4);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = readAdminToken();
    if (token) headers["X-Admin-Auth"] = token;
  }

  try {
    const res = await fetch(path.startsWith("/") ? API_URL + path : path, {
      method,
      headers,
      body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
      signal: controller.signal,
    });
    let json: Record<string, unknown> = {};
    try {
      json = await res.json();
    } catch {
      /* réponse non-JSON : on garde {} */
    }
    if (!res.ok) {
      throw new ApiError(String(json.error || `Erreur ${res.status}`), res.status);
    }
    return json as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Vérifie la disponibilité du backend (health check court) */
export async function detectApi(): Promise<boolean> {
  try {
    await apiFetch("/api/health", { timeoutMs: 2200 });
    return true;
  } catch {
    return false;
  }
}
