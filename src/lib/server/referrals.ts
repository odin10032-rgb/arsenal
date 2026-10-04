/**
 * Arsenal — PARRAINAGE D'UN COMPTE (recrutement affilié).
 *
 * Idée propriétaire : le COMPTE est le seul identifiant qui traverse les
 * appareils. Dès qu'un visiteur venu d'un lien affilié crée un compte, on lie
 * durablement ce compte à l'affilié d'origine ; à son PREMIER achat, l'affilié
 * touche une RÉCOMPENSE A de recrutement — une seule fois, sans commission.
 *
 * Ce module ne touche JAMAIS aux ventes ni aux commissions : uniquement au
 * ledger A (`a_transactions`, type `reward`), toujours idempotent.
 *
 * Style maison : fonctions pures recevant `D1Database`, lectures défensives.
 */

/** Réglage : montant de la récompense de recrutement (A). 0 = désactivé. */
export const RECRUITMENT_REWARD_KEY = "reward_recruitment_a";

import { getAffiliateById } from "./affiliation";

/** Clé d'idempotence du crédit — un seul versement par filleul. */
function recruitmentKey(userId: string): string {
  return `recruitment:${userId}`;
}

export interface UserReferralRow {
  user_id: string;
  affiliate_id: string;
  link_id: string | null;
  product_id: string | null;
  created_at: number;
  rewarded_at: number | null;
  rewarded_purchase_id: string | null;
}

/** Parrainage d'un compte (null si le compte n'est pas parrainé). */
export async function getReferralForUser(
  db: D1Database,
  userId: string
): Promise<UserReferralRow | null> {
  try {
    const row = await db
      .prepare("SELECT * FROM user_referrals WHERE user_id = ? LIMIT 1")
      .bind(userId)
      .first<UserReferralRow>();
    return row ?? null;
  } catch {
    return null; // table absente (base ancienne) : aucun parrainage connu
  }
}

/**
 * Lie un compte à l'affilié d'origine — UNE SEULE FOIS.
 *
 * `INSERT OR IGNORE` sur `user_id` : si le compte était déjà parrainé (il s'est
 * connecté plusieurs fois, ou avait déjà un parrain), on ne change RIEN. Le
 * premier parrain reste le bon : c'est celui qui l'a fait entrer.
 *
 * Retourne true si un nouveau parrainage vient d'être posé.
 */
export async function linkReferralIfAbsent(
  db: D1Database,
  input: {
    userId: string;
    affiliateId: string;
    linkId?: string | null;
    productId?: string | null;
    now?: number;
  }
): Promise<boolean> {
  const now = input.now ?? Date.now();
  try {
    const res = await db
      .prepare(
        `INSERT OR IGNORE INTO user_referrals
           (user_id, affiliate_id, link_id, product_id, created_at, rewarded_at, rewarded_purchase_id)
         VALUES (?, ?, ?, ?, ?, NULL, NULL)`
      )
      .bind(
        input.userId,
        input.affiliateId,
        input.linkId ?? null,
        input.productId ?? null,
        now
      )
      .run();
    return Number(res.meta?.changes ?? 0) > 0;
  } catch {
    return false; // table absente : on n'échoue jamais l'inscription pour ça
  }
}

/**
 * Statements de la RÉCOMPENSE DE RECRUTEMENT (à exécuter dans le batch d'achat).
 *
 * Deux écritures gardées, donc sans effet si le filleul était déjà récompensé :
 *  1. le crédit A (type `reward`, clé `recruitment:<userId>` — UNIQUE) ;
 *  2. le marquage `rewarded_at` (garde `rewarded_at IS NULL`).
 *
 * Retourne un tableau VIDE si le compte n'est pas parrainé, déjà récompensé, ou
 * si le montant est nul — l'appelant peut toujours concaténer le résultat.
 */
export async function recruitmentRewardStatements(
  db: D1Database,
  input: {
    userId: string;
    purchaseId: string;
    amountA: number;
    now?: number;
  }
): Promise<D1PreparedStatement[]> {
  const amount = Math.trunc(Number(input.amountA) || 0);
  if (amount <= 0) return [];

  const referral = await getReferralForUser(db, input.userId);
  if (!referral || referral.rewarded_at != null) return [];

  // ⚠️ Le ledger A est indexé par `user_id` (un COMPTE), alors que
  // `user_referrals.affiliate_id` porte l'id de la ligne `affiliates`. Créditer
  // ce dernier créerait un solde sur un identifiant qui n'est pas un compte
  // (bug constaté le 03/10/2026 : +50 A versés dans le vide). On résout donc le
  // COMPTE de l'affilié — sans résolution valide, on ne crédite RIEN.
  const affiliate = await getAffiliateById(db, referral.affiliate_id);
  if (!affiliate || !affiliate.user_id) return [];

  const now = input.now ?? Date.now();
  const { aTransactionStatement } = await import("./ledger");

  return [
    // 1. Crédit idempotent : la clé `recruitment:<userId>` empêche tout doublon,
    //    même en cas de double exécution du batch.
    aTransactionStatement(db, {
      userId: affiliate.user_id,
      delta: amount,
      type: "reward",
      label: "Récompense de recrutement",
      refType: "referral",
      refId: input.userId,
      idempotencyKey: recruitmentKey(input.userId),
    }),
    // 2. Marquage : la garde `rewarded_at IS NULL` rend le crédit définitif.
    //    ⚠️ Conditionné à l'EXISTENCE du crédit ci-dessus : si la clé existait
    //    déjà (rejeu), le marquage ne s'applique pas deux fois.
    db
      .prepare(
        `UPDATE user_referrals SET rewarded_at = ?, rewarded_purchase_id = ?
          WHERE user_id = ? AND rewarded_at IS NULL
            AND EXISTS (SELECT 1 FROM a_transactions WHERE idempotency_key = ?)`
      )
      .bind(now, input.purchaseId, input.userId, recruitmentKey(input.userId)),
  ];
}
