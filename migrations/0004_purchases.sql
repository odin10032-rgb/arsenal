-- Arsenal — migration 0004 : paiement en A + fulfillment (Phase 2.6).
-- Contrat FIGÉ : docs/chantier/07-contrat-paiement-a.md (schéma repris à l'identique).
-- Audit des capacités Chariow : docs/chantier/06-audit-chariow-fulfillment.md.
--
-- Additive pour `products` (4 colonnes), non destructive pour les nouvelles
-- tables (IF NOT EXISTS).
--
-- ⚠️ AVERTISSEMENT ALTER TABLE (SQLite/D1) : SQLite ne connaît PAS
-- `ADD COLUMN IF NOT EXISTS`. Les 4 ALTER TABLE ci-dessous ÉCHOUENT si les
-- colonnes existent déjà. C'est acceptable et volontaire : une migration n'est
-- appliquée qu'une seule fois (suivi interne `d1_migrations`) et
-- `wrangler d1 migrations apply` exécute chaque fichier dans une transaction
-- (aucune application partielle). NE PAS rejouer ce fichier à la main sur une
-- base déjà migrée.

/* ------------------- Extension produit (additive, rétrocompatible) ------------------- */
-- Défauts non nuls : les produits existants restent INCHANGÉS et non achetables
-- (purchasable = 0), fulfillment_method = 'manual'.
ALTER TABLE products ADD COLUMN purchasable INTEGER NOT NULL DEFAULT 0;      -- achetable en A
ALTER TABLE products ADD COLUMN price_a INTEGER NOT NULL DEFAULT 0;          -- prix en A (> 0 requis si purchasable)
ALTER TABLE products ADD COLUMN chariow_product_id TEXT;                     -- id produit Chariow « Gratuit »
ALTER TABLE products ADD COLUMN fulfillment_method TEXT NOT NULL DEFAULT 'manual'; -- manual | chariow_free_checkout

/* --------------------------------- Achats (A) --------------------------------- */

CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, product_id TEXT NOT NULL,
  amount_a INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'fulfillment_pending',   -- pending|paid|fulfillment_pending|fulfilled|failed|cancelled|refunded
  affiliate_id TEXT, link_code TEXT,                    -- attribution affiliation (facultative)
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, fulfilled_at INTEGER, refunded_at INTEGER
);

-- Un utilisateur ne possède qu'une fois un même produit (états actifs) — garde-fou
-- type `already_purchased` de Chariow. L'échec de cet index annule tout le
-- db.batch d'achat (transaction D1) : ni double achat, ni double débit.
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchases_owner ON purchases(user_id, product_id)
  WHERE status NOT IN ('cancelled','failed','refunded');

/* ------------------------------- Fulfillments ------------------------------- */

CREATE TABLE IF NOT EXISTS fulfillments (
  id TEXT PRIMARY KEY, purchase_id TEXT NOT NULL, provider TEXT NOT NULL,      -- chariow | manual | arsenal_link
  status TEXT NOT NULL DEFAULT 'pending',                                       -- pending|processing|completed|failed
  provider_reference TEXT, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT,
  created_at INTEGER NOT NULL, completed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_fulfillments_purchase ON fulfillments(purchase_id);

/* ------------------------------------ Index ------------------------------------ */
-- Écrans admin (liste filtrable par statut) et « Mes produits » (par utilisateur).
CREATE INDEX IF NOT EXISTS idx_purchases_user ON purchases(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_status ON purchases(status, created_at DESC);
