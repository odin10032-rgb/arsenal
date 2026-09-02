/**
 * Bêta Arsenal — Couche de persistance serveur (JSON atomique + file d'attente)
 * Les données vivent dans /data (products.json, analytics.json, config.json, uploads/)
 */
import { promises as fs } from "fs";
import path from "path";
import { SEED_PRODUCTS, seedAnalytics } from "./seed";

const DATA_DIR = path.join(process.cwd(), "data");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

/* ------------------------------------------------------------------ */
/* Écritures atomiques sérialisées (100+ utilisateurs simultanés)      */
/* ------------------------------------------------------------------ */
let queue: Promise<unknown> = Promise.resolve();
export function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn as unknown as () => Promise<T>);
  queue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function ensureDirs(): Promise<void> {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, file), "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await ensureDirs();
  const target = path.join(DATA_DIR, file);
  const tmp = target + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tmp, target);
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */
export interface Product {
  id: string;
  title: string;
  shortDescription: string;
  description: string;
  category: "saas" | "desktop" | "mobile" | "ebook" | "prompts";
  actionType: "chariow" | "terminal" | "mobile";
  badges: string[];
  price: string;
  actionUrl: string;
  apkUrl?: string;
  pwaUrl?: string;
  command?: string | null;
  videoUrl?: string | null;
  imageUrl: string;
  clicks: number;
  createdAt: number;
  updatedAt: number;
}

export interface Analytics {
  visits: number;
  actionsTotal: number;
  clicksByProduct: Record<string, number>;
  visitsByDay: Record<string, number>;
  recentVisits: number[];
  updatedAt: number;
}

export interface MediaItem {
  name: string;
  url: string;
  kind: "image";
  size: number;
  uploadedAt: number;
}

export interface AppConfig {
  adminToken?: string;
}

/* ------------------------------------------------------------------ */
/* Caches mémoire                                                      */
/* ------------------------------------------------------------------ */
let productsCache: Product[] | null = null;
let analyticsCache: Analytics | null = null;
let configCache: AppConfig | null = null;
let mediaCache: MediaItem[] | null = null;

export async function getProducts(): Promise<Product[]> {
  if (productsCache) return productsCache;
  const stored = await readJson<Product[] | null>("products.json", null);
  productsCache = stored && stored.length ? stored : [...SEED_PRODUCTS];
  if (!stored || !stored.length) {
    await writeJson("products.json", productsCache);
  }
  return productsCache;
}

export async function saveProducts(products: Product[]): Promise<void> {
  productsCache = products;
  await writeJson("products.json", products);
}

export async function getAnalytics(): Promise<Analytics> {
  if (analyticsCache) return analyticsCache;
  const stored = await readJson<Analytics | null>("analytics.json", null);
  analyticsCache = stored ?? seedAnalytics();
  if (!stored) await writeJson("analytics.json", analyticsCache);
  return analyticsCache;
}

export async function saveAnalytics(a: Analytics): Promise<void> {
  analyticsCache = a;
  a.updatedAt = Date.now();
  await writeJson("analytics.json", a);
}

export async function getConfig(): Promise<AppConfig> {
  if (configCache) return configCache;
  configCache = await readJson<AppConfig>("config.json", {});
  return configCache;
}

export async function saveConfig(c: AppConfig): Promise<void> {
  configCache = c;
  await writeJson("config.json", c);
}

export async function getMedia(): Promise<MediaItem[]> {
  if (mediaCache) return mediaCache;
  mediaCache = await readJson<MediaItem[]>("media.json", []);
  return mediaCache;
}

export async function addMedia(item: MediaItem): Promise<void> {
  // S'assurer que le nom du fichier est sécurisé, sans aucun chemin relatif ou absolu
  const safeName = path.basename(item.name);
  const safeItem = { ...item, name: safeName };
  
  const list = await getMedia();
  mediaCache = [safeItem, ...list];
  await writeJson("media.json", mediaCache);
}

export function uploadsDir(): string {
  return UPLOADS_DIR;
}

export async function writeUpload(filename: string, buf: Buffer): Promise<void> {
  await ensureDirs();
  await fs.writeFile(path.join(UPLOADS_DIR, filename), buf);
}

export async function readUpload(filename: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(path.join(UPLOADS_DIR, filename));
  } catch {
    return null;
  }
}

/* Version du catalogue (invalidation du cache client localStorage) */
export function catalogVersion(products: Product[], tracked: Record<string, number>): string {
  const view = products.map((p) => [p.id, p.updatedAt, p.clicks + (tracked[p.id] || 0)]);
  return Buffer.from(JSON.stringify(view)).toString("base64").slice(0, 22);
}
