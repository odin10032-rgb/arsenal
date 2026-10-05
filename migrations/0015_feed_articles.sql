-- ============================================================
-- Arsenal Tools — Feed éditorial (refonte front 05/10/2026)
-- ============================================================
-- Le Feed est la couche éditoriale d'Arsenal : contenu écrit et PUBLIÉ depuis
-- l'admin uniquement (aucune publication utilisateur, aucun commentaire).
-- Les articles publiés sont lus publiquement via GET /api/feed.

CREATE TABLE IF NOT EXISTS feed_articles (
  id           TEXT PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,          -- identifiant d'URL (/feed/?a=<slug>)
  title        TEXT NOT NULL,
  excerpt      TEXT,                          -- accroche (cartes, aperçu)
  content      TEXT NOT NULL DEFAULT '',      -- paragraphes séparés par une ligne vide
  cover_url    TEXT,                          -- couverture (médiathèque Arsenal)
  category     TEXT,                          -- étiquette libre courte
  video_url    TEXT,                          -- vidéo YouTube (déjà validée serveur)
  product_id   TEXT,                          -- produit associé (page produit liée)
  status       TEXT NOT NULL DEFAULT 'draft', -- draft | published
  published_at INTEGER,                       -- posé au passage en « publié »
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_feed_published
  ON feed_articles(status, published_at DESC);
