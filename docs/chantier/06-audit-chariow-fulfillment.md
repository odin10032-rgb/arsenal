# Audit Chariow + architecture « Paiement en A + Fulfillment »

> Établi le 30/09/2026 à partir des sources **officielles uniquement** (chariow.dev — llms.txt, OpenAPI 3.1.0, guides `.md` — et help.chariow.com). Aucun endpoint, webhook ou paramètre inventé.
> Règle appliquée : **ne pas coder une hypothèse**. Ce qui n'est pas documenté est marqué NON VÉRIFIABLE et n'est pas utilisé comme fondation.

## A. Capacités Chariow vérifiées

| Capacité | Existe ? | Preuve (source officielle) | Contraintes | Utilisable ? |
|---|---|---|---|---|
| API | **OUI** | `chariow.dev/api-reference/openapi.json` — 19 chemins, `bearerAuth` (`sk_live_…`), base `https://api.chariow.com/v1`. Création de clé : dashboard → Paramètres → Développeur (art. 222). | Lecture quasi exclusive : **3 POST seulement** (`/checkout`, `/licenses/{key}/activate`, `/licenses/{key}/revoke`, `/affiliates/invitations`). Aucun PUT/PATCH/DELETE. 100 req/min. Clé non relisible après création. | **OUI** |
| Webhooks (Pulses) | **OUI** | `chariow.dev/en/guides/pulses.md` — `successful.sale`, `license.*`, `affiliate.joined` ; HMAC `x-chariow-signature: sha256=<hex>` sur le corps brut ; `x-pulse-delivery-id` (idempotence). | 5 tentatives puis **Pulse désactivé** ; timeout 30 s ; un secret `whsec_` par Pulse. `redirect_url` explicitement « UX only » — la confirmation fiable passe par les Pulses. | **OUI** (déjà implémenté en Phase 2) |
| Coupons | **OUI** (dashboard uniquement) | help.chariow.com art. 136 — création dans Marketing → Réductions. API : `GET /v1/discounts`, `GET /v1/discounts/{id}`. | **Aucun `POST /v1/discounts`** : pas de création automatisable. Champs : `type` (`percentage`\|`fixed`), `value_off`, `products[]`, `customer_email`, `usage_limit`, dates. | **PARTIELLEMENT** |
| Coupon 100 % | **NON VÉRIFIABLE** | Aucune source officielle n'énonce de plafond ni n'autorise 100 % ; art. 136 ne donne qu'un exemple (« 15 »). | Impossible de savoir si `100` est accepté ni si le `step` serait `completed`. | **NON** — ne pas fonder l'architecture dessus |
| Commande à 0 | **OUI** — via un produit **« Gratuit »** | `init-checkout.md` : `step` ∈ `payment` / **`completed`** (« free products ») / `already_purchased` ; `checkout.md` : « For free products, the sale completes immediately » (`checkout_url: null`). | `CheckoutRequest` **ne contient aucun champ de montant** (le prix vient du produit). Produits Service / Coaching / prix libre → **422**. | **OUI** |
| Accès gratuit | **OUI** — modèle de tarification « Gratuit » du produit | help art. 167/233 (mode de vente : Paiement unique, **gratuit**, prix libre). | Le produit est gratuit **pour tout le monde** sur la boutique. Seule atténuation documentée : « Masquer sur la boutique » (art. 170) — action **dashboard**, visibilité via API **INCERTAIN**. | **OUI, avec réserve** |
| Livraison digitale | **OUI — automatique** | `checkout.md` : « Customer receives automatic access to files, licenses, courses, etc. » ; help art. 280 : l'accès reste dans la bibliothèque du client sur **app.ateliat.com**, lié à **l'email** utilisé à l'achat (art. 292). | L'accès est clé par email ; portail sans mot de passe (code par email). | **OUI** |
| Création de commande | **OUI** | `use-cases.md` scénario 1 « Custom Storefront Integration » ; `checkout.md` : « programmatically create purchase sessions… custom storefronts ». | Produit **publié** obligatoire (sinon 404) ; ventes marquées canal « API » ; `custom_metadata` (10 clés, 255 car.) transmis dans les Pulses. | **OUI** |
| Suivi / statut de commande | **OUI** | `GET /v1/sales`, `GET /v1/sales/{id}` — statuts `awaiting_payment`, **`completed`** (« product access granted »), `failed`, `abandoned`, `settled` ; champs `fulfillment`, `download`, `payment`. | `fulfillment` est **conditionnel/nullable** — incohérence documentaire signalée entre `sales.md` et l'OpenAPI. | **OUI** |
| Licences | Lecture/activation/révocation | `licenses.md` — générées automatiquement à l'achat d'un produit Licence. | **Aucun endpoint de création** (énumération exhaustive des 19 chemins). Prérequis explicite : « Customer buys your product on Chariow ». | **NON** pour accorder un accès |
| Clients | **OUI** (lecture seule) | `GET /v1/customers`, `/v1/customers/{id}`. Créés automatiquement au premier achat. | **Aucun POST** ; changement d'email = dashboard uniquement (art. 132). Pas d'historique d'achats dans l'objet Customer (passer par `GET /v1/sales?customer_id=` ou `?search=<email>`). | **PARTIELLEMENT** |

### Impossible (absence d'endpoint confirmée)
Créer un coupon · créer une licence · créer un client · changer l'email d'un client · **accorder un accès sans checkout** · créer/modifier un produit (aucun `POST/PUT /v1/products`) · fixer un montant arbitraire au checkout.

### Non vérifiable / incertain
Coupon à 100 % (accepté ? `step` résultant ?) · produit « Gratuit » masqué reste-t-il hors API ? · `fulfillment` toujours peuplé sur une vente `completed` ? · paramètres `product_slug`/`customer_email` de `GET /v1/sales` cités dans un scénario mais absents de la référence · **aucun mode sandbox documenté** (pas de `sk_test`) → les tests réels exigent une clé live.

## B. Architecture retenue

**Paiement en A côté Arsenal + fulfillment à méthode configurable par produit**, avec Chariow en méthode nominale et un repli manuel. Ni coupon (non vérifiable), ni licences (inaccessibles), ni bricolage.

```text
Utilisateur → Produit (prix en A défini par l'admin)
   → POST /api/purchases {productId}   (serveur : connexion, produit actif, prix, solde, non-déjà-possédé)
   → débit A atomique + Purchase (état fulfillment_pending)
   → Fulfillment :
        • chariow_free_checkout : POST /v1/checkout (produit Chariow « Gratuit », email de l'utilisateur,
          custom_metadata.arsenal_purchase = <purchaseId>) → step "completed" → accès accordé
        • manual                : l'admin livre (référence/note) → fulfilled
   → Purchase = fulfilled → apparaît dans « Mes produits » → l'utilisateur accède via app.ateliat.com
```

**Pourquoi** : le checkout API sur produit gratuit est la **seule** voie d'accès accordé automatiquement et entièrement documentée. `already_purchased` (renvoyé pour Downloadable/Course/Bundle quand l'email possède déjà le produit) sert de garde-fou naturel côté Chariow.

**Ce que cela impose (à savoir et à décider côté Arsenal)** :
1. Le produit Chariow correspondant doit être en **modèle de tarification « Gratuit »** — ce qui le rend gratuit pour quiconque possède l'URL. Atténuation officielle : le **masquer de la boutique**. Recommandation : créer un **produit Chariow dédié « Arsenal (A) »** par produit vendu en A, masqué, distinct du produit payant en FCFA.
2. Une **clé API Chariow** est nécessaire (création par le propriétaire de la boutique).
3. Les types **Service / Coaching / prix libre** ne passent pas par l'API → méthode `manual` pour ceux-là.
4. `fulfillment` n'étant pas garanti dans la réponse, l'accès réel n'est **jamais déduit** de `GET /v1/sales` seul : la vente `completed` fait foi, et le Pulse `successful.sale` (déjà câblé, avec `custom_metadata`) confirme côté serveur.

**Échec de fulfillment** : les A ne sont **jamais** perdus — la Purchase reste `fulfillment_pending` avec `attempts`, l'admin peut relancer (retry idempotent) ou rembourser en A (transaction `refund`, traçable).

## C. Prérequis utilisateur (hors code)

| # | Action | Où | Bloquant pour |
|---|---|---|---|
| 1 | Créer une **clé API** Chariow | Dashboard Chariow → Paramètres → Développeur → Clés API | Le fulfillment automatique |
| 2 | Créer/configurer les **produits Chariow « Gratuit » masqués** équivalents | Dashboard Chariow | Le fulfillment automatique |
| 3 | Renseigner dans l'admin Arsenal : `price_a`, `chariow_product_id`, `fulfillment_method` par produit | Admin Arsenal (onglet Produits) | L'activation produit par produit |

Tant que 1 et 2 ne sont pas faits, tout le reste fonctionne : l'achat en A, la déduction, les commandes, « Mes produits » — la livraison passant par la méthode **manuelle** (l'admin marque la commande livrée).

**Questions à trancher avec le support Chariow** (recommandation de l'audit, non bloquante) : (1) un coupon `percentage` à 100 est-il accepté et produit-il `step: "completed"` ? (2) `GET /v1/sales/{id}` renvoie-t-il toujours `fulfillment` pour une vente `completed` ?
