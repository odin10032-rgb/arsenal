-- Arsenal — migration 0001 : schéma de base, ALIGNÉ SUR LA PRODUCTION
-- (`arsenal-db-prod`, vérifié le 30/09/2026).
--
-- ⚠️ Différences avec l'ancien schéma d'origine du dépôt (jamais déployé sur
-- cette base) : l'analytique est NORMALISÉE en quatre tables, et les réglages
-- vivent dans `settings` (clé/valeur) au lieu de `config`.
--
-- Non destructif : CREATE TABLE IF NOT EXISTS — rejouable sans risque sur une
-- base existante (les tables déjà présentes sont laissées intactes).

CREATE TABLE IF NOT EXISTS products (
  id                TEXT PRIMARY KEY,
  title             TEXT NOT NULL,
  short_description TEXT NOT NULL DEFAULT '',
  description       TEXT NOT NULL DEFAULT '',
  category          TEXT NOT NULL CHECK (category IN ('saas','desktop','mobile','ebook','prompts')),
  action_type       TEXT NOT NULL CHECK (action_type IN ('chariow','terminal','mobile')),
  badges            TEXT NOT NULL DEFAULT '[]',
  price             TEXT NOT NULL DEFAULT '',
  action_url        TEXT NOT NULL DEFAULT '',
  apk_url           TEXT,
  pwa_url           TEXT,
  command           TEXT,
  video_url         TEXT,
  image_url         TEXT NOT NULL,
  clicks            INTEGER NOT NULL DEFAULT 0,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS media (
  name        TEXT PRIMARY KEY,
  url         TEXT,
  kind        TEXT NOT NULL DEFAULT 'image',
  size        INTEGER NOT NULL DEFAULT 0,
  data        TEXT,
  mime        TEXT,
  hosted      TEXT NOT NULL DEFAULT 'd1',
  uploaded_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS analytics_counters (
  key   TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS clicks_by_product (
  product_id TEXT PRIMARY KEY,
  clicks     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS visits_by_day (
  day    TEXT PRIMARY KEY,
  visits INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS recent_visits (
  ts INTEGER PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
