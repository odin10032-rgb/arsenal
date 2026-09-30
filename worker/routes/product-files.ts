import { Hono } from "hono";
import { isAdmin, unauthorized, sha256hex } from "../../src/lib/server/auth";
import { securityEventStatement } from "../../src/lib/server/user-auth";
import { uploadToGitHub } from "../../src/lib/server/github";
import type { App, Env } from "../env";

/**
 * Phase 2.6 — fichier livrable d'un produit vendu en A.
 * Hébergé sur GitHub (même canal que les médias), servi par une route VÉRIFIÉE
 * : l'URL brute n'est jamais exposée au client.
 */

const MAX_PRODUCT_FILE_BYTES = 25 * 1024 * 1024; // 25 Mo (limite pratique de l'API Contents GitHub)

const ALLOWED_EXTENSIONS = new Set(["pdf", "epub", "mobi", "zip", "mp4", "apk"]);

function extOf(name: string): string {
  const parts = String(name || "").toLowerCase().split(".");
  return parts.length > 1 ? parts.pop()!.replace(/[^a-z0-9]/g, "") : "";
}

function safeFileName(name: string): string {
  return String(name || "").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);
}

export const adminFileRoutes: App = new Hono<{ Bindings: Env }>()
  /**
   * POST /api/admin/products/:id/file — téléverse le fichier livrable du produit
   * vers GitHub (sous-dossier `products/`) et enregistre ses métadonnées.
   */
  .post("/api/admin/products/:id/file", async (c) => {
    if (!(await isAdmin(c.req.raw, c.env))) return unauthorized();
    const productId = c.req.param("id");

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
        503
      );
    }

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
    if (file.size > MAX_PRODUCT_FILE_BYTES) {
      return c.json(
        {
          ok: false,
          error:
            "Fichier trop volumineux (25 Mo maximum). Au-delà, prévoir un stockage objet (R2).",
        },
        413
      );
    }
    const originalName = file.name || "";
    const ext = extOf(originalName);
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return c.json(
        {
          ok: false,
          error: "Type de fichier non autorisé — formats acceptés : pdf, epub, mobi, zip, mp4, apk.",
        },
        400
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = `${Date.now().toString(36)}-${safeFileName(originalName)}`;
    if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
      return c.json({ ok: false, error: "Nom de fichier invalide." }, 400);
    }

    try {
      const url = await uploadToGitHub(filename, buffer, {
        token: githubToken,
        owner: githubOwner,
        repo: githubRepo,
        branch: githubBranch,
        folder: "products",
      });
      const mime = file.type || "application/octet-stream";
      const displayName = safeFileName(originalName);

      await c.env.DB.batch([
        c.env.DB.prepare(
          `UPDATE products
             SET product_file_url = ?, product_file_name = ?, product_file_size = ?, product_file_mime = ?, updated_at = ?
           WHERE id = ?`
        ).bind(url, displayName, buffer.length, mime, Date.now(), productId),
        securityEventStatement(c.env.DB, {
          actor: "admin",
          action: "admin_product_file_upload",
          ipHash: sha256hex(c.req.header("cf-connecting-ip") || "unknown"),
          meta: { productId, filename: displayName, size: buffer.length },
        }),
      ]);

      return c.json({
        ok: true,
        file: { name: displayName, size: buffer.length, mime },
      });
    } catch (e: any) {
      console.error("Upload fichier produit:", e?.message);
      return c.json({ ok: false, error: e?.message || "Erreur d'upload GitHub." }, 500);
    }
  })

  /** DELETE /api/admin/products/:id/file — retire le fichier livrable. */
  .delete("/api/admin/products/:id/file", async (c) => {
    if (!(await isAdmin(c.req.raw, c.env))) return unauthorized();
    const productId = c.req.param("id");
    await c.env.DB.batch([
      c.env.DB.prepare(
        `UPDATE products
           SET product_file_url = NULL, product_file_name = NULL, product_file_size = NULL, product_file_mime = NULL, updated_at = ?
         WHERE id = ?`
      ).bind(Date.now(), productId),
      securityEventStatement(c.env.DB, {
        actor: "admin",
        action: "admin_product_file_delete",
        ipHash: sha256hex(c.req.header("cf-connecting-ip") || "unknown"),
        meta: { productId },
      }),
    ]);
    return c.json({ ok: true });
  });
