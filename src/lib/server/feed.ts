/**
 * Feed Arsenal Tools — accès données (migration 0015, refonte 05/10).
 *
 * Le Feed est la couche ÉDITORIALE d'Arsenal : le contenu est publié depuis
 * l'admin uniquement. Aucune donnée personnelle ici — des articles.
 */

export interface FeedArticleRow {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  cover_url: string | null;
  category: string | null;
  video_url: string | null;
  product_id: string | null;
  status: string;
  published_at: number | null;
  created_at: number;
  updated_at: number;
}

const ARTICLE_LIMIT_MAX = 100;
const TITLE_MAX = 140;
const EXCERPT_MAX = 300;
const CONTENT_MAX = 60_000;
const CATEGORY_MAX = 40;

/** Slug d'URL : minuscules, tirets — jamais vide (repli « article »). */
export function slugify(raw: string): string {
  const slug = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "article";
}

/** URL http(s) ou chemin relatif/upload — jamais javascript: ni data:. */
function safeUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value) return null;
  if (!/^(https?:\/\/|\/)/i.test(value) || value.length > 500) return null;
  return value;
}

export interface FeedArticleInput {
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  coverUrl: string | null;
  category: string | null;
  videoUrl: string | null;
  productId: string | null;
}

/** Normalise + valide le corps admin. Retourne les erreurs (FR) éventuelles. */
export function normalizeArticleInput(
  body: Record<string, unknown>,
  existing?: FeedArticleRow
): { errors: string[]; data: FeedArticleInput } {
  const errors: string[] = [];

  const title =
    body.title === undefined && existing
      ? existing.title
      : String(body.title ?? "").trim().slice(0, TITLE_MAX);
  if (title.length < 2) errors.push("Titre requis (2 caractères minimum).");

  const slugRaw =
    body.slug === undefined
      ? existing?.slug ?? title
      : String(body.slug ?? "").trim();
  const slug = slugify(slugRaw);

  const excerpt =
    body.excerpt === undefined && existing
      ? existing.excerpt
      : String(body.excerpt ?? "").trim().slice(0, EXCERPT_MAX) || null;

  const content =
    body.content === undefined && existing
      ? existing.content
      : String(body.content ?? "").slice(0, CONTENT_MAX);

  const coverUrl =
    body.coverUrl === undefined && existing ? existing.cover_url : safeUrl(body.coverUrl);

  const category =
    body.category === undefined && existing
      ? existing.category
      : String(body.category ?? "").trim().slice(0, CATEGORY_MAX) || null;

  const videoUrl =
    body.videoUrl === undefined && existing ? existing.video_url : safeUrl(body.videoUrl);

  const productId =
    body.productId === undefined && existing
      ? existing.product_id
      : String(body.productId ?? "").trim() || null;

  return { errors, data: { title, slug, excerpt, content, coverUrl, category, videoUrl, productId } };
}

/** Un slug déjà pris par un AUTRE article ? (l'éditeur reçoit une erreur claire) */
export async function slugTaken(db: D1Database, slug: string, exceptId?: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT id FROM feed_articles WHERE slug = ?")
    .bind(slug)
    .first<{ id: string }>();
  return Boolean(row && row.id !== exceptId);
}

/** Articles PUBLIÉS (liste légère, du plus récent au plus ancien). */
export async function listPublishedArticles(
  db: D1Database,
  limit = 50
): Promise<FeedArticleRow[]> {
  const capped = Math.min(Math.max(1, Math.trunc(limit) || 50), ARTICLE_LIMIT_MAX);
  const { results = [] } = await db
    .prepare(
      `SELECT * FROM feed_articles WHERE status = 'published'
        ORDER BY published_at DESC, created_at DESC LIMIT ?`
    )
    .bind(capped)
    .all<FeedArticleRow>();
  return results || [];
}

/** Article publié par slug (null si brouillon ou inconnu). */
export async function getPublishedArticleBySlug(
  db: D1Database,
  slug: string
): Promise<FeedArticleRow | null> {
  const row = await db
    .prepare("SELECT * FROM feed_articles WHERE slug = ? AND status = 'published'")
    .bind(slug)
    .first<FeedArticleRow>();
  return row ?? null;
}

/** Tous les articles (admin — brouillons compris). */
export async function listAllArticles(db: D1Database): Promise<FeedArticleRow[]> {
  const { results = [] } = await db
    .prepare("SELECT * FROM feed_articles ORDER BY updated_at DESC, created_at DESC LIMIT 300")
    .all<FeedArticleRow>();
  return results || [];
}

export async function getArticleById(db: D1Database, id: string): Promise<FeedArticleRow | null> {
  const row = await db
    .prepare("SELECT * FROM feed_articles WHERE id = ?")
    .bind(id)
    .first<FeedArticleRow>();
  return row ?? null;
}

export async function createArticle(db: D1Database, data: FeedArticleInput): Promise<FeedArticleRow> {
  const now = Date.now();
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO feed_articles
         (id, slug, title, excerpt, content, cover_url, category, video_url, product_id, status, published_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', NULL, ?, ?)`
    )
    .bind(
      id, data.slug, data.title, data.excerpt, data.content,
      data.coverUrl, data.category, data.videoUrl, data.productId, now, now
    )
    .run();
  const created = await getArticleById(db, id);
  if (!created) throw new Error("Article introuvable après création.");
  return created;
}

export async function updateArticle(
  db: D1Database,
  id: string,
  data: FeedArticleInput
): Promise<void> {
  await db
    .prepare(
      `UPDATE feed_articles
          SET slug = ?, title = ?, excerpt = ?, content = ?, cover_url = ?, category = ?,
              video_url = ?, product_id = ?, updated_at = ?
        WHERE id = ?`
    )
    .bind(
      data.slug, data.title, data.excerpt, data.content, data.coverUrl, data.category,
      data.videoUrl, data.productId, Date.now(), id
    )
    .run();
}

export async function deleteArticle(db: D1Database, id: string): Promise<boolean> {
  const res = await db.prepare("DELETE FROM feed_articles WHERE id = ?").bind(id).run();
  return Number(res.meta?.changes ?? 0) > 0;
}

/**
 * Passage brouillon ⇄ publié. `published_at` est posé UNE fois (première
 * publication) puis conservé — dépublier ne perd pas la date d'origine.
 */
export async function setArticleStatus(
  db: D1Database,
  id: string,
  status: "draft" | "published"
): Promise<void> {
  await db
    .prepare(
      `UPDATE feed_articles
          SET status = ?,
              published_at = CASE
                WHEN ? = 'published' AND published_at IS NULL THEN ?
                ELSE published_at
              END,
              updated_at = ?
        WHERE id = ?`
    )
    .bind(status, status, Date.now(), Date.now(), id)
    .run();
}

/** Longueur visée de l'aperçu du Feed (le vrai début du texte, pas un résumé). */
const PREVIEW_MAX = 260;

/**
 * Aperçu du CONTENU RÉEL pour le flux : premières lignes, coupées proprement à
 * la fin d'un mot (jamais un faux extrait marketing). `hasMore` indique qu'il
 * reste du texte à déplier.
 */
export function contentPreview(
  content: string,
  max = PREVIEW_MAX
): { preview: string; hasMore: boolean } {
  const text = (content || "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return { preview: text, hasMore: false };
  let cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > max * 0.6) cut = cut.slice(0, lastSpace);
  return { preview: cut.replace(/[.,;:!?…]+$/, ""), hasMore: true };
}

/** Forme publique d'un article (jamais la ligne brute). */
export function articleToJson(row: FeedArticleRow, full = false) {
  const { preview, hasMore } = contentPreview(row.content || "");
  return {
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt ?? "",
    coverUrl: row.cover_url,
    category: row.category,
    publishedAt: row.published_at != null ? Number(row.published_at) : null,
    productId: row.product_id,
    // Aperçu du vrai contenu (flux éditorial) — toujours présent, léger.
    preview,
    hasMore,
    ...(full ? { content: row.content, videoUrl: row.video_url } : {}),
  };
}
