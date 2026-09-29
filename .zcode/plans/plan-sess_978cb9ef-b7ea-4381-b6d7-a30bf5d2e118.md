# Plan v0 — Migration d'Arsenal vers Next.js (fondations multi-pages)

## Objectif
Remplacer la SPA monopage par une application **Next.js App Router multi-pages**, en répliquant fidèlement le site validé (design v3.0 « Catalogue sobre », mécaniques complètes), connectée à l'API prod existante (beta-arsenal-api — **zéro changement backend**). Déployable sur Cloudflare Pages via le pipeline existant.

## Constats qui fondent le plan
- Next 16.3 + React 19 + Tailwind 4 déjà installés, `output: 'export'` déjà configuré, 51 composants shadcn présents
- Design system v3.0 validé à porter dans `globals.css` (problème à régler : tokens shadcn absents du bloc `@theme` Tailwind v4)
- API prod : CORS ouvert, `GET /api/products` public (liste complète + `version`), tracking `{type:"click", productId}`, login `{password}` → token + header `X-Admin-Auth`
- Route produit unitaire admin-protégée → la page produit publique lira la liste et filtrera par id
- En export statique, pas de route dynamique serveur → URL produit gérée par query + rewrite Cloudflare

## Structure cible
```
src/app/
  layout.tsx        layout commun (header clé + footer, fonts, metadata FR, favicon /logo.jfif)
  globals.css       design v3.0 + @theme inline (tokens shadcn)
  page.tsx          / — catalogue (client)
  produit/page.tsx  /produit?id=… — page produit dédiée (client)
  admin/page.tsx    /admin — dashboard dédié (client)
src/components/
  site-header / site-footer / product-card / filters-bar / hero-stats
  media-embed (vidéo 16:9 / 9:16) / action-block (Chariow / Terminal / APK+PWA)
  admin/ (login, shell, tabs produits-médiathèque-analytics-paramètres, product-form, confirm)
src/lib/
  api.ts (apiFetch porté : timeout ×4 non-GET, X-Admin-Auth, erreurs {ok,error})
  products.ts (type Product, constantes, filtre ET badges, tri popular/récents, cache localStorage + version)
  video.ts (parseVideoUrl : YouTube/Shorts/TikTok/embed → iframe nocookie, regex identiques)
  format.ts (fmt, timeAgo, dayKey) · track.ts (click/visit) · safeUrl (anti-XSS)
```

## Étapes

1. **Nettoyage public/** (critique) : déplacer l'ancien front (`index.html`, `app.js`, `style.css`, `config.js`) vers `legacy/` — sinon l'`index.html` écraserait la page Next dans le build. Ne garder dans `public/` que `logo.jfif`, `logo.svg`, `robots.txt`, `_headers` (cache révisé) + nouveau `_redirects`.
2. **Fondations** : `globals.css` (design v3.0 + `@theme inline` pour shadcn), `layout.tsx` (header/footer, Inter + JetBrains Mono), `lib/` (api, products, video, format, track, safeUrl).
3. **Catalogue `/`** : hero + 3 stats, filtres catégories/badges (ET logique), tri populaire/récent, recherche 140 ms + Ctrl+K, cartes (2 badges max, heat clics, image lazy + fallback), stale-while-revalidate avec cache + `version`, état vide/skeleton, tracking visite.
4. **Page produit `/produit?id=`** : cover, badges, description, **vidéo démo** (16:9 / 9:16 auto-détectée), **bloc action par type** (Chariow : CTA prix/gratuit · Terminal : commande + copie + lien repo · Mobile : APK + PWA + hint par plateforme), tracking clic. URLs propres via `_redirects` : `/produit/:id → /produit/index.html?id=:id (200)`.
5. **Admin `/admin`** (page dédiée, terminait le point qui vous dérangeait) : login → dashboard à 4 onglets répliqués — Produits (liste, recherche, formulaire complet avec champs conditionnels PWA/commande, aperçu vidéo, dropzone image), Médiathèque, Analytics (auto-refresh 5 s, graphique 7 jours, top produits), Paramètres (GitHub, mot de passe, export/import JSON).
6. **Build & validation** : `npm run build` (export statique), déploiement sur `arsenal-v3-preview`, **test GUI complet** (catalogue, filtres, page produit avec vidéo, admin login → ajout produit fictif → suppression → déconnexion), puis bascule `arsenal-tools`.
7. **CI/CD** : mise à jour du workflow GitHub Actions (build Next en CI Linux puis déploiement de `out/`), `main` = source de vérité.

## Hors périmètre v0 (prochains chantiers)
Comptes utilisateurs, affiliation/récompenses, avis/communauté, SSR (l'API route produit unitaire devient publique à ce moment-là), routes d'URL sans query.

## Points de vigilance
- L'ancien front reste intact dans `legacy/` + l'historique git (rollback trivial)
- Cache assets 1h → `_headers` revu (HTML no-cache, assets longs)
- Le build Windows next dev marche ; seul next-on-pages était cassé en local — la v0 n'en dépend pas (export statique)