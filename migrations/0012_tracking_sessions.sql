-- Arsenal — migration 0012 : PONT DE TRACKING (vague 1 — socle + redirection).
--
-- Objectif : remplacer l'attribution affiliée reposant sur un code mémorisé 30 j
-- en `localStorage` (effaçable, mono-appareil, écrasé silencieusement si un second
-- lien est cliqué) par un JETON DE TRACKING SERVEUR, opaque et anonyme, délivré au
-- passage par les liens `/r/<code>`. Le jeton identifie tout le parcours du
-- visiteur ; le code en `localStorage` reste le REPLI (rien n'est cassé).
--
-- Décisions propriétaire respectées à la lettre :
--   • RÈGLE D'ATTRIBUTION = DERNIER TOUCHER. Le dernier jeton/lien en date prime ;
--     la session porte le DERNIER toucher connu et `latestTrackingTouch()` le
--     matérialise (aujourd'hui c'était vrai par accident, sans trace).
--   • ANONYMAT (§37) : le jeton est OPAQUE (aléatoire, aucune donnée personnelle,
--     aucune IP, jamais dérivé de l'IP). `visitor_hash` = `sha256(ip+ua+jour)`
--     reste la SEULE empreinte, comme partout ailleurs (click_events).
--
-- Additif et non destructif : uniquement des CREATE TABLE / CREATE INDEX
-- `IF NOT EXISTS` — rejouable sans risque. AUCUNE migration ALTER TABLE ici.
--
-- ⚠️ NE PAS appliquer cette migration dans cette vague (livrée pour application
-- ultérieure par le propriétaire).

/* ------------------------------ Sessions de tracking ------------------------------ */
-- Une ligne = un parcours visiteur identifié par son jeton opaque. Le jeton est
-- un `crypto.randomUUID()` (ou deux UUID concaténés) généré côté serveur : jamais
-- devinable, jamais dérivé de l'IP, révocable par simple expiration.
CREATE TABLE IF NOT EXISTS tracking_sessions (
  token TEXT PRIMARY KEY,          -- jeton opaque (UUID serveur) — aucune donnée personnelle
  visitor_hash TEXT,               -- sha256(ip + user-agent + jour) — SEULE empreinte conservée
  affiliate_id TEXT,               -- DERNIER toucher connu (règle « dernier toucher »)
  link_id TEXT,
  product_id TEXT,
  campaign_id TEXT,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,     -- created_at + 30 jours (TRACKING_TTL_MS)
  user_id TEXT,                    -- rempli à la création/connexion de compte (liaison multi-appareils)
  steps TEXT                       -- JSON agrégé des étapes : {"product_view":3,"add_to_cart":1,...}
                                   -- (compteurs, PAS un log ligne par ligne — reste léger)
);

-- Empreinte visiteur : retrouver la session la plus récente d'un visiteur
-- (règle « dernier toucher ») et rattacher un porteur d'empreinte à son jeton.
CREATE INDEX IF NOT EXISTS idx_tracking_visitor ON tracking_sessions(visitor_hash);
-- Purge des sessions expirées (balayage par expiration).
CREATE INDEX IF NOT EXISTS idx_tracking_expires ON tracking_sessions(expires_at);
-- Liaison multi-appareils : retrouver les sessions d'un utilisateur connecté.
CREATE INDEX IF NOT EXISTS idx_tracking_user ON tracking_sessions(user_id);

/* -------------------------- Historique des liens d'entrée -------------------------- */
-- L'HISTORIQUE des liens d'entrée d'un même visiteur : permet de DÉTECTER les
-- conflits multi-liens (même visiteur, plusieurs affiliés/produits) et d'appliquer
-- « dernier toucher » EN CONNAISSANCE DE CAUSE (tracé), plutôt qu'en écrasant
-- silencieusement. Une ligne par entrée de lien (jamais de donnée personnelle).
CREATE TABLE IF NOT EXISTS tracking_links_history (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL,             -- jeton de la session concernée
  affiliate_id TEXT,
  link_id TEXT,
  product_id TEXT,
  created_at INTEGER
);

-- Retrouver l'historique d'entrée d'un jeton (analyse des conflits multi-liens).
CREATE INDEX IF NOT EXISTS idx_tracking_links_history_token ON tracking_links_history(token);
