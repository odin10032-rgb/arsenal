import { Hono } from "hono";
import type { Context } from "hono";
import { isAdmin, unauthorized } from "../../src/lib/server/auth";
import type { App, Env } from "../env";

/**
 * Onglet admin « Suivi » (vague 6) — lecture seule du PONT DE TRACKING.
 *
 * Trois lectures (X-Admin-Auth) :
 *   GET /api/admin/tracking/sessions?limit=   parcours récents (jeton TRONQUÉ, affilié
 *                                             via jointure affiliates→users, produit, dates,
 *                                             étapes JSON décodées, durée d'activité) ;
 *   GET /api/admin/tracking/conflicts?limit=  conflits multi-liens (plusieurs touchers
 *                                             distincts pour un même jeton, affilié retenu) ;
 *   GET /api/admin/tracking/referrals?limit=  parrainages (filleul, affilié recruteur,
 *                                             récompense versée ou non + achat concerné).
 *
 * MINIMISATION (§37) : le jeton est TOUJOURS TRONQUÉ (jamais renvoyé en entier), l'IP et
 * l'email ne sont JAMAIS exposés, aucun identifiant de compte complet n'est affiché — les
 * jointures exposent uniquement le PSEUDO de l'affilié. `visitor_hash` n'est jamais renvoyé.
 *
 * Style maison : `isAdmin` + `unauthorized`, lectures DÉFENSIVES (table absente ou requête
 * en échec → [] ; la route ne répond JAMAIS 500 pour autant, et n'invente aucune donnée).
 */

type AdminContext = Context<{ Bindings: Env }, any, any>;

/** X-Admin-Auth réutilisé tel quel (isAdmin + unauthorized de auth.ts). */
async function requireAdmin(c: AdminContext): Promise<Response | null> {
  if (await isAdmin(c.req.raw, c.env)) return null;
  return unauthorized();
}

/** Entier borné depuis la query string (repli si absent/illisible) — helper des routes admin. */
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

/** Plafond des trois listes de l'onglet (contrat) : 200 entrées au maximum. */
const TRACKING_LIMIT_MAX = 200;

/* --------------------------------- Helpers --------------------------------- */

/** Nombre entier sûr (jamais NaN) — les colonnes INTEGER peuvent revenir en texte. */
function safeInt(v: unknown): number {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? n : 0;
}

/** Date (ms) ou null si absente/illisible — aucune valeur inventée. */
function safeTs(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Jeton TRONQUÉ pour l'affichage : on ne montre que les 8 premiers caractères
 * (préfixe) et on masque le reste. C'est la règle de minimisation de l'onglet :
 * le jeton complet n'est JAMAIS renvoyé par ces routes.
 */
function truncateToken(raw: unknown): string {
  const token = typeof raw === "string" ? raw : "";
  if (!token) return "";
  const visible = token.slice(0, 8);
  return `${visible}…`;
}

/**
 * Décodage DÉFENSIF de `steps` (JSON agrégé `{"product_view":3,...}`) en objet de
 * compteurs POSITIFS. Une valeur illisible donne un objet vide (jamais d'exception,
 * jamais de compteur inventé).
 */
function parseSteps(raw: unknown): Record<string, number> {
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const n = Math.trunc(Number(value));
      if (Number.isFinite(n) && n > 0) out[key] = n;
    }
    return out;
  } catch {
    return {};
  }
}

/* ----------------------------------- Types ----------------------------------- */

interface SessionRow {
  token: string;
  affiliate_id: string | null;
  product_id: string | null;
  created_at: number;
  last_seen_at: number;
  steps: string | null;
  affiliate_pseudo: string | null;
  product_title: string | null;
}

interface HistoryRow {
  token: string;
  affiliate_id: string | null;
  link_id: string | null;
  product_id: string | null;
  created_at: number | null;
  /** Pseudo de l'affilié (jointure affiliates→users) — null si inconnu. */
  affiliate_pseudo: string | null;
}

interface ReferralRow {
  user_id: string;
  affiliate_id: string;
  created_at: number;
  rewarded_at: number | null;
  rewarded_purchase_id: string | null;
  /** Pseudo du filleul (compte parrainé). */
  referred_pseudo: string | null;
  /** Pseudo de l'affilié recruteur (via affiliates→users). */
  affiliate_pseudo: string | null;
  /** Montant en A de l'achat qui a déclenché la récompense (facultatif). */
  reward_amount_a: number | null;
}

/* ------------------------------------ Routes ------------------------------------ */

export const adminTrackingRoutes: App = new Hono<{ Bindings: Env }>()
  /**
   * GET /api/admin/tracking/sessions?limit= — parcours de suivi récents.
   * Tri : dernière activité la plus récente d'abord. L'affilié est résolu par
   * jointure `affiliates`→`users` (PSEUDO uniquement), le produit par son titre.
   * Le jeton est TRONQUÉ et les `steps` sont décodés en objet de compteurs ; la
   * durée (première → dernière action) est calculée en JS (`last_seen_at - created_at`).
   */
  .get("/api/admin/tracking/sessions", async (c) => {
    const denied = await requireAdmin(c);
    if (denied) return denied;

    const limit = parseClampedInt(c.req.query("limit"), 100, 1, TRACKING_LIMIT_MAX);

    const rows = await safeAll<SessionRow>(
      c.env.DB,
      `SELECT ts.token, ts.affiliate_id, ts.product_id, ts.created_at, ts.last_seen_at, ts.steps,
              u.pseudo AS affiliate_pseudo,
              p.title  AS product_title
         FROM tracking_sessions ts
         LEFT JOIN affiliates af ON af.id = ts.affiliate_id
         LEFT JOIN users u       ON u.id  = af.user_id
         LEFT JOIN products p    ON p.id  = ts.product_id
        ORDER BY ts.last_seen_at DESC, ts.created_at DESC
        LIMIT ?`,
      limit
    );

    return c.json({
      ok: true,
      count: rows.length,
      sessions: rows.map((r) => {
        const createdAt = safeInt(r.created_at);
        const lastSeenAt = safeInt(r.last_seen_at);
        return {
          // Jamais le jeton complet (minimisation).
          token: truncateToken(r.token),
          affiliatePseudo: r.affiliate_pseudo ?? null,
          productTitle: r.product_title ?? null,
          createdAt,
          lastSeenAt,
          // Durée d'activité = dernière action − première action (jamais négative).
          durationMs: Math.max(0, lastSeenAt - createdAt),
          steps: parseSteps(r.steps),
        };
      }),
    });
  })
  /**
   * GET /api/admin/tracking/conflicts?limit= — conflits multi-liens.
   * Un CONFLIT = un jeton dont l'historique d'entrée (`tracking_links_history`)
   * porte PLUSIEURS affiliés distincts (le visiteur est venu par plusieurs liens).
   * On renvoie tous les touchers (affilié + date) et l'affilié RETENU : le DERNIER
   * toucher, matérialisé par la session courante (`tracking_sessions.affiliate_id`).
   * C'est la règle « dernier toucher » choisie par le propriétaire, rendue visible.
   *
   * Les jetons sont listés depuis l'historique (lecture bornée), puis l'historique
   * complet de chacun est relu et filtré en JS pour ne garder que les conflits réels.
   */
  .get("/api/admin/tracking/conflicts", async (c) => {
    const denied = await requireAdmin(c);
    if (denied) return denied;

    const limit = parseClampedInt(c.req.query("limit"), 50, 1, TRACKING_LIMIT_MAX);

    // Jeton candidats : ceux qui ont au moins 2 entrées distinctes d'affilié.
    const candidates = await safeAll<{ token: string }>(
      c.env.DB,
      `SELECT token
         FROM tracking_links_history
        GROUP BY token
       HAVING COUNT(DISTINCT affiliate_id) > 1
        LIMIT ?`,
      limit
    );
    if (!candidates.length) return c.json({ ok: true, count: 0, conflicts: [] });

    // Historique complet des jetons candidats (borné) + session courante (retenu).
    const tokens = candidates.map((row) => row.token);
    const placeholders = tokens.map(() => "?").join(", ");

    const [history, sessions] = await Promise.all([
      safeAll<HistoryRow>(
        c.env.DB,
        `SELECT h.token, h.affiliate_id, h.link_id, h.product_id, h.created_at,
                u.pseudo AS affiliate_pseudo
           FROM tracking_links_history h
           LEFT JOIN affiliates af ON af.id = h.affiliate_id
           LEFT JOIN users u       ON u.id  = af.user_id
          WHERE h.token IN (${placeholders})
          ORDER BY h.created_at ASC`,
        ...tokens
      ),
      safeAll<{ token: string; affiliate_pseudo: string | null; last_seen_at: number | null }>(
        c.env.DB,
        `SELECT ts.token, ts.last_seen_at, u.pseudo AS affiliate_pseudo
           FROM tracking_sessions ts
           LEFT JOIN affiliates af ON af.id = ts.affiliate_id
           LEFT JOIN users u       ON u.id  = af.user_id
          WHERE ts.token IN (${placeholders})`,
        ...tokens
      ),
    ]);

    // Regroupe l'historique par jeton (l'ordre chronologique est déjà posé par le SQL).
    const byToken = new Map<string, HistoryRow[]>();
    for (const row of history) {
      const list = byToken.get(row.token) ?? [];
      list.push(row);
      byToken.set(row.token, list);
    }
    const retainedByToken = new Map(sessions.map((s) => [s.token, s]));

    const conflicts = tokens
      .map((token) => {
        const touches = byToken.get(token) ?? [];
        const distinctAffiliates = new Set(
          touches.map((t) => t.affiliate_id ?? "").filter(Boolean)
        );
        // Sécurité : ne garder que les conflits RÉELS (l'agrégat SQL a pu inclure du bruit).
        if (distinctAffiliates.size < 2) return null;
        const retained = retainedByToken.get(token);
        return {
          token: truncateToken(token),
          touches: touches.map((t) => ({
            affiliatePseudo: t.affiliate_pseudo ?? null,
            productId: t.product_id ?? null,
            at: safeTs(t.created_at),
          })),
          // Affilié RETENU = dernier toucher (celui de la session courante).
          retainedAffiliatePseudo: retained?.affiliate_pseudo ?? null,
          lastSeenAt: safeTs(retained?.last_seen_at ?? null),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    return c.json({ ok: true, count: conflicts.length, conflicts });
  })
  /**
   * GET /api/admin/tracking/referrals?limit= — parrainages (`user_referrals`).
   * Pseudo du filleul, pseudo de l'affilié recruteur, date, et état de la récompense
   * (`rewarded_at` non nul = versée) avec l'achat concerné (titre + montant A, lus
   * sur `purchases` — facultatifs si l'achat n'est plus lisible).
   */
  .get("/api/admin/tracking/referrals", async (c) => {
    const denied = await requireAdmin(c);
    if (denied) return denied;

    const limit = parseClampedInt(c.req.query("limit"), 100, 1, TRACKING_LIMIT_MAX);

    const rows = await safeAll<ReferralRow>(
      c.env.DB,
      `SELECT r.user_id, r.affiliate_id, r.created_at, r.rewarded_at, r.rewarded_purchase_id,
              referred.pseudo  AS referred_pseudo,
              recruiter.pseudo AS affiliate_pseudo,
              pur.amount_a     AS reward_amount_a
         FROM user_referrals r
         LEFT JOIN users referred ON referred.id = r.user_id
         LEFT JOIN affiliates af  ON af.id       = r.affiliate_id
         LEFT JOIN users recruiter ON recruiter.id = af.user_id
         LEFT JOIN purchases pur  ON pur.id      = r.rewarded_purchase_id
        ORDER BY r.created_at DESC
        LIMIT ?`,
      limit
    );

    return c.json({
      ok: true,
      count: rows.length,
      referrals: rows.map((r) => ({
        referredPseudo: r.referred_pseudo ?? null,
        affiliatePseudo: r.affiliate_pseudo ?? null,
        createdAt: safeInt(r.created_at),
        rewardedAt: safeTs(r.rewarded_at),
        rewardAmountA: r.reward_amount_a != null ? safeInt(r.reward_amount_a) : null,
      })),
    });
  });
