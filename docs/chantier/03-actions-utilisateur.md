# Actions utilisateur — tutoriels (à faire à la fin du chantier)

> Décision utilisateur (30/09) : ces actions seront exécutées **à la fin du chantier**, après que l'agent aura fini d'utiliser l'état actuel pour vérifier tout le workflow.
> Conséquence acceptée : tant que ce n'est pas fait, **rien ne se déploie** (CI en échec sur secret manquant) — le développement continue en local sur `chantier-v1`.

---

## A. Créer le token Cloudflare et l'ajouter en secret GitHub (≈ 5 min)

**But** : permettre à GitHub Actions de déployer automatiquement le front (Pages `arsenal-tools`) et l'API (Worker `arsenal-api`).

### 1. Créer le token
1. Aller sur **https://dash.cloudflare.com** et se connecter.
2. En haut à droite : icône de profil → **My Profile** → dans le menu de gauche : **API Tokens**.
3. Cliquer **Create Token** → tout en bas : **Create Custom Token** → **Get started**.
4. Renseigner :
   - **Token name** : `arsenal-github-deploy`
   - **Permissions** (3 lignes, bouton « + Add more ») :
     | Type | Élément | Accès |
     |------|---------|-------|
     | Account | **Cloudflare Pages** | **Edit** |
     | Account | **Workers Scripts** | **Edit** |
     | Account | **D1** | **Edit** |
   - **Account Resources** : Include → votre compte (celui qui héberge Arsenal).
   - **Zone Resources** : laisser sur « Include — All zones » (par défaut) ou ignorer — aucune zone n'est nécessaire.
5. **Continue to summary** → **Create Token**.
6. ⚠️ **Copier le token immédiatement** — il n'est affiché qu'une seule fois.

### 2. L'ajouter en secret GitHub
1. Aller sur **https://github.com/odin10032-rgb/arsenal** → onglet **Settings**.
2. Menu de gauche : **Secrets and variables** → **Actions**.
3. Onglet **Secrets** → bouton **New repository secret**.
4. Renseigner exactement :
   - **Name** : `CLOUDFLARE_API_TOKEN` (respecter majuscules et underscores)
   - **Secret** : coller le token copié à l'étape 6.
5. **Add secret**. C'est tout — GitHub le chiffre et ne le réaffichera jamais.

### 3. Vérifier
- Dire à l'agent que c'est fait : il relancera le run CI échoué (**Actions** → dernier run rouge → **Re-run failed jobs**) ou poussera un commit.
- Signature de succès : le job « Front Next.js » se termine en vert et `arsenal-tools.pages.dev` sert la nouvelle version (~1 min après le run).

---

## B. Changer le mot de passe administrateur (À LA FIN du chantier, ≈ 2 min)

**But** : rendre caduc le mot de passe par défaut `BetaArsenal@2025`, visible dans l'historique Git public (risque critique C2 des audits). Tant qu'il n'est pas changé, le secret admin doit être considéré comme compromis.

1. Ouvrir **https://arsenal-tools.pages.dev/#admin** (admin actuel en prod) ou `/admin` (une fois la v0 déployée).
2. Se connecter avec le mot de passe actuel.
3. Onglet **Paramètres** → section **Changement de mot de passe**.
4. Choisir un nouveau mot de passe : **8 caractères minimum**, unique (pas réutilisé ailleurs).
5. Valider → le nouveau hash est écrit en base D1 (`config.admin_token`) et `BetaArsenal@2025` devient définitivement inutilisable.
6. ⚠️ La session admin actuelle du navigateur est mise à jour, mais toute AUTRE session admin (autre navigateur/appareil) devient invalide — c'est normal et voulu.
7. Si vous voulez que l'agent teste le workflow admin complet après rotation (comme lors du passage uniatizer), lui communiquer le nouveau mot de passe — sinon rien à faire de plus.

---

## C. Désactiver les Workers Builds parasites (≈ 1 min, optionnel mais recommandé)

**But** : arrêter les échecs de build « Latest build failed » à chaque push (le Worker « arsenal » a un build Git intégré qui essaie de builder une config Pages).

1. **https://dash.cloudflare.com** → menu de gauche : **Workers & Pages**.
2. Cliquer sur le Worker **« arsenal »** (pas `arsenal-api`).
3. Onglet **Settings** → section **Builds** (ou **Builds & Deployments**) → **Disable builds**.

---

## D. Ce que l'agent fera juste après (séquence de validation finale)

1. Appliquer les migrations D1 de prod (`0001`, `0002`, …) via `wrangler d1 migrations apply`.
2. Déployer le nouveau Worker sur un **worker de preview**, vérifier les contrats (health, products, register/login/me).
3. Déployer le front Next.js (`out/`) et valider le workflow complet en GUI : catalogue, produit, inscription, connexion, portefeuille A, admin 4 onglets, tracking.
4. Bascule définitive (Worker prod + Pages `main`), dernière passe de tests.

## E. Plus tard (Phase 2 — affiliation, pas bloquant aujourd'hui)

- Créer une **clé API Chariow** : dashboard Chariow → **Settings → API Keys** → Create API Key (pour les webhooks « Pulses » et la réconciliation des ventes). L'agent donnera les instructions précises au moment voulu.
