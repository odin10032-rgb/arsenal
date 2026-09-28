# BUGS_TROUVES

Bugs découverts pendant l'inventaire uniatizer — consignés sans correction (hors scope).

## BUG-01 — Le commit `4b0a413` casse la page publique (markup supprimé, jamais remplacé)

- **Fichier** : `public/index.html` (réduit de 171 à 17 lignes dans le commit `4b0a413`)
- **Lignes** : tout le `<body>` (header, recherche, hero, filtres, grille, footer) a été retiré du shell
- **Symptôme** : `public/app.js` s'attend toujours à ces éléments et plante au démarrage :
  - `app.js:659` — `$("#stat-total").textContent` → `stat-total` n'existe plus
  - `app.js:750` — `bindPublicControls()` fait `$("#search-input").addEventListener(...)` → `search-input` n'existe plus → `TypeError: Cannot read properties of null` → `boot()` échoue, page blanche
  - `renderGrid()` dépend de `#product-grid`, `#grid-skeleton`, `#empty-state`, `#results-count` — tous absents
- **Vérifié le 2026-09-28** : la prod (https://arsenal-tools.pages.dev) tourne encore sur l'ancienne version (index.html complet 174 lignes, app.js sans la logique `CONFIG.API_URL`) — le commit cassé n'a donc **pas** été déployé.
- **À noter** : `deploy.zip` (45 Mo, build du 2026-09-03) est commité dans le repo — artefact périmé, à retirer du suivi git.
