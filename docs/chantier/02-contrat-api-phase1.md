# Contrat API — Phase 1 (comptes utilisateurs & monnaie A)

> CONTRAT FIGÉ — le backend (Worker) et le front (Next export statique) l'implémentent chacun de leur côté.
> Règle absolue : ne rien changer aux contrats existants (admin `POST /api/auth/login`, `X-Admin-Auth`, `{ok,…}` partout).

## Généralités

- Base : `API_URL` = `NEXT_PUBLIC_API_URL` sinon `https://beta-arsenal-api.aimane-project-api.workers.dev` (déjà géré par `src/lib/api.ts`).
- Auth utilisateur = header **`Authorization: Bearer <token>`** (token de session opaque). ⚠️ PAS de cookie (front et API sur des sites différents → SameSite=Lax ne passerait pas).
- Toutes les réponses : `{ ok: true, ... }` ou `{ ok: false, error: string }` + code HTTP (400 validation, 401 auth, 409 conflit, 429 rate limit).
- Timestamps : epoch millisecondes.
- CORS : `Authorization` déjà dans l'allowlist du Worker.

## Endpoints

### POST /api/auth/register — inscription
```jsonc
// req
{ "pseudo": "Florian", "email": "florian@example.com", "password": "…≥8 car." }
// 201
{ "ok": true, "token": "<opaque>", "user": { … } }
// 400 → "Le pseudo doit contenir entre 3 et 24 caractères…" / "Email invalide." / "Le mot de passe doit contenir au moins 8 caractères."
// 409 → "Pseudo déjà utilisé." / "Email déjà utilisé."
```
Règles : pseudo 3–24 car., `[a-zA-Z0-9_-]`, unicité insensible à la casse ; email valide (regex simple, ≤ 254, stocké en minuscules) ; **minimisation : AUCUNE autre donnée demandée** (pas de nom, téléphone, adresse).

### POST /api/auth/session — connexion utilisateur (email OU pseudo)
```jsonc
// req
{ "identifiant": "florian", "password": "…" }
// 200
{ "ok": true, "token": "<opaque>", "user": { … } }
// 401 → "Identifiants incorrects." (message volontairement générique)
```
⚠️ `POST /api/auth/login` RESTE le login ADMIN (sha256(mdp) → X-Admin-Auth). Ne pas y toucher.

### DELETE /api/auth/session — déconnexion (Bearer)
`200 → { ok: true }` — révoque la session en base (idempotent : session déjà invalide → 200 aussi).

### GET /api/me — profil + solde (Bearer)
```jsonc
// 200
{ "ok": true, "user": {
  "id": "uuid", "pseudo": "Florian", "email": "florian@example.com",
  "role": "user",             // "user" | "affiliate" | "super_affiliate" | "admin"
  "balanceA": 100,            // ENTIER, calculé serveur = SUM(delta) — jamais stocké dans users
  "createdAt": 1759200000000
}}
// 401 → session invalide ou expirée
```

### GET /api/me/transactions?limit=20&offset=0 — historique A (Bearer)
```jsonc
// 200
{ "ok": true, "total": 1, "transactions": [
  { "id": "uuid", "delta": 100, "type": "reward", "label": "Bienvenue sur Arsenal",
    "refType": null, "refId": null, "createdAt": 1759200000000 }
]}
// limit ≤ 100 (défaut 20), offset ≥ 0 ; tri created_at DESC puis id
```

## Objet `user` (définition unique, partagée)

`{ id, pseudo, email, role: "user"|"affiliate"|"super_affiliate"|"admin", balanceA: number, createdAt }`

## Stockage côté front (convention)

- Clé localStorage `arsenal_session_token` : le token brut.
- Cache utilisateur optionnel en localStorage `arsenal_user_cache` (JSON `{user, fetchedAt}`), toujours revalidé via GET /api/me.
- Événement DOM `arsenal-user-changed` émis après login/logout/refresh → la pill du header et les pages se mettent à jour.

## Sécurité attendue (côté Worker)

- Mots de passe : **PBKDF2-SHA-256, 100 000 itérations, salt 16 o aléatoire, 32 o dérivés**, format stocké `pbkdf2$100000$<saltB64>$<hashB64>` (WebCrypto, aucune dépendance).
- Sessions : token = 32 o aléatoires (base64url) ; **seul sha256(token) stocké** (colonne PK) ; TTL 30 jours, renouvellement glissant (si restant < 15 j à l'accès → repoussé à 30 j) ; révocables (DELETE /api/auth/session).
- Ledger A : table **append-only** ; solde = SUM(delta) ; chaque écriture porte une clé d'idempotence UNIQUE (ex. `welcome:<userId>`). Le front ne propose JAMAIS de montant.
- Rate limiting (même mécanique que Phase 0) : register 3/min/IP, session 10/min/IP.
- security_events : enregistrer register / login ok / login échec / logout (actor, action, ip_hashé, meta JSON).

## Récompense de bienvenue

À l'inscription, une transaction `+100 A — Bienvenue sur Arsenal` (type `reward`, idempotence `welcome:<userId>`) est créée dans la même transaction D1 que le user. Constante modifiable (`WELCOME_A`).

## Schéma D1 (migration 0002)

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  pseudo TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,           -- pbkdf2$100000$<saltB64>$<hashB64>
  role TEXT NOT NULL DEFAULT 'user',     -- user|affiliate|super_affiliate|admin
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,           -- sha256 hex du token (le token lui-même n'est JAMAIS stocké)
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE TABLE a_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  delta INTEGER NOT NULL,                -- signé : + gains, - dépenses
  type TEXT NOT NULL,                    -- reward|spend|adjustment
  label TEXT NOT NULL,
  ref_type TEXT,
  ref_id TEXT,
  idempotency_key TEXT UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_a_tx_user ON a_transactions(user_id, created_at DESC);
CREATE TABLE security_events (
  id TEXT PRIMARY KEY,
  at INTEGER NOT NULL,
  actor TEXT,                            -- user_id, "admin" ou null
  action TEXT NOT NULL,                  -- register | user_login_ok | user_login_fail | logout
  ip_hash TEXT,                          -- sha256 de l'IP (jamais l'IP brute)
  meta TEXT                              -- JSON libre
);
```
