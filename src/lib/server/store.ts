import { getCloudflareContext } from "@cloudflare/next-on-pages";
import { Product, Analytics, MediaItem, AppConfig } from "./types";

const getDB = () => getCloudflareContext().env.DB;

export async function getProducts(): Promise<Product[]> {
  const { results } = await getDB()
    .prepare("SELECT * FROM products ORDER BY created_at DESC")
    .all<any>();
  
  return results.map(p => ({
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
    updatedAt: Number(p.updated_at)
  }));
}

export async function saveProducts(products: Product[]): Promise<void> {
  const db = getDB();
  const batch = products.map(p => 
    db.prepare(`
      INSERT OR REPLACE INTO products 
      (id, title, short_description, description, category, action_type, badges, price, action_url, apk_url, pwa_url, command, video_url, image_url, clicks, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      p.id, p.title, p.shortDescription, p.description, p.category, 
      p.actionType, JSON.stringify(p.badges), p.price, p.actionUrl, 
      p.apkUrl || null, p.pwaUrl || null, p.command || null, 
      p.videoUrl || null, p.imageUrl, p.clicks, p.createdAt, p.updatedAt
    )
  );
  await db.batch(batch);
}

export async function getAnalytics(): Promise<Analytics> {
  const row = await getDB()
    .prepare("SELECT * FROM analytics WHERE id = 1")
    .first<any>();
    
  if (!row) return { visits: 0, actionsTotal: 0, clicksByProduct: {}, visitsByDay: {}, recentVisits: [], updatedAt: Date.now() };

  return {
    visits: row.visits,
    actionsTotal: row.actions_total,
    clicksByProduct: JSON.parse(row.clicks_by_product || "{}"),
    visitsByDay: JSON.parse(row.visits_by_day || "{}"),
    recentVisits: JSON.parse(row.recent_visits || "[]"),
    updatedAt: row.updated_at
  };
}

export async function saveAnalytics(a: Analytics): Promise<void> {
  await getDB().prepare(`
    INSERT OR REPLACE INTO analytics 
    (id, visits, actions_total, clicks_by_product, visits_by_day, recent_visits, updated_at)
    VALUES (1, ?, ?, ?, ?, ?, ?)
  `).bind(
    a.visits, a.actionsTotal, JSON.stringify(a.clicksByProduct), 
    JSON.stringify(a.visitsByDay), JSON.stringify(a.recentVisits), Date.now()
  ).run();
}

export async function getMedia(): Promise<MediaItem[]> {
  const { results } = await getDB().prepare("SELECT * FROM media ORDER BY uploaded_at DESC").all<any>();
  return results.map(m => ({
    name: m.name,
    url: m.url,
    kind: m.kind,
    size: m.size,
    uploadedAt: Number(m.uploaded_at)
  }));
}

export async function addMedia(item: MediaItem): Promise<void> {
  await getDB().prepare(`
    INSERT INTO media (name, url, kind, size, uploaded_at) VALUES (?, ?, ?, ?, ?)
  `).bind(item.name, item.url, item.kind, item.size, item.uploadedAt).run();
}

export async function getConfig(): Promise<AppConfig> {
  const row = await getDB().prepare("SELECT admin_token FROM config WHERE id = 1").first<any>();
  return { adminToken: row?.admin_token };
}

export async function saveConfig(c: AppConfig): Promise<void> {
  await getDB().prepare(`
    INSERT OR REPLACE INTO config (id, admin_token) VALUES (1, ?)
  `).bind(c.adminToken).run();
}
