/**
 * Bêta Arsenal — /api/track
 * POST (public) : comptage des visites et des clics produits.
 * { type: "visit" }  ou  { type: "click", productId, action? }
 */
import { NextRequest, NextResponse } from "next/server";
import { incrementClick, incrementVisit } from "@/lib/server/store";

function dayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export async function POST(request: NextRequest) {
  let body: { type?: string; productId?: string; action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON invalide." }, { status: 400 });
  }
  const type = String(body.type || "");

  if (type === "visit") {
    await incrementVisit(dayKey(), Date.now());
    return NextResponse.json({ ok: true });
  }

  if (type === "click") {
    const productId = String(body.productId || "");
    if (!productId) {
      return NextResponse.json({ ok: false, error: "productId requis." }, { status: 400 });
    }
    await incrementClick(productId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "Type de suivi inconnu." }, { status: 400 });
}
