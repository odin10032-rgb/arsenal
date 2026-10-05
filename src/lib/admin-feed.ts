/**
 * Feed (admin) — accès client à la gestion éditoriale.
 * Routes : /api/admin/feed (X-Admin-Auth via `auth: true`).
 */

import { apiFetch } from "./api";

export interface AdminFeedArticle {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  coverUrl: string | null;
  category: string | null;
  videoUrl: string | null;
  productId: string | null;
  status: "draft" | "published";
  publishedAt: number | null;
  updatedAt: number;
}

function toArticle(raw: unknown): AdminFeedArticle {
  const a = (raw ?? {}) as Record<string, unknown>;
  return {
    id: typeof a.id === "string" ? a.id : "",
    slug: typeof a.slug === "string" ? a.slug : "",
    title: typeof a.title === "string" ? a.title : "",
    excerpt: typeof a.excerpt === "string" ? a.excerpt : "",
    content: typeof a.content === "string" ? a.content : "",
    coverUrl: typeof a.coverUrl === "string" && a.coverUrl ? a.coverUrl : null,
    category: typeof a.category === "string" && a.category ? a.category : null,
    videoUrl: typeof a.videoUrl === "string" && a.videoUrl ? a.videoUrl : null,
    productId: typeof a.productId === "string" && a.productId ? a.productId : null,
    status: a.status === "published" ? "published" : "draft",
    publishedAt: typeof a.publishedAt === "number" ? a.publishedAt : null,
    updatedAt: typeof a.updatedAt === "number" ? a.updatedAt : 0,
  };
}

export async function fetchAdminFeed(): Promise<AdminFeedArticle[]> {
  const res = await apiFetch<{ ok: boolean; articles?: unknown[] }>("/api/admin/feed", {
    auth: true,
    timeoutMs: 6000,
  });
  return (res.articles || []).map(toArticle).filter((a) => a.id);
}

export interface AdminFeedInput {
  title: string;
  slug?: string;
  excerpt?: string;
  content?: string;
  coverUrl?: string | null;
  category?: string | null;
  videoUrl?: string | null;
  productId?: string | null;
}

export async function createAdminArticle(input: AdminFeedInput): Promise<void> {
  await apiFetch("/api/admin/feed", { method: "POST", body: input, auth: true, timeoutMs: 8000 });
}

export async function updateAdminArticle(id: string, input: AdminFeedInput): Promise<void> {
  await apiFetch(`/api/admin/feed/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: input,
    auth: true,
    timeoutMs: 8000,
  });
}

export async function setAdminArticleStatus(
  id: string,
  status: "draft" | "published"
): Promise<void> {
  await apiFetch(`/api/admin/feed/${encodeURIComponent(id)}/status`, {
    method: "POST",
    body: { status },
    auth: true,
    timeoutMs: 6000,
  });
}

export async function deleteAdminArticle(id: string): Promise<void> {
  await apiFetch(`/api/admin/feed/${encodeURIComponent(id)}`, {
    method: "DELETE",
    auth: true,
    timeoutMs: 6000,
  });
}
