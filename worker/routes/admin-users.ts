import { Hono } from "hono";
import type { Context } from "hono";
import { isAdmin, unauthorized } from "../../src/lib/server/auth";
import { securityEventStatement } from "../../src/lib/server/user-auth";
import { sha256hex } from "../../src/lib/server/auth";
import { normalizeMembership } from "../../src/lib/server/user-auth";
import { ACTIVE_PURCHASE_STATUSES } from "../../src/lib/server/purchases";
import type { App, Env } from "../env";

/**
 * Onglet admin « Utilisateurs » (X-Admin-Auth) — profil, solde A et historique
 * d'activité complet d'un compte. 100 % LECTURE SEULE (aucune mutation, aucun
 * réglage, aucun téléchargement de fichier).
 *
 * - `GET /api/admin/users?q=&limit=`            liste (pseudo/email, rôle, solde A, achats, affiliation) ;
 * - `GET /api/admin/users/:id`                  fiche détaillée + compteurs + affilié éventuel ;
 * - `GET /api/admin/users/:id/activity?limit=`  timeline fusionnée (sécurité, monnaie A, achats, rôles).
 *
 * Le solde A n'est JAMAIS stocké (contrat Phase 1) : il est toujours recalculé
 * ici par `SUM(delta)` sur `a_transactions`. `ip_hash` des `security_events`
 * n'est jamais exposé (minimisation — comme partout ailleurs : jamais d'IP).
 *
 * Toutes les lectures de tables OPTIONNELLES (affiliation, licences, achats…)
 * sont défensives : une table absente (base plus ancienne) ou une requête en
 * échec renvoie `[]` / `null` — la route ne répond JAMAIS 500 pour autant et
 * n'invente aucune donnée (même style que les agrégats du module affiliation).
 */

/* --------------------------------- Utilitaires --------------------------------- */

type AdminContext = Context<{ Bindings: Env }, any, any>;

/** X-Admin-Auth réutilisé tel quel (isAdmin + unauthorized de auth.ts). */
async function requireAdmin(c: AdminContext): Promise<Response | null> {
  if (await isAdmin(c.req.raw, c.env)) return null;
  return unauthorized();
}

function notFound(error: string): Response {
  return Response.json({ ok: false, error }, { status: 404 });
}

/** Entier borné depuis la query string (repli si absent/illisible) — helper des routes admin. */
function parseClampedInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value), min), max);
}

/** Échappe `\`, `%` et `_` pour un `LIKE … ESCAPE '\'` : aucun joker injectable par l'utilisateur. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
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

/** Même contrat que `safeAll` pour une ligne unique : null en cas d'absence ou d'échec. */
async function safeFirst<T>(db: D1Database, sql: string, ...binds: unknown[]): Promise<T | null> {
  try {
    const statement = binds.length ? db.prepare(sql).bind(...binds) : db.prepare(sql);
    return (await statement.first<T>()) ?? null;
  } catch {
    return null;
  }
}

/** Bornes de l'onglet : liste et timeline plafonnées à 200 entrées (contrat). */
const USERS_LIMIT_MAX = 200;
const ACTIVITY_SOURCE_LIMIT = 200;

/**
 * Placeholders de la liste des statuts d'achat « non annulés ». Source unique :
 * `ACTIVE_PURCHASE_STATUSES` de purchases.ts (miroir exact de l'index partiel
 * `idx_purchases_owner` de la migration 0004) — jamais de statut recopié à la main.
 */
const ACTIVE_STATUS_PLACEHOLDERS = ACTIVE_PURCHASE_STATUSES.map(() => "?").join(", ");

/* ------------------------------ Libellés lisibles ------------------------------ */

/**
 * Libellés français des actions journalisées dans `security_events`.
 * Repli : l'action brute avec ses underscores remplacés par des espaces
 * (jamais un libellé inventé pour une action inconnue).
 */
const SECURITY_ACTION_LABELS: Record<string, string> = {
  register: "Inscription",
  user_login_ok: "Connexion réussie",
  user_login_fail: "Échec de connexion",
  logout: "Déconnexion",
  purchase_download: "Téléchargement d'un produit",
  self_affiliation_blocked: "Achat avec son propre code (bloqué)",
  super_upgrade_request: "Demande de promotion Super Affiliate",
  admin_affiliate_status: "Statut d'affilié modifié (admin)",
  admin_campaign_create: "Campagne créée (admin)",
  admin_campaign_state: "Statut de campagne modifié (admin)",
  admin_campaign_delete: "Campagne supprimée (admin)",
  admin_chariow_link: "Produit Chariow lié (admin)",
  admin_commission_state: "Statut de commission modifié (admin)",
  admin_license_revoke: "Licence révoquée (admin)",
  admin_media_delete: "Média supprimé (admin)",
  admin_payment_create: "Paiement affilié enregistré (admin)",
  admin_product_file_upload: "Fichier produit téléversé (admin)",
  admin_product_file_delete: "Fichier produit supprimé (admin)",
  admin_purchase_fulfill: "Commande marquée livrée (admin)",
  admin_purchase_refund: "Commande remboursée (admin)",
  admin_purchase_retry: "Livraison relancée (admin)",
  admin_sale_create: "Vente manuelle enregistrée (admin)",
  admin_sale_state: "Statut de vente modifié (admin)",
  admin_settings_update: "Réglages mis à jour (admin)",
  admin_super_promote: "Promotion Super Affiliate (admin)",
};

function actionLabel(action: string): string {
  return SECURITY_ACTION_LABELS[action] ?? action.replace(/_+/g, " ");
}

/** Libellés français des statuts d'achat (détail de la timeline). Repli : statut brut. */
const PURCHASE_STATUS_LABELS: Record<string, string> = {
  pending: "en attente",
  paid: "payée",
  fulfillment_pending: "livraison en cours",
  fulfilled: "livrée",
  failed: "échec de livraison",
  cancelled: "annulée",
  refunded: "remboursée",
};

function purchaseStatusLabel(status: string): string {
  return PURCHASE_STATUS_LABELS[status] ?? status;
}

/**
 * `meta` des security_events = JSON libre (texte en base). Jamais d'exception :
 * un meta illisible est renvoyé tel quel (objet parsé, texte brut ou null).
 */
function parseMeta(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

/* ----------------------------------- Types ----------------------------------- */

interface UserListRow {
  id: string;
  pseudo: string;
  email: string;
  role: string;
  created_at: number;
  balance_a: number;
  purchases_count: number;
  affiliate_code: string | null;
  affiliate_status: string | null;
}

interface UserRow {
  id: string;
  pseudo: string;
  email: string;
  role: string;
  created_at: number;
  updated_at: number;
}

interface AffiliateRow {
  id: string;
  code: string;
  status: string;
  applied_at: number;
  activated_at: number | null;
}

interface SecurityEventRow {
  at: number;
  action: string;
  meta: string | null;
}

interface ATransactionRow {
  created_at: number;
  delta: number;
  label: string;
}

interface PurchaseActivityRow {
  at: number;
  status: string;
  amount_a: number;
  product_title: string | null;
}

interface StatusHistoryRow {
  at: number;
  from_role: string | null;
  to_role: string;
}

/** Entrée de la timeline fusionnée (forme du contrat de l'onglet). */
interface ActivityEntry {
  at: number;
  kind: "securite" | "a" | "achat" | "role";
  label: string;
  /** delta A (nombre) · meta JSON (objet) · texte composé (chaîne) · null. */
  detail: unknown;
}

/* ------------------------------------ Routes ------------------------------------ */

export const adminUserRoutes: App = new Hono<{ Bindings: Env }>()

  /**
   * POST /api/admin/users/:id/membership {membership: "member"|"none"} —
   * accorde ou retire l'ADHESION au programme (migration 0008). C'est le
   * bouton qui MANQUAIT : sans lui, la monnaie A etait inattribuable
   * (aucune route, aucun UI, migration 0008b jamais ecrite).
   * Journalise (action `admin_${string}`) dans le meme batch.
   */
  .post("/api/admin/users/:id/membership", async (c) => {
    const denied = await requireAdmin(c);
    if (denied) return denied;
    const targetId = String(c.req.param("id") ?? "").trim();
    if (!targetId) return notFound("Utilisateur introuvable.");
    const db = c.env.DB;

    let body: { membership?: unknown };
    try {
      body = (await c.req.json()) as typeof body;
    } catch {
      return Response.json({ ok: false, error: "JSON invalide." }, { status: 400 });
    }
    const value = body.membership === "member" ? "member" : body.membership === "none" ? "none" : null;
    if (!value) {
      return Response.json({ ok: false, error: 'Valeur invalide (attendu : "member" ou "none").' }, { status: 400 });
    }

    const target = await safeFirst<{ id: string; pseudo: string; membership: string | null }>(
      db,
      "SELECT id, pseudo, membership FROM users WHERE id = ?",
      targetId
    );
    if (!target) return notFound("Utilisateur introuvable.");

    const previous = normalizeMembership(target.membership);
    if (previous === value) {
      return c.json({ ok: true, membership: value, unchanged: true });
    }

    await db.batch([
      db
        .prepare("UPDATE users SET membership = ?, updated_at = ? WHERE id = ?")
        .bind(value, Date.now(), targetId),
      securityEventStatement(db, {
        actor: "admin",
        action: "admin_membership_set",
        ipHash: sha256hex(c.req.header("cf-connecting-ip") || "unknown"),
        meta: { userId: targetId, pseudo: target.pseudo, from: previous, to: value },
      }),
    ]);
    return c.json({ ok: true, membership: value });
  })
  /**
   * GET /api/admin/users?q=&limit= — liste des comptes.
   * `q` filtre pseudo OU email (LIKE échappé, insensible à la casse) ;
   * le solde A et le nombre d'achats « non annulés » sont recalculés en SQL.
   */
  .get("/api/admin/users", async (c) => {
    const denied = await requireAdmin(c);
    if (denied) return denied;

    const q = (c.req.query("q") ?? "").trim().slice(0, 60);
    const limit = parseClampedInt(c.req.query("limit"), 100, 1, USERS_LIMIT_MAX);
    const like = `%${escapeLike(q)}%`;

    const rows = await safeAll<UserListRow>(
      c.env.DB,
      `SELECT u.id, u.pseudo, u.email, u.role, u.created_at,
              COALESCE((SELECT SUM(t.delta) FROM a_transactions t WHERE t.user_id = u.id), 0) AS balance_a,
              (SELECT COUNT(*) FROM purchases p
                WHERE p.user_id = u.id AND p.status IN (${ACTIVE_STATUS_PLACEHOLDERS})) AS purchases_count,
              af.code AS affiliate_code, af.status AS affiliate_status
         FROM users u
         LEFT JOIN affiliates af ON af.user_id = u.id
         ${q ? "WHERE (u.pseudo LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')" : ""}
        ORDER BY u.created_at DESC, u.id DESC
        LIMIT ?`,
      // Ordre des `?` dans le SQL : statuts actifs (sous-requête) → recherche → LIMIT.
      ...ACTIVE_PURCHASE_STATUSES,
      ...(q ? [like, like] : []),
      limit
    );

    return c.json({
      ok: true,
      count: rows.length,
      users: rows.map((r) => ({
        id: r.id,
        pseudo: r.pseudo,
        email: r.email,
        role: r.role,
        balanceA: Math.trunc(Number(r.balance_a) || 0),
        createdAt: Number(r.created_at) || 0,
        purchasesCount: Math.trunc(Number(r.purchases_count) || 0),
        // Code présent ⇔ ligne `affiliates` présente (code NOT NULL) ; sinon null.
        affiliate:
          r.affiliate_code != null
            ? { code: r.affiliate_code, status: r.affiliate_status ?? null }
            : null,
      })),
    });
  })
  /**
   * GET /api/admin/users/:id — fiche détaillée d'un compte.
   * Compteurs : transactions A, achats non annulés, licences (table `licenses`,
   * migration 0006) et téléchargements servis (`security_events` action
   * `purchase_download`, actor = user_id). Affilié éventuel : code, statut,
   * clics (click_events) et ventes CONFIRMÉES (sales.state = 'confirmed' —
   * même définition que la liste des affiliés).
   */
  .get("/api/admin/users/:id", async (c) => {
    const denied = await requireAdmin(c);
    if (denied) return denied;

    const db = c.env.DB;
    const id = c.req.param("id");

    const user = await safeFirst<UserRow>(
      db,
      "SELECT id, pseudo, email, role, created_at, updated_at FROM users WHERE id = ?",
      id
    );
    if (!user) return notFound("Utilisateur introuvable.");

    const [balanceRow, txRow, purchaseRow, licenseRow, downloadRow, affiliateRow] = await Promise.all([
      // Solde A = SUM(delta) — jamais stocké (contrat Phase 1).
      safeFirst<{ total: number }>(
        db,
        "SELECT COALESCE(SUM(delta), 0) AS total FROM a_transactions WHERE user_id = ?",
        id
      ),
      safeFirst<{ n: number }>(db, "SELECT COUNT(*) AS n FROM a_transactions WHERE user_id = ?", id),
      safeFirst<{ n: number }>(
        db,
        `SELECT COUNT(*) AS n FROM purchases WHERE user_id = ? AND status IN (${ACTIVE_STATUS_PLACEHOLDERS})`,
        // Ordre des `?` dans le SQL : user_id (WHERE) → statuts actifs (IN).
        id,
        ...ACTIVE_PURCHASE_STATUSES
      ),
      safeFirst<{ n: number }>(db, "SELECT COUNT(*) AS n FROM licenses WHERE user_id = ?", id),
      safeFirst<{ n: number }>(
        db,
        "SELECT COUNT(*) AS n FROM security_events WHERE action = 'purchase_download' AND actor = ?",
        id
      ),
      safeFirst<AffiliateRow>(
        db,
        "SELECT id, code, status, applied_at, activated_at FROM affiliates WHERE user_id = ?",
        id
      ),
    ]);

    let affiliate: {
      id: string;
      code: string;
      status: string;
      clicks: number;
      sales: number;
      appliedAt: number;
      activatedAt: number | null;
    } | null = null;
    if (affiliateRow) {
      const [clicksRow, salesRow] = await Promise.all([
        safeFirst<{ n: number }>(
          db,
          "SELECT COUNT(*) AS n FROM click_events WHERE affiliate_id = ?",
          affiliateRow.id
        ),
        safeFirst<{ n: number }>(
          db,
          "SELECT COUNT(*) AS n FROM sales WHERE affiliate_id = ? AND state = 'confirmed'",
          affiliateRow.id
        ),
      ]);
      affiliate = {
        id: affiliateRow.id,
        code: affiliateRow.code,
        status: affiliateRow.status,
        clicks: Math.trunc(Number(clicksRow?.n) || 0),
        sales: Math.trunc(Number(salesRow?.n) || 0),
        appliedAt: Number(affiliateRow.applied_at) || 0,
        activatedAt: affiliateRow.activated_at != null ? Number(affiliateRow.activated_at) : null,
      };
    }

    return c.json({
      ok: true,
      user: {
        id: user.id,
        pseudo: user.pseudo,
        email: user.email,
        role: user.role,
        balanceA: Math.trunc(Number(balanceRow?.total) || 0),
        createdAt: Number(user.created_at) || 0,
        updatedAt: Number(user.updated_at) || 0,
      },
      counts: {
        transactions: Math.trunc(Number(txRow?.n) || 0),
        purchases: Math.trunc(Number(purchaseRow?.n) || 0),
        licenses: Math.trunc(Number(licenseRow?.n) || 0),
        downloads: Math.trunc(Number(downloadRow?.n) || 0),
      },
      affiliate,
    });
  })
  /**
   * GET /api/admin/users/:id/activity?limit= — timeline fusionnée, triée DESC
   * par date. Quatre lectures bornées (chacune ORDER BY … DESC LIMIT 200),
   * fusion en JS puis plafond `limit` (≤ 200) :
   * - `security_events` (actor = :id)  → kind « securite », meta en détail ;
   * - `a_transactions`                 → kind « a », delta signé en détail ;
   * - `purchases` (+ titre produit)    → kind « achat », « statut · montant A · titre » ;
   * - `status_history`                 → kind « role », « from_role → to_role ».
   * Une source absente (table manquante) ne fait jamais échouer la route.
   */
  .get("/api/admin/users/:id/activity", async (c) => {
    const denied = await requireAdmin(c);
    if (denied) return denied;

    const db = c.env.DB;
    const id = c.req.param("id");
    const limit = parseClampedInt(c.req.query("limit"), 100, 1, USERS_LIMIT_MAX);

    // L'existence du compte est vérifiée AVANT la fusion : 404 franc plutôt
    // qu'une timeline vide ambiguë (id inconnu ≠ compte sans activité).
    const exists = await safeFirst<{ id: string }>(db, "SELECT id FROM users WHERE id = ?", id);
    if (!exists) return notFound("Utilisateur introuvable.");

    const [events, transactions, purchases, roles] = await Promise.all([
      safeAll<SecurityEventRow>(
        db,
        "SELECT at, action, meta FROM security_events WHERE actor = ? ORDER BY at DESC LIMIT ?",
        id,
        ACTIVITY_SOURCE_LIMIT
      ),
      safeAll<ATransactionRow>(
        db,
        "SELECT created_at, delta, label FROM a_transactions WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?",
        id,
        ACTIVITY_SOURCE_LIMIT
      ),
      safeAll<PurchaseActivityRow>(
        db,
        `SELECT p.created_at AS at, p.status, p.amount_a, pr.title AS product_title
           FROM purchases p
           LEFT JOIN products pr ON pr.id = p.product_id
          WHERE p.user_id = ?
          ORDER BY p.created_at DESC, p.id DESC
          LIMIT ?`,
        id,
        ACTIVITY_SOURCE_LIMIT
      ),
      safeAll<StatusHistoryRow>(
        db,
        "SELECT created_at AS at, from_role, to_role FROM status_history WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?",
        id,
        ACTIVITY_SOURCE_LIMIT
      ),
    ]);

    const entries: ActivityEntry[] = [
      ...events.map(
        (e): ActivityEntry => ({
          at: Number(e.at) || 0,
          kind: "securite",
          label: actionLabel(e.action),
          detail: parseMeta(e.meta),
        })
      ),
      ...transactions.map(
        (t): ActivityEntry => ({
          at: Number(t.created_at) || 0,
          kind: "a",
          label: t.label,
          detail: Math.trunc(Number(t.delta) || 0),
        })
      ),
      ...purchases.map(
        (p): ActivityEntry => ({
          at: Number(p.at) || 0,
          kind: "achat",
          label: "Achat",
          detail: `${purchaseStatusLabel(p.status)} · ${Math.trunc(Number(p.amount_a) || 0)} A · ${
            p.product_title ?? "produit supprimé"
          }`,
        })
      ),
      ...roles.map(
        (r): ActivityEntry => ({
          at: Number(r.at) || 0,
          kind: "role",
          label: "Changement de rôle",
          detail: `${r.from_role ?? "—"} → ${r.to_role}`,
        })
      ),
    ];

    // Tri DESC par date ; à date égale l'ordre des sources est conservé (tri stable).
    entries.sort((a, b) => b.at - a.at);

    return c.json({ ok: true, activity: entries.slice(0, limit) });
  });
