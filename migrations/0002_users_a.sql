-- Arsenal — migration 0002 : comptes utilisateurs, sessions, ledger monnaie A
-- et journal de sécurité (contrat : docs/chantier/02-contrat-api-phase1.md).
-- Non destructive (IF NOT EXISTS), dans la continuité de 0001.
-- Unicité pseudo/email insensible à la casse : UNIQUE COLLATE NOCASE.
-- Le solde A n'est JAMAIS stocké : il est recalculé (SUM delta de a_transactions).

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  pseudo TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,           -- pbkdf2$100000$<saltB64>$<hashB64>
  role TEXT NOT NULL DEFAULT 'user',     -- user|affiliate|super_affiliate|admin
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,           -- sha256 hex du token (le token lui-même n'est JAMAIS stocké)
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS a_transactions (
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

CREATE INDEX IF NOT EXISTS idx_a_tx_user ON a_transactions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS security_events (
  id TEXT PRIMARY KEY,
  at INTEGER NOT NULL,
  actor TEXT,                            -- user_id, "admin" ou null
  action TEXT NOT NULL,                  -- register | user_login_ok | user_login_fail | logout
  ip_hash TEXT,                          -- sha256 de l'IP (jamais l'IP brute)
  meta TEXT                              -- JSON libre
);
