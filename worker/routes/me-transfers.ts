import { Hono } from "hono";
import { requireAuth } from "./me";
import { aBalance, aTransactionStatement } from "../../src/lib/server/ledger";
import { isMember } from "../../src/lib/server/user-auth";
import {
  countSharesToday,
  getAffiliateByUserId,
  getAffiliateLink,
  getProductById,
  readAffiliateSettings,
  shareEventStatement,
} from "../../src/lib/server/affiliation";
import { sha256hex } from "../../src/lib/server/auth";
import {
  executeTransfer,
  findUserByPseudo,
  normalizePseudo,
  normalizeIdempotencyKey,
  TransferInsufficientBalanceError,
  validateTransfer,
} from "../../src/lib/server/transfers";
import type { AuthedApp, AuthedEnv } from "../env";

/**
 * Vague 2 — transferts de A et partage récompensé (Bearer requis, `requireAuth`).
 *
 * - GET  /api/me/transfer/lookup?q=<pseudo>  → {ok, recipient:{pseudo}|null}
 *      résolution EXACTE par pseudo ; réponse MINIMALE (jamais d'email, d'id
 *      ni de solde — minimisation).
 * - POST /api/me/transfer {recipientPseudo, amount, idempotencyKey}
 *      transfert ATOMIQUE, gardé par le solde, non rejouable. La clé
 *      d'idempotence vient du CLIENT (UUID généré une fois par tentative) :
 *      un double clic ne crée pas deux transferts. Sans clé valide, une clé
 *      dérivée serveur est utilisée (jamais de repli sur une clé vide partagée).
 * - POST /api/me/share {productId, linkId?}
 *      enregistre un partage, crédite la récompense (clé `share:<id>`), plafonné
 *      à `share_max_per_day` par jour ; 429 au-delà, aucune récompense.
 */

/** IP hachée (sha256) — jamais l'IP brute (même règle que le reste du Worker). */
function ipHashOf(ip: string | undefined | null): string | null {
  return ip ? sha256hex(ip) : null;
}

export const meTransferRoutes: AuthedApp = new Hono<AuthedEnv>()
  /* ----------------------------- Destinataire (lookup) ----------------------------- */
  .get("/api/me/transfer/lookup", requireAuth, async (c) => {
    const q = normalizePseudo(c.req.query("q"));
    if (!q) return c.json({ ok: true, recipient: null });
    const user = await findUserByPseudo(c.env.DB, q);
    // Réponse MINIMALE : le pseudo seulement. Aucune fuite d'existence utile
    // (pas d'id, pas d'email, pas de solde, pas de rôle).
    return c.json({
      ok: true,
      recipient: user ? { pseudo: user.pseudo } : null,
    });
  })

  /* ------------------------------- Transfert de A ------------------------------- */
  .post("/api/me/transfer", requireAuth, async (c) => {
    const { user } = c.get("authUser");

    let body: { recipientPseudo?: unknown; amount?: unknown; idempotencyKey?: unknown };
    try {
      body = (await c.req.json()) as typeof body;
    } catch {
      return c.json({ ok: false, error: "JSON invalide." }, 400);
    }

    const validation = await validateTransfer(c.env.DB, user, {
      recipientPseudo: body?.recipientPseudo,
      amount: body?.amount,
    });
    if ("error" in validation) {
      return c.json({ ok: false, error: validation.error.error }, validation.error.status);
    }

    // Clé d'idempotence : celle du CLIENT (double clic = même clé = un seul
    // transfert) ; sinon dérivée serveur (l'opération reste unique).
    const clientKey = normalizeIdempotencyKey(body?.idempotencyKey);
    const transferId = clientKey ?? crypto.randomUUID();

    try {
      const result = await executeTransfer(c.env.DB, {
        transferId,
        sender: user,
        recipient: validation.recipient,
        amount: validation.amount,
        ipHash: ipHashOf(c.req.header("cf-connecting-ip")),
      });
      const balanceA = await aBalance(c.env.DB, user.id);
      return c.json({
        ok: true,
        transferId: result.transferId,
        amount: result.amount,
        recipient: { pseudo: result.recipientPseudo },
        balanceA,
      });
    } catch (err) {
      if (err instanceof TransferInsufficientBalanceError) {
        return c.json({ ok: false, error: "Solde A insuffisant." }, 402);
      }
      throw err;
    }
  })

  /* --------------------------- Partage récompensé (anti-spam) --------------------------- */
  .post("/api/me/share", requireAuth, async (c) => {
    const { user } = c.get("authUser");

    // Monnaie A réservée aux MEMBRES : un non-membre ne peut ni partager
    // récompensé ni consommer le quota.
    if (!isMember(user)) {
      return c.json({ ok: false, error: "La monnaie A est réservée aux membres." }, 403);
    }

    let body: { productId?: unknown; linkId?: unknown };
    try {
      body = (await c.req.json()) as typeof body;
    } catch {
      return c.json({ ok: false, error: "JSON invalide." }, 400);
    }
    const productId = typeof body?.productId === "string" ? body.productId.trim() : "";
    if (!productId) {
      return c.json({ ok: false, error: "productId requis." }, 400);
    }

    // Affilié ACTIF uniquement (mêmes règles que le reste de l'espace affilié).
    const affiliate = await getAffiliateByUserId(c.env.DB, user.id);
    if (!affiliate || affiliate.status !== "active") {
      return c.json({ ok: false, error: "Partage réservé aux affiliés actifs." }, 403);
    }

    const settings = await readAffiliateSettings(c.env.DB);

    // Anti-spam : la limite est comptée AVANT d'enregistrer le partage, sur les
    // `share_events` du jour. Refus EXPLICITE (429) sans aucune récompense.
    const sharedToday = await countSharesToday(c.env.DB, user.id);
    if (sharedToday >= settings.shareMaxPerDay) {
      return c.json(
        {
          ok: false,
          error: `Limite de ${settings.shareMaxPerDay} partages par jour atteinte.`,
          remainingToday: 0,
        },
        429
      );
    }

    // Lien du produit (facultatif mais tracé) : on ne retient le `linkId` que
    // s'il appartient bien à CET affilié et à ce produit — jamais un id client brut.
    const product = await getProductById(c.env.DB, productId);
    let linkId: string | null = null;
    if (product) {
      const link = await getAffiliateLink(c.env.DB, affiliate.id, productId);
      linkId = link ? link.id : null;
    }

    // Enregistrement + crédit dans le MÊME batch : la clé `share:<id>` rend le
    // crédit idempotent (un seul crédit par partage), et le quota est consommé
    // par l'événement lui-même.
    const { event, statement } = shareEventStatement(c.env.DB, {
      affiliateId: affiliate.id,
      userId: user.id,
      linkId,
      productId,
    });
    const statements = [statement];
    const rewarded = settings.rewardShareA > 0;
    if (rewarded) {
      statements.push(
        aTransactionStatement(c.env.DB, {
          userId: user.id,
          delta: settings.rewardShareA,
          type: "reward_share",
          label: "Récompense partage",
          refType: "share",
          refId: event.id,
          idempotencyKey: `share:${event.id}`,
        })
      );
    }
    await c.env.DB.batch(statements);

    return c.json({
      ok: true,
      rewarded,
      rewardA: rewarded ? settings.rewardShareA : 0,
      remainingToday: Math.max(0, settings.shareMaxPerDay - (sharedToday + 1)),
    });
  });
