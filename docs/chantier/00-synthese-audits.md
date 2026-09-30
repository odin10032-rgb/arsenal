# Chantier Arsenal v1 — Synthèse des audits initiaux

> Date : 30/09/2026. Audits réalisés en parallèle par 6 subagents (lecture seule) + 1 recherche web Chariow.
> Source du chantier : `prompt-gros-chantier` (écosystème : comptes, monnaie A, affiliation, Super Affiliates, commissions, campagnes, communauté, admin, paiements).

---

## 🔴 Constats critiques (à traiter AVANT toute fonctionnalité)

### C1 — L'API de prod n'est pas reproductible depuis le dépôt (drift Worker)
`worker/index.ts` est un **stub Hono ne servant que `/health`**, alors que l'API de prod (`beta-arsenal-api.aimane-project-api.workers.dev`) répond avec toutes les routes (products, track, auth, analytics, media). Les handlers réels existent dans `worker/*/route.ts` (déplacés de `src/app/api` au commit `4b0a413`) mais **ne sont câblés dans aucun routeur** (`worker/products/route.ts`, `worker/track/route.ts`, etc. — style Next.js, jamais montés).
**Conséquence** : le job CI `deploy-api` déploie `worker/index.ts` (via `wrangler-api.jsonc:4`) → **tout push touchant `worker/` écraserait l'API de prod par le stub** (catalogue vide sur tous les fronts). Le code qui tourne réellement en prod n'est pas reconstruisible depuis `main`.

### C2 — Secret admin traitable comme compromis
- Token admin = `sha256(mot de passe)`, **non salé, non expirant, non révocable** (`src/lib/server/auth.ts:10-28`).
- Le mot de passe par défaut `BetaArsenal@2025` est **committé en clair** dans `legacy/app.js:22`, `prod-base/app.js:22`, `worklog.md:52`. Si `config.admin_token` n'a jamais été écrit en D1 (seul `POST /api/admin/password` le fait), le token admin est **calculable par n'importe qui ayant lu le repo public**.
- Vérification du mot de passe actuel faite **côté client** (`settings-tab.tsx:133-137`).
- **Action utilisateur P0 : changer le mot de passe admin en prod** (écran Paramètres de l'admin) — écrit `config.admin_token` en D1 et rend le mot de passe public caduc.

## 🟠 Risques élevés

| # | Risque | Détail |
|---|--------|--------|
| E1 | CORS à réflexion d'origine vérifié en prod | `Origin: evil.example.com` réfléchi ; allowlist inclut `X-Admin-Auth, X-GitHub-*`. Le code CORS n'existe pas dans le repo (vite dans le binaire déployé). Interdit dès qu'on ajoute des sessions. |
| E2 | Aucun rate limiting, aucune expiration | `/api/auth/login` brute-forceable ; token à vie. |
| E3 | `/api/track` écriture publique non bornée | Read-modify-write **non atomique** d'une ligne `analytics` unique JSON (`store.ts:127-156`) → poisoning gratuit, pertes d'updates sous concurrence. Pattern **à ne pas transposer** au ledger A. |
| E4 | Upload média | PAT GitHub accepté depuis un header client (`worker/media/route.ts:25`), ni taille ni MIME vérifiés. |
| E5 | CI API aveugle | Le job `deploy-api` ne se déclenche que sur `^worker/|wrangler-api.jsonc`, pas sur `src/lib/server/**` ni `migrations/**`. |

## 🟡 Risques moyens
- `PUT /api/products/:id` réécrit tout le catalogue ; `description` sans limite ; `price` = texte libre tronqué à 24 car. (pas de montant structuré).
- `_headers` sans CSP ni `frame-ancestors` ; fallback iframe permissif (`video.ts:81-90`).
- Artefacts committés : `deploy.zip` (45 Mo), `db/custom.db`, `data/*.json`, `wrangler.toml.bak`, boilerplate `prisma/`, `src/lib/db.ts` cassé (prisma absent des deps), `worker/route.ts` hello-world, script npm `deploy` pointant vers `.vercel/output/static` (mauvais dossier), `ignoreBuildErrors: true` dans next.config.
- Catalogue front : ~578 KB JS + 115 KB CSS sur l'accueil (tout en `use client`) — contrainte de poids pour la suite.

---

## ✅ Ce qui existe et est sain / réutilisable

- **Front Next.js v0** : catalogue `(site)/page.tsx`, page produit `(site)/produit/page.tsx`, admin `/admin` (login + 4 onglets : Produits, Médiathèque, Analytics, Paramètres) — patterns propres : `src/lib/api.ts` (client fetch typé + timeouts), `src/lib/admin.ts` (couche API admin), `use-catalog.ts` (SWR + version base64), `ConfirmDialog`, toast maison, drawer `ProductForm` mobile-first.
- **Requêtes D1** : toutes en `.prepare().bind()` — pas d'injection SQL.
- **Validation produits** : whitelists catégories/types/badges, `sanitizeUrl` bloque `javascript:`.
- **Auth vérifiée sur toutes les écritures admin** ; seed non exécutable en prod.
- **Minimisation des données déjà conforme** : /api/track ne stocke que type/productId/timestamps — pas d'IP, pas d'UA.
- **Design system v3.0** : palette sobre (rouge #e63946 / vert #2a9d8f), Space Grotesk (titres) + Inter, `.btn-arsenal` 44 px (tactile), `BrandLogo` SVG inline (modèle pour la pièce A). Le nettoyage uniatizer a laissé un socle sain mais **sans animations** (le champ est libre).
- **Modèle produit** (`src/lib/server/types.ts:1-19`, `schema.sql:7-25`) : `id, title, short_description, description, category (saas|desktop|mobile|ebook|prompts), action_type (chariow|terminal|mobile), badges, price (texte), action_url, apk_url, pwa_url, command, video_url, image_url, clicks, created_at, updated_at`. Les 5 produits réels de prod sont en `action_type=chariow` avec URLs `https://tmyxphcm.mychariow.shop/prd_*/checkout`.
- **Crypto disponible dans Workers** : WebCrypto (PBKDF2-SHA-256, getRandomValues) + `nodejs_compat` actif — suffisant pour mots de passe et sessions, sans dépendance.
- **Deps déjà installées mais inutilisées** : zod, framer-motion (à NE PAS utiliser pour les animations de statut — CSS suffit), @tanstack/react-table, next-auth (à retirer ou adopter).

## ❌ Ce qui n'existe pas (tout est à construire)
Aucune trace de : comptes utilisateurs, sessions, monnaie A, affiliation, Super Affiliate, commissions, campagnes, paiements, journal d'audit, rôles. Schéma D1 actuel = 4 tables seulement (`products`, `analytics` ligne unique, `media`, `config`).

---

## 💰 Capacités officielles Chariow (recherche web sourcée — NE JAMAIS inventer au-delà)

| Capacité | Verdict | Source |
|----------|---------|--------|
| API développeur | **OUI** — `https://api.chariow.com/v1`, Bearer clé API, 100 req/min (Products, Sales, Checkout init, Customers, Licenses, Affiliates…) | chariow.dev |
| Webhooks (« Pulses ») | **OUI** — `successful.sale`, `failed.sale`, `abandoned.sale`, `affiliate.joined`… Payload inclut `sale.id` (`sal_…`), montants, `product`, `customer`, `affiliate`, `custom_metadata`. Signature HMAC-SHA256 (`x-chariow-signature`), idempotence `x-pulse-delivery-id`, 5 retries puis désactivation | chariow.dev/en/guides/pulses.md |
| Affiliation native | **OUI** — invitations, codes affiliés, commission **par produit**, objet vente avec `affiliate_commission`. **INCERTAIN** : mécanique d'attribution (cookie ? fenêtre ?) et format du lien affilié non documentés | chariow.dev/en/guides/affiliates.md |
| Tracking sur URL produit | **PARTIEL/INCERTAIN** — l'API Checkout accepte `campaign_id` + `custom_metadata` (10 clés, 255 car., restitués dans les Pulses) ; paramètres de query sur les liens hébergés (`*.mychariow.shop/prd_*/checkout?ref=…`) **non documentés** | chariow.dev/api-reference/checkout |
| ID de commande | **OUI** — `sale.id` via webhook/API `/v1/sales` | chariow.dev |
| Redirection post-achat | **OUI** — `redirect_url` par produit (2048 car. max) ; variable `{sale_id}` aperçue dans un exemple officiel mais **jamais documentée formellement** | chariow.dev/en/guides/use-cases.md |

**Conclusion d'attribution des ventes (meilleure → pire)** :
1. **Webhook Pulse `successful.sale` → Worker Arsenal** (vérification HMAC, idempotence sur `x-pulse-delivery-id`/`sale.id`, attribution via `custom_metadata` ou canal `affiliate`) — fiable, serveur-à-serveur. ⚠️ Nécessite une clé API Chariow côté marchand et un endpoint HTTPS public (le Worker, parfait).
2. **Page de succès `redirect_url` + `{sale_id}`** — simple mais non vérifiable (l'acheteur peut ne pas revenir, paramètre non garanti).
3. **Réconciliation** `GET /v1/sales` périodique (100 req/min) croisée avec les clics trackés.
4. **Suivi manuel admin** (marquer une vente à la main) — toujours disponible en dernier recours.

**Limitation assumée pour la v1** : la mécanique exacte d'attribution du programme d'affiliation natif Chariow n'est pas documentée → le chantier doit rester **source de vérité de son propre tracking** : clics trackés par Arsenal, vente confirmée par webhook (si activé) sinon validation admin manuelle, jamais l'inverse.

---

## 🔎 Découvertes de l'inspection du Cloudflare RÉEL (30/09, après accès navigateur)

L'accès direct au compte Cloudflare a révélé des écarts importants entre le dépôt et la production :

| Élément | Dépôt (avant) | **Réalité de production (vérifiée)** |
|---------|---------------|--------------------------------------|
| Worker API | `arsenal-api` (quasi inactif, 9 requêtes) | **`beta-arsenal-api`** (54 versions, 355 requêtes) |
| Base D1 | `arsenal` (484b6903) | **`arsenal-db-prod`** (969f85c2) |
| Analytique | ligne unique JSON (`analytics`) | **4 tables normalisées** : `analytics_counters`, `clicks_by_product`, `visits_by_day`, `recent_visits` |
| Réglages | table `config` | **table `settings`** (clé/valeur, clé `admin_token`) |
| Médias | name/url/kind/size | **+ `data` (base64), `mime`, `hosted`** (`github`\|`d1`) — les octets peuvent être servis par le Worker |
| Upload | `POST /api/media` | `POST /api/upload` (5 Mo, images uniquement) — le nôtre accepte désormais **les deux** |
| Secrets worker | aucun | `ADMIN_PASSWORD`, `GITHUB_TOKEN`, `JWT_SECRET` + restes inutilisés `FIREBASE_*`, `FEDAPAY_*` (aucune trace dans le code déployé) |

Le code du worker de production a été **sauvegardé localement** (`.prod-backup/beta-arsenal-api.js`, hors suivi git) avant toute opération, alors qu'il n'existait nulle part dans le dépôt.

**Conséquence traitée en Phase 0.5 (alignement)** : `store.ts`, `auth.ts`, les routes `analytics`/`media`/`admin` et la migration `0001` ont été réécrits sur le schéma réel. Les contrats d'API sont **identiques** (vérifié en preview puis en production : même `version` de catalogue, même structure produit, média D1 servi à l'octet près). Les tables `users`, `sessions`, `a_transactions`, `security_events` ont été créées sur `arsenal-db-prod` et testées (inscription +100 A, 409 doublon, login, `/api/me`, 401) puis le compte de test a été supprimé.

## 🧭 Décisions d'architecture qui découlent des audits
1. **Reconstruire le Worker comme un seul app Hono** (`worker/index.ts` montant des routes modulaires) : code audité = code déployé, rollback possible. Portage fidèle des handlers existants (contrats préservés : enveloppe `{ok,…}`, formats identiques).
2. **Découpler l'accès D1** : fonctions pures recevant `D1Database` en paramètre (fini `getCloudflareContext()` de `@cloudflare/next-on-pages`, pensé pour Pages Functions).
3. **Migrations D1 versionnées** (`migrations/`, `wrangler d1 migrations`) — fin des `schema.sql` destructifs.
4. **Ledger A append-only** (`a_transactions` : delta, type, ref, `idempotency_key UNIQUE`) — solde = somme calculée serveur, jamais un compteur mutable manipulable.
5. **Sessions opaques en D1** (token aléatoire 32 o, sha256 stocké, TTL 30 j glissante, révocables) + mots de passe PBKDF2-SHA-256 ≥ 100 000 itérations salés. Header `Authorization: Bearer` (sessions cross-domain : cookies SameSite=Lax ne passeraient pas entre pages.dev et workers.dev).
6. **CORS allowlist** (`.pages.dev` du projet + localhost + env) — fin de la réflexion d'origine.
7. **Rate limiting simple sur Worker** (login 5/min/IP, track ~30/min/IP) + dédup clics.
8. **Journal SecurityEvent** sur mutations sensibles + échecs de login, consultable admin.
9. **Analytics : à normaliser** (tables d'événements) avant d'y brancher commissions/campagnes — l'agrégat ligne unique reste pour compat pendant la transition.
10. **Extension produit additive** (rétrocompatible) : colonnes nullables `affiliate_enabled`, `commission_type`, `commission_value`, `currency` ; GET `/api/products` ajoute les champs sans toucher aux existants ; bump `updatedAt` pour invalider le cache SWR.
11. **UI** : token `--accent-gold` unique, composant `CoinA` (SVG sobre type `BrandLogo`), solde en pill de header (pas de HUD), animations de déblocage en **CSS pur** (1,8–2,5 s, bouton Passer dès 400 ms, `prefers-reduced-motion`), route group `(account)`.
12. **/r/<code> (liens affiliés)** : `_redirects` Pages → `/r/index.html?code=:splat` → page statique qui enregistre le clic via l'API puis redirige (compatible export statique ; latence acceptable).

## 📄 Document lié
- Plan de phases et lots : [`01-plan-chantier.md`](01-plan-chantier.md)
