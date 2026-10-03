/**
 * Arsenal — Accès D1. Fonctions pures : la base est passée en paramètre (le
 * Worker fournit env.DB). Contrats d'API inchangés.
 *
 * ⚠️ Schéma aligné sur la base de PRODUCTION `arsenal-db-prod` (vérifié le
 * 30/09/2026) — qui diffère du schéma d'origine : analytique normalisée en
 * quatre tables (analytics_counters / clicks_by_product / visits_by_day /
 * recent_visits) et `settings` (clé/valeur) au lieu de `config`.
 */
import { Product, Analytics, MediaItem, FulfillmentMethod, DeliveryKind, PRODUCT_LANGUAGE_CODES, ProductLanguage } from "./types";

const RECENT_VISITS_MAX = 500;

/**
 * Méthode de fulfillment EFFECTIVEMENT stockée : toute valeur inconnue retombe
 * sur `manual` (défaut du contrat) — même règle que
 * `normalizeFulfillmentMethod` de `fulfillment.ts`, dupliquée ici pour éviter un
 * cycle d'imports (`fulfillment.ts` importe déjà `store.ts`).
 */
function normalizeFulfillmentMethod(raw: unknown): FulfillmentMethod {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (value === "chariow_free_checkout") return "chariow_free_checkout";
  if (value === "chariow_discount_checkout") return "chariow_discount_checkout";
  return "manual";
}

/**
 * Type de livraison EFFECTIVEMENT stocké (migration 0006) : `file` | `license`
 * | `null`. Toute valeur inconnue retombe sur `null` (aucune livraison
 * Arsenal) — jamais de livraison devinée à partir d'une donnée illisible.
 */
function normalizeDeliveryKind(raw: unknown): DeliveryKind | null {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (value === "file") return "file";
  if (value === "license") return "license";
  return null;
}

/**
 * Langues du produit (migration 0007) : la colonne `languages` contient un
 * tableau JSON de codes connus (ou NULL). Analyse DÉFENSIVE — jamais d'erreur :
 * valeur illisible, non-tableau ou codes inconnus sont ignorés, doublons
 * supprimés (filtre sur la liste FIGÉE, donc ordre canonique), et un résultat
 * vide vaut `undefined` (« non applicable »).
 */
function parseLanguages(raw: unknown): ProductLanguage[] | undefined {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return undefined;
    const languages = PRODUCT_LANGUAGE_CODES.filter((code) => parsed.includes(code));
    return languages.length > 0 ? languages : undefined;
  } catch {
    return undefined;
  }
}

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
    /* --- Vente en A (Phase 2.6 — migration 0004) --- */
    purchasable: Number(p.purchasable) === 1,
    priceA: Number(p.price_a || 0),
    chariowProductId: p.chariow_product_id || null,
    fulfillmentMethod: normalizeFulfillmentMethod(p.fulfillment_method),
    /* --- Fulfillment par code promo (migration 0005) --- */
    chariowDiscountCode: p.chariow_discount_code || null,
    /* --- Fichier livrable + licences (Phase 2.6 — migration 0006) --- */
    productFileUrl: p.product_file_url || null,
    productFileName: p.product_file_name || null,
    productFileSize:
      p.product_file_size === null || p.product_file_size === undefined
        ? null
        : Number(p.product_file_size),
    productFileMime: p.product_file_mime || null,
    deliveryKind: normalizeDeliveryKind(p.delivery_kind),
    /* --- Langues (migration 0007) --- */
    languages: parseLanguages(p.languages),
  }));
}

export async function saveProducts(db: D1Database, products: Product[]): Promise<void> {
  const batch = products.map(p =>
    db.prepare(`
      INSERT OR REPLACE INTO products
      (id, title, short_description, description, category, action_type, badges, price, action_url, apk_url, pwa_url, command, video_url, image_url, clicks, created_at, updated_at, affiliate_enabled, commission_type, commission_value, reward_a, purchasable, price_a, chariow_product_id, fulfillment_method, chariow_discount_code, product_file_url, product_file_name, product_file_size, product_file_mime, delivery_kind, languages)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      p.id, p.title, p.shortDescription, p.description, p.category,
      p.actionType, JSON.stringify(p.badges), p.price, p.actionUrl,
      p.apkUrl || null, p.pwaUrl || null, p.command || null,
      p.videoUrl || null, p.imageUrl, p.clicks, p.createdAt, p.updatedAt,
      p.affiliateEnabled ? 1 : 0, p.commissionType || null,
      p.commissionValue ?? null, p.rewardA ?? 0,
      p.purchasable ? 1 : 0, Math.trunc(Number(p.priceA ?? 0)) || 0,
      p.chariowProductId || null,
      normalizeFulfillmentMethod(p.fulfillmentMethod),
      p.chariowDiscountCode || null,
      // Fichier livrable + type de livraison (migration 0006) : sans ces
      // colonnes, l'INSERT OR REPLACE ci-dessus effacerait le fichier livrable
      // à chaque modification du produit.
      p.productFileUrl || null,
      p.productFileName || null,
      p.productFileSize === null || p.productFileSize === undefined
        ? null
        : Math.trunc(Number(p.productFileSize)) || 0,
      p.productFileMime || null,
      normalizeDeliveryKind(p.deliveryKind),
      // Langues (migration 0007) : même piège que ci-dessus — sans cette
      // colonne, l'INSERT OR REPLACE effacerait les langues déclarées.
      p.languages?.length ? JSON.stringify(p.languages) : null
    )
  );
  await db.batch(batch);
}

export async function deleteProduct(db: D1Database, id: string): Promise<boolean> {
  const res = await db.prepare("DELETE FROM products WHERE id = ?").bind(id).run();
  return res.success;
}

/* ------------------------ Fichier livrable du produit ------------------------ */
/* Phase 2.6 (migration 0006) : le fichier est hébergé sur GitHub, mais son URL
 * n'est JAMAIS exposée au client — seul `GET /api/purchases/:id/download` (achat
 * vérifié) sert les octets. Ces deux écritures sont donc les seules à manipuler
 * les colonnes `product_file_*`. */

export interface ProductFileColumns {
  url: string;
  name: string;
  size: number;
  mime: string;
}

/** Écrit les 4 colonnes `product_file_*` — false si le produit n'existe pas. */
export async function setProductFile(
  db: D1Database,
  productId: string,
  file: ProductFileColumns
): Promise<boolean> {
  const res = await db
    .prepare(
      `UPDATE products
          SET product_file_url = ?, product_file_name = ?, product_file_size = ?,
              product_file_mime = ?, updated_at = ?
        WHERE id = ?`
    )
    .bind(
      file.url,
      file.name,
      Math.trunc(Number(file.size) || 0),
      file.mime,
      Date.now(),
      productId
    )
    .run();
  return Number(res.meta?.changes ?? 0) > 0;
}

/** Retire le fichier livrable (colonnes à NULL) — false si le produit n'existe pas. */
export async function clearProductFile(db: D1Database, productId: string): Promise<boolean> {
  const res = await db
    .prepare(
      `UPDATE products
          SET product_file_url = NULL, product_file_name = NULL, product_file_size = NULL,
              product_file_mime = NULL, updated_at = ?
        WHERE id = ?`
    )
    .bind(Date.now(), productId)
    .run();
  return Number(res.meta?.changes ?? 0) > 0;
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

/**
 * Retire une ligne de la bibliothèque média. Le stockage sous-jacent n'est
 * JAMAIS touché (blob GitHub conservé, lien toujours servi) : l'appelant
 * (route admin) refuse les médias hébergés en base, pour qui la ligne EST
 * le stockage.
 */
export async function deleteMedia(db: D1Database, name: string): Promise<boolean> {
  const res = await db.prepare("DELETE FROM media WHERE name = ?").bind(name).run();
  return Number(res.meta?.changes ?? 0) > 0;
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
  // La version inclut les CHAMPS dont une modification doit invalider le cache
  // des visiteurs : notamment l'IMAGE et le prix. Sans eux, un produit dont
  // seule la couverture changeait gardait la même version → les navigateurs
  // servaient leur cache et l'ancienne image restait affichée (bug constaté le
  // 03/10 : images changées dans l'admin, invisibles sur les autres appareils).
  // Le contenu de la chaîne n'a pas d'importance — seul son CHANGEMENT compte.
  const view = products.map((p) => [
    p.id,
    p.updatedAt,
    p.clicks + (tracked[p.id] || 0),
    p.imageUrl,
    p.price,
    p.actionUrl,
  ]);
  return Buffer.from(JSON.stringify(view)).toString("base64").slice(0, 22);
}
