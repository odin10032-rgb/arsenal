/**
 * Arsenal — Ledger de la monnaie A (Phase 1).
 * Contrat : docs/chantier/02-contrat-api-phase1.md
 *
 * Table a_transactions APPEND-ONLY : jamais d'UPDATE ni de DELETE ; le solde
 * d'un utilisateur est TOUJOURS recalculé (SUM(delta)) et jamais stocké dans
 * users. Chaque écriture porte une idempotency_key UNIQUE : rejouer une
 * écriture est sans effet (INSERT OR IGNORE). Les deltas sont calculés côté
 * serveur uniquement — le front ne propose jamais de montant.
 *
 * Un DÉBIT peut être conditionné au solde dans le SQL lui-même
 * (`guardedDebitStatement`) : c'est la seule garde correcte sous concurrence
 * (un solde lu avant le batch peut être périmé — voir l'audit du module
 * « Paiement en A + Fulfillment », constat C1).
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
  /**
   * Clé d'idempotence d'une écriture QUI DOIT EXISTER (dans le même batch) pour
   * que celle-ci soit écrite. Sert aux achats : la vente, la commission et la
   * récompense d'un achat ne sont créées que si le débit conditionnel
   * (`guardedDebitStatement`) a bien été écrit — sinon rien n'est créé.
   */
  requiresTransaction?: string;
}

const A_TRANSACTION_COLUMNS =
  "(id, user_id, delta, type, label, ref_type, ref_id, idempotency_key, created_at)";

/** INSERT append-only prêt pour un db.batch — idempotent via idempotency_key UNIQUE. */
export function aTransactionStatement(db: D1Database, tx: NewTransaction): D1PreparedStatement {
  const values = [
    crypto.randomUUID(),
    tx.userId,
    Math.trunc(tx.delta),
    tx.type,
    tx.label,
    tx.refType ?? null,
    tx.refId ?? null,
    tx.idempotencyKey,
    Date.now(),
  ];
  if (tx.requiresTransaction) {
    // Forme conditionnelle : aucune écriture si l'écriture référencée n'existe pas.
    return db
      .prepare(
        `INSERT OR IGNORE INTO a_transactions ${A_TRANSACTION_COLUMNS}
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE ${transactionExistsSql()}`
      )
      .bind(...values, tx.requiresTransaction);
  }
  return db
    .prepare(`INSERT OR IGNORE INTO a_transactions ${A_TRANSACTION_COLUMNS} VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(...values);
}

/* ------------------------- Débit conditionnel au solde ------------------------- */

/**
 * Fragment SQL « l'écriture d'idempotence `?` existe » — les statements suivants
 * d'un même db.batch s'en servent pour ne rien créer si le débit n'a pas eu lieu.
 */
export function transactionExistsSql(): string {
  return "EXISTS (SELECT 1 FROM a_transactions WHERE idempotency_key = ?)";
}

export interface GuardedDebit {
  /** Statement conditionnel — à exécuter EN PREMIER dans le batch de l'achat. */
  statement: D1PreparedStatement;
  /** Id de la transaction (référence de traçabilité). */
  transactionId: string;
  /** Clé d'idempotence écrite — garde des statements suivants (`transactionExistsSql`). */
  idempotencyKey: string;
  /** Montant débité (entier positif). */
  amount: number;
}

/**
 * Débit conditionné au solde DANS LE SQL (correct sous concurrence) :
 *
 *   INSERT INTO a_transactions (…) SELECT … WHERE (SELECT COALESCE(SUM(delta),0) …) >= <montant>
 *
 * Pourquoi la garde est dans le SQL et non avant : D1 sérialise les écritures,
 * et un batch est une transaction SQLite. Le solde est donc recalculé AU MOMENT
 * de l'écriture (et non dans un aller-retour précédent qui pourrait être périmé
 * — faille TOCTOU). Si le solde est insuffisant, la ligne n'est pas écrite
 * (`meta.changes === 0`) et l'appelant annule l'achat : les statements suivants
 * du batch sont gardés par `transactionExistsSql()`, donc RIEN n'est créé
 * (ni purchase, ni fulfillment, ni vente, ni commission, ni récompense).
 * Le solde n'est jamais stocké : il reste dérivé de `SUM(delta)`.
 */
export function guardedDebitStatement(
  db: D1Database,
  debit: {
    userId: string;
    /** Montant ENTIER positif à débiter (le delta écrit est `-amount`). */
    amount: number;
    /** spend | adjustment */
    type?: string;
    label: string;
    refType?: string | null;
    refId?: string | null;
    idempotencyKey: string;
    now?: number;
  }
): GuardedDebit {
  const amount = Math.max(0, Math.trunc(Number(debit.amount) || 0));
  const transactionId = crypto.randomUUID();
  const statement = db
    .prepare(
      `INSERT OR IGNORE INTO a_transactions
         (id, user_id, delta, type, label, ref_type, ref_id, idempotency_key, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE (SELECT COALESCE(SUM(delta), 0) FROM a_transactions WHERE user_id = ?) >= ?`
    )
    .bind(
      transactionId,
      debit.userId,
      -amount,
      debit.type ?? "spend",
      debit.label,
      debit.refType ?? null,
      debit.refId ?? null,
      debit.idempotencyKey,
      debit.now ?? Date.now(),
      debit.userId,
      amount
    );
  return { statement, transactionId, idempotencyKey: debit.idempotencyKey, amount };
}

/** Écriture autonome (hors batch). */
export async function recordTransaction(db: D1Database, tx: NewTransaction): Promise<void> {
  await aTransactionStatement(db, tx).run();
}

/* ------------------------------- Transfert de A ------------------------------- */

/**
 * Clé d'idempotence d'un transfert : `transfer:<id>`. Le débit utilise
 * `transfer-out:<id>` et le crédit `transfer-in:<id>` — tous deux DÉRIVÉS de
 * l'id de tentative, jamais du client tel quel.
 */
export function transferDebitKey(transferId: string): string {
  return `transfer-out:${transferId}`;
}
export function transferCreditKey(transferId: string): string {
  return `transfer-in:${transferId}`;
}

/**
 * Statements d'un TRANSFERT de A entre deux utilisateurs — à exécuter en UN
 * SEUL db.batch (atomicité D1 : tout ou rien). Montant ENTIER positif calculé
 * côté serveur (jamais fourni par le client).
 *
 * Anti-rejeu : le débit est conditionné à l'inexistence de SA PROPRE clé ET au
 * solde (`WHERE NOT EXISTS(transfer-out:<id>) AND SUM(delta) >= montant`). Le
 * crédit est gardé par l'existence du débit (`transactionExistsSql`) : si le
 * débit n'a pas été écrit (rejeu, ou solde insuffisant), le crédit n'est PAS
 * créé. Un même `transferId` ne peut donc produire qu'un seul mouvement.
 *
 * Le solde n'est jamais stocké : le débit est gardé DANS le SQL, correct sous
 * concurrence (D1 sérialise les écritures ; la garde est recalculée à l'écriture).
 */
export function transferStatements(
  db: D1Database,
  input: {
    transferId: string;
    fromUserId: string;
    toUserId: string;
    /** Montant ENTIER positif à débiter chez l'expéditeur (crédité au destinataire). */
    amount: number;
    /** Libellés explicites (incluent le pseudo de l'autre partie — fournis par l'appelant). */
    outLabel: string;
    inLabel: string;
    refType?: string | null;
    refId?: string | null;
    now?: number;
  }
): {
  /** Statement de débit conditionnel (à exécuter EN PREMIER dans le batch). */
  debitStatement: D1PreparedStatement;
  /** Statements complets du batch : [débit, crédit]. */
  statements: D1PreparedStatement[];
  debitId: string;
  debitKey: string;
  creditKey: string;
  amount: number;
} {
  const now = input.now ?? Date.now();
  const amount = Math.max(0, Math.trunc(Number(input.amount) || 0));
  const debitId = crypto.randomUUID();
  const debitKey = transferDebitKey(input.transferId);
  const creditKey = transferCreditKey(input.transferId);

  // Débit : condition au solde ET anti-rejeu (la clé de débit ne doit pas exister).
  const debitStatement = db
    .prepare(
      `INSERT OR IGNORE INTO a_transactions
         (id, user_id, delta, type, label, ref_type, ref_id, idempotency_key, created_at)
       SELECT ?, ?, ?, 'transfer_out', ?, ?, ?, ?, ?
        WHERE NOT EXISTS (SELECT 1 FROM a_transactions WHERE idempotency_key = ?)
          AND (SELECT COALESCE(SUM(delta), 0) FROM a_transactions WHERE user_id = ?) >= ?`
    )
    .bind(
      debitId,
      input.fromUserId,
      -amount,
      input.outLabel,
      input.refType ?? "transfer",
      input.refId ?? input.transferId,
      debitKey,
      now,
      debitKey,
      input.fromUserId,
      amount
    );

  // Crédit : écrit SEULEMENT si le débit a été écrit (même batch, garde EXISTS).
  const creditStatement = db
    .prepare(
      `INSERT OR IGNORE INTO a_transactions
         (id, user_id, delta, type, label, ref_type, ref_id, idempotency_key, created_at)
       SELECT ?, ?, ?, 'transfer_in', ?, ?, ?, ?, ?
        WHERE ${transactionExistsSql()}`
    )
    .bind(
      crypto.randomUUID(),
      input.toUserId,
      amount,
      input.inLabel,
      input.refType ?? "transfer",
      input.refId ?? input.transferId,
      creditKey,
      now,
      debitKey
    );

  return {
    debitStatement,
    statements: [debitStatement, creditStatement],
    debitId,
    debitKey,
    creditKey,
    amount,
  };
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
