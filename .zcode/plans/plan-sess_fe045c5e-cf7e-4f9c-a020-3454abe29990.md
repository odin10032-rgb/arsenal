### Plan d'intégration de la SPA dans Next.js App Router

L'objectif est d'intégrer proprement l'interface et la logique métier de l'application vanilla dans Next.js, tout en éliminant les conflits de routage et la page blanche.

1.  **Centralisation du CSS :**
    -   Déplacer le contenu de `public/style.css` vers `src/app/globals.css`.
    -   Nettoyer les imports inutiles pour éviter les conflits avec le CSS actuel.

2.  **Migration des composants (Reactification) :**
    -   Extraire la structure HTML de `public/index.html` pour créer les composants de `src/app/layout.tsx` (Header, Footer, modales).
    -   Développer les composants `ProductGrid` et `ProductCard` en React en réutilisant le HTML/CSS existant.

3.  **Migration de la Logique (`app.js`) :**
    -   Transférer les fonctions métier (API, stockage, formatage) vers `src/lib/api.ts` et de nouveaux hooks personnalisés (`useCatalog.ts`, `useAdmin.ts`).
    -   Remplacer les manipulations manuelles du DOM par des états React (`useState`).

4.  **Routage Next.js :**
    -   Utiliser `src/app/page.tsx` pour le catalogue public.
    -   Créer `src/app/admin/page.tsx` pour le dashboard admin (protection via une logique d'authentification intégrée).

5.  **Finalisation :**
    -   Supprimer les fichiers inutiles dans `public/` (index.html, app.js).
    -   Reconstruire le projet pour valider le déploiement.