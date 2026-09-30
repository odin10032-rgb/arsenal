# Gap analysis — Production vs workflow cible

> Établi le 30/09/2026 **après vérification réelle** (code lu, base `arsenal-db-prod` interrogée, workflows testés en production).
> Méthode : chaque « ❓ » de la spécification est remplacé par un constat vérifié. Règle appliquée : une carte qui affiche un nombre ne prouve rien — seuls comptent l'UI **+** la logique **+** l'API **+** la base **+** les permissions **+** la persistance.

## Matrice

| Fonctionnalité | Workflow cible | Constat vérifié | État | Phase |
|---|---|---|---|---|
| Compte utilisateur | création → connexion → profil | Inscription/connexion/profil testés de bout en bout en prod le 30/09 (compte créé, puis supprimé). PBKDF2, sessions opaques en D1, `/api/me`. | ✅ EXISTE ET FONCTIONNE | — |
| Portefeuille A | solde + historique + origine | `/compte/portefeuille` testé : solde = SUM(delta) calculé serveur, historique paginé affichant « Bienvenue sur Arsenal · +100 A ». | ✅ EXISTE ET FONCTIONNE | — |
| Pièce A | pièce d'or + grand A | Composant `CoinA` SVG (or 2 tons, anneau gravé) présent header/compte/portefeuille ; aucun style crypto/casino. | ✅ EXISTE ET FONCTIONNE | — |
| Sécurité du A | serveur = source de vérité | Solde jamais accepté du client (aucun endpoint d'écriture de montant) ; ledger append-only avec clé d'idempotence ; 401 vérifiés. | ✅ EXISTE ET FONCTIONNE | — |
| Tracking clics | clic enregistré et attribué | Les clics par produit existent (`clicks_by_product`, `/api/track`) — mais **sans aucun affilié** : impossible d'attribuer un clic à quelqu'un. | 🟡 PARTIEL | 2 |
| Récompenses A | événement → A | Ledger opérationnel + récompense de bienvenue idempotente. Aucun autre type de récompense (vente, campagne, objectif, parrainage). | 🟡 PARTIEL | 2-3 |
| Dashboard admin | gestion globale | 4 onglets fonctionnels (Produits, Médiathèque, Analytics, Paramètres). Aucune gestion utilisateurs/affiliés/A/commissions/paiements. | 🟡 PARTIEL | 4-5 |
| Anti-fraude | détection d'anomalies | `security_events` (register/login/échec) + rate limiting (login, track) + comparaisons timing-safe. Pas de détection de clics artificiels ni de double attribution (rien à détecter encore). | 🟡 PARTIEL | 2-3 |
| Mobile | tous les workflows | Écrans livrés responsive (pill compacte, cibles 44 px, drawer admin plein écran) — vérifié sur le catalogue et l'espace compte. À re-tester sur les nouveaux écrans. | 🟡 PARTIEL | continu |
| **Affiliation** | utilisateur → affilié | **Aucune table, aucune route, aucun écran** (grep exhaustif : seuls les libellés de rôle existent). | 🔴 MANQUANT | 2 |
| **Liens affiliés** | lien unique → tracking | Inexistant. | 🔴 MANQUANT | 2 |
| **Tracking ventes** | Chariow → Arsenal | Inexistant (aucun webhook). Capacités Chariow vérifiées et documentées (Pulses HMAC) — à implémenter. | 🔴 MANQUANT | 2 |
| **Commissions** | vente → commission → payable | Inexistant. | 🔴 MANQUANT | 2-4 |
| **Espace Affilié** | dashboard + mes produits | Inexistant. | 🔴 MANQUANT | 2 |
| **Super Affiliate** | affilié → super (règles, historique) | Inexistant (le rôle est prévu dans le type, rien ne le gère). | 🔴 MANQUANT | 3 |
| **Espace Super Affiliate** | privilèges réellement supérieurs | Inexistant. | 🔴 MANQUANT | 3 |
| **Animations de déblocage** | 1ʳᵉ ouverture, une seule fois | Inexistant. | 🔴 MANQUANT | 3 |
| **Campagnes** | création → participation → résultats | Inexistant. | 🔴 MANQUANT | 3 |
| **Portail de paiement** | commissions dues → validation → payé | Inexistant. | 🔴 MANQUANT | 4 |
| **Communauté** | statut → accès | Inexistant (aucune dépendance Discord, conforme à la cible). | 🔴 MANQUANT | 5 |

## Ce que la prod publique montre (et pourquoi)

Le crawl public affiche « 0 outils au catalogue / Chargement du catalogue… » : c'est le **comportement attendu** du rendu client (l'export statique charge les données via JavaScript). Vérifié visuellement le 30/09 : le catalogue affiche bien **5 produits réels** avec recherche, filtres, badges et tri. Ce n'est donc pas une absence de données.

## Concepts à vérifier (§32 de la spécification)

| Concept | État |
|---|---|
| User | ✅ table `users` |
| ATransaction | ✅ table `a_transactions` (append-only) |
| SecurityEvent | ✅ table `security_events` |
| Product | ✅ table `products` |
| Affiliate / AffiliateLink / Click / Conversion / Sale / Reward / Commission / Withdrawal / Payment / Campaign / SuperAffiliateStatus / StatusUnlockEvent | 🔴 à créer (Phases 2-4) |

## Séquence de fermeture des écarts

1. **Phase 2** — affiliation : schéma (`affiliates`, `affiliate_links`, `click_events`, `sales`, `commissions`), candidature, liens `/r/<code>`, tracking des clics, webhook Chariow (Pulses, HMAC, idempotence) + repli de validation manuelle admin, espace Affilié, onglet admin Affiliés.
2. **Phase 3** — Super Affiliate (règles configurables, historique, validation), animations de déblocage (CSS, une seule fois, état serveur), campagnes.
3. **Phase 4** — commissions (machine à états serveur), portail de paiement admin, historique.
4. **Phase 5** — admin étendu (utilisateurs, A, journal), hook communauté, pages légales.
5. **Phase 6** — tests, audit final indépendant, déploiement.

> Chaque fonctionnalité ne sera déclarée terminée qu'après test du cycle complet : UI → logique → API → base → permissions → validation → persistance → retour UI.
