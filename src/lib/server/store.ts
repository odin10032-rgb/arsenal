/**
 * Arsenal — Accès D1. Fonctions pures : la base est passée en paramètre (le
 * Worker fournit env.DB). Contrats d'API inchangés.
 *
 * ⚠️ Schéma aligné sur la base de PRODUCTION `arsenal-db-prod` (vérifié le
 * 30/09/2026) — qui diffère du schéma d'origine : analytique normalisée en
 * quatre tables (analytics_counters / clicks_by_product / visits_by_day /
 * recent_visits) et `settings` (clé/valeur) au lieu de `config`.
 */
import { Product, Analytics, MediaItem } from "./types";

const RECENT_VISITS_MAX = 500;

/* ------------------------------- Products ------------------------------- */

export async function getProducts(db: D1Database): Promise<Product[]> {
  const { results = [] } = await db
    .prepare("SELECT * FROM products ORDER BY created_at DESC, rowid DESC")
    .all<any>();

  return results.map((p) => ({
    ...p,
    badges: JSON.parse(p.badges || "[]"),
    shortDescription: p.short_description,
    actionType: p.action_type,
    actionUrl: p.action_url,
    apkUrl: p.apk_url || undefined,
    pwaUrl: p.pwa_url || undefined,
    videoUrl: p.video_url || null,
    imageUrl: p.image_url,
    createdAt: Number(p.created_at),
    updatedAt: Number(p.updated_at),
    affiliateEnabled: Number(p.affiliate_enabled) === 1,
    commissionType: p.commission_type || null,
    commissionValue: p.commission_value === null || p.commission_value === undefined ? null : Number(p.commission_value),
    rewardA: Number(p.reward_a || 0),
  }));
}

export async function saveProducts(db: D1Database, products: Product[]): Promise<void> {
  const batch = products.map(p =>
    db.prepare(`
      INSERT OR REPLACE INTO products
      (id, title, short_description, description, category, action_type, badges, price, action_url, apk_url, pwa_url, command, video_url, image_url, clicks, created_at, updated_at, affiliate_enabled, commission_type, commission_value, reward_a)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      p.id, p.title, p.shortDescription, p.description, p.category,
      p.actionType, JSON.stringify(p.badges), p.price, p.actionUrl,
      p.apkUrl || null, p.pwaUrl || null, p.command || null,
      p.videoUrl || null, p.imageUrl, p.clicks, p.createdAt, p.updatedAt,
      p.affiliateEnabled ? 1 : 0, p.commissionType || null,
      p.commissionValue ?? null, p.rewardA ?? 0
    )
  );
  await db.batch(batch);
}

export async function deleteProduct(db: D1Database, id: string): Promise<boolean> {
  const res = await db.prepare("DELETE FROM products WHERE id = ?").bind(id).run();
  return res.success;
}

/* --------------------------- Analytique (normalisée) --------------------------- */

export async function getAnalytics(db: D1Database): Promise<Analytics> {
  const [countersRes, clicksRes, daysRes, visitsRes] = await Promise.all([
    db.prepare("SELECT key, value FROM analytics_counters").all<any>(),
    db.prepare("SELECT product_id, clicks FROM clicks_by_product").all<any>(),
    db.prepare("SELECT day, visits FROM visits_by_day ORDER BY day").all<any>(),
    db.prepare("SELECT ts FROM recent_visits ORDER BY ts DESC LIMIT ?").bind(RECENT_VISITS_MAX).all<any>(),
  ]);

  const counters: Record<string, number> = {};
  for (const row of countersRes.results || []) counters[row.key] = Number(row.value);

  const clicksByProduct: Record<string, number> = {};
  for (const row of clicksRes.results || []) clicksByProduct[row.product_id] = Number(row.clicks);

  const visitsByDay: Record<string, number> = {};
  for (const row of daysRes.results || []) visitsByDay[row.day] = Number(row.visits);

  return {
    visits: counters.visits || 0,
    actionsTotal: counters.actions_total || 0,
    clicksByProduct,
    visitsByDay,
    recentVisits: (visitsRes.results || []).map((r) => Number(r.ts)),
    updatedAt: counters.updated_at || Date.now(),
  };
}

/** Purge les visites les plus anciennes au-delà de RECENT_VISITS_MAX. */
function pruneRecentVisitsStatement(db: D1Database): D1PreparedStatement {
  return db.prepare(
    "DELETE FROM recent_visits WHERE ts NOT IN (SELECT ts FROM recent_visits ORDER BY ts DESC LIMIT ?)"
  ).bind(RECENT_VISITS_MAX);
}

/** Clic produit : compteurs + JSON par produit + présence — le tout en un batch atomique. */
export async function incrementClick(db: D1Database, productId: string): Promise<void> {
  const now = Date.now();
  await db.batch([
    db.prepare(
      "INSERT INTO clicks_by_product (product_id, clicks) VALUES (?, 1) ON CONFLICT(product_id) DO UPDATE SET clicks = clicks + 1"
    ).bind(productId),
    db.prepare(
      "INSERT INTO analytics_counters (key, value) VALUES ('actions_total', 1) ON CONFLICT(key) DO UPDATE SET value = value + 1"
    ),
    db.prepare(
      "INSERT INTO analytics_counters (key, value) VALUES ('updated_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    ).bind(now),
    db.prepare("INSERT OR REPLACE INTO recent_visits (ts) VALUES (?)").bind(now),
    pruneRecentVisitsStatement(db),
  ]);
}

/** Visite : compteur global + par jour + présence — un seul batch atomique. */
export async function incrementVisit(db: D1Database, dayKey: string, timestamp: number): Promise<void> {
  await db.batch([
    db.prepare(
      "INSERT INTO analytics_counters (key, value) VALUES ('visits', 1) ON CONFLICT(key) DO UPDATE SET value = value + 1"
    ),
    db.prepare(
      "INSERT INTO visits_by_day (day, visits) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET visits = visits + 1"
    ).bind(dayKey),
    db.prepare(
      "INSERT INTO analytics_counters (key, value) VALUES ('updated_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    ).bind(timestamp),
    db.prepare("INSERT OR REPLACE INTO recent_visits (ts) VALUES (?)").bind(timestamp),
    pruneRecentVisitsStatement(db),
  ]);
}

/* --------------------------------- Media --------------------------------- */

export async function getMedia(db: D1Database): Promise<MediaItem[]> {
  const { results = [] } = await db
    .prepare("SELECT name, url, kind, size, mime, hosted, uploaded_at FROM media ORDER BY uploaded_at DESC")
    .all<any>();
  return results.map((m) => ({
    name: m.name,
    url: m.url || "",
    kind: m.kind || "image",
    size: Number(m.size),
    mime: m.mime || undefined,
    hosted: m.hosted || undefined,
    uploadedAt: Number(m.uploaded_at),
  }));
}

export async function addMedia(db: D1Database, item: MediaItem): Promise<void> {
  await db.prepare(`
    INSERT OR REPLACE INTO media (name, url, kind, size, data, mime, hosted, uploaded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    item.name, item.url || null, item.kind, item.size,
    item.data || null, item.mime || null, item.hosted || "d1", item.uploadedAt
  ).run();
}

/** Média complet (avec data/mime) — pour servir les octets depuis D1. */
export async function getMediaItem(db: D1Database, name: string): Promise<MediaItem | null> {
  const row = await db
    .prepare("SELECT name, url, kind, size, data, mime, hosted, uploaded_at FROM media WHERE name = ?")
    .bind(name)
    .first<any>();
  if (!row) return null;
  return {
    name: row.name,
    url: row.url || "",
    kind: row.kind || "image",
    size: Number(row.size),
    data: row.data || undefined,
    mime: row.mime || undefined,
    hosted: row.hosted || undefined,
    uploadedAt: Number(row.uploaded_at),
  };
}

/* -------------------------------- Settings -------------------------------- */

/** Table `settings` (clé/valeur) — remplace l'ancienne table `config`. */
export async function getSetting(db: D1Database, key: string): Promise<string | null> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first<{ value: string }>();
  return row?.value ?? null;
}

export async function setSetting(db: D1Database, key: string, value: string): Promise<void> {
  await db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).bind(key, value).run();
}

/* ------------------------------- Divers ------------------------------- */

export function catalogVersion(products: Product[], tracked: Record<string, number>): string {
  const view = products.map((p) => [p.id, p.updatedAt, p.clicks + (tracked[p.id] || 0)]);
  return Buffer.from(JSON.stringify(view)).toString("base64").slice(0, 22);
}
