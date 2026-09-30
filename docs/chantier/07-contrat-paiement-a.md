# Contrat API — Paiement en A + Fulfillment (Phase 2.6)

> CONTRAT FIGÉ — s'appuie sur l'audit `06-audit-chariow-fulfillment.md` (capacités réelles uniquement, aucune invention).
> Règle : le serveur est seul maître du solde, du prix, du statut d'achat et du fulfillment.
>
> **Mise à jour post-audit (30/09)** — le contrat a évolué sur cinq points après l'audit indépendant :
> 1. **Atomicité** : le débit A est désormais **conditionnel au solde dans la requête SQL** (`INSERT … SELECT … WHERE (SELECT SUM(delta)) >= montant`) et toutes les écritures de l'achat sont gardées par l'existence de ce débit — plus de lecture de solde suivie d'une écriture (faille de concurrence corrigée).
> 2. **`already_purchased`** (Chariow) est un **succès** (l'accès existe déjà → commande livrée), et un **timeout réseau** laisse la commande relançable (jamais un échec définitif).
> 3. **Remboursement** : rejette la vente liée, annule la commission tant qu'elle n'est pas `paid`, et reprend la récompense A réellement versée — le tout dans le même lot idempotent.
> 4. **Auto-affiliation interdite** : un affilié qui achète avec son propre code n'est pas attribué (journalisé `self_affiliation_blocked`).
> 5. **Validation serveur** : `chariow_free_checkout` exige un `chariow_product_id` (400 sinon) ; `chariowProductId` n'est plus exposé dans le catalogue public (réservé aux requêtes admin).

## Séparation stricte des concepts

| Concept | Table | Devise |
|---|---|---|
| **A** (monnaie interne) | `a_transactions` (append-only, delta signé) | A |
| **Prix produit** | `products.price_a` (+ `price` affiché en FCFA pour le canal Chariow) | A |
| **Purchase** (achat en A) | `purchases` | A |
| **Fulfillment** (livraison) | `fulfillments` | — |
| **Commission** (affiliation) | `commissions` | A pour un achat en A, FCFA pour une vente Chariow |
| **Récompense** | `a_transactions` type `reward` | A |
| **Accès** (« Mes produits ») | dérivé des purchases `fulfilled` | — |

## Schéma D1 (migration 0004)

```sql
-- Produit : extension additive
ALTER TABLE products ADD COLUMN purchasable INTEGER NOT NULL DEFAULT 0;      -- achetable en A
ALTER TABLE products ADD COLUMN price_a INTEGER NOT NULL DEFAULT 0;          -- prix en A (> 0 requis si purchasable)
ALTER TABLE products ADD COLUMN chariow_product_id TEXT;                     -- id produit Chariow « Gratuit »
ALTER TABLE products ADD COLUMN fulfillment_method TEXT NOT NULL DEFAULT 'manual'; -- manual | chariow_free_checkout

CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, product_id TEXT NOT NULL,
  amount_a INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'fulfillment_pending',   -- pending|paid|fulfillment_pending|fulfilled|failed|cancelled|refunded
  affiliate_id TEXT, link_code TEXT,                    -- attribution affiliation (facultative)
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, fulfilled_at INTEGER, refunded_at INTEGER
);
-- Un utilisateur ne possède qu'une fois un même produit (états actifs) — garde-fou type `already_purchased` de Chariow.
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchases_owner ON purchases(user_id, product_id)
  WHERE status NOT IN ('cancelled','failed','refunded');

CREATE TABLE IF NOT EXISTS fulfillments (
  id TEXT PRIMARY KEY, purchase_id TEXT NOT NULL, provider TEXT NOT NULL,      -- chariow | manual | arsonal_link
  status TEXT NOT NULL DEFAULT 'pending',                                       -- pending|processing|completed|failed
  provider_reference TEXT, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT,
  created_at INTEGER NOT NULL, completed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_fulfillments_purchase ON fulfillments(purchase_id);
```

Traçabilité A : débit = transaction `type='spend'`, `idempotency_key='purchase:<purchaseId>'` ; remboursement = `type='adjustment'`, `idempotency_key='refund:<purchaseId>'`.

## Routes utilisateur (Bearer)

### POST /api/purchases — acheter avec ses A
```jsonc
// req
{ "productId": "…", "affiliateCode": "…" /* facultatif, ref. de parrainage < 30 j */ }
// 201
{ "ok": true, "purchase": { "id":"…","productId":"…","amountA":500,"status":"fulfilled",
   "createdAt":0,"fulfilledAt":0,"product":{ "id":"…","title":"…","imageUrl":"…" },
   "access": { "mode":"chariow_portal", "email":"…" } | { "mode":"manual", "instructions":"…" } } }
```
Erreurs : `400` produit non achetable / prix A invalide ; `401` non connecté ; `402 {ok:false,error:"Solde A insuffisant."}` **avec** `{balanceA, priceA, missingA}` ; `409 {ok:false,error:"Vous possédez déjà ce produit."}` ; `429` rate limit.
**Atomicité** : vérification du solde puis `db.batch([ transaction A négative, INSERT purchase, INSERT fulfillment ])` ; la clé `purchase:<id>` rend l'opération rejouable sans double débit. Le solde est relu dans le même lot (aucune écriture de solde, il est toujours dérivé de `SUM(delta)`).

### GET /api/purchases — mes produits
`{ ok:true, purchases:[ { id, productId, amountA, status, createdAt, fulfilledAt, product:{id,title,imageUrl,category}, fulfillment:{provider,status,completedAt} } ] }` (tri `created_at DESC`)

### POST /api/purchases/:id/retry — relancer un fulfillment en échec
`{ ok:true, purchase }` — idempotent ; `409` si le statut n'est pas `fulfillment_pending`/`failed` ; limite : 5 tentatives.

## Fulfillment (serveur)

**`chariow_free_checkout`** — nécessite la clé API (`settings.chariow_api_key`) et `products.chariow_product_id` :
1. `POST https://api.chariow.com/v1/checkout` avec `{ product_id, email, first_name?, last_name?, custom_metadata:{ arsenal_purchase: <purchaseId>, arsenal_user: <userId> } }` (aucun autre champ inventé).
2. Réponse `step":"completed"` → `fulfillments.status='completed'`, purchase → `fulfilled` (`access.mode = 'chariow_portal'` — accès sur app.ateliat.com avec l'email de l'utilisateur).
3. `step":"payment"` (produit non gratuit) → `failed` avec `last_error` explicite (« le produit Chariow n'est pas en modèle Gratuit ») ; les A **restent débités** mais la commande est relançable/remboursable par l'admin.
4. `already_purchased` ou `422`/erreur réseau → `failed`, `attempts++`, message d'erreur conservé ; jamais de perte de A.
5. Clé API absente → `failed` immédiat, message « Clé API Chariow non configurée » (aucune tentative réseau).

**`manual`** — `fulfillments.provider='manual'`, status `pending` : l'admin livre puis marque la commande (`POST /api/admin/purchases/:id/fulfill` avec `reference` et `note`).

**Pulse `successful.sale`** (déjà en place) : si `custom_metadata.arsenal_purchase` est présent, la vente Chariow correspondante **ne crée ni commission ni récompense** (elle est la livraison d'un achat déjà payé en A) — elle met à jour le fulfillment en `completed` si besoin.

## Intégration affiliation

- Le clic sur un lien `/r/<code>` mémorise le code côté client (`localStorage.arsenal_affiliate_ref = {code, at}`) pour **30 jours**.
- À l'achat, le client transmet ce code (`affiliateCode`). Le serveur vérifie (affilié `active`, lien existant, produit correspondant, fenêtre ≤ 30 j) puis :
  - crée une `sales` (`source='wallet_purchase'`, `sale_ref='purchase:<purchaseId>'`, `currency='A'`, `amount=amount_a`, état `confirmed`) — **idempotent** ;
  - crée une `commissions` (`state='pending'`, `currency='A'`, montant calculé par la même règle produit → campagne → défaut, `reward_a` idem) ;
  - crédite la récompense A de l'affilié (`a_transactions` type `reward`, `idempotency_key='sale:purchase:<id>'`).
- **Jamais deux fois** : le `sale_ref` unique et la clé d'idempotence le garantissent ; un code invalide est ignoré silencieusement (vente non attribuée, comme pour Chariow).

## Routes admin (X-Admin-Auth)

| Route | Effet |
|---|---|
| `GET /api/admin/purchases?status=&limit=` | liste : utilisateur (pseudo/email), produit, montant A, statut, fulfillment (provider/status/attempts/last_error), dates |
| `POST /api/admin/purchases/:id/fulfill` `{reference?, note?}` | livraison **manuelle** → fulfillment `completed`, purchase `fulfilled` |
| `POST /api/admin/purchases/:id/retry` | relance le fulfillment automatique (idempotent, ≤ 5 tentatives) |
| `POST /api/admin/purchases/:id/refund` `{reason?}` | rembourse en A (transaction `adjustment` positive, clé `refund:<id>`), purchase `refunded`, fulfillment `failed` |
| `POST /api/admin/settings` | clés ajoutées à la whitelist : `chariow_api_key` (jamais renvoyée en clair), `purchase_max_per_min` (défaut 5) |

Chaque mutation admin journalise un `security_events` (`admin_purchase_*`).

## Réglages (settings)

`chariow_api_key` (secret) · `purchase_max_per_min` (défaut 5) · réutilise `default_commission_percent`, `default_reward_a`.

## Front (export statique)

- **Page produit** : si `purchasable && price_a > 0` → bloc « **Obtenir pour X A** » (CoinA + montant) avec, selon l'état : bouton d'achat (connecté), « Se connecter pour acheter » (anonyme), « Vous possédez ce produit » + lien vers Mes produits (déjà acheté), erreur de solde explicite (« il vous manque N A »). Après achat : « Produit obtenu » + accès.
- **`/compte/produits`** — « Mes produits » : cartes (image, titre, « Obtenu le … »), bouton **Accéder** (portail Chariow si `chariow_portal`, sinon instructions/note du produit), statut clair si `fulfillment_pending` (« livraison en cours ») avec bouton **Relancer**.
- **Admin → onglet Commandes** : liste filtrable par statut, actions *Relancer*, *Marquer livré* (référence + note), *Rembourser en A* (confirmation), affichage des erreurs de fulfillment.
- **Admin → formulaire produit** : section « Vente en A » (case *Achetable avec des A*, prix en A, id produit Chariow, méthode de fulfillment `manual`/`chariow_free_checkout`) + rappel des limites Chariow si `chariow_free_checkout`.
- **Admin → Paramètres** : champ clé API Chariow (masqué, indique si configurée).
- Le lien `/r/<code>` stocke la référence d'affiliation (30 j) — voir Intégration affiliation.

## Sécurité attendue

- Aucune de ces routes n'accepte un montant, un solde, un statut ou un prix venant du client : le prix est lu en base, le solde recalculé, les statuts posés serveur.
- Idempotence : index unique propriétaire, `sale_ref` unique, clés `purchase:<id>` / `refund:<id>` / `sale:purchase:<id>`.
- Rate limits : achat 5/min/IP (réglable), retry 3/min/IP.
- La clé API Chariow n'est **jamais** exposée par une route.
