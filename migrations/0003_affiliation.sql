-- Arsenal — migration 0003 : affiliation (Phase 2).
-- Contrat FIGÉ : docs/chantier/05-contrat-api-phase2.md (schéma repris à l'identique).
-- Non destructive pour les nouvelles tables (IF NOT EXISTS), additive pour `products`.
--
-- ⚠️ AVERTISSEMENT ALTER TABLE (SQLite/D1) : SQLite ne connaît PAS
-- `ADD COLUMN IF NOT EXISTS`. Les 4 ALTER TABLE ci-dessous ÉCHOUENT si les
-- colonnes existent déjà. C'est acceptable et volontaire : une migration n'est
-- appliquée qu'une seule fois (suivi interne `d1_migrations`) et
-- `wrangler d1 migrations apply` exécute chaque fichier dans une transaction
-- (aucune application partielle). NE PAS rejouer ce fichier à la main sur une
-- base déjà migrée.

/* --------------------------------- Affiliation --------------------------------- */

CREATE TABLE IF NOT EXISTS affiliates (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,                -- code public court (ex. FLORIAN-X7) — sans donnée personnelle
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | active | suspended
  note TEXT, applied_at INTEGER NOT NULL, activated_at INTEGER, updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS affiliate_links (
  id TEXT PRIMARY KEY, affiliate_id TEXT NOT NULL, product_id TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE, campaign_id TEXT, created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS click_events (
  id TEXT PRIMARY KEY, link_id TEXT NOT NULL, affiliate_id TEXT NOT NULL, product_id TEXT NOT NULL,
  campaign_id TEXT, ts INTEGER NOT NULL, visitor_hash TEXT          -- sha256(ip+ua+jour) — jamais l'IP brute
);

CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY, affiliate_id TEXT, product_id TEXT NOT NULL, link_id TEXT,
  source TEXT NOT NULL,                     -- chariow_webhook | manual
  sale_ref TEXT NOT NULL UNIQUE,            -- idempotence (sale.id Chariow ou réf. saisie par l'admin)
  amount REAL NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'FCFA',
  state TEXT NOT NULL DEFAULT 'pending',    -- pending | confirmed | rejected
  occurred_at INTEGER NOT NULL, created_at INTEGER NOT NULL,
  confirmed_by TEXT, confirmed_at INTEGER
);

CREATE TABLE IF NOT EXISTS commissions (
  id TEXT PRIMARY KEY, sale_id TEXT NOT NULL UNIQUE, affiliate_id TEXT NOT NULL,
  amount REAL NOT NULL, currency TEXT NOT NULL DEFAULT 'FCFA',
  rate_percent REAL, state TEXT NOT NULL DEFAULT 'pending',   -- pending|validated|payable|paid|cancelled
  reward_a INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, payment_id TEXT
);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, product_id TEXT NOT NULL,
  starts_at INTEGER, ends_at INTEGER, commission_type TEXT, commission_value REAL,
  reward_a INTEGER NOT NULL DEFAULT 0, goal_sales INTEGER,
  status TEXT NOT NULL DEFAULT 'draft', created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS campaign_participants (
  campaign_id TEXT NOT NULL, affiliate_id TEXT NOT NULL, joined_at INTEGER NOT NULL,
  PRIMARY KEY (campaign_id, affiliate_id)
);

CREATE TABLE IF NOT EXISTS status_history (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, from_role TEXT, to_role TEXT NOT NULL,
  reason TEXT, created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS status_unlock_events (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, status TEXT NOT NULL,
  created_at INTEGER NOT NULL, seen_at INTEGER, UNIQUE(user_id, status)
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY, affiliate_id TEXT NOT NULL, amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'FCFA', reference TEXT, state TEXT NOT NULL DEFAULT 'paid',
  note TEXT, created_at INTEGER NOT NULL, paid_at INTEGER
);

/* ------------------------------------ Index ------------------------------------ */
-- Les 3 index du contrat :
CREATE INDEX IF NOT EXISTS idx_clicks_affiliate ON click_events(affiliate_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_sales_affiliate ON sales(affiliate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commissions_affiliate ON commissions(affiliate_id, created_at DESC);

-- Index additionnels (purement additifs — aucun impact sur le schéma ni les contrats) :
-- dédup des clics (link + visitor_hash), résolution idempotente d'un lien par couple
-- affilié/produit, et filtres des écrans admin.
CREATE INDEX IF NOT EXISTS idx_clicks_link_visitor ON click_events(link_id, visitor_hash, ts);
CREATE INDEX IF NOT EXISTS idx_links_affiliate_product ON affiliate_links(affiliate_id, product_id);
CREATE INDEX IF NOT EXISTS idx_links_product ON affiliate_links(product_id);
CREATE INDEX IF NOT EXISTS idx_sales_state ON sales(state, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commissions_state ON commissions(state, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_affiliate ON payments(affiliate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_status_history_user ON status_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaigns_product ON campaigns(product_id, status);

/* ------------------- Extension produit (additive, rétrocompatible) ------------------- */
-- Colonnes nullables + défauts : les produits existants restent inchangés
-- (affiliate_enabled = 0 → non éligible à l'affiliation).
ALTER TABLE products ADD COLUMN affiliate_enabled INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN commission_type TEXT;      -- percent | fixed
ALTER TABLE products ADD COLUMN commission_value REAL;
ALTER TABLE products ADD COLUMN reward_a INTEGER DEFAULT 0;
