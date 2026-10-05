-- Arsenal — migration 0014 : cycle de vie des produits + notifications affilié.
--
-- PROBLÈME (audit cycle de vie du 05/10/2026) : DELETE /api/products/:id était un
-- HARD DELETE — un acheteur perdait l'accès à son fichier (product_file_url vivait
-- sur la ligne produit), et les liens affiliés donnaient « Lien inconnu » sans
-- explication. Aucune notification n'informait les affiliés.
--
-- CORRECTIF (Option A validée par le propriétaire) :
--   • produits.deleted_at        → soft delete : la ligne survit (historique,
--                                  ventes, liens, fichiers achetés préservés)
--   • produits.unavailable_at    → indisponibilité temporaire explicite
--   • affiliate_notifications    → notifications liées à de VRAIS événements
--                                  backend, lues dans l'espace affilié
--
-- Additif : ALTER TABLE + CREATE TABLE IF NOT EXISTS uniquement.
--
-- ⚠️ Appliquer AVANT de déployer le code qui lit ces colonnes.

ALTER TABLE products ADD COLUMN deleted_at INTEGER;
ALTER TABLE products ADD COLUMN unavailable_at INTEGER;

CREATE TABLE IF NOT EXISTS affiliate_notifications (
  id TEXT PRIMARY KEY,
  affiliate_id TEXT NOT NULL,
  type TEXT NOT NULL,              -- product_deleted | product_ineligible | product_unavailable |
                                   -- product_re_eligible | campaign_ended | campaign_disabled
  message TEXT NOT NULL,           -- phrase humaine prête à afficher (aucun contenu inventé côté client)
  product_id TEXT,
  campaign_id TEXT,
  created_at INTEGER NOT NULL,
  read_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_affiliate_notif_affiliate
  ON affiliate_notifications(affiliate_id, created_at DESC);
