import { Hono } from "hono";
import { getMedia, addMedia, getMediaItem, deleteMedia } from "../../src/lib/server/store";
import { isAdmin, unauthorized, sha256hex } from "../../src/lib/server/auth";
import { securityEventStatement } from "../../src/lib/server/user-auth";
import { uploadToGitHub } from "../../src/lib/server/github";
import type { MediaItem } from "../../src/lib/server/types";
import type { App, Env } from "../env";

/** Aligné sur le worker de production : 5 Mo, images uniquement. */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
};
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

function extOf(name: string): string {
  const parts = String(name || "").toLowerCase().split(".");
  return parts.length > 1 ? parts.pop()!.replace(/[^a-z0-9]/g, "") : "";
}

function safeMediaName(name: string): string {
  return String(name || "").replace(/[^A-Za-z0-9._-]/g, "");
}

function bytesFromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Upload d'image (admin) — mêmes règles que la prod :
 * - 5 Mo maximum, images uniquement (jpg, jpeg, png, webp, gif, avif) ;
 * - GitHub si le PAT est configuré (hosted "github"), sinon stockage en base64
 *   dans D1 (hosted "d1") — aucun échec bloquant.
 * Réponse : { ok, url, item } (le front lit `url`).
 */
async function handleUpload(c: any): Promise<Response> {
  if (!(await isAdmin(c.req.raw, c.env))) return unauthorized();

  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return c.json({ ok: false, error: "Requête multipart invalide." }, 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return c.json({ ok: false, error: "Champ « file » manquant." }, 400);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return c.json({ ok: false, error: "Fichier trop volumineux (5 Mo maximum)." }, 413);
  }

  const mime = (file.type || "").toLowerCase();
  const ext = extOf(file.name) || EXT_BY_MIME[mime] || "";
  if (!MIME_BY_EXT[ext] && !EXT_BY_MIME[mime]) {
    return c.json(
      { ok: false, error: "Type de fichier non autorisé — images uniquement (jpg, png, webp, gif, avif)." },
      400
    );
  }
  const resolvedMime = mime || MIME_BY_EXT[ext] || "image/png";
  const finalExt = ext || EXT_BY_MIME[resolvedMime] || "png";
  const name = `ba-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${finalExt}`;

  const buffer = await file.arrayBuffer();
  const githubToken = c.env.GITHUB_TOKEN || c.req.header("X-GitHub-Token");
  const githubOwner = c.env.GITHUB_REPO_OWNER || c.req.header("X-GitHub-Repo")?.split("/")[0];
  const githubRepo = c.env.GITHUB_REPO_NAME || c.req.header("X-GitHub-Repo")?.split("/")[1];
  const githubBranch = c.env.GITHUB_BRANCH || c.req.header("X-GitHub-Branch") || "main";

  let item: MediaItem;
  if (githubToken && githubOwner && githubRepo) {
    try {
      const url = await uploadToGitHub(name, Buffer.from(buffer), {
        token: githubToken,
        owner: githubOwner,
        repo: githubRepo,
        branch: githubBranch,
      });
      item = { name, url, kind: "image", size: buffer.byteLength, mime: resolvedMime, hosted: "github", uploadedAt: Date.now() };
      await addMedia(c.env.DB, item);
      return c.json({ ok: true, url: item.url, item });
    } catch (e: any) {
      console.error("Upload GitHub échoué, repli D1:", e?.message);
      // repli D1 ci-dessous
    }
  }

  item = {
    name,
    url: `/api/media/${name}`,
    kind: "image",
    size: buffer.byteLength,
    data: toBase64(buffer),
    mime: resolvedMime,
    hosted: "d1",
    uploadedAt: Date.now(),
  };
  await addMedia(c.env.DB, item);
  return c.json({ ok: true, url: item.url, item });
}

export const mediaRoutes: App = new Hono<{ Bindings: Env }>()
  /** POST /api/upload et POST /api/media (admin) — même handler (compat front v0 + prod). */
  .post("/api/upload", handleUpload)
  .post("/api/media", handleUpload)

  /** GET /api/media (admin) — liste (contrat front : {uploads}). */
  .get("/api/media", async (c) => {
    if (!(await isAdmin(c.req.raw, c.env))) return unauthorized();
    const items = await getMedia(c.env.DB);
    return c.json({
      ok: true,
      uploads: items.map((m) => ({
        url: m.hosted === "d1" ? `/api/media/${m.name}` : m.url,
        filename: m.name,
        hosted: m.hosted !== "d1",
        kind: m.kind,
        size: m.size,
        uploadedAt: m.uploadedAt,
      })),
    });
  })

  /**
   * GET /api/media/:name (public) — sert les octets si le média est en D1,
   * sinon redirige vers son URL hébergée (comportement d'origine).
   */
  .get("/api/media/:name", async (c) => {
    const name = safeMediaName(c.req.param("name"));
    if (!name || name.startsWith(".") || name.includes("..")) {
      return c.json({ ok: false, error: "Nom de fichier invalide." }, 400);
    }
    const media = await getMediaItem(c.env.DB, name);
    if (!media) {
      return c.json({ ok: false, error: "Média introuvable." }, 404);
    }
    if (media.data) {
      const bytes = bytesFromBase64(media.data);
      const ext = extOf(name);
      return new Response(bytes, {
        status: 200,
        headers: {
          "Content-Type": media.mime || MIME_BY_EXT[ext] || "application/octet-stream",
          "Content-Length": String(bytes.length),
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }
    return c.redirect(media.url, 301);
  })

  /**
   * DELETE /api/admin/media/:name (admin) — retire le média de la BIBLIOTHÈQUE.
   * Le fichier et son lien ne sont pas touchés : tout élément qui utilise
   * l'URL (couverture produit, etc.) continue de fonctionner.
   * - hébergé GitHub → la ligne est supprimée, le blob reste en ligne ;
   * - stocké en base (repli D1) → 409 : la ligne EST le stockage, la retirer
   *   effacerait le média et casserait son lien.
   */
  .delete("/api/admin/media/:name", async (c) => {
    if (!(await isAdmin(c.req.raw, c.env))) return unauthorized();
    const name = safeMediaName(c.req.param("name"));
    if (!name || name.startsWith(".") || name.includes("..")) {
      return c.json({ ok: false, error: "Nom de fichier invalide." }, 400);
    }
    const media = await getMediaItem(c.env.DB, name);
    if (!media) {
      return c.json({ ok: false, error: "Média introuvable." }, 404);
    }
    if (media.hosted !== "github") {
      return c.json(
        {
          ok: false,
          error:
            "Média stocké dans la base (repli sans GitHub) : le retirer effacerait le fichier " +
            "et son lien. Il est conservé.",
        },
        409
      );
    }
    await deleteMedia(c.env.DB, name);
    await securityEventStatement(c.env.DB, {
      actor: "admin",
      action: "admin_media_delete",
      ipHash: sha256hex(c.req.header("cf-connecting-ip") || "unknown"),
      meta: { name },
    }).run();
    return c.json({ ok: true, deleted: name });
  });
