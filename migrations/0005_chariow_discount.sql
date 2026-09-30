-- Arsenal — migration 0005 : fulfillment par CODE PROMO Chariow.
-- Audit des capacités Chariow : docs/chantier/06-audit-chariow-fulfillment.md
-- (`discount_code` est un champ OFFICIEL du `CheckoutRequest` de l'OpenAPI ;
--  les coupons se créent uniquement dans le dashboard Chariow → Marketing →
--  Réductions : l'API est en lecture seule sur ce point).
--
-- Objectif : livrer un produit via le produit Chariow d'ORIGINE (payant pour le
-- public) au lieu d'un produit dupliqué en « Gratuit » — le code promo réservé à
-- Arsenal rend la commande gratuite pour les seuls achats réglés en A.
--
-- Additive et rétrocompatible : les produits existants gardent
-- `chariow_discount_code = NULL` et leur méthode de fulfillment actuelle.
--
-- ⚠️ AVERTISSEMENT ALTER TABLE (SQLite/D1) : SQLite ne connaît PAS
-- `ADD COLUMN IF NOT EXISTS`. L'ALTER TABLE ci-dessous ÉCHOUE si la colonne
-- existe déjà. C'est acceptable et volontaire : une migration n'est appliquée
-- qu'une seule fois (suivi interne `d1_migrations`) et
-- `wrangler d1 migrations apply` exécute chaque fichier dans une transaction
-- (aucune application partielle). NE PAS rejouer ce fichier à la main sur une
-- base déjà migrée.

/* --------------- Extension produit (additive, rétrocompatible) --------------- */
-- Code promo Chariow réservé au fulfillment des achats en A, utilisé par la
-- méthode `fulfillment_method = 'chariow_discount_checkout'` (chaîne libre côté
-- SQL ; bornée côté API : ≤ 60 caractères, majuscules/chiffres/tirets).
ALTER TABLE products ADD COLUMN chariow_discount_code TEXT;
