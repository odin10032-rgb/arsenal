/**
 * Arsenal — NOTIFICATIONS AFFILIÉ (cycle de vie, migration 0014).
 *
 * Chaque notification correspond à un VRAI événement backend (changement
 * d'éligibilité, suppression, campagne terminée) — jamais un contenu inventé
 * côté client. Le message est écrit CÔTÉ SERVEUR, prêt à afficher.
 *
 * Style maison : fonctions pures recevant D1Database, lectures défensives.
 */

/** Insère une notification pour CHAQUE affilié ayant un lien (actif ou non) sur le produit. */
export async function notifyProductAffiliates(
  db: D1Database,
  input: { productId: string; type: string; message: string; now?: number }
): Promise<void> {
  const now = input.now ?? Date.now();
  try {
    // Une ligne par lien affilié au produit (id unique par lien+type).
    await db
      .prepare(
        `INSERT OR IGNORE INTO affiliate_notifications
           (id, affiliate_id, type, message, product_id, created_at)
         SELECT lower(hex(randomblob(16))), al.affiliate_id, ?, ?, ?, ?
           FROM affiliate_links al
          WHERE al.product_id = ?`
      )
      .bind(input.type, input.message, input.productId, now, input.productId)
      .run();
  } catch {
    /* jamais bloquant : une notification ratée ne doit pas casser l'action admin */
  }
}

/** Insère une notification pour CHAQUE participant d'une campagne. */
export async function notifyCampaignParticipants(
  db: D1Database,
  input: { campaignId: string; type: string; message: string; now?: number }
): Promise<void> {
  const now = input.now ?? Date.now();
  try {
    await db
      .prepare(
        `INSERT OR IGNORE INTO affiliate_notifications
           (id, affiliate_id, type, message, campaign_id, created_at)
         SELECT lower(hex(randomblob(16))), cp.affiliate_id, ?, ?, ?, ?
           FROM campaign_participants cp
          WHERE cp.campaign_id = ?`
      )
      .bind(input.type, input.message, input.campaignId, now, input.campaignId)
      .run();
  } catch {
    /* jamais bloquant */
  }
}

/** Notifications NON LUES d'un affilié (les plus récentes d'abord, 50 max). */
export async function listUnreadNotifications(
  db: D1Database,
  affiliateId: string
): Promise<{ id: string; type: string; message: string; createdAt: number }[]> {
  try {
    const { results = [] } = await db
      .prepare(
        `SELECT id, type, message, created_at FROM affiliate_notifications
          WHERE affiliate_id = ? AND read_at IS NULL
          ORDER BY created_at DESC LIMIT 50`
      )
      .bind(affiliateId)
      .all<{ id: string; type: string; message: string; created_at: number }>();
    return (results || []).map((r) => ({
      id: r.id,
      type: r.type,
      message: r.message,
      createdAt: r.created_at,
    }));
  } catch {
    return [];
  }
}

/** Marque TOUTES les notifications de l'affilié comme lues (idempotent). */
export async function markAllNotificationsRead(db: D1Database, affiliateId: string): Promise<void> {
  try {
    await db
      .prepare(
        "UPDATE affiliate_notifications SET read_at = ? WHERE affiliate_id = ? AND read_at IS NULL"
      )
      .bind(Date.now(), affiliateId)
      .run();
  } catch {
    /* best-effort */
  }
}
