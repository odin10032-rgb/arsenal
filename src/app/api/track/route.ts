/**
 * Bêta Arsenal — /api/track
 * POST (public) : comptage des visites et des clics produits.
 * { type: "visit" }  ou  { type: "click", productId, action? }
 */
import { NextRequest, NextResponse } from "next/server";
import { getAnalytics, saveAnalytics, getProducts, saveProducts, withLock } from "@/lib/server/store";

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
    await withLock(async () => {
      const a = await getAnalytics();
      a.visits += 1;
      const key = dayKey();
      a.visitsByDay[key] = (a.visitsByDay[key] || 0) + 1;
      a.recentVisits = [...a.recentVisits.filter((t) => Date.now() - t < 60_000), Date.now()].slice(-500);
      await saveAnalytics(a);
    });
    return NextResponse.json({ ok: true });
  }

  if (type === "click") {
    const productId = String(body.productId || "");
    if (!productId) {
      return NextResponse.json({ ok: false, error: "productId requis." }, { status: 400 });
    }
    await withLock(async () => {
      const a = await getAnalytics();
      a.actionsTotal += 1;
      a.clicksByProduct[productId] = (a.clicksByProduct[productId] || 0) + 1;
      /* Un clic est aussi un signal de présence (visiteurs actifs 60 s) */
      a.recentVisits = [...a.recentVisits.filter((t) => Date.now() - t < 60_000), Date.now()].slice(-500);
      await saveAnalytics(a);
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "Type de suivi inconnu." }, { status: 400 });
}
