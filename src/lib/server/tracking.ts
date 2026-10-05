/**
 * Arsenal — PONT DE TRACKING (vague 1 : socle + redirection).
 *
 * Un jeton de tracking SERVEUR, OPAQUE et ANONYME, délivré au passage par les
 * liens `/r/<code>` (voir `worker/routes/affiliate-track.ts`), identifie tout le
 * parcours du visiteur. Il remplace — sans le casser — le code mémorisé 30 j en
 * `localStorage` (`src/lib/purchases.ts`), qui reste le REPLI.
 *
 * Décisions propriétaire respectées à la lettre :
 *   • RÈGLE D'ATTRIBUTION = DERNIER TOUCHER : c'est le dernier jeton/lien en date
 *     qui prime. La session porte le DERNIER toucher connu et `latestTrackingTouch`
 *     le matérialise — la règle est EXPLICITE et TRACÉE (avant : vraie par accident).
 *   • ANONYMAT (§37) : le jeton est OPAQUE (UUID aléatoire côté serveur, aucune
 *     donnée personnelle, aucune IP, jamais dérivé de l'IP). `visitor_hash`
 *     (`sha256(ip+ua+jour)`, calculé ailleurs via `visitorHashOf`) reste la SEULE
 *     empreinte, comme partout ailleurs (click_events).
 *
 * Style maison (comme `affiliation.ts` / `store.ts`) : fonctions pures recevant
 * `D1Database` en paramètre, testables et réutilisables par les routes du Worker.
 * TOUTES les lectures sont défensives (try/catch → null / 0) : jamais d'exception
 * ne doit remonter — le tracking ne bloque JAMAIS une redirection publique.
 */

/* ---------------------------------- Types ---------------------------------- */

/** Session de tracking telle que stockée (migration 0012). */
export interface TrackingSessionRow {
  token: string;
  visitor_hash: string | null;
  affiliate_id: string | null;
  link_id: string | null;
  product_id: string | null;
  campaign_id: string | null;
  created_at: number;
  last_seen_at: number;
  expires_at: number;
  user_id: string | null;
  /** JSON agrégé des étapes (`{"product_view":3,...}`) — compteurs, pas un log. */
  steps: string | null;
}

/** Champs d'entrée d'une session (le jeton est généré ici, jamais fourni par le client). */
export interface TrackingSessionInput {
  visitorHash?: string | null;
  affiliateId?: string | null;
  linkId?: string | null;
  productId?: string | null;
  campaignId?: string | null;
  now?: number;
}

/* -------------------------------- Constantes -------------------------------- */

/** Durée de vie d'un jeton de tracking : 30 jours (même fenêtre que le repli localStorage). */
export const TRACKING_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * LISTE FERMÉE des étapes suivies (vague 1 : seules les clés connues sont
 * incrémentées — toute autre étape est ignorée silencieusement). Les vagues
 * suivantes brancheront la collecte sur ces points du parcours.
 */
export const TRACKING_STEPS = ["product_view", "add_to_cart", "feed_view", "checkout_start", "purchase"] as const;
export type TrackingStep = (typeof TRACKING_STEPS)[number];

/** true si `step` appartient à la liste FERMÉE des étapes connues. */
export function isTrackingStep(step: unknown): step is TrackingStep {
  return typeof step === "string" && (TRACKING_STEPS as readonly string[]).includes(step);
}

/* --------------------------------- Helpers --------------------------------- */

/**
 * Jeton OPAQUE : deux UUID concaténés (~256 bits, aucun tiret supplémentaire
 * nécessaire). Aléatoire, sans donnée personnelle, JAMAIS dérivé de l'IP.
 */
export function newTrackingToken(): string {
  return `${crypto.randomUUID()}-${crypto.randomUUID()}`;
}

/** Arrondit un instant en entier sûr (jamais NaN) — les colonnes sont INTEGER. */
function safeNow(now?: number): number {
  const value = Math.trunc(Number(now));
  return Number.isFinite(value) ? value : Date.now();
}

/** `steps` lisibles : objet JSON agrégé, jamais une exception (défensif). */
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

/* -------------------------- Écriture / lecture session -------------------------- */

/**
 * Crée une session de tracking et renvoie son jeton opaque.
 * `visitorHash` : empreinte existante (`visitorHashOf`) — la SEULE empreinte,
 * jamais l'IP brute. Aucune exception ne doit remonter : en cas d'échec, on
 * renvoie `null` (la redirection publique suit son cours sans jeton).
 */
export async function createTrackingSession(
  db: D1Database,
  input: TrackingSessionInput
): Promise<string | null> {
  const token = newTrackingToken();
  const now = safeNow(input.now);
  try {
    await db
      .prepare(
        `INSERT INTO tracking_sessions
           (token, visitor_hash, affiliate_id, link_id, product_id, campaign_id,
            created_at, last_seen_at, expires_at, user_id, steps)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`
      )
      .bind(
        token,
        input.visitorHash ?? null,
        input.affiliateId ?? null,
        input.linkId ?? null,
        input.productId ?? null,
        input.campaignId ?? null,
        now,
        now,
        now + TRACKING_TTL_MS
      )
      .run();
    return token;
  } catch (err) {
    console.error("createTrackingSession:", err);
    return null;
  }
}

/**
 * Session valide (non expirée) pour un jeton, ou null si le jeton est
 * inconnu / expiré / illisible (lecture TOUJOURS défensive).
 */
export async function readTrackingSession(
  db: D1Database,
  token: string,
  now: number = Date.now()
): Promise<TrackingSessionRow | null> {
  const clean = (token ?? "").trim();
  if (!clean) return null;
  try {
    const row = await db
      .prepare("SELECT * FROM tracking_sessions WHERE token = ?")
      .bind(clean)
      .first<TrackingSessionRow>();
    if (!row) return null;
    if (Math.trunc(Number(row.expires_at)) <= safeNow(now)) return null; // expiré
    return row;
  } catch {
    return null;
  }
}

/** Met à jour `last_seen_at` d'une session (jamais bloquant, silencieux si absente). */
export async function touchTrackingSession(
  db: D1Database,
  token: string,
  input: { lastSeenAt?: number } = {}
): Promise<void> {
  const clean = (token ?? "").trim();
  if (!clean) return;
  try {
    await db
      .prepare("UPDATE tracking_sessions SET last_seen_at = ? WHERE token = ?")
      .bind(safeNow(input.lastSeenAt), clean)
      .run();
  } catch (err) {
    console.error("touchTrackingSession:", err);
  }
}

/* ----------------------------- Étapes du parcours ----------------------------- */

/**
 * Incrémente le compteur d'une étape dans `steps` (JSON AGRÉGÉ, pas un log ligne
 * par ligne). Une étape INCONNUE est ignorée SILENCIEUSEMENT. Ne remonte jamais
 * d'exception : un compteur d'étapes ne doit jamais casser le parcours.
 *
 * `purchase` est terminal dans le parcours : on ne relit ni ne réécrit `steps`
 * (l'agrégat reste léger, une seule écriture).
 */
export async function recordTrackingStep(
  db: D1Database,
  token: string,
  step: TrackingStep | string
): Promise<void> {
  const clean = (token ?? "").trim();
  if (!clean || !isTrackingStep(step)) return; // étape inconnue → ignorée (silencieux)
  try {
    if (step === "purchase") return; // terminal : rien à incrémenter davantage
    const session = await db
      .prepare("SELECT steps FROM tracking_sessions WHERE token = ?")
      .bind(clean)
      .first<{ steps: string | null }>();
    if (!session) return;
    const steps = parseSteps(session.steps);
    steps[step] = Math.trunc(Number(steps[step]) || 0) + 1;
    await db
      .prepare("UPDATE tracking_sessions SET steps = ? WHERE token = ?")
      .bind(JSON.stringify(steps), clean)
      .run();
  } catch (err) {
    console.error("recordTrackingStep:", err);
  }
}

/* ------------------------------ Liaison au compte ------------------------------ */

/**
 * Renseigne `user_id` d'une session : liaison MULTI-APPAREILS (le visiteur crée
 * un compte ou se connecte → ses parcours convergent vers le même utilisateur).
 * Un `userId` vide est ignoré ; une session absente ne fait rien.
 */
export async function linkTrackingToUser(
  db: D1Database,
  token: string,
  userId: string
): Promise<void> {
  const clean = (token ?? "").trim();
  const user = (userId ?? "").trim();
  if (!clean || !user) return;
  try {
    await db
      .prepare("UPDATE tracking_sessions SET user_id = ? WHERE token = ?")
      .bind(user, clean)
      .run();
  } catch (err) {
    console.error("linkTrackingToUser:", err);
  }
}

/* ---------------------------- Règle « dernier toucher » ---------------------------- */

/**
 * Session la PLUS RÉCENTE d'un visiteur identifié par son empreinte (`visitor_hash`).
 * C'EST ELLE QUI GAGNE : matérialisation EXPLICITE et TRACÉE de la règle
 * « dernier toucher » (le dernier lien/jeton en date prime). La session la plus
 * récente est déterminée par `last_seen_at` (puis `created_at`, puis `rowid` en
 * départage stable). null si l'empreinte est vide / inconnue / illisible.
 *
 * Note : la session la plus récente peut être EXPIRÉE (dernier toucher trop
 * ancien) — l'appelant en tient compte via `expires_at` ; on ne filtre pas ici
 * pour rester une lecture pure de la donnée.
 */
export async function latestTrackingTouch(
  db: D1Database,
  visitorHash: string
): Promise<TrackingSessionRow | null> {
  const clean = (visitorHash ?? "").trim();
  if (!clean) return null;
  try {
    const row = await db
      .prepare(
        `SELECT * FROM tracking_sessions
          WHERE visitor_hash = ?
          ORDER BY last_seen_at DESC, created_at DESC, rowid DESC
          LIMIT 1`
      )
      .bind(clean)
      .first<TrackingSessionRow>();
    return row ?? null;
  } catch {
    return null;
  }
}

/* ---------------------- Historique des liens d'entrée ---------------------- */

/**
 * Ajoute une ligne à l'HISTORIQUE des liens d'entrée (migration 0012) : permet de
 * détecter les conflits multi-liens (même visiteur, plusieurs affiliés/produits)
 * et d'appliquer « dernier toucher » en connaissance de cause. Bruit silencieux
 * en cas d'échec (jamais bloquant).
 */
export async function recordTrackingLinkHistory(
  db: D1Database,
  input: {
    token: string;
    affiliateId?: string | null;
    linkId?: string | null;
    productId?: string | null;
    createdAt?: number;
  }
): Promise<void> {
  const token = (input.token ?? "").trim();
  if (!token) return;
  try {
    await db
      .prepare(
        `INSERT INTO tracking_links_history (id, token, affiliate_id, link_id, product_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(
        crypto.randomUUID(),
        token,
        input.affiliateId ?? null,
        input.linkId ?? null,
        input.productId ?? null,
        safeNow(input.createdAt)
      )
      .run();
  } catch (err) {
    console.error("recordTrackingLinkHistory:", err);
  }
}

/**
 * Applique le DERNIER TOUCHER à une session existante : réécrit l'affilié / lien /
 * produit / campagne de la session, rafraîchit `last_seen_at` et la repousse à
 * `expires_at` (une nouvelle entrée de lien remet la fenêtre à 30 jours). C'est
 * ce chemin qui rend l'écrasement EXPLICITE et TRACÉ (l'historique garde trace
 * de l'entrée précédente via `recordTrackingLinkHistory`).
 */
export async function refreshTrackingTouch(
  db: D1Database,
  token: string,
  input: {
    visitorHash?: string | null;
    affiliateId?: string | null;
    linkId?: string | null;
    productId?: string | null;
    campaignId?: string | null;
    now?: number;
  } = {}
): Promise<boolean> {
  const clean = (token ?? "").trim();
  if (!clean) return false;
  const now = safeNow(input.now);
  try {
    const res = await db
      .prepare(
        `UPDATE tracking_sessions
            SET affiliate_id = ?, link_id = ?, product_id = ?, campaign_id = ?,
                visitor_hash = COALESCE(?, visitor_hash),
                last_seen_at = ?, expires_at = ?
          WHERE token = ?`
      )
      .bind(
        input.affiliateId ?? null,
        input.linkId ?? null,
        input.productId ?? null,
        input.campaignId ?? null,
        input.visitorHash ?? null,
        now,
        now + TRACKING_TTL_MS,
        clean
      )
      .run();
    return Number((res as { meta?: { changes?: unknown } } | null)?.meta?.changes ?? 0) > 0;
  } catch (err) {
    console.error("refreshTrackingTouch:", err);
    return false;
  }
}
