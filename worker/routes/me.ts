import { Hono } from "hono";
import type { Context, Next } from "hono";
import { bearerToken, getAuthContext, isMember, toPublicUser } from "../../src/lib/server/user-auth";
import { aBalance, listTransactions } from "../../src/lib/server/ledger";
import {
  markUnlockSeenStatement,
  normalizeUnlockStatus,
  readUnlockPending,
} from "../../src/lib/server/super-affiliate";
import type { AuthedApp, AuthedEnv } from "../env";

const DEFAULT_TX_LIMIT = 20;
const MAX_TX_LIMIT = 100;

/**
 * Middleware d'authentification utilisateur (contrat Phase 1) : parse
 * `Authorization: Bearer`, sha256 du token → lookup sessions (non révoquée,
 * non expirée), chargement du user + renouvellement glissant, puis
 * c.set("authUser", …). 401 sinon.
 */
export async function requireAuth(c: Context<AuthedEnv>, next: Next) {
  const token = bearerToken(c.req.header("authorization"));
  if (!token) {
    return c.json({ ok: false, error: "Authentification requise." }, 401);
  }
  const auth = await getAuthContext(c.env.DB, token);
  if (!auth) {
    return c.json({ ok: false, error: "Session invalide ou expirée." }, 401);
  }
  c.set("authUser", auth);
  await next();
}

/** Valeur numérique bornée depuis la query string (fallback si absente/invalide). */
function parseClampedInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

/**
 * Phase 1 — profil utilisateur (Bearer requis) :
 * - GET /api/me                → {ok, user} (balanceA = SUM(delta) serveur, ENTIER)
 * - GET /api/me/transactions   → {ok, total, transactions} (limit ≤ 100 défaut 20, offset ≥ 0)
 */
export const meRoutes: AuthedApp = new Hono<AuthedEnv>()
  .get("/api/me", requireAuth, async (c) => {
    const { user } = c.get("authUser");
    // Monnaie A réservée aux MEMBRES (décision propriétaire du 03/10/2026) :
    // un simple utilisateur reçoit un solde à 0, sans même lire le ledger —
    // son portefeuille n'existe pas tant qu'il n'a pas rejoint le programme.
    const balanceA = isMember(user) ? await aBalance(c.env.DB, user.id) : 0;
    return c.json({ ok: true, user: toPublicUser(user, balanceA) });
  })
  .get("/api/me/transactions", requireAuth, async (c) => {
    const { user } = c.get("authUser");
    // Non-membre : aucun historique (200 vide, jamais d'erreur côté client).
    if (!isMember(user)) return c.json({ ok: true, total: 0, transactions: [] });
    const limit = parseClampedInt(c.req.query("limit"), DEFAULT_TX_LIMIT, 1, MAX_TX_LIMIT);
    const offset = parseClampedInt(c.req.query("offset"), 0, 0, Number.MAX_SAFE_INTEGER);
    const { total, transactions } = await listTransactions(c.env.DB, user.id, limit, offset);
    return c.json({ ok: true, total, transactions });
  })
  /** Phase 3 — animation de déblocage : état contrôlé serveur (une seule fois). */
  .get("/api/me/unlock", requireAuth, async (c) => {
    const { user } = c.get("authUser");
    const pending = await readUnlockPending(c.env.DB, user.id);
    return c.json({
      ok: true,
      status: pending ? pending.status : null,
      seenAt: pending ? pending.seenAt : null,
    });
  })
  .post("/api/me/unlock/seen", requireAuth, async (c) => {
    const { user } = c.get("authUser");
    let body: { status?: unknown };
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }
    const status = normalizeUnlockStatus(body.status);
    if (!status) return c.json({ ok: false, error: "Statut invalide." }, 400);
    await markUnlockSeenStatement(c.env.DB, user.id, status).run();
    return c.json({ ok: true, seen: status });
  });
