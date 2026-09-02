/**
 * Bêta Arsenal — /api/analytics
 * GET (admin) : tableau de bord analytique — visites, clics par produit,
 * visites par jour, visiteurs actifs (60 s).
 */
import { NextRequest, NextResponse } from "next/server";
import { getAnalytics, getProducts } from "@/lib/server/store";
import { isAdmin, unauthorized } from "@/lib/server/auth";

export async function GET(request: NextRequest) {
  if (!(await isAdmin(request))) return unauthorized();
  const [analytics, products] = await Promise.all([getAnalytics(), getProducts()]);
  const titles: Record<string, string> = {};
  const images: Record<string, string> = {};
  for (const p of products) {
    titles[p.id] = p.title;
    images[p.id] = p.imageUrl;
  }
  const onlineNow = analytics.recentVisits.filter((t) => Date.now() - t < 60_000).length;
  return NextResponse.json({
    ok: true,
    visits: analytics.visits,
    actionsTotal: analytics.actionsTotal,
    clicksByProduct: analytics.clicksByProduct,
    visitsByDay: analytics.visitsByDay,
    productTitles: titles,
    productImages: images,
    productCount: products.length,
    onlineNow,
    updatedAt: analytics.updatedAt,
  });
}
