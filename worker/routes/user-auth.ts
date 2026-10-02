import { Hono } from "hono";
import {
  bearerToken,
  createSession,
  generateSessionToken,
  getUserByLogin,
  hashPassword,
  insertUserStatement,
  recordSecurityEvent,
  revokeSession,
  securityEventStatement,
  sessionStatement,
  toPublicUser,
  uniqueViolationColumn,
  verifyPassword,
} from "../../src/lib/server/user-auth";
// Note : la récompense de bienvenue (`welcomeRewardStatement`) n'est PLUS versée
// à l'inscription — la monnaie A est réservée aux membres du programme
// (décision propriétaire du 03/10/2026). L'helper reste dans le ledger pour
// d'éventuels usages ciblés (migration/octroi manuel).
import { aBalance } from "../../src/lib/server/ledger";
import { sha256hex } from "../../src/lib/server/auth";
import type { App, Env } from "../env";

/* Validation du contrat (POST /api/auth/register). */
const PSEUDO_RE = /^[a-zA-Z0-9_-]{3,24}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX_LENGTH = 254;

/** Minimisation : seule l'empreinte sha256 de l'IP est journalisée. */
function ipHashOf(header: string | undefined): string {
  return sha256hex(header || "unknown");
}

/**
 * Phase 1 — comptes utilisateurs :
 * - POST   /api/auth/register  {pseudo, email, password} → 201 {ok, token, user}
 * - POST   /api/auth/session   {identifiant, password}   → 200 {ok, token, user}
 *   (identifiant = email OU pseudo ; ⚠️ POST /api/auth/login reste le login ADMIN)
 * - DELETE /api/auth/session   (Bearer)                  → 200 {ok} (idempotent)
 */
export const userAuthRoutes: App = new Hono<{ Bindings: Env }>()
  .post("/api/auth/register", async (c) => {
    let body: { pseudo?: unknown; email?: unknown; password?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ ok: false, error: "JSON invalide." }, 400);
    }
    const pseudo = typeof body.pseudo === "string" ? body.pseudo.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!PSEUDO_RE.test(pseudo)) {
      return c.json(
        {
          ok: false,
          error:
            "Le pseudo doit contenir entre 3 et 24 caractères (lettres, chiffres, tirets ou underscores).",
        },
        400
      );
    }
    if (!email || email.length > EMAIL_MAX_LENGTH || !EMAIL_RE.test(email)) {
      return c.json({ ok: false, error: "Email invalide." }, 400);
    }
    if (password.length < 8) {
      return c.json({ ok: false, error: "Le mot de passe doit contenir au moins 8 caractères." }, 400);
    }

    const userId = crypto.randomUUID();
    const now = Date.now();
    const passwordHash = await hashPassword(password);
    const token = generateSessionToken();

    try {
      // Inscription ATOMIQUE : user + session + security_event en un seul batch D1.
      // ⚠️ AUCUNE récompense de bienvenue : un nouvel inscrit est un simple
      // UTILISATEUR (membership « none »), sans accès à la monnaie A. La monnaie
      // A, le portefeuille et les récompenses sont réservés aux MEMBRES du
      // programme (décision propriétaire du 03/10/2026, option A) — rejoindre le
      // programme est un acte volontaire, distinct de la création de compte.
      await c.env.DB.batch([
        insertUserStatement(c.env.DB, { id: userId, pseudo, email, passwordHash, now }),
        sessionStatement(c.env.DB, userId, token),
        securityEventStatement(c.env.DB, {
          actor: userId,
          action: "register",
          ipHash: ipHashOf(c.req.header("cf-connecting-ip")),
          meta: { pseudo },
        }),
      ]);
    } catch (err) {
      // Unicité insensible à la casse (UNIQUE COLLATE NOCASE) → 409 avec le bon message.
      const column = uniqueViolationColumn(err);
      if (column === "pseudo") return c.json({ ok: false, error: "Pseudo déjà utilisé." }, 409);
      if (column === "email") return c.json({ ok: false, error: "Email déjà utilisé." }, 409);
      throw err;
    }

    return c.json(
      {
        ok: true,
        token,
        user: toPublicUser(
          {
            id: userId,
            pseudo,
            email,
            password_hash: passwordHash,
            role: "user",
            membership: "none",
            created_at: now,
            updated_at: now,
          },
          0
        ),
      },
      201
    );
  })
  .post("/api/auth/session", async (c) => {
    let body: { identifiant?: unknown; password?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ ok: false, error: "JSON invalide." }, 400);
    }
    const identifiant = typeof body.identifiant === "string" ? body.identifiant.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!identifiant || !password) {
      return c.json({ ok: false, error: "Identifiant et mot de passe requis." }, 400);
    }

    const ipHash = ipHashOf(c.req.header("cf-connecting-ip"));
    const user = await getUserByLogin(c.env.DB, identifiant);

    let valid = false;
    if (user) {
      valid = await verifyPassword(password, user.password_hash);
    } else {
      // Identifiant inconnu : dérivation jetable pour égaliser le coût CPU
      // (l'existence d'un compte ne doit pas se deviner au timing).
      await hashPassword("arsenal-timing-equalizer");
    }
    if (!valid || !user) {
      await recordSecurityEvent(c.env.DB, {
        actor: user?.id ?? null,
        action: "user_login_fail",
        ipHash,
        meta: { identifiant },
      });
      return c.json({ ok: false, error: "Identifiants incorrects." }, 401);
    }

    const { token } = await createSession(c.env.DB, user.id);
    await recordSecurityEvent(c.env.DB, { actor: user.id, action: "user_login_ok", ipHash });
    const balanceA = await aBalance(c.env.DB, user.id);
    return c.json({ ok: true, token, user: toPublicUser(user, balanceA) });
  })
  .delete("/api/auth/session", async (c) => {
    const token = bearerToken(c.req.header("authorization"));
    if (token) {
      const userId = await revokeSession(c.env.DB, token);
      if (userId) {
        await recordSecurityEvent(c.env.DB, {
          actor: userId,
          action: "logout",
          ipHash: ipHashOf(c.req.header("cf-connecting-ip")),
        });
      }
    }
    // Idempotent : session absente, expirée ou déjà révoquée → 200 quand même.
    return c.json({ ok: true });
  });
