-- Arsenal — migration 0011 : plafonds de liens affiliés + demandes de produit (vague 4).
--
-- Décisions propriétaire implémentées ici :
--   • Affilié normal : 3 liens ACTIFS maximum, 20 ventes maximum par lien ;
--   • un lien qui atteint 20 ventes est DÉSACTIVÉ automatiquement (état `saturated`,
--     libère son emplacement, les ventes déjà acquises sont conservées) ;
--   • Super-affilié : aucun plafond, et il peut demander à rendre un produit éligible.
--
-- ⚠️ ADDITIF mais avec un piège ASSUMÉ : `affiliate_links.status` prend la valeur
-- par défaut `active`. Les liens DÉJÀ existants (tous créés automatiquement par
-- l'ancien comportement de `GET /api/affiliate/me/products`) deviennent donc
-- `active` — c'est volontaire : aucun affilié ne perd ses liens au déploiement.
-- Conséquence à connaître : un affilié qui avait accumulé plus de 3 liens actifs
-- les conserve tels quels (aucune désactivation rétroactive n'est faite) ; il ne
-- pourra simplement plus en activer de nouveaux tant qu'il reste au-dessus du
-- plafond. C'est la seule lecture non destructive possible de cette transition.
--
-- ⚠️ AVERTISSEMENT ALTER TABLE (SQLite/D1) : `ADD COLUMN` n'a pas de
-- `IF NOT EXISTS` — rejouer ce fichier à la main sur une base déjà migrée ÉCHOUE.
-- Une migration n'est appliquée qu'une fois (suivi interne `d1_migrations`).
-- NE PAS appliquer cette migration ; elle est livrée pour application ultérieure.

/* ------------------------- État et compteur des liens ------------------------- */

-- status : active | inactive | saturated
--   active    → lien qui occupe un emplacement et attribue clics/ventes ;
--   inactive  → lien désactivé (par l'affilié ou un admin) : n'attribue plus ;
--   saturated → plafond de ventes atteint (max_sales_per_link) : désactivé
--               automatiquement, les ventes déjà acquises sont conservées.
ALTER TABLE affiliate_links ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
-- Compteur de ventes DÉNORMALISÉ : permet d'appliquer le plafond par lien sans
-- agréger `sales` à chaque écriture. Incrémenté aux points d'attribution de vente.
ALTER TABLE affiliate_links ADD COLUMN sales_count INTEGER NOT NULL DEFAULT 0;

-- Comptage des liens actifs d'un affilié (plafond max_active_links).
CREATE INDEX IF NOT EXISTS idx_links_affiliate_status ON affiliate_links(affiliate_id, status);

/* --------------------------- Demandes de produit --------------------------- */
-- Demande d'un Super-affilié pour qu'un produit soit rendu éligible à
-- l'affiliation (`products.affiliate_enabled = 1` en cas d'approbation admin).
-- Une seule demande `pending` par couple (affilié, produit) — index unique partiel.
CREATE TABLE IF NOT EXISTS product_requests (
  id TEXT PRIMARY KEY,
  affiliate_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | rejected
  created_at INTEGER NOT NULL,
  decided_at INTEGER,
  decided_by TEXT,
  note TEXT
);

-- Idempotence : au plus une demande EN ATTENTE par (affilié, produit).
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_requests_pending
  ON product_requests(affiliate_id, product_id) WHERE status = 'pending';

-- Fichier de travail admin (liste des demandes, filtre par statut).
CREATE INDEX IF NOT EXISTS idx_product_requests_status ON product_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_requests_affiliate ON product_requests(affiliate_id, created_at DESC);
