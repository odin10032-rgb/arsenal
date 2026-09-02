/**
 * Bêta Arsenal — /api/media/[name]
 * GET (public) : sert un média uploadé (image) depuis data/uploads.
 */
import { NextRequest, NextResponse } from "next/server";
import { readUpload } from "@/lib/server/store";

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  /* Anti path-traversal : on ne garde que le nom de base sûr */
  const safe = name.replace(/[^A-Za-z0-9._-]/g, "");
  if (!safe || safe.startsWith(".") || safe.includes("..")) {
    return NextResponse.json({ ok: false, error: "Nom de fichier invalide." }, { status: 400 });
  }
  const ext = safe.split(".").pop()?.toLowerCase() || "";
  const mime = MIME[ext];
  if (!mime) {
    return NextResponse.json({ ok: false, error: "Type de fichier non autorisé." }, { status: 400 });
  }
  const data = await readUpload(safe);
  if (!data) {
    return NextResponse.json({ ok: false, error: "Média introuvable." }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Length": String(data.length),
    },
  });
}
