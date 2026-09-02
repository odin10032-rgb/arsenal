/**
 * Bêta Arsenal — /api/products/[id]
 * PUT    : modification d'un produit (admin)
 * DELETE : suppression d'un produit (admin)
 */
import { NextRequest, NextResponse } from "next/server";
import { getProducts, saveProducts, getAnalytics, withLock, Product } from "@/lib/server/store";
import { isAdmin, unauthorized } from "@/lib/server/auth";

const CATEGORIES = ["saas", "desktop", "mobile", "ebook", "prompts"];
const ACTION_TYPES = ["chariow", "terminal", "mobile"];
const BADGES = ["gratuit", "premium", "beta", "nouveau"];

function sanitizeUrl(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return "";
  if (/^(https?:\/\/|\/|data:image\/)/i.test(s)) return s;
  return "";
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin(request))) return unauthorized();
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON invalide." }, { status: 400 });
  }

  const title = String(body.title || "").trim();
  const category = String(body.category || "");
  const actionType = String(body.actionType || "");
  if (title.length < 2) return NextResponse.json({ ok: false, error: "Titre requis." }, { status: 400 });
  if (!CATEGORIES.includes(category) || !ACTION_TYPES.includes(actionType)) {
    return NextResponse.json({ ok: false, error: "Catégorie ou type d'action invalide." }, { status: 400 });
  }
  const actionUrl = sanitizeUrl(body.actionUrl);

  const result = await withLock(async () => {
    const products = await getProducts();
    const index = products.findIndex((p) => p.id === id);
    if (index === -1) return null;
    const previous = products[index];
    const updated: Product = {
      ...previous,
      title,
      shortDescription: String(body.shortDescription || "").trim().slice(0, 140),
      description: String(body.description || "").trim(),
      category: category as Product["category"],
      actionType: actionType as Product["actionType"],
      badges: Array.isArray(body.badges)
        ? (body.badges as unknown[]).map(String).filter((b) => BADGES.includes(b))
        : [],
      price: String(body.price || "").trim().slice(0, 24),
      actionUrl,
      apkUrl: sanitizeUrl(body.apkUrl) || undefined,
      pwaUrl: sanitizeUrl(body.pwaUrl) || undefined,
      command: body.command ? String(body.command).trim().slice(0, 500) : null,
      videoUrl: sanitizeUrl(body.videoUrl) || null,
      imageUrl: sanitizeUrl(body.imageUrl) || previous.imageUrl,
      updatedAt: Date.now(),
    };
    products[index] = updated;
    await saveProducts(products);
    return updated;
  });

  if (!result) {
    return NextResponse.json({ ok: false, error: "Produit introuvable." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, product: result });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin(request))) return unauthorized();
  const { id } = await params;
  const found = await withLock(async () => {
    const products = await getProducts();
    const next = products.filter((p) => p.id !== id);
    if (next.length === products.length) return false;
    await saveProducts(next);
    return true;
  });
  if (!found) {
    return NextResponse.json({ ok: false, error: "Produit introuvable." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, deleted: id });
}
