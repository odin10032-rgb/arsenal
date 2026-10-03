-- Arsenal — migration 0013 : RECRUTEMENT D'AFFILIÉ (idée propriétaire).
--
-- PROBLÈME RÉSOLU : un visiteur venu d'un lien affilié sur son téléphone, qui
-- achète plus tard depuis un AUTRE appareil, n'était attribuable à personne (le
-- code en localStorage ne traverse pas les appareils). Le COMPTE, lui, est
-- portable : dès qu'il en crée un, on peut le relier durablement à l'affilié
-- par lequel il est venu.
--
-- MÉCANISME (décision propriétaire) :
--   1. le visiteur arrive par un lien affilié (jeton de tracking posé) ;
--   2. il CRÉE UN COMPTE (incité par un popup contextuel) → l'affilié d'origine
--      est lié à SON COMPTE, définitivement ;
--   3. à son PREMIER ACHAT — même 3 mois plus tard, même depuis un autre
--      appareil — l'affilié d'origine touche une RÉCOMPENSE A DE RECRUTEMENT,
--      UNE SEULE FOIS ;
--   4. la COMMISSION DE VENTE, elle, reste au dernier toucher : aucun doublon,
--      aucune injustice (celui qui a fait découvrir Arsenal est récompensé,
--      celui qui a vendu touche sa commission).
--
-- ⚠️ Ce n'est PAS une commission : pas de ligne `commissions`, pas de vente
-- attribuée. Uniquement une transaction `reward` du ledger A.
--
-- Additif : CREATE TABLE / ADD COLUMN IF NOT EXISTS uniquement.

/* ----------------------- Parrainage d'un compte utilisateur ----------------------- */
-- L'affilié d'origine d'un compte : posé UNE fois (au premier jeton vu à
-- l'inscription/connexion), jamais écrasé ensuite — c'est le lien durable.
CREATE TABLE IF NOT EXISTS user_referrals (
  user_id TEXT PRIMARY KEY,             -- le filleul (compte Arsenal)
  affiliate_id TEXT NOT NULL,           -- l'affilié par lequel il est venu
  link_id TEXT,
  product_id TEXT,
  created_at INTEGER NOT NULL,
  -- Récompense effectivement versée ? (au PREMIER achat du filleul, une fois)
  rewarded_at INTEGER,
  -- Achat qui a déclenché la récompense (traçabilité, jamais réutilisé).
  rewarded_purchase_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_user_referrals_affiliate ON user_referrals(affiliate_id);
