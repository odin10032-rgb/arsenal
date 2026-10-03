/**
 * Arsenal — Transferts de monnaie A entre membres (vague 2).
 *
 * Règles propriétaire (STRICTES, l'ordre de validation compte) :
 *  - montant ENTIER > 0 et ≤ `TRANSFER_MAX_A` (plafond raisonnable calculé serveur) ;
 *  - destinataire existant (résolu par PSEUDO EXACT côté serveur) ;
 *  - destinataire ≠ expéditeur ;
 *  - expéditeur ET destinataire MEMBRES (`isMember`, monnaie A réservée aux membres) ;
 *  - débit conditionné au solde DANS LE SQL (jamais un solde lu avant) ;
 *  - ATOMIQUE et NON REJOUABLE : un SEUL db.batch [débit gardé, crédit gardé par
 *    `EXISTS(clé du débit)`] — même technique que `purchaseStatements`.
 *
 * Style store.ts : fonctions pures recevant D1Database en paramètre.
 *
 * AUCUNE écriture de solde hors transaction traçable : le solde reste SUM(delta)
 * de `a_transactions` (append-only), débit `transfer_out` / crédit `transfer_in`.
 */
import { changesOf } from "./commissions";
import { transferStatements } from "./ledger";
import { isMember, securityEventStatement } from "./user-auth";
import type { UserRow } from "./user-auth";

/* --------------------------------- Constantes --------------------------------- */

/** Plafond d'un transfert, en A (montant ENTIER positif). */
export const TRANSFER_MAX_A = 100_000;

/** Action journalisée dans `security_events` pour chaque transfert exécuté. */
export const A_TRANSFER_ACTION = "a_transfer";

/* ------------------------------------ Types ------------------------------------ */

/** Erreurs de validation d'un transfert (message client + statut HTTP). */
export interface TransferError {
  status: 400 | 403 | 404 | 409;
  error: string;
}

/** Destinataire minimal d'un transfert — jamais d'email, jamais d'id, jamais de solde. */
export interface TransferRecipient {
  pseudo: string;
}

/** Détail d'un transfert exécuté. */
export interface TransferResult {
  transferId: string;
  amount: number;
  recipientPseudo: string;
}

/* --------------------------------- Validation --------------------------------- */

/** Pseudo normalisé pour comparaison EXACTE (espaces de bord retirés). */
export function normalizePseudo(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

/**
 * Montant normalisé : entier > 0 et ≤ `TRANSFER_MAX_A`, sinon null (erreur).
 * Aucun montant n'est accepté du client sans ce garde-fou.
 */
export function normalizeTransferAmount(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(typeof raw === "string" ? raw.trim() : raw);
  if (!Number.isFinite(n)) return null;
  const value = Math.trunc(n);
  if (value <= 0 || value > TRANSFER_MAX_A) return null;
  return value;
}

/** Recherche d'un destinataire par pseudo EXACT (insensible à la casse, comme users.pseudo). */
export async function findUserByPseudo(db: D1Database, pseudo: string): Promise<UserRow | null> {
  const value = normalizePseudo(pseudo);
  if (!value) return null;
  const row = await db
    .prepare("SELECT * FROM users WHERE pseudo = ? COLLATE NOCASE LIMIT 1")
    .bind(value)
    .first<UserRow>();
  return row ?? null;
}

/**
 * Valide un transfert EN AMONT (ordre imposé) et renvoie soit une erreur, soit
 * le destinataire validé et le montant. Le débit/solde n'est PAS vérifié ici :
 * il l'est DANS le SQL du batch (seule garde correcte sous concurrence).
 *
 * Ordre : montant → destinataire existant (sinon 404) → soi-même (400) →
 * expéditeur membre (403) → destinataire membre (403).
 */
export async function validateTransfer(
  db: D1Database,
  sender: UserRow,
  input: { recipientPseudo: unknown; amount: unknown }
): Promise<{ error: TransferError } | { recipient: UserRow; amount: number }> {
  const amount = normalizeTransferAmount(input.amount);
  if (amount === null) {
    return { error: { status: 400, error: `Montant invalide (entier entre 1 et ${TRANSFER_MAX_A}).` } };
  }

  const pseudo = normalizePseudo(input.recipientPseudo);
  if (!pseudo) {
    return { error: { status: 400, error: "Pseudo du destinataire requis." } };
  }

  const recipient = await findUserByPseudo(db, pseudo);
  if (!recipient) {
    return { error: { status: 404, error: "Destinataire introuvable." } };
  }
  // Comparaison d'identité (pas de pseudo) : « jamais vers soi-même », même
  // si la casse du pseudo saisi diffère.
  if (recipient.id === sender.id) {
    return { error: { status: 400, error: "Impossible de se transférer des A à soi-même." } };
  }
  if (!isMember(sender)) {
    return { error: { status: 403, error: "La monnaie A est réservée aux membres." } };
  }
  if (!isMember(recipient)) {
    return { error: { status: 403, error: "Le destinataire n'est pas membre." } };
  }

  return { recipient, amount };
}

/* --------------------------------- Exécution --------------------------------- */

/**
 * Clé d'idempotence de transfert fournie par le client (UUID généré une fois
 * par tentative côté front). C'est LUI qui garantit qu'un double clic ne crée
 * pas deux transferts : deux requêtes portant la même clé réutilisent le même
 * `transferId`, donc le second débit est ignoré (NOT EXISTS) et son crédit aussi.
 *
 * Format : UUID (majuscules/minuscules, tirets) — on n'accepte qu'un motif
 * strict, sinon une clé dérivée serveur est utilisée (jamais de clé vide).
 */
const CLIENT_KEY_PATTERN = /^[0-9a-fA-F-]{16,64}$/;

export function normalizeIdempotencyKey(raw: unknown): string | null {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value || !CLIENT_KEY_PATTERN.test(value)) return null;
  return value;
}

/**
 * Exécute un transfert ATOMIQUE et non rejouable.
 *
 * Le `transferId` est la clé d'idempotence : fourni par le client (route) ou
 * dérivé serveur. Le débit (`transfer-out:<id>`) est conditionné au solde ET à
 * l'inexistence de sa propre clé ; le crédit (`transfer-in:<id>`) est gardé par
 * `EXISTS(clé du débit)`. Un seul db.batch : soit les DEUX lignes existent, soit
 * AUCUNE (D1 exécute un batch en transaction).
 *
 * `security_events` (`a_transfer`) n'est journalisé que si le transfert a
 * RÉELLEMENT eu lieu (ou a déjà eu lieu — rejeu idempotent) : aucune trace pour
 * une tentative refusée faute de solde. L'écriture est best-effort (jamais
 * bloquante) et porte `ipHash` = sha256 de l'IP (jamais l'IP brute).
 */
export async function executeTransfer(
  db: D1Database,
  input: {
    transferId: string;
    sender: UserRow;
    recipient: UserRow;
    amount: number;
    ipHash?: string | null;
  }
): Promise<TransferResult> {
  const { transferId, sender, recipient, amount } = input;
  const transfer = transferStatements(db, {
    transferId,
    fromUserId: sender.id,
    toUserId: recipient.id,
    amount,
    outLabel: `Transfert vers ${recipient.pseudo}`,
    inLabel: `Transfert de ${sender.pseudo}`,
    refId: transferId,
  });

  // Batch ATOMIQUE : uniquement les deux écritures de ledger (ou rien). Le
  // journal est écrit APRÈS, car son contenu (`result`) dépend du débit, dont
  // l'issue n'est connue qu'à la sortie du batch.
  const results = await db.batch(transfer.statements);

  // `results[0]` = débit conditionnel. 1 ligne = transfert écrit ; 0 ligne =
  // rejeu (clé déjà présente) OU solde insuffisant. On distingue en relisant la
  // clé de débit : présente → rejeu idempotent (le transfert a déjà eu lieu),
  // absente → solde insuffisant (aucune ligne écrite, rien à annuler).
  const debited = changesOf(results[0]) === 1;
  let outcome: "done" | "replay" | null = debited ? "done" : null;
  if (!debited) {
    const existing = await db
      .prepare("SELECT 1 AS ok FROM a_transactions WHERE idempotency_key = ? LIMIT 1")
      .bind(transfer.debitKey)
      .first<{ ok: number }>();
    if (existing) outcome = "replay";
  }

  if (!outcome) throw new TransferInsufficientBalanceError();

  // Traçabilité best-effort : le transfert est déjà écrit, un échec du journal
  // ne doit pas transformer un transfert réussi en erreur côté client.
  try {
    await securityEventStatement(db, {
      actor: sender.id,
      action: A_TRANSFER_ACTION,
      ipHash: input.ipHash ?? null,
      meta: {
        transferId,
        recipientId: recipient.id,
        recipientPseudo: recipient.pseudo,
        amount,
        result: outcome,
      },
    }).run();
  } catch (err) {
    console.error("security_events (a_transfer):", err);
  }

  return { transferId, amount, recipientPseudo: recipient.pseudo };
}

/** Erreur : solde A insuffisant (aucune ligne écrite — ni débit, ni crédit). */
export class TransferInsufficientBalanceError extends Error {
  constructor() {
    super("Solde A insuffisant.");
    this.name = "TransferInsufficientBalanceError";
  }
}
