import { Hono } from "hono";
import { isAdmin, unauthorized, sha256hex } from "../../src/lib/server/auth";
import { securityEventStatement } from "../../src/lib/server/user-auth";
import {
  articleToJson,
  createArticle,
  deleteArticle,
  getArticleById,
  getPublishedArticleBySlug,
  listAllArticles,
  listPublishedArticles,
  normalizeArticleInput,
  setArticleStatus,
  slugTaken,
  updateArticle,
} from "../../src/lib/server/feed";
import type { App, Env } from "../env";

/**
 * Feed Arsenal Tools (refonte 05/10) — couche éditoriale.
 *
 * Public :
 *   GET  /api/feed?limit=      articles publiés (liste légère)
 *   GET  /api/feed/:slug       article publié complet (404 si brouillon/inconnu)
 *
 * Admin (X-Admin-Auth) :
 *   GET    /api/admin/feed                    tous les articles (brouillons compris)
 *   POST   /api/admin/feed                    créer (brouillon)
 *   PUT    /api/admin/feed/:id                modifier
 *   POST   /api/admin/feed/:id/status         publier / dépublier
 *   DELETE /api/admin/feed/:id                supprimer (définitif — contenu éditorial)
 */

export const feedRoutes: App = new Hono<{ Bindings: Env }>()
  .get("/api/feed", async (c) => {
    const limitRaw = Number(c.req.query("limit"));
    const articles = await listPublishedArticles(
      c.env.DB,
      Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 50
    );
    return c.json({ ok: true, articles: articles.map((a) => articleToJson(a)) });
  })
  .get("/api/feed/:slug", async (c) => {
    const slug = String(c.req.param("slug") ?? "").trim().toLowerCase();
    if (!slug) return c.json({ ok: false, error: "Article introuvable." }, 404);
    const article = await getPublishedArticleBySlug(c.env.DB, slug);
    if (!article) return c.json({ ok: false, error: "Article introuvable." }, 404);
    return c.json({ ok: true, article: articleToJson(article, true) });
  })

  /* ------------------------------- Admin ------------------------------- */

  .get("/api/admin/feed", async (c) => {
    if (!(await isAdmin(c.req.raw, c.env))) return unauthorized();
    const articles = await listAllArticles(c.env.DB);
    return c.json({
      ok: true,
      articles: articles.map((a) => ({
        id: a.id,
        slug: a.slug,
        title: a.title,
        excerpt: a.excerpt ?? "",
        content: a.content,
        coverUrl: a.cover_url,
        category: a.category,
        videoUrl: a.video_url,
        productId: a.product_id,
        status: a.status === "published" ? "published" : "draft",
        publishedAt: a.published_at != null ? Number(a.published_at) : null,
        updatedAt: Number(a.updated_at),
      })),
    });
  })

  .post("/api/admin/feed", async (c) => {
    if (!(await isAdmin(c.req.raw, c.env))) return unauthorized();
    let body: Record<string, unknown>;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return c.json({ ok: false, error: "JSON invalide." }, 400);
    }
    const { errors, data } = normalizeArticleInput(body);
    if (errors.length) return c.json({ ok: false, error: errors.join(" ") }, 400);
    if (await slugTaken(c.env.DB, data.slug)) {
      return c.json({ ok: false, error: `L'identifiant d'URL « ${data.slug} » est déjà utilisé.` }, 409);
    }
    const article = await createArticle(c.env.DB, data);
    await securityEventStatement(c.env.DB, {
      actor: "admin",
      action: "admin_feed_create",
      ipHash: sha256hex(c.req.header("cf-connecting-ip") || "unknown"),
      meta: { articleId: article.id, slug: article.slug },
    }).run();
    return c.json({ ok: true, id: article.id, slug: article.slug }, 201);
  })

  .put("/api/admin/feed/:id", async (c) => {
    if (!(await isAdmin(c.req.raw, c.env))) return unauthorized();
    const id = c.req.param("id");
    const existing = await getArticleById(c.env.DB, id);
    if (!existing) return c.json({ ok: false, error: "Article introuvable." }, 404);
    let body: Record<string, unknown>;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return c.json({ ok: false, error: "JSON invalide." }, 400);
    }
    const { errors, data } = normalizeArticleInput(body, existing);
    if (errors.length) return c.json({ ok: false, error: errors.join(" ") }, 400);
    if (await slugTaken(c.env.DB, data.slug, id)) {
      return c.json({ ok: false, error: `L'identifiant d'URL « ${data.slug} » est déjà utilisé.` }, 409);
    }
    await updateArticle(c.env.DB, id, data);
    return c.json({ ok: true, id, slug: data.slug });
  })

  .post("/api/admin/feed/:id/status", async (c) => {
    if (!(await isAdmin(c.req.raw, c.env))) return unauthorized();
    const id = c.req.param("id");
    const existing = await getArticleById(c.env.DB, id);
    if (!existing) return c.json({ ok: false, error: "Article introuvable." }, 404);
    let body: { status?: unknown };
    try {
      body = (await c.req.json()) as { status?: unknown };
    } catch {
      body = {};
    }
    const status = body.status === "published" || body.status === "draft" ? body.status : null;
    if (!status) {
      return c.json({ ok: false, error: "Statut invalide (draft, published)." }, 400);
    }
    await setArticleStatus(c.env.DB, id, status);
    return c.json({ ok: true, id, status });
  })

  .delete("/api/admin/feed/:id", async (c) => {
    if (!(await isAdmin(c.req.raw, c.env))) return unauthorized();
    const id = c.req.param("id");
    const ok = await deleteArticle(c.env.DB, id);
    if (!ok) return c.json({ ok: false, error: "Article introuvable." }, 404);
    return c.json({ ok: true, deleted: id });
  });
