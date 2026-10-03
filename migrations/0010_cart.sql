-- Arsenal — migration 0010 : panier (visiteurs ET membres) + achats abandonnés.
--
-- Décision de conception : un panier peut appartenir à DEUX porteurs :
--   • un VISITEUR non connecté → identifié par un `visitor_token` opaque généré
--     côté client (localStorage), jamais deviné côté serveur ;
--   • un UTILISATEUR connecté → identifié par son `user_id`.
-- Le rattachement visiteur → compte se fait à la connexion (fusion simple :
-- réassignation de `user_id`, voir `resolveCart` dans src/lib/server/cart.ts).
-- Un panier doit toujours avoir l'un des deux porteurs, jamais aucun.
--
-- ACHATS ABANDONNÉS : aucune table dédiée n'est nécessaire. Un panier non
-- converti EST un abandon. On peut donc les lister (admin, vague 5) à partir de
-- `carts.updated_at` — d'où l'index `idx_carts_updated_at` ci-dessous. Un panier
-- « converti » n'est pas marqué ici : la vente en A passe déjà par `purchases`
-- (migration 0004) et le tunnel Chariow reste inchangé. Un futur rapprochement
-- panier → achat se fera par (user_id, product_id), sans nouvelle table.
--
-- Additive : IF NOT EXISTS partout. ⚠️ Appliquer AVANT de déployer le code.

/* --------------------------------- Paniers --------------------------------- */

CREATE TABLE IF NOT EXISTS carts (
  id TEXT PRIMARY KEY,
  user_id TEXT,          -- porteur connecté (NULL pour un visiteur)
  visitor_token TEXT,    -- porteur visiteur (NULL pour un connecté)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Un seul panier actif par porteur (index unique PARTIELS : SQLite autorise
-- plusieurs NULL, ce qui laisse coexister les paniers visiteur et membre).
CREATE UNIQUE INDEX IF NOT EXISTS idx_carts_user
  ON carts(user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_carts_visitor
  ON carts(visitor_token) WHERE visitor_token IS NOT NULL;

-- Liste des abandons (paniers inactifs depuis N jours) côté admin — vague 5.
CREATE INDEX IF NOT EXISTS idx_carts_updated_at ON carts(updated_at DESC);

/* ------------------------------ Articles du panier ------------------------------ */

CREATE TABLE IF NOT EXISTS cart_items (
  id TEXT PRIMARY KEY,
  cart_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  added_at INTEGER NOT NULL,
  UNIQUE(cart_id, product_id)
);

-- Contenu d'un panier (lecture par cart_id) : l'index unique (cart_id, product_id)
-- couvre déjà cet accès, mais un index dédié garde la lecture explicite.
CREATE INDEX IF NOT EXISTS idx_cart_items_cart ON cart_items(cart_id);
