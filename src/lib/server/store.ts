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
    size: Number(m.size),
    uploadedAt: Number(m.uploaded_at)
  }));
}

export async function getConfig(): Promise<AppConfig> {
  const row = await getDB().prepare("SELECT admin_token FROM config WHERE id = 1").first<any>();
  return { adminToken: row?.admin_token };
}

export async function getMediaItem(name: string): Promise<MediaItem | null> {
  const row = await getDB().prepare("SELECT * FROM media WHERE name = ?").bind(name).first<any>();
  if (!row) return null;
  return {
    name: row.name,
    url: row.url,
    kind: row.kind,
    size: Number(row.size),
    uploadedAt: Number(row.uploaded_at)
  };
}

export async function deleteProduct(id: string): Promise<boolean> {
  const res = await getDB().prepare("DELETE FROM products WHERE id = ?").bind(id).run();
  return res.success;
}

export async function saveConfig(c: AppConfig): Promise<void> {
  await getDB().prepare(`
    INSERT OR REPLACE INTO config (id, admin_token) VALUES (1, ?)
  `).bind(c.adminToken).run();
}

export async function catalogVersion(products: Product[], tracked: Record<string, number>): Promise<string> {
  const view = products.map((p) => [p.id, p.updatedAt, p.clicks + (tracked[p.id] || 0)]);
  return Buffer.from(JSON.stringify(view)).toString("base64").slice(0, 22);
}

// Pour compatibilité API (on utilise saveProducts qui fait le job)
export const addProduct = saveProducts;

// Pour compatibilité API (on ne fait plus d'écriture fichier, donc on ignore silencieusement)
export async function writeUpload(filename: string, buf: Buffer): Promise<void> {
  console.warn("writeUpload appelé en mode serverless (ignoré, upload via GitHub)");
}

export async function incrementClick(productId: string): Promise<void> {
  const db = getDB();
  await db.prepare(`
    UPDATE analytics 
    SET actions_total = actions_total + 1,
        clicks_by_product = json_set(clicks_by_product, '$.' || ?, ifnull(json_extract(clicks_by_product, '$.' || ?), 0) + 1),
        updated_at = ?
    WHERE id = 1
  `).bind(productId, productId, Date.now()).run();

  const current = await getAnalytics();
  const newRecent = [Date.now(), ...current.recentVisits].slice(0, 500);
  await db.prepare("UPDATE analytics SET recent_visits = ? WHERE id = 1").bind(JSON.stringify(newRecent)).run();
}

export async function incrementVisit(dayKey: string, timestamp: number): Promise<void> {
  const db = getDB();
  
  await db.prepare(`
    UPDATE analytics 
    SET visits = visits + 1,
        visits_by_day = json_set(visits_by_day, '$.' || ?, ifnull(json_extract(visits_by_day, '$.' || ?), 0) + 1),
        updated_at = ?
    WHERE id = 1
  `).bind(dayKey, dayKey, timestamp).run();

  const current = await getAnalytics();
  const newRecent = [timestamp, ...current.recentVisits].slice(0, 500);
  await db.prepare("UPDATE analytics SET recent_visits = ? WHERE id = 1").bind(JSON.stringify(newRecent)).run();
}
