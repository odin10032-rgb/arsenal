/**
 * Arsenal — Ledger de la monnaie A (Phase 1).
 * Contrat : docs/chantier/02-contrat-api-phase1.md
 *
 * Table a_transactions APPEND-ONLY : jamais d'UPDATE ni de DELETE ; le solde
 * d'un utilisateur est TOUJOURS recalculé (SUM(delta)) et jamais stocké dans
 * users. Chaque écriture porte une idempotency_key UNIQUE : rejouer une
 * écriture est sans effet (INSERT OR IGNORE). Les deltas sont calculés côté
 * serveur uniquement — le front ne propose jamais de montant.
 */

/** Récompense de bienvenue : +100 A offerts à l'inscription (constante modifiable). */
export const WELCOME_A = 100;

export interface ATransactionRow {
  id: string;
  user_id: string;
  delta: number;
  type: string; // reward | spend | adjustment
  label: string;
  ref_type: string | null;
  ref_id: string | null;
  idempotency_key: string | null;
  created_at: number;
}

/** Transaction A au format API (camelCase, contrat GET /api/me/transactions). */
export interface ATransaction {
  id: string;
  delta: number;
  type: string;
  label: string;
  refType: string | null;
  refId: string | null;
  createdAt: number;
}

export interface NewTransaction {
  userId: string;
  /** Signé : + gains, - dépenses. Toujours calculé côté serveur. */
  delta: number;
  /** reward | spend | adjustment */
  type: string;
  label: string;
  refType?: string | null;
  refId?: string | null;
  idempotencyKey: string;
}

/** INSERT append-only prêt pour un db.batch — idempotent via idempotency_key UNIQUE. */
export function aTransactionStatement(db: D1Database, tx: NewTransaction): D1PreparedStatement {
  return db
    .prepare(
      `INSERT OR IGNORE INTO a_transactions
        (id, user_id, delta, type, label, ref_type, ref_id, idempotency_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      crypto.randomUUID(),
      tx.userId,
      Math.trunc(tx.delta),
      tx.type,
      tx.label,
      tx.refType ?? null,
      tx.refId ?? null,
      tx.idempotencyKey,
      Date.now()
    );
}

/** Écriture autonome (hors batch). */
export async function recordTransaction(db: D1Database, tx: NewTransaction): Promise<void> {
  await aTransactionStatement(db, tx).run();
}

/** +WELCOME_A « Bienvenue sur Arsenal » — idempotence `welcome:<userId>`. */
export function welcomeRewardStatement(db: D1Database, userId: string): D1PreparedStatement {
  return aTransactionStatement(db, {
    userId,
    delta: WELCOME_A,
    type: "reward",
    label: "Bienvenue sur Arsenal",
    idempotencyKey: `welcome:${userId}`,
  });
}

export async function createWelcomeReward(db: D1Database, userId: string): Promise<void> {
  await welcomeRewardStatement(db, userId).run();
}

/** Solde A = SUM(delta), recalculé serveur (ENTIER). */
export async function aBalance(db: D1Database, userId: string): Promise<number> {
  const row = await db
    .prepare("SELECT COALESCE(SUM(delta), 0) AS balance FROM a_transactions WHERE user_id = ?")
    .bind(userId)
    .first<{ balance: number }>();
  return Math.trunc(Number(row?.balance ?? 0));
}

export interface TransactionPage {
  total: number;
  transactions: ATransaction[];
}

/** Historique A : tri created_at DESC puis id DESC, pagination limit/offset. */
export async function listTransactions(
  db: D1Database,
  userId: string,
  limit: number,
  offset: number
): Promise<TransactionPage> {
  const countRow = await db
    .prepare("SELECT COUNT(*) AS total FROM a_transactions WHERE user_id = ?")
    .bind(userId)
    .first<{ total: number }>();
  const { results = [] } = await db
    .prepare(
      "SELECT * FROM a_transactions WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?"
    )
    .bind(userId, Math.trunc(limit), Math.trunc(offset))
    .all<ATransactionRow>();
  return {
    total: Math.trunc(Number(countRow?.total ?? 0)),
    transactions: results.map(toTransaction),
  };
}

function toTransaction(row: ATransactionRow): ATransaction {
  return {
    id: row.id,
    delta: Number(row.delta),
    type: row.type,
    label: row.label,
    refType: row.ref_type ?? null,
    refId: row.ref_id ?? null,
    createdAt: Number(row.created_at),
  };
}
