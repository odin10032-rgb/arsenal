# Chantier Arsenal v1 — Plan de phases et des lots

> Priorité imposée par le cahier des charges : **fonctionnel → sécurisé → cohérent → performant → maintenable → extensible**.
> Règle absolue : **ne rien casser de l'existant** (catalogue, page produit, admin, tracking, données D1 de prod).
> Contexte : audits dans [`00-synthese-audits.md`](00-synthese-audits.md).

---

## 🎯 Architecture cible (une seule phrase par brique)

- **Front** : export statique Next.js sur Cloudflare Pages (`arsenal-tools.pages.dev`) — inchangé, enrichi de route groups `(site)` (public), `(account)` (/compte, /affilie) et `/admin` étendu.
- **API** : UN SEUL Worker Hono (`arsenal-api`, `beta-arsenal-api…workers.dev`) montant des routes modulaires sous `/api/*` — code audité = code déployé.
- **Données** : D1 `arsenal` + migrations versionnées. Ledger A append-only, sessions opaques, journal SecurityEvent.
- **Paiements** : manuels (admin), Arsenal calcule ce qui est dû ; webhook Chariow Pulse comme source de confirmation de vente (optionnelle, avec repli manuel).
- **Chariow** : jamais inventé au-delà de la doc officielle (voir synthèse §Chariow).

---

## Phase 0 — Socle & sécurité (PRÉ-REQUIS, séquentiel)

| # | Lot | Contenu | Parallélisable ? |
|---|-----|---------|------------------|
| 0.1 | Worker complet | Reconstruire `worker/index.ts` en app Hono montant TOUTES les routes actuelles (products, products/:id, track, analytics, auth/login, admin/password, media, media/:name, health) en portant fidèlement `worker/*/route.ts` ; contrats préservés (`{ok,…}`, GET /api/health = `{ok,ts,service}`) | Non (socle) |
| 0.2 | Store découplé | `src/lib/server/store.ts` : fonctions pures recevant `D1Database` ; suppressions de `getCloudflareContext()` ; compteurs analytics **atomiques en SQL** | avec 0.1 |
| 0.3 | Migrations | `migrations/0001_init.sql` (schéma actuel, non destructif) + `migrations_dir` dans `wrangler-api.jsonc` | avec 0.1 |
| 0.4 | Sécurité de base | CORS allowlist (fin de réflexion), comparaison constant-time, rate limiting simple (login/track), `/api/track` durci (dédup fenêtre + productId vérifié) | avec 0.1 |
| 0.5 | Nettoyage repo | Retirer du suivi : `deploy.zip`, `db/custom.db`, `data/`, `wrangler.toml.bak`, `prisma/`, `src/lib/db.ts`, `worker/route.ts` ; corriger script npm `deploy` ; CI `deploy-api` paths += `src/lib/server/**`, `migrations/**` | après 0.1-0.4 |
| 0.6 | Validation | `tsc --noEmit` ✓, `wrangler deploy --dry-run` ✓ (bundle 79,65 KiB, bindings D1 + FRONT_ORIGINS). ⚠️ Test runtime local **impossible sur cette machine** (workerd plante — Windows 10 build 1909, essais wrangler 4.144 et 3.90) → validation runtime OBLIGATOIRE sur un **Worker de preview** (ex. `arsenal-api-preview`, même D1) avant toute bascule du job CI sur `main` | après tout |

**🔴 Actions utilisateur P0 (hors code)** : 1) changer le mot de passe admin en prod (rend caduc `BetaArsenal@2025` committé) ; 2) ajouter le secret GitHub `CLOUDFLARE_API_TOKEN` (bloque aussi le déploiement de la v0 Next) ; 3) à terme : créer une clé API Chariow (dashboard → API Keys) pour les Pulses.

## Phase 1 — Comptes utilisateurs & monnaie A (fondations)

- **D1** : `users` (id, pseudo UNIQUE, email UNIQUE, password_hash `pbkdf2$iter$salt$hash`, role `user|affiliate|super_affiliate|admin`, created_at…), `sessions` (token_hash PK, user_id, expires_at, revoked_at), `a_transactions` (append-only : id, user_id, delta, type `reward|spend|adjustment`, ref_type/ref_id, label, `idempotency_key UNIQUE`, created_at), `security_events`.
- **Worker** : `POST /api/auth/register` (pseudo+email+mdp ; minimisation : rien d'autre), `POST /api/auth/login` (user), `GET /api/me` (profil + solde calculé = SUM(delta)), `GET /api/me/transactions` (paginé). Middleware `requireAuth` / `requireRole`.
- **Front** : route group `(account)` : `/connexion`, `/inscription`, `/compte` (profil + pill solde), `/compte/portefeuille` (historique A, origine de chaque transaction). Composant `CoinA` (SVG, token `--accent-gold`), pill solde discrète dans `SiteHeader` (pas de HUD).
- **Sécurité** : PBKDF2 ≥ 100k itérations ; session = token 32 o (sha256 stocké) ; rate limit register/login.
- *Lots parallélisables (subagents)* : A) schéma+migrations+auth Worker ; B) UI compte/portefeuille/CoinA (contre un contrat d'API figé).

## Phase 2 — Affiliation core

- **D1** : `affiliates` (user_id UNIQUE, code UNIQUE court, status `pending|active|suspended`, stats dérivées), `affiliate_links` (affiliate_id, product_id, code, campaign_id ?, created_at), `click_events` (link_id, product_id, ts, session_hash — IP/UA jamais stockés en clair), `sales` (source `chariow_webhook|manual`, sale_ref UNIQUE, product_id, affiliate_id, amount, currency, state `pending|confirmed|rejected`), `commissions` (sale_id, affiliate_id, amount, currency, state `pending|validated|payable|paid|cancelled`), `reward_a` via `a_transactions`.
- **Worker** : `POST /api/affiliate/apply`, `GET /api/affiliate/me` (dashboard : clics, ventes, conversion, A gagnés, commissions), `GET /api/affiliate/me/products` (liens + copier), `GET /r/:code`→ géré côté Pages (voir ci-dessous) + `POST /api/track/redirect` (enregistre le clic, renvoie l'URL cible), webhook `POST /api/webhooks/chariow` (vérif HMAC, idempotence `x-pulse-delivery-id`+`sale_ref`, création sale→commission→récompense A en une transaction D1 batch).
- **Pages** : `_redirects` : `/r/* /r/index.html?code=:splat 200` ; page `/r` statique : enregistre le clic puis redirige vers le produit (`/produit?id=…`).
- **Front** : Espace Affilié `/affilie` (vue d'ensemble + Mes produits + liens copiables). Admin : onglet Affiliés (valider candidatures).
- **Règles affiliés classiques** : table `settings`/config centralisée (limites produits, commissions par défaut) — jamais en dur.
- *Lots parallélisables* : A) backend affiliation ; B) dashboard affilié front ; C) page /r + tracking redirect.

## Phase 3 — Super Affiliate + animations + campagnes

- Candidature/validation Super Affiliate, historique de statut (`status_history`), privilèges configurables (settings admin).
- Espace `/affilie/super` réellement supérieur (stats avancées, campagnes, produits exclusifs, outils).
- **Animations de déblocage** (Affilié, puis Super Affiliate plus prestigieuse) : overlay CSS pur 1,8–2,5 s, bouton « Passer » dès 400 ms, `prefers-reduced-motion` → version statique ; état « vue » côté serveur (`status_unlock_events`) + miroir localStorage ; jouée une seule fois par statut/utilisateur.
- **Campagnes** : `campaigns` (produit, période, commission, récompense A, objectif, limites, éligibilité) + admin CRUD.
- *Lots parallélisables* : A) backend campagnes/statuts ; B) animations UI ; C) espace Super Affiliate front.

## Phase 4 — Commissions & paiements

- Machine à états des commissions **contrôlée serveur** (`UPDATE … WHERE state='pending'`), transitions `pending→validated→payable→paid|cancelled`.
- `withdrawals` (demande de retrait) + `payments` (référence, date, montant) — Arsenal ne devient pas une banque : calcul seulement, paiement manuel.
- **Admin « Portail de paiement »** : commissions dues (filtre/valider/marquer payé + référence), historique, anomalies (onglet dédié).
- Idempotence absolue sur les événements de paiement (UNIQUE `sale_ref`).

## Phase 5 — Admin étendu + communauté + légal

- Onglets admin : Utilisateurs, Affiliés, Monnaie A (émission/consommation/anomalies), Campagnes, Paiements, Journal (SecurityEvent). Tabs synchronisées à l'URL (`/admin/[tab]` compatible export).
- Hook communauté : `is_currently_super_affiliate(user)` exposé proprement (sans dépendance Discord).
- Pages légales : mentions, confidentialité, CGU, règles d'affiliation, règles A (contenu à fournir par l'utilisateur — **jamais inventé**).

## Phase 6 — Tests, audit final, déploiement

- Tests : unitaires (ledger, machine à états, webhook HMAC/idempotence), intégration Worker (contrats API préservés), régression (catalogue/produit/admin actuels), GUI mobile (browser-use).
- **Audit final indépendant** par un subagent n'ayant pas implémenté (bugs, failles, fraude, incohérences front/backend, perfs).
- Déploiement : validation sur canal temporaire (`arsenal-v3-preview`) → bascule `arsenal-tools` (workflow établi : commit avant déploiement, réessayer plutôt qu'abandonner).

---

## 📋 Traçabilité cahier des charges → phases

| § Prompt | Sujet | Phase |
|----------|-------|-------|
| 3, 37 | Comptes, minimisation, conformité | 1, 5 |
| 4, 5, 6, 31 | Monnaie A, pièce, solde sans HUD, pas une crypto | 1 |
| 7 | Interface utilisateur progressive | 1 |
| 8, 9, 10, 11, 12 | Affiliation, espace, produits, liens, tracking clics | 2 |
| 13, 14, 36 | Chariow (vérifié — voir synthèse), flux de vente | 2 |
| 15, 16 | Récompenses A, limites affiliés | 2 |
| 17, 18, 19 | Super Affiliate + animations | 3 |
| 20, 21, 22 | Commissions, retraits, portail admin paiements | 4 |
| 23, 24 | Communauté, campagnes | 3, 5 |
| 25, 26 | Dashboards affilié/admin | 2, 4, 5 |
| 27, 28, 29 | Modèle de données, sécurité, anti-fraude | transverse (0-4) |
| 30, 31, 32 | Mobile, identité pièce A, perfs | transverse |
| 33, 34 | Préservation existant, tests | 0, 6 |
| 38, 39, 40 | Évolutivité, critère de réussite, livrable | 6 |
