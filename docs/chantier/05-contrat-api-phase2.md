# Contrat API — Phase 2 (affiliation)

> CONTRAT FIGÉ — backend (Worker) et front (export statique) l'implémentent en parallèle.
> Règles : ne rien casser des contrats existants (`{ok,…}`, ADMIN `X-Admin-Auth`, USER `Authorization: Bearer`).
> Chariow : **uniquement** les mécanismes officiellement documentés (Pulses HMAC) — aucun endpoint inventé.

## Vocabulaire (séparation stricte)

| Concept | Rôle |
|---|---|
| **A** | monnaie interne (ledger `a_transactions`) |
| **Commission** | argent dû à l'affilié (table `commissions`, états `pending → validated → payable → paid`, ou `cancelled`) |
| **Paiement** | acte administratif manuel (table `payments`) — Arsenal n'est pas une banque |
| **Récompense** | bonus en A (transaction `reward` dans `a_transactions`) |

## Schéma D1 (migration 0003)

```sql
CREATE TABLE IF NOT EXISTS affiliates (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,                -- code public court (ex. FLORIAN-X7) — sans donnée personnelle
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | active | suspended
  note TEXT, applied_at INTEGER NOT NULL, activated_at INTEGER, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS affiliate_links (
  id TEXT PRIMARY KEY, affiliate_id TEXT NOT NULL, product_id TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE, campaign_id TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS click_events (
  id TEXT PRIMARY KEY, link_id TEXT NOT NULL, affiliate_id TEXT NOT NULL, product_id TEXT NOT NULL,
  campaign_id TEXT, ts INTEGER NOT NULL, visitor_hash TEXT          -- sha256(ip+ua+jour) — jamais l'IP brute
);
CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY, affiliate_id TEXT, product_id TEXT NOT NULL, link_id TEXT,
  source TEXT NOT NULL,                     -- chariow_webhook | manual
  sale_ref TEXT NOT NULL UNIQUE,            -- idempotence (sale.id Chariow ou réf. saisie par l'admin)
  amount REAL NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'FCFA',
  state TEXT NOT NULL DEFAULT 'pending',    -- pending | confirmed | rejected
  occurred_at INTEGER NOT NULL, created_at INTEGER NOT NULL,
  confirmed_by TEXT, confirmed_at INTEGER
);
CREATE TABLE IF NOT EXISTS commissions (
  id TEXT PRIMARY KEY, sale_id TEXT NOT NULL UNIQUE, affiliate_id TEXT NOT NULL,
  amount REAL NOT NULL, currency TEXT NOT NULL DEFAULT 'FCFA',
  rate_percent REAL, state TEXT NOT NULL DEFAULT 'pending',   -- pending|validated|payable|paid|cancelled
  reward_a INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, payment_id TEXT
);
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, product_id TEXT NOT NULL,
  starts_at INTEGER, ends_at INTEGER, commission_type TEXT, commission_value REAL,
  reward_a INTEGER NOT NULL DEFAULT 0, goal_sales INTEGER,
  status TEXT NOT NULL DEFAULT 'draft', created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS campaign_participants (
  campaign_id TEXT NOT NULL, affiliate_id TEXT NOT NULL, joined_at INTEGER NOT NULL,
  PRIMARY KEY (campaign_id, affiliate_id)
);
CREATE TABLE IF NOT EXISTS status_history (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, from_role TEXT, to_role TEXT NOT NULL,
  reason TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS status_unlock_events (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, status TEXT NOT NULL,
  created_at INTEGER NOT NULL, seen_at INTEGER, UNIQUE(user_id, status)
);
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY, affiliate_id TEXT NOT NULL, amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'FCFA', reference TEXT, state TEXT NOT NULL DEFAULT 'paid',
  note TEXT, created_at INTEGER NOT NULL, paid_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_clicks_affiliate ON click_events(affiliate_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_sales_affiliate ON sales(affiliate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commissions_affiliate ON commissions(affiliate_id, created_at DESC);
```

Extension produit (additive, rétrocompatible) — colonnes nullables :
`affiliate_enabled INTEGER DEFAULT 0`, `commission_type TEXT` (`percent`|`fixed`), `commission_value REAL`, `reward_a INTEGER DEFAULT 0`.

## Réglages (table `settings`, clés)

`affiliate_min_sales` (défaut 0) · `super_min_sales` (défaut 10) · `super_min_clicks` (défaut 100) · `default_commission_percent` (défaut 30) · `default_reward_a` (défaut 50) · `chariow_webhook_secret` (secret)

---

## Routes utilisateur (Bearer)

### POST /api/affiliate/apply — candidature
`{ "note": "…" }` (optionnel) → `201 {ok, affiliate}` — statut `pending`. Si déjà affilié → `409 {ok:false,error:"Vous êtes déjà affilié."}`
L'utilisateur passe role → reste `user` tant que non validé (le rôle `affiliate` n'est posé qu'à l'activation).

### GET /api/affiliate/me — état + statistiques
```jsonc
{ "ok": true, "affiliate": {          // null si jamais candidaté
    "code": "FLORIAN-X7", "status": "active", "appliedAt": 0, "activatedAt": 0,
    "isSuper": false,
    "stats": { "clicks": 0, "sales": 0, "conversion": 0,        // conversion = ventes/clics*100, 2 décimales
               "aEarned": 0, "commissionTotal": 0, "pending": 0, "payable": 0, "paid": 0 } } }
```
Montants = commissions de l'affilié **hors** `cancelled` ; `pending` = état `pending`+`validated` ; `payable` = `payable` ; `paid` = `paid`.

### GET /api/affiliate/me/products — produits éligibles + performance
```jsonc
{ "ok": true, "products": [ { "id":"…","title":"…","imageUrl":"…","price":"…",
   "commissionType":"percent","commissionValue":30,"rewardA":50,
   "clicks":0,"sales":0,"conversion":0,
   "link":"https://arsenal-tools.pages.dev/r/CODE-PRODUCT","linkCode":"…" } ] }
```
Ne renvoie que les produits `affiliate_enabled = 1` (et, pour un affilié `suspended`, `products: []`).
Le lien est créé à la volée s'il n'existe pas (idempotent par couple affilié/produit).

### POST /api/affiliate/me/products/:productId/link — (re)générer un lien
→ `{ok, link}` (même format). 403 si non affilié actif ou produit non éligible.

---

## Route publique — tracking d'un clic affilié

### POST /api/track/affiliate-click
`{ "code": "<linkCode>" }` → `200 { ok: true, url: "<action_url du produit>" }`
- Enregistre un `click_events` (affilié, produit, campagne, `visitor_hash = sha256(ip + user-agent + jour)` — **jamais** l'IP brute), incrémente aussi `clicks_by_product` (compteur global existant).
- Dédup : au plus **1 clic compté par (link, visitor_hash) par 24 h** (anti double-comptage).
- `404 {ok:false,error:"Lien inconnu."}` si code inconnu ; `409` si affilié suspendu ou produit non éligible.
- Rate limit dédié (60/min/IP).

---

## Webhook Chariow (public, signé)

### POST /api/webhooks/chariow
- Vérifie `x-chariow-signature: sha256=<hex>` = HMAC-SHA256 du corps brut avec `settings.chariow_webhook_secret`. Absent/non configuré → `503 {ok:false,error:"Webhook non configuré."}` ; signature invalide → `401`.
- Idempotence : `x-pulse-delivery-id` **et** `sale.id` — si `sale_ref` déjà en base → `200 {ok:true, duplicate:true}` (aucune double commission).
- Sur `successful.sale` : crée `sales` (state `confirmed`, source `chariow_webhook`) + `commissions` (`pending`) + récompense A éventuelle (transaction `reward`, idempotence `sale:<sale_ref>`), en **un seul batch**.
- Attribution : `custom_metadata.arsenal_link` (code de lien) → lien → affilié + produit ; sinon `affiliate.code` ; sinon vente **non attribuée** (affiliate_id NULL, visible admin).
- Autres événements : `200 {ok:true, ignored:true}`.

### Repli admin (si webhook indisponible) — validation manuelle
`POST /api/admin/sales` `{ affiliateCode, productId, saleRef, amount, currency?, occurredAt? }` (admin) → crée la vente `confirmed` + commission `pending` comme ci-dessus. `409` si `saleRef` existe déjà.

---

## Routes admin (X-Admin-Auth)

| Route | Effet |
|---|---|
| `GET /api/admin/affiliates?status=` | liste : user (pseudo/email), code, statut, clics, ventes, commissions (payable/payé), dates |
| `POST /api/admin/affiliates/:id/status` `{status, reason?}` | `pending→active` (pose `users.role='affiliate'`, `activated_at`, `status_history`, `status_unlock_events`), `active→suspended`, `suspended→active` |
| `GET /api/admin/sales?state=&affiliate_id=` | ventes + attribution + état |
| `POST /api/admin/sales/:id/state` `{state:"confirmed"\|"rejected", reason?}` | confirmer (crée/réactive commission) ou rejeter (commission `cancelled`) — **idempotent**, jamais de double commission |
| `GET /api/admin/commissions?state=&affiliate_id=` | liste avec affilié, vente, montants |
| `POST /api/admin/commissions/:id/state` `{state}` | transitions **strictes** `pending→validated`, `validated→payable`, `payable→paid` (exige `paymentId`), `*→cancelled`. Toute transition invalide → `409` |
| `GET /api/admin/payments?affiliate_id=` | historique des paiements |
| `POST /api/admin/payments` `{affiliateId, amount, currency?, reference?, note?}` | enregistre un paiement manuel et marque **payable→paid en une transaction** |
| `GET /api/admin/settings` / `POST /api/admin/settings` | lire/écrire les réglages ci-dessus (clés whitelistées) |

Toutes les mutations admin écrivent un `security_events` (`action` = `admin_*`).

---

## Front (export statique)

- `/affilie` — état : non candidat → formulaire de candidature ; `pending` → « en attente de validation » ; `active` → tableau de bord (identité, statut, solde A, clics, ventes, conversion, A gagnés, commissions, payable, payé) ; `suspended` → message dédié.
- `/affilie/produits` — « Mes produits » : cartes produit (image, prix, commission, A, clics, ventes, conversion) + lien + bouton **Copier**.
- `/r/?code=…` — page de redirection : appelle `POST /api/track/affiliate-click` puis `location.replace(url)`. Repli : si l'appel échoue, redirige vers `/produit/?id=…` si connu, sinon vers l'accueil. `public/_redirects` : `/r/*  /r/index.html?code=:splat  200`.
- Header : la pill de solde gagne un lien discret « Espace affilié » quand `role` est affilié/super_affilié.
- Admin : 5ᵉ onglet **Affiliés** (liste, filtre par statut, validation/suspension, ajout manuel d'une vente).

## Sécurité attendue

- Aucune route ci-dessus n'accepte un montant, un statut ou un solde venant du client (hors saisie admin explicite).
- Le code affilié est **généré serveur** : `PSEUDO-XXXX` (majuscules, sans caractère ambigu), unique.
- Toutes les lectures d'un affilié sont scopées par `user_id` de la session.
- `visitor_hash` : sha256, jamais d'IP/UA en clair.
