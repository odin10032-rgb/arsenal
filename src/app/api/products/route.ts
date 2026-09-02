/**
 * Bêta Arsenal — /api/products
 * GET  : catalogue public (clics fusionnés avec l'analytics, version pour cache client)
 * POST : création d'un produit (admin, X-Admin-Auth)
 */
import { NextRequest, NextResponse } from "next/server";
import { getProducts, saveProducts, getAnalytics, catalogVersion, withLock, Product } from "@/lib/server/store";
import { isAdmin, unauthorized } from "@/lib/server/auth";
import { randomUUID } from "crypto";

const CATEGORIES = ["saas", "desktop", "mobile", "ebook", "prompts"];
const ACTION_TYPES = ["chariow", "terminal", "mobile"];
const BADGES = ["gratuit", "premium", "beta", "nouveau"];

function sanitizeUrl(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return "";
  if (/^(https?:\/\/|\/|data:image\/)/i.test(s)) return s;
  return "";
}

function normalize(body: Record<string, unknown>): { errors: string[]; data: Partial<Product> } {
  const errors: string[] = [];
  const title = String(body.title || "").trim();
  if (title.length < 2) errors.push("Le titre est requis (2 caractères minimum).");

  const category = String(body.category || "");
  if (!CATEGORIES.includes(category)) errors.push("Catégorie invalide.");

  const actionType = String(body.actionType || "");
  if (!ACTION_TYPES.includes(actionType)) errors.push("Type d'action invalide.");

  const actionUrl = sanitizeUrl(body.actionUrl);
  if (actionType !== "chariow" && !actionUrl) errors.push("L'URL d'action est requise.");

  const badges = Array.isArray(body.badges)
    ? (body.badges as unknown[]).map(String).filter((b) => BADGES.includes(b))
    : [];

  const data: Partial<Product> = {
    title,
    shortDescription: String(body.shortDescription || "").trim().slice(0, 140),
    description: String(body.description || "").trim(),
    category: category as Product["category"],
    actionType: actionType as Product["actionType"],
    badges,
    price: String(body.price || "").trim().slice(0, 24),
    actionUrl,
    apkUrl: sanitizeUrl(body.apkUrl) || undefined,
    pwaUrl: sanitizeUrl(body.pwaUrl) || undefined,
    command: body.command ? String(body.command).trim().slice(0, 500) : null,
    videoUrl: sanitizeUrl(body.videoUrl) || null,
    imageUrl: sanitizeUrl(body.imageUrl) || "",
  };
  if (!data.imageUrl) errors.push("Une image de couverture est requise.");
  return { errors, data };
}

export async function GET() {
  const [products, analytics] = await Promise.all([getProducts(), getAnalytics()]);
  const merged = products.map((p) => ({
    ...p,
    clicks: p.clicks + (analytics.clicksByProduct[p.id] || 0),
  }));
  return NextResponse.json({
    ok: true,
    version: catalogVersion(products, analytics.clicksByProduct),
    count: merged.length,
    products: merged,
  });
}

export async function POST(request: NextRequest) {
  if (!(await isAdmin(request))) return unauthorized();
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON invalide." }, { status: 400 });
  }
  const { errors, data } = normalize(body);
  if (errors.length) {
    return NextResponse.json({ ok: false, error: errors.join(" ") }, { status: 400 });
  }
  const now = Date.now();
  const product: Product = {
    id: randomUUID(),
    ...(data as Required<Omit<Product, "id" | "clicks" | "createdAt" | "updatedAt">>),
    clicks: 0,
    createdAt: now,
    updatedAt: now,
  };
  await withLock(async () => {
    const products = await getProducts();
    await saveProducts([product, ...products]);
  });
  return NextResponse.json({ ok: true, product }, { status: 201 });
}
