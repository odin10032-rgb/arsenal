import { Hono } from "hono";
import { sha256hex } from "../../src/lib/server/auth";
import { securityEventStatement, bearerToken, getAuthContext } from "../../src/lib/server/user-auth";
import {
  getPurchaseForDownload,
  countRecentDownloads,
  downloadEventStatement,
  readDownloadMaxPerHour,
} from "../../src/lib/server/purchases";
import type { App, Env } from "../env";

/**
 * Phase 2.6 — téléchargement vérifié d'un fichier produit vendu en A.
 * L'utilisateur doit posséder la commande (session) et elle doit être livrée.
 * Les octets sont servis par le Worker : l'URL GitHub n'est jamais exposée.
 */
export const downloadRoutes: App = new Hono<{ Bindings: Env }>().get(
  "/api/purchases/:id/download",
  async (c) => {
    const token = bearerToken(c.req.header("authorization"));
    if (!token) return c.json({ ok: false, error: "Authentification requise." }, 401);
    const auth = await getAuthContext(c.env.DB, token);
    if (!auth) return c.json({ ok: false, error: "Session invalide ou expirée." }, 401);
    const userId = auth.user.id;
    const purchaseId = c.req.param("id");

    const purchase = await getPurchaseForDownload(c.env.DB, userId, purchaseId);
    // 404 (et non 403) quand la commande n'appartient pas à l'utilisateur :
    // ne pas révéler l'existence des commandes d'autrui.
    if (!purchase) {
      return c.json({ ok: false, error: "Commande introuvable." }, 404);
    }
    if (purchase.status !== "fulfilled") {
      return c.json(
        { ok: false, error: "Livraison non terminée — réessayez une fois la commande livrée." },
        409
      );
    }
    if (!purchase.product_file_url) {
      return c.json({ ok: false, error: "Aucun fichier associé à ce produit." }, 404);
    }

    // Plafond anti-abus : `download_max_per_hour` téléchargements par utilisateur.
    const maxPerHour = await readDownloadMaxPerHour(c.env.DB);
    const recent = await countRecentDownloads(c.env.DB, userId, Date.now() - 3_600_000);
    if (recent >= maxPerHour) {
      return c.json(
        { ok: false, error: "Trop de téléchargements — réessayez dans une heure." },
        429
      );
    }

    let upstream: Response;
    try {
      upstream = await fetch(purchase.product_file_url, {
        // GitHub raw suit les redirections par défaut ; pas de cache.
        headers: { "User-Agent": "Arsenal-Worker" },
        cf: { cacheTtl: 0, cacheEverything: false },
      } as RequestInit);
    } catch (e: any) {
      console.error("Download fetch error:", e?.message);
      return c.json({ ok: false, error: "Fichier momentanément indisponible." }, 502);
    }
    if (!upstream.ok || !upstream.body) {
      return c.json({ ok: false, error: "Fichier momentanément indisponible." }, 502);
    }

    // Journalisation (traçabilité : qui a téléchargé quoi, quand — IP hashée).
    await downloadEventStatement(c.env.DB, {
      userId,
      purchaseId,
      productId: purchase.product_id,
      ipHash: sha256hex(c.req.header("cf-connecting-ip") || "unknown"),
    }).run();

    const fileName = purchase.product_file_name || `arsenal-${purchaseId.slice(0, 8)}`;
    const mime =
      purchase.product_file_mime ||
      ({ pdf: "application/pdf", epub: "application/epub+zip", zip: "application/zip", apk: "application/vnd.android.package-archive" } as Record<string, string>)[
        fileName.split(".").pop()?.toLowerCase() || ""
      ] ||
      "application/octet-stream";

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `attachment; filename="${fileName.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
        ...(upstream.headers.get("content-length")
          ? { "Content-Length": String(upstream.headers.get("content-length")) }
          : {}),
      },
    });
  }
);
