import { Hono } from "hono";
import { getMedia, addMedia, getMediaItem } from "../../src/lib/server/store";
import { isAdmin, unauthorized } from "../../src/lib/server/auth";
import { uploadToGitHub } from "../../src/lib/server/github";
import type { MediaItem } from "../../src/lib/server/types";
import type { App, Env } from "../env";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 Mo

export const mediaRoutes: App = new Hono<{ Bindings: Env }>()
  /** GET /api/media (admin) — liste des médias (contrat front : {uploads}). */
  .get("/api/media", async (c) => {
    if (!(await isAdmin(c.req.raw, c.env))) return unauthorized();
    const items = await getMedia(c.env.DB);
    return c.json({
      ok: true,
      uploads: items.map((m) => ({
        url: m.url,
        filename: m.name,
        hosted: true,
        kind: m.kind,
        size: m.size,
        uploadedAt: m.uploadedAt,
      })),
    });
  })

  /** POST /api/media (admin, multipart) — upload GitHub (PAT préféré en secret, fallback header). */
  .post("/api/media", async (c) => {
    if (!(await isAdmin(c.req.raw, c.env))) return unauthorized();

    const formData = await c.req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return c.json({ ok: false, error: "Aucun fichier." }, 400);
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return c.json({ ok: false, error: "Fichier trop volumineux (10 Mo maximum)." }, 413);
    }

    // Config GitHub : secret Worker d'abord, headers en repli (compat front prod).
    const githubToken = c.env.GITHUB_TOKEN || c.req.header("X-GitHub-Token");
    const githubOwner =
      c.env.GITHUB_REPO_OWNER || c.req.header("X-GitHub-Repo")?.split("/")[0];
    const githubRepo =
      c.env.GITHUB_REPO_NAME || c.req.header("X-GitHub-Repo")?.split("/")[1];
    const githubBranch = c.env.GITHUB_BRANCH || c.req.header("X-GitHub-Branch") || "main";

    if (!githubToken || !githubOwner || !githubRepo) {
      return c.json(
        {
          ok: false,
          error:
            "Upload GitHub non configuré (GITHUB_TOKEN / GITHUB_REPO_OWNER / GITHUB_REPO_NAME requis).",
        },
        500
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    // Nettoyage strict du nom de fichier + anti path-traversal
    const originalName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const filename = `${Date.now()}-${originalName}`;
    if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
      return c.json({ ok: false, error: "Nom de fichier invalide." }, 400);
    }

    try {
      const url = await uploadToGitHub(filename, buffer, {
        token: githubToken,
        owner: githubOwner,
        repo: githubRepo,
        branch: githubBranch,
      });

      const item: MediaItem = {
        name: filename,
        url,
        kind: "image",
        size: buffer.length,
        uploadedAt: Date.now(),
      };
      await addMedia(c.env.DB, item);

      // {url} pour le front Next, {item} pour compat historique.
      return c.json({ ok: true, url: item.url, item });
    } catch (e: any) {
      console.error("Upload error:", e?.message);
      return c.json({ ok: false, error: e?.message || "Erreur upload GitHub" }, 500);
    }
  })

  /** GET /api/media/:name (public) — redirige vers l'URL hébergée. */
  .get("/api/media/:name", async (c) => {
    const name = c.req.param("name");
    const media = await getMediaItem(c.env.DB, name);
    if (!media) {
      return c.json({ ok: false, error: "Média introuvable." }, 404);
    }
    return c.redirect(media.url, 301);
  });
