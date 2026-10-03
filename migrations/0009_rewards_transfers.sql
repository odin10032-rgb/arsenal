-- Arsenal — migration 0009 : récompenses copie/clic + transferts de A (vague 2).
--
-- Objectif (décisions propriétaire) :
--  1. récompense A pour un PARTAGE (copie d'un lien) enregistré côté serveur,
--     avec limite anti-spam de 50 partages par JOUR (réglage `share_max_per_day`) ;
--  2. récompense A pour un CLIC affilié compté (une seule fois par clic compté) ;
--  3. TRANSFERT de A entre membres : atomique, gardé par le solde, jamais vers
--     soi-même ni vers un non-membre, jamais rejoué.
--
-- La monnaie A est réservée aux MEMBRES (`users.membership`, migration 0008).
-- Règle d'or : le solde n'est JAMAIS stocké (SUM(delta) de `a_transactions`,
-- append-only). Aucune écriture de solde hors transactions traçables.
--
-- ⚠️ AUCUN changement sur `a_transactions` : le `type` est du TEXTE LIBRE. Les
-- nouveaux types explicites sont posés par le CODE :
--   reward_share | reward_click | transfer_out | transfer_in.
--
-- Table `reward_claims` VOLONTAIREMENT ABSENTE : l'idempotence des récompenses
-- est portée par `a_transactions.idempotency_key` (UNIQUE) — clés
-- `share:<shareEventId>` et `click:<clickEventId>`. Une table de réclamations
-- serait un second registre redondant, sans capacité supplémentaire : elle est
-- inutile (démontré : un seul crédit possible par clé, INSERT OR IGNORE).
--
-- ⚠️ ORDRE DE DÉPLOIEMENT : appliquer AVANT de déployer le code qui la lit.

/* --------------------------- Partage (anti-spam + traçabilité) --------------------------- */
-- Une ligne par partage ENREGISTRÉ : c'est elle qui porte la limite des 50/jour
-- (comptage des lignes du jour AVANT enregistrement, dans le même flux) et la
-- traçabilité (qui a partagé quoi, quand).

CREATE TABLE IF NOT EXISTS share_events (
  id TEXT PRIMARY KEY,
  affiliate_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  link_id TEXT,
  product_id TEXT,
  created_at INTEGER NOT NULL
);

-- Comptage de la limite quotidienne : (user_id, created_at) — le compteur lit
-- `COUNT(*) WHERE user_id = ? AND created_at > début du jour`.
CREATE INDEX IF NOT EXISTS idx_share_events_user_created ON share_events(user_id, created_at DESC);
