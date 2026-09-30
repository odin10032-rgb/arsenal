-- Arsenal — migration 0001 : schéma initial (état prod au 30/09/2026).
-- Non destructif (CREATE IF NOT EXISTS) — remplaçant versionné de schema.sql
-- qui, lui, contient des DROP TABLE et ne doit plus être exécuté sur la prod.

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  short_description TEXT,
  description TEXT,
  category TEXT NOT NULL,
  action_type TEXT NOT NULL,
  badges TEXT,
  price TEXT,
  action_url TEXT,
  apk_url TEXT,
  pwa_url TEXT,
  command TEXT,
  video_url TEXT,
  image_url TEXT,
  clicks INTEGER DEFAULT 0,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS analytics (
  id INTEGER PRIMARY KEY DEFAULT 1,
  visits INTEGER DEFAULT 0,
  actions_total INTEGER DEFAULT 0,
  clicks_by_product TEXT,
  visits_by_day TEXT,
  recent_visits TEXT,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS media (
  name TEXT PRIMARY KEY,
  url TEXT,
  kind TEXT,
  size INTEGER,
  uploaded_at INTEGER
);

CREATE TABLE IF NOT EXISTS config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  admin_token TEXT
);
