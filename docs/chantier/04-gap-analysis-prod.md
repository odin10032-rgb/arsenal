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
| Tracking clics | clic enregistré et attribué | `POST /api/track/affiliate-click` testé en prod : clic attribué à l'affilié et au produit, `visitor_hash` (jamais d'IP brute), dédup 24 h vérifiée (2 clics → 1 enregistré), redirection vers la vraie page Chariow. | ✅ EXISTE ET FONCTIONNE | — |
| Récompenses A | événement → A | Bienvenue (+100 A) + récompense de vente (+50 A, `idempotency_key sale:<ref>`) testées ; autres sources (campagne, objectif, parrainage) à venir en Phase 3. | 🟡 PARTIEL | 3 |
| Dashboard admin | gestion globale | 5 onglets : Produits, Médiathèque, Analytics, Paramètres + **Affiliés** (validation/suspension, vente manuelle). Reste : utilisateurs, A, paiements, journal. | 🟡 PARTIEL | 4-5 |
| Anti-fraude | détection d'anomalies | `security_events` (register/login/**admin_\***), rate limiting (login, register, track, affiliate-click), HMAC webhook vérifié, idempotence `sale_ref` + `x-pulse-delivery-id`, transactions BDD gardées par `WHERE state = <lu>`. Manque : détection de clics artificiels et journal admin consultable. | 🟡 PARTIEL | 3-5 |
| Mobile | tous les workflows | Écrans livrés responsive (pill compacte, cibles 44 px, drawer admin plein écran) — vérifié sur catalogue, compte, espace affilié. À re-tester au fil des phases. | 🟡 PARTIEL | continu |
| **Affiliation** | utilisateur → affilié | Candidature (`pending`) → validation admin (rôle `affiliate`, `status_history`, `status_unlock_events`) → suspension/réactivation : implémenté et testé (activation vérifiée en prod via la base). | ✅ EXISTE ET FONCTIONNE | — |
| **Liens affiliés** | lien unique → tracking | `affiliate_links` + code `PSEUDO-XXXX-PRODUIT` généré serveur, lien `arsenal-tools.pages.dev/r/<code>` testé. | ✅ EXISTE ET FONCTIONNE | — |
| **Tracking ventes** | Chariow → Arsenal | Webhook Pulse : HMAC-SHA256 vérifié (401 si invalide), idempotence (rejeu → `duplicate:true`), attribution par `custom_metadata`, commission + récompense A créées. Repli `POST /api/admin/sales` (vente manuelle) livré. 503 tant que le secret Chariow n'est pas configuré. | ✅ EXISTE ET FONCTIONNE | — |
| **Commissions** | vente → commission → payable | Création testée (1 500 FCFA = 30 % de 5 000), états et machine à états strictes implémentés, allocation des paiements au plus ancien. **Transitions admin et paiement restent à tester avec le mot de passe admin.** | 🟡 PARTIEL | 4 |
| **Espace Affilié** | dashboard + mes produits | `/affilie` (4 états) et `/affilie/produits` (liens + copie) vérifiés en production : clics, ventes, conversion 100 %, A gagnés, commissions, payable/payé. | ✅ EXISTE ET FONCTIONNE | — |
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
| Affiliate / AffiliateLink / Click / Sale / Commission / Reward / Payment (Withdrawal) | ✅ tables `affiliates`, `affiliate_links`, `click_events`, `sales`, `commissions`, `payments` + récompenses via `a_transactions` |
| Campaign / SuperAffiliateStatus / StatusUnlockEvent | 🟡 tables créées (`campaigns`, `campaign_participants`, `status_unlock_events`) mais fonctionnalités à activer (Phases 3-4) |

## Séquence de fermeture des écarts

1. **Phase 2** — affiliation : schéma (`affiliates`, `affiliate_links`, `click_events`, `sales`, `commissions`), candidature, liens `/r/<code>`, tracking des clics, webhook Chariow (Pulses, HMAC, idempotence) + repli de validation manuelle admin, espace Affilié, onglet admin Affiliés.
2. **Phase 3** — Super Affiliate (règles configurables, historique, validation), animations de déblocage (CSS, une seule fois, état serveur), campagnes.
3. **Phase 4** — commissions (machine à états serveur), portail de paiement admin, historique.
4. **Phase 5** — admin étendu (utilisateurs, A, journal), hook communauté, pages légales.
5. **Phase 6** — tests, audit final indépendant, déploiement.

> Chaque fonctionnalité ne sera déclarée terminée qu'après test du cycle complet : UI → logique → API → base → permissions → validation → persistance → retour UI.
