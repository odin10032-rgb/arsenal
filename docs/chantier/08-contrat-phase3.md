# Contrat API — Phase 3 (Super Affiliate + animations + campagnes)

> CONTRAT FIGÉ. Les tables existent déjà (migration 0003) : `campaigns`, `campaign_participants`, `status_history`, `status_unlock_events`. Réglages : `super_min_sales` (défaut 10), `super_min_clicks` (défaut 100), `license_max_activations` (3).
> Rappel : rôles `users.role` = user | affiliate | super_affiliate | admin. La table `affiliates.status` (pending|active|suspended) est le statut du programme d'affiliation, indépendant du rôle.

## 1. Super Affiliate

### Progression et éligibilité (dans GET /api/affiliate/me)
La réponse ajoute :
```jsonc
{
  "affiliate": {
    "isSuper": false,                    // déjà présent
    "super": {                           // NOUVEAU
      "requested": false,                // candidature en cours ?
      "eligible": true,                  // critères atteints ?
      "criteria": { "minSales": 10, "minClicks": 100 },
      "progress": { "sales": 0, "clicks": 0 }   // ventes confirmées + clics réels
    },
    "unlockPending": "affiliate" | "super_affiliate" | null   // animation à jouer ?
  }
}
```
- `eligible` = `progress.sales >= criteria.minSales && progress.clicks >= criteria.minClicks` (valeurs des settings, défauts 10/100).
- `unlockPending` = premier `status_unlock_events` (user, seen_at NULL) → son `status` ; null si aucun.

### POST /api/affiliate/me/upgrade — candidature Super Affiliate
- Bearer ; affilié `active` requis (403 sinon) ; déjà super → 409.
- Vérifie l'éligibilité : si non atteinte → `403 {ok:false, error:"Critères non atteints pour devenir Super Affiliate."}` + `{criteria, progress}`.
- Si atteinte : insère `status_history (from_role='affiliate', to_role='super_affiliate', reason='request')` et répond `201 {ok:true, requested:true}` — **la validation reste manuelle** (admin), conformément au §19 (validation si nécessaire).
- 200 si une demande existe déjà (idempotent).

### Admin
- `POST /api/admin/affiliates/:id/promote-super` `{reason?}` (admin) :
  - charge l'affilié (par son id `affiliates.id`), vérifie `users.role` ;
  - `users.role = 'super_affiliate'` (si pas déjà) ;
  - `status_history (from_role='affiliate', to_role='super_affiliate', reason)` ;
  - `status_unlock_events (user_id, status='super_affiliate')` — INSERT OR IGNORE (une seule animation) ;
  - `security_events 'admin_super_promote'` ;
  - réponse `{ok, user:{id,pseudo,role}, unlocked:boolean}`.
- `GET /api/admin/affiliates` : chaque ligne gagne `role` (déjà) et `superRequested` (status_history contient une demande sans promotion).
- L'onglet admin doit pouvoir **promouvoir même sans demande** (gestion discrétionnaire) et afficher les critères/progression.

## 2. Animation de déblocage (état contrôlé serveur)

- `GET /api/me/unlock` (Bearer) → `{ok, status: 'affiliate'|'super_affiliate'|null, seenAt: number|null}` — le premier événement non vu.
- `POST /api/me/unlock/seen` `{status}` → marque `seen_at = now` (idempotent ; 400 si status invalide).
- Règles : l'animation est jouée **une seule fois par statut et par utilisateur** (UNIQUE(user_id,status) en base — pas de compteur front seul). Le front la joue quand `unlockPending` est non null, puis marque vu.

## 3. Campagnes

### Admin
| Route | Corps / requête | Effet |
|---|---|---|
| `GET /api/admin/campaigns?status=` | — | liste : id, name, productId+title, période, commissionType/Value, rewardA, goalSales, status, participants, clics/ventes agrégées de la campagne |
| `POST /api/admin/campaigns` | `{name, productId, startsAt?, endsAt?, commissionType, commissionValue?, rewardA?, goalSales?}` | crée en `draft` (validation : nom ≥ 3, produit existant, commissionType percent(0-100)/fixed(≥0), dates cohérentes) → `201 {ok, campaign}` |
| `POST /api/admin/campaigns/:id/state` | `{status: 'active'\|'ended'\|'draft'}` | transition libre mais journalisée (`security_events admin_campaign_state`) |
| `DELETE /api/admin/campaigns/:id` | — | supprime uniquement si `draft` et sans clics (sinon 409) |

### Affilié (Bearer, affilié actif)
- `GET /api/affiliate/me/campaigns` → campagnes **actives** (et publiées) du produit de l'affilié éligibles :
```jsonc
{ "ok": true, "campaigns": [ { "id":"…", "name":"…", "productName":"…",
    "endsAt": 0, "commissionType":"percent", "commissionValue":40, "rewardA":80,
    "goalSales": 50, "mySales": 3, "myClicks": 120, "joined": true } ] }
```
- `POST /api/affiliate/me/campaigns/:id/join` → participe (INSERT OR IGNORE sur (campaign_id, affiliate_id)) ; `200 {ok, joined:true}` ; 404 campagne inconnue/inactive ; 403 non affilié actif.

### Impact sur les commissions
`resolveCommissionRule` (existant) considère déjà les campagnes actives couvrant le produit — la priorité reste : **produit → campagne → défaut**. Aucun changement de calcul, juste l'existence des campagnes actives.

## 4. Front

- **Animation de déblocage** : composant plein écran (overlay sombre), pièce A en rotation 3D CSS (keyframes `@keyframes`, PAS de lib), titre « STATUT DÉBLOQUÉ » + nom du statut + pseudo, bouton **Passer** visible dès 400 ms, durée totale ≤ 2,5 s, `@media (prefers-reduced-motion: reduce)` → version statique sans rotation, puis `POST /api/me/unlock/seen`. Jouée depuis `/affilie` quand `unlockPending` non null.
- **/affilie** : si `super.requested` → encart « candidature Super Affiliate en attente » ; si `affiliate.status === 'active'` → encart progression Super Affiliate (critères, progression actuelle, bouton **Demander le statut Super Affiliate** actif si éligible) ; nouvelle section **Campagnes** (cartes : nom, produit, condition, commission/récompense, progression `mySales/goalSales`, bouton Participer si `!joined`).
- **Admin** : nouvel onglet **Campagnes** (liste + création via formulaire + activer/terminer) ; onglet **Affiliés** : bouton **Promouvoir Super Affiliate** (ConfirmDialog, critères affichés) sur chaque ligne.
- Mobile-first, 44 px, pas de lib d'animation, montants/statuts toujours lus de l'API.

## 5. Sécurité
- La promotion Super Affiliate est **toujours** une action admin ; le client ne peut pas se l'attribuer.
- `unlock/seen` ne marque que les événements de l'utilisateur de la session.
- Toute mutation admin journalisée (`admin_campaign_*`, `admin_super_promote`).
