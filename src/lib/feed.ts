/**
 * Feed Arsenal Tools — types et accès client (refonte 05/10).
 *
 * Le Feed est la couche ÉDITORIALE d'Arsenal : le contenu est écrit et publié
 * depuis l'admin uniquement (aucune publication utilisateur, aucun commentaire
 * — spec §11). Les articles publiés sont lus sur `GET /api/feed` (public).
 */

import { apiFetch } from "./api";

export interface FeedArticleListItem {
  /** Identifiant d'URL (slug) — la page article se lit `/feed/?a=<slug>`. */
  slug: string;
  title: string;
  excerpt: string;
  /** Début du CONTENU RÉEL (flux éditorial) — jamais un résumé inventé. */
  preview: string;
  /** true = il reste du texte à déplier (« Lire plus »). */
  hasMore: boolean;
  coverUrl: string | null;
  category: string | null;
  publishedAt: number | null;
  /** Produit associé (si l'article en présente un). */
  productId: string | null;
}

export interface FeedArticle extends FeedArticleListItem {
  /** Contenu brut : paragraphes séparés par une ligne vide. */
  content: string;
  /** Vidéo YouTube de l'article (déjà validée par le serveur). */
  videoUrl: string | null;
}

function toListItem(raw: unknown): FeedArticleListItem {
  const a = (raw ?? {}) as Record<string, unknown>;
  return {
    slug: typeof a.slug === "string" ? a.slug : "",
    title: typeof a.title === "string" ? a.title : "",
    excerpt: typeof a.excerpt === "string" ? a.excerpt : "",
    preview: typeof a.preview === "string" ? a.preview : "",
    hasMore: a.hasMore === true,
    coverUrl: typeof a.coverUrl === "string" && a.coverUrl ? a.coverUrl : null,
    category: typeof a.category === "string" && a.category ? a.category : null,
    publishedAt: typeof a.publishedAt === "number" ? a.publishedAt : null,
    productId: typeof a.productId === "string" && a.productId ? a.productId : null,
  };
}

/** GET /api/feed — articles publiés, du plus récent au plus ancien. */
export async function fetchFeed(limit?: number): Promise<FeedArticleListItem[]> {
  const query = limit ? `?limit=${limit}` : "";
  const res = await apiFetch<{ ok: boolean; articles?: unknown[] }>(`/api/feed${query}`, {
    timeoutMs: 6000,
  });
  return (res.articles || []).map(toListItem).filter((a) => a.slug && a.title);
}

/** GET /api/feed/:slug — article publié complet (404 → null). */
export async function fetchFeedArticle(slug: string): Promise<FeedArticle | null> {
  try {
    const res = await apiFetch<{ ok: boolean; article?: unknown }>(
      `/api/feed/${encodeURIComponent(slug)}`,
      { timeoutMs: 6000 }
    );
    if (!res.article) return null;
    const raw = res.article as Record<string, unknown>;
    return {
      ...toListItem(raw),
      content: typeof raw.content === "string" ? raw.content : "",
      videoUrl: typeof raw.videoUrl === "string" && raw.videoUrl ? raw.videoUrl : null,
    };
  } catch {
    return null; // inconnu / non publié / API injoignable : même traitement sobre
  }
}

/** Date lisible d'un article (locale FR, sans dépendance externe). */
export function formatArticleDate(ts: number | null): string {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
