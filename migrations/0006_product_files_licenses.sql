-- Arsenal — migration 0006 : vente en A AUTONOME (fichier livrable + licences).
-- Contrat de la Phase 2.6 : docs/chantier/07-contrat-paiement-a.md.
--
-- Objectif : livrer un produit vendu en A SANS dépendre de Chariow —
--   • `delivery_kind = 'file'`    → le fichier livrable (ebook, zip, apk…) est
--     hébergé sur GitHub (même canal que les médias) et servi par une route
--     VÉRIFIÉE (`GET /api/purchases/:id/download`) : l'URL brute n'est jamais
--     exposée au client ;
--   • `delivery_kind = 'license'` → une clé de licence est générée à la
--     livraison de l'achat (table `licenses`), activable par appareil
--     (`license_activations`) via `POST /api/licenses/verify`.
--
-- Additive pour `products` (5 colonnes nullables), non destructive pour les
-- nouvelles tables (IF NOT EXISTS).
--
-- ⚠️ AVERTISSEMENT ALTER TABLE (SQLite/D1) : SQLite ne connaît PAS
-- `ADD COLUMN IF NOT EXISTS`. Les 5 ALTER TABLE ci-dessous ÉCHOUENT si les
-- colonnes existent déjà. C'est acceptable et volontaire : une migration n'est
-- appliquée qu'une seule fois (suivi interne `d1_migrations`) et
-- `wrangler d1 migrations apply` exécute chaque fichier dans une transaction
-- (aucune application partielle). NE PAS rejouer ce fichier à la main sur une
-- base déjà migrée.
--
-- ⚠️ ORDRE DE DÉPLOIEMENT : appliquer cette migration en PRODUCTION AVANT de
-- déployer le Worker (le code lit/écrit `product_file_*`, `delivery_kind`,
-- `licenses` et `license_activations` dès la première requête concernée).

/* ------------------- Extension produit (additive, rétrocompatible) ------------------- */
-- Toutes nullables : les produits existants restent INCHANGÉS (aucun fichier,
-- aucun type de livraison) et continuent d'être livrés comme avant.
ALTER TABLE products ADD COLUMN product_file_url TEXT;      -- URL GitHub raw du fichier livrable
ALTER TABLE products ADD COLUMN product_file_name TEXT;     -- nom de fichier présenté au téléchargement
ALTER TABLE products ADD COLUMN product_file_size INTEGER;  -- taille en octets (≤ 25 Mo)
ALTER TABLE products ADD COLUMN product_file_mime TEXT;     -- type MIME (repli : extension)
ALTER TABLE products ADD COLUMN delivery_kind TEXT;         -- 'file' | 'license' | NULL

/* --------------------------------- Licences --------------------------------- */
-- Une licence par achat (`purchase_id` UNIQUE = idempotence : rejouer une
-- livraison ne crée JAMAIS de seconde clé). `license_key` est également unique.
CREATE TABLE IF NOT EXISTS licenses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  purchase_id TEXT NOT NULL UNIQUE,
  license_key TEXT NOT NULL UNIQUE,                 -- ARN-XXXX-XXXX-XXXX-XXXX
  status TEXT NOT NULL DEFAULT 'active',            -- active | revoked
  max_activations INTEGER NOT NULL DEFAULT 3,
  activations_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_licenses_user ON licenses(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_licenses_product ON licenses(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status, created_at DESC);

/* ---------------------------- Activations (appareils) ---------------------------- */
-- UNIQUE(license_id, device_id) : un appareil donné n'active qu'une fois — il
-- peut donc être revu (`last_seen_at`) sans consommer de place supplémentaire.
CREATE TABLE IF NOT EXISTS license_activations (
  id TEXT PRIMARY KEY,
  license_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  UNIQUE(license_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_license_activations_license
  ON license_activations(license_id, last_seen_at DESC);

/* ------------------------------- Téléchargements ------------------------------- */
-- Compteur du réglage `download_max_per_hour` (défaut 20) : les téléchargements
-- servis sont journalisés dans `security_events` (action 'purchase_download',
-- actor = user_id) — l'index partiel ne couvre QUE ces lignes.
CREATE INDEX IF NOT EXISTS idx_security_events_downloads
  ON security_events(actor, at DESC) WHERE action = 'purchase_download';
