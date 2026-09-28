export const runtime = 'edge';
/**
 * Arsenal — /api/media/[name]
 * GET (public) : récupère l'URL d'un média depuis D1.
 */
import { NextRequest, NextResponse } from "next/server";
import { getMediaItem } from "@/lib/server/store";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const media = await getMediaItem(name);
  
  if (!media) {
    return NextResponse.json({ ok: false, error: "Média introuvable." }, { status: 404 });
  }

  // Redirection vers l'URL hébergée (GitHub ou CDN)
  return NextResponse.redirect(media.url, 301);
}
