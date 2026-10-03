import { Hono } from "hono";
import type { Context } from "hono";
import { isAdmin, unauthorized, sha256hex } from "../../src/lib/server/auth";
import { securityEventStatement } from "../../src/lib/server/user-auth";
import { isMember } from "../../src/lib/server/user-auth";
import { changesOf } from "../../src/lib/server/commissions";
import {
  aBalance,
  aTransactionStatement,
  guardedDebitStatement,
} from "../../src/lib/server/ledger";
import { listAbandonedCarts } from "../../src/lib/server/cart";
import type { AbandonedCartRow } from "../../src/lib/server/cart";
import {
  isAffiliateSettingKey,
  readAffiliateSettings,
  writeAffiliateSetting,
} from "../../src/lib/server/affiliation";

import type { App, Env } from "../env";

/**
 * Vague 5 — administration du PROGRAMME (X-Admin-Auth, même style que les autres
 * routeurs admin : `isAdmin` + `unauthorized`).
 *
 * Quatre familles :
 * - `GET  /api/admin/transfers?limit=`            traçabilité des transferts de A ;
 * - `GET  /api/admin/abandoned-carts?hours=&limit=` achats abandonnés (= paniers non convertis) ;
 * - `GET  /api/admin/program-settings`            réglages du programme d'affiliation ;
 * - `POST /api/admin/program-settings`            écriture d'un réglage whitelisté ;
 * - `POST /api/admin/users/:id/credit`            AJUSTEMENT administratif de A (très sensible).
 *
 * Toutes les lectures de tables OPTIONNELLES sont défensives : une table absente
 * (base plus ancienne) ou une requête en échec renvoie `[]` — la route ne répond
 * JAMAIS 500 pour autant et n'invente aucune donnée (même style que admin-users).
 * Le solde A n'est jamais stocké : il reste `SUM(delta)` de `a_transactions`.
 */

/* --------------------------------- Utilitaires --------------------------------- */

type AdminContext = Context<{ Bindings: Env }, any, any>;

/** X-Admin-Auth réutilisé tel quel (isAdmin + unauthorized de auth.ts). */
async function requireAdmin(c: AdminContext): Promise<Response | null> {
  if (await isAdmin(c.req.raw, c.env)) return null;
  return unauthorized();
}

/** Minimisation : seule l'empreinte sha256 de l'IP est journalisée. */
function ipHashOf(header: string | undefined): string {
  return sha256hex(header || "unknown");
}

function badRequest(error: string): Response {
  return Response.json({ ok: false, error }, { status: 400 });
}

function notFound(error: string): Response {
  return Response.json({ ok: false, error }, { status: 404 });
}

async function readJson(c: AdminContext): Promise<Record<string, unknown> | null> {
  try {
    const body = await c.req.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Entier borné depuis la query string (repli si absent/illisible). */
function parseClampedInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value), min), max);
}

/** Lecture défensive d'une liste : table absente ou requête en échec → [] (jamais d'exception). */
async function safeAll<T>(db: D1Database, sql: string, ...binds: unknown[]): Promise<T[]> {
  try {
    const statement = binds.length ? db.prepare(sql).bind(...binds) : db.prepare(sql);
    const { results } = await statement.all<T>();
    return results ?? [];
  } catch {
    return [];
  }
}

/** Bornes de l'onglet : transferts et abandons plafonnés à 200 entrées. */
const PROGRAM_LIMIT_MAX = 200;

/** Plafond absolu d'un ajustement administratif de A (crédit comme débit). */
export const ADMIN_CREDIT_MAX_A = 100_000;

/* ----------------------------- Transferts de A ----------------------------- */

/**
 * Un transfert du ledger est une PAIRE `transfer_out` / `transfer_in` partageant
 * le même `ref_id` (= transferId, voir `transferStatements` de ledger.ts). On
 * reconstitue donc chaque transfert depuis ces deux écritures :
 *   - expéditeur = user_id de la ligne `transfer_out` ;
 *   - destinataire = user_id de la ligne `transfer_in` ;
 *   - montant = |delta| (positif) ;
 *   - date = created_at de l'écriture de débit.
 * Le pseudo est joint depuis `users`. Aucune donnée n'est inventée : une paire
 * incomplète (transfert inachevé) est ignorée.
 */
interface TransferRow {
  ref_id: string;
  out_user_id: string;
  in_user_id: string | null;
  amount: number;
  created_at: number;
}

interface PseudoRow {
  id: string;
  pseudo: string;
}

/* ------------------------------ Réglages du programme ------------------------------ */

/**
 * Clés de réglages « pertinentes pour l'admin » du programme d'affiliation.
 * L'ÉCRITURE n'utilise JAMAIS cette liste comme whitelist : elle réutilise
 * `isAffiliateSettingKey` (source unique de vérité, dérivée des défauts du
 * contrat). Cette liste ne sert qu'à présenter à l'admin un sous-ensemble lisible.
 */
const PROGRAM_SETTING_KEYS = [
  "max_active_links",
  "max_sales_per_link",
  "super_max_active_links",
  "reward_share_a",
  "reward_click_a",
  "share_max_per_day",
  "super_min_sales",
  "super_min_clicks",
  "default_commission_percent",
  "default_reward_a",
  "affiliate_min_sales",
] as const;

/** Réglages sérialisés pour l'admin (camelCase + clés brutes des plafonds). */
async function programSettingsJson(db: D1Database) {
  const settings = await readAffiliateSettings(db);
  return {
    // Plafonds de liens (0 = illimité pour super_max_active_links).
    max_active_links: settings.maxActiveLinks,
    max_sales_per_link: settings.maxSalesPerLink,
    super_max_active_links: settings.superMaxActiveLinks,
    // Récompenses en A.
    reward_share_a: settings.rewardShareA,
    reward_click_a: settings.rewardClickA,
    // Anti-spam du partage.
    share_max_per_day: settings.shareMaxPerDay,
    // Seuils Super Affiliate.
    super_min_sales: settings.superMinSales,
    super_min_clicks: settings.superMinClicks,
    // Commission / récompense par défaut.
    default_commission_percent: settings.defaultCommissionPercent,
    default_reward_a: settings.defaultRewardA,
    affiliate_min_sales: settings.affiliateMinSales,
  };
}

/* ------------------------------------ Routes ------------------------------------ */

export const adminProgramRoutes: App = new Hono<{ Bindings: Env }>()
  /**
   * GET /api/admin/transfers?limit= — transferts de A reconstruits depuis le
   * ledger (paires `transfer_out` / `transfer_in` de même `ref_id`).
   * Lecture 100 % défensive : jamais 500. Plafond 200 entrées.
   */
  .get("/api/admin/transfers", async (c) => {
    const denied = await requireAdmin(c);
    if (denied) return denied;

    const limit = parseClampedInt(c.req.query("limit"), 100, 1, PROGRAM_LIMIT_MAX);
    const db = c.env.DB;

    // Écritures de transfert, débit d'abord (c'est lui qui porte la date et l'expéditeur).
    const rows = await safeAll<TransferRow>(
      db,
      `SELECT out_tx.ref_id AS ref_id,
              out_tx.user_id AS out_user_id,
              in_tx.user_id  AS in_user_id,
              ABS(out_tx.delta) AS amount,
              out_tx.created_at AS created_at
         FROM a_transactions out_tx
         LEFT JOIN a_transactions in_tx
                ON in_tx.ref_id = out_tx.ref_id AND in_tx.type = 'transfer_in'
        WHERE out_tx.type = 'transfer_out' AND out_tx.ref_id IS NOT NULL
        ORDER BY out_tx.created_at DESC, out_tx.id DESC
        LIMIT ?`,
      limit
    );

    // Pseudos des deux parties (une seule requête, dédupliquée).
    const userIds = Array.from(
      new Set(rows.flatMap((r) => [r.out_user_id, r.in_user_id]).filter((v): v is string => !!v))
    );
    const pseudoMap = new Map<string, string>();
    if (userIds.length) {
      const placeholders = userIds.map(() => "?").join(", ");
      const users = await safeAll<PseudoRow>(
        db,
        `SELECT id, pseudo FROM users WHERE id IN (${placeholders})`,
        ...userIds
      );
      for (const u of users) pseudoMap.set(u.id, u.pseudo);
    }

    return c.json({
      ok: true,
      count: rows.length,
      transfers: rows.map((r) => ({
        refId: r.ref_id,
        // Pseudo absent (compte supprimé) : on n'invente rien, on renvoie null.
        fromPseudo: pseudoMap.get(r.out_user_id) ?? null,
        toPseudo: r.in_user_id ? (pseudoMap.get(r.in_user_id) ?? null) : null,
        amount: Math.trunc(Number(r.amount) || 0),
        createdAt: Number(r.created_at) || 0,
      })),
    });
  })
  /**
   * GET /api/admin/abandoned-carts?hours=&limit= — paniers non convertis (= achats
   * abandonnés, migration 0010 : aucune table dédiée). Utilise `listAbandonedCarts`
   * de cart.ts (source unique). `hours` = fenêtre d'inactivité (défaut 24 h, bornée 1..720).
   *
   * La VALEUR affichée est le prix PUBLIC des articles (`products.price`), JAMAIS
   * la valeur en A : un panier visiteur ou d'un non-membre n'a pas de prix en A.
   */
  .get("/api/admin/abandoned-carts", async (c) => {
    const denied = await requireAdmin(c);
    if (denied) return denied;

    const hours = parseClampedInt(c.req.query("hours"), 24, 1, 720);
    const limit = parseClampedInt(c.req.query("limit"), 100, 1, PROGRAM_LIMIT_MAX);
    const db = c.env.DB;
    const idleSince = Date.now() - hours * 60 * 60 * 1000;

    const carts = await listAbandonedCarts(db, idleSince, limit);

    // Détail des articles (prix public + quantité) — une requête par panier, bornée.
    const enriched = await Promise.all(
      carts.map(async (cart: AbandonedCartRow) => {
        const items = await safeAll<{ price: string; quantity: number }>(
          db,
          `SELECT p.price AS price, ci.quantity AS quantity
             FROM cart_items ci JOIN products p ON p.id = ci.product_id
            WHERE ci.cart_id = ?`,
          cart.id
        );
        // Valeur PUBLIQUE : somme des prix publics × quantité. Un prix non
        // numérique (chaîne libre saisie par l'admin) compte 0 — jamais inventé.
        const publicValue = items.reduce((sum, it) => {
          const n = Number(String(it.price).replace(/[^0-9.,-]/g, "").replace(",", "."));
          return sum + (Number.isFinite(n) ? n * (Number(it.quantity) || 0) : 0);
        }, 0);

        let pseudo: string | null = null;
        if (cart.user_id) {
          const u = await safeAll<PseudoRow>(
            db,
            "SELECT id, pseudo FROM users WHERE id = ? LIMIT 1",
            cart.user_id
          );
          pseudo = u[0]?.pseudo ?? null;
        }

        return {
          cartId: cart.id,
          // Porteur : pseudo si compte, sinon « visiteur » (jamais d'id ni de token).
          owner: pseudo ?? "visiteur",
          hasAccount: Boolean(cart.user_id),
          itemCount: Math.trunc(Number(cart.item_count) || 0),
          publicValue,
          updatedAt: Number(cart.updated_at) || 0,
          createdAt: Number(cart.created_at) || 0,
        };
      })
    );

    return c.json({ ok: true, hours, count: enriched.length, carts: enriched });
  })
  /**
   * GET /api/admin/program-settings — réglages du programme d'affiliation
   * (plafonds, récompenses, anti-spam, seuils Super, commission/récompense par défaut).
   */
  .get("/api/admin/program-settings", async (c) => {
    const denied = await requireAdmin(c);
    if (denied) return denied;

    return c.json({
      ok: true,
      settings: await programSettingsJson(c.env.DB),
      keys: PROGRAM_SETTING_KEYS,
    });
  })
  /**
   * POST /api/admin/program-settings {key, value} — écriture d'un réglage.
   *
   * ⚠️ AUCUNE whitelist inventée ici : on réutilise `isAffiliateSettingKey`
   * (reconnaît les clés du programme) et `writeAffiliateSetting` (normalise).
   * Journalisation `admin_settings_update` comme la route admin/settings existante.
   */
  .post("/api/admin/program-settings", async (c) => {
    const denied = await requireAdmin(c);
    if (denied) return denied;

    const body = await readJson(c);
    if (!body) return badRequest("JSON invalide.");
    const key = String(body.key ?? "").trim();
    if (!isAffiliateSettingKey(key)) {
      return badRequest(`Réglage inconnu : ${key || "(vide)"}.`);
    }

    const value = await writeAffiliateSetting(c.env.DB, key, body.value);

    await securityEventStatement(c.env.DB, {
      actor: "admin",
      action: "admin_settings_update",
      ipHash: ipHashOf(c.req.header("cf-connecting-ip")),
      meta: { keys: [key], value },
    }).run();

    return c.json({ ok: true, settings: await programSettingsJson(c.env.DB) });
  })
  /**
   * POST /api/admin/users/:id/credit {amount, reason} — AJUSTEMENT administratif
   * de la monnaie A. TRÈS SENSIBLE.
   *
   * Garde-fous (l'ordre compte) :
   *  - utilisateur EXISTANT et MEMBRE (`isMember` — la monnaie A est réservée aux membres) ;
   *  - `amount` entier NON NUL, borné ±`ADMIN_CREDIT_MAX_A` (positif = crédit, négatif = débit) ;
   *  - `reason` OBLIGATOIRE (motif humain non vide) ;
   *  - montant NÉGATIF : débit conditionné au solde DANS LE SQL
   *    (`guardedDebitStatement` — seule garde correcte sous concurrence) ;
   *  - montant POSITIF : écriture simple idempotente ;
   *  - clé d'idempotence DÉRIVÉE côté serveur (`admin-credit:<uuid>`) ;
   *  - journalisation OBLIGATOIRE dans `security_events` (action `admin_credit`)
   *    avec le motif et le montant.
   * La réponse porte le NOUVEAU solde (recalculé, jamais stocké).
   */
  .post("/api/admin/users/:id/credit", async (c) => {
    const denied = await requireAdmin(c);
    if (denied) return denied;

    const body = await readJson(c);
    if (!body) return badRequest("JSON invalide.");

    const amountRaw = Number(body.amount);
    if (!Number.isInteger(amountRaw) || amountRaw === 0) {
      return badRequest("Montant invalide (entier non nul : positif = crédit, négatif = débit).");
    }
    if (Math.abs(amountRaw) > ADMIN_CREDIT_MAX_A) {
      return badRequest(`Montant hors bornes (maximum ${ADMIN_CREDIT_MAX_A} A en valeur absolue).`);
    }
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!reason) return badRequest("Motif obligatoire.");
    if (reason.length > 300) return badRequest("Motif trop long (300 caractères maximum).");

    const db = c.env.DB;
    const userId = String(c.req.param("id") ?? "");
    const user = await safeAll<{ id: string; pseudo: string; membership: string | null }>(
      db,
      "SELECT id, pseudo, membership FROM users WHERE id = ? LIMIT 1",
      userId
    );
    const target = user[0];
    if (!target) return notFound("Utilisateur introuvable.");
    if (!isMember(target)) {
      return badRequest("La monnaie A est réservée aux membres.");
    }

    const amount = Math.trunc(amountRaw);
    // Anti-double : la clé vient du CLIENT quand il en fournit une (l'interface en
    // génère une par tentative de saisie — un double clic réseau, ou un renvoi
    // du même formulaire, ne crée alors qu'UN ajustement). À défaut, elle est
    // dérivée côté serveur : l'appel reste unique, simplement non rejouable.
    const clientKey =
      typeof body.idempotencyKey === "string" && /^[0-9a-zA-Z-]{8,64}$/.test(body.idempotencyKey.trim())
        ? body.idempotencyKey.trim()
        : crypto.randomUUID();
    const idempotencyKey = `admin-credit:${clientKey}`;
    const label =
      amount > 0 ? `Ajustement admin (+${amount} A) — ${reason}` : `Ajustement admin (${amount} A) — ${reason}`;

    let applied = true;
    if (amount < 0) {
      // DÉBIT gardé par le solde : si le solde est insuffisant, AUCUNE ligne
      // n'est écrite et l'ajustement est refusé (aucun solde négatif possible).
      const debit = guardedDebitStatement(db, {
        userId: target.id,
        amount: Math.abs(amount),
        type: "adjustment",
        label,
        refType: "admin_credit",
        refId: target.id,
        idempotencyKey,
      });
      const results = await db.batch([debit.statement]);
      applied = changesOf(results[0]) === 1;
      if (!applied) {
        return badRequest("Solde A insuffisant pour ce débit.");
      }
    } else {
      await aTransactionStatement(db, {
        userId: target.id,
        delta: amount,
        type: "adjustment",
        label,
        refType: "admin_credit",
        refId: target.id,
        idempotencyKey,
      }).run();
    }

    // Journalisation OBLIGATOIRE de l'ajustement (motif + montant + cible).
    await securityEventStatement(db, {
      actor: "admin",
      action: "admin_credit",
      ipHash: ipHashOf(c.req.header("cf-connecting-ip")),
      meta: { userId: target.id, pseudo: target.pseudo, amount, reason, idempotencyKey },
    }).run();

    const balanceA = await aBalance(db, target.id);
    return c.json({ ok: true, userId: target.id, pseudo: target.pseudo, amount, balanceA });
  });
