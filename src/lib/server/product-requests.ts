/**
 * Arsenal — demandes de disponibilité produit (vague 4).
 *
 * Un SUPER-affilié peut demander qu'un produit encore non éligible soit OUVRERT
 * à l'affiliation (`products.affiliate_enabled = 1`). La demande est validée par
 * un ADMIN (route dédiée `worker/routes/admin-product-requests.ts`) — le client
 * ne s'octroie jamais l'éligibilité lui-même.
 *
 * Idempotence : au plus UNE demande `pending` par couple (affilié, produit),
 * garantie par l'index unique partiel `idx_product_requests_pending` (migration
 * 0011). Une nouvelle demande après un refus est possible (le refus n'est plus
 * `pending`).
 *
 * Style maison : fonctions pures recevant D1Database en paramètre.
 */

/* ---------------------------------- Types ---------------------------------- */

export type ProductRequestStatus = "pending" | "approved" | "rejected";
export const PRODUCT_REQUEST_STATUSES: readonly ProductRequestStatus[] = [
  "pending",
  "approved",
  "rejected",
];

export interface ProductRequestRow {
  id: string;
  affiliate_id: string;
  user_id: string;
  product_id: string;
  status: string;
  created_at: number;
  decided_at: number | null;
  decided_by: string | null;
  note: string | null;
}

export interface ProductRequestWithContext extends ProductRequestRow {
  affiliate_code: string | null;
  affiliate_pseudo: string | null;
  product_title: string | null;
}

export function isProductRequestStatus(raw: unknown): raw is ProductRequestStatus {
  return typeof raw === "string" && (PRODUCT_REQUEST_STATUSES as readonly string[]).includes(raw);
}

/* --------------------------------- Écriture --------------------------------- */

export interface CreateProductRequestInput {
  affiliateId: string;
  userId: string;
  productId: string;
  note?: string | null;
  now?: number;
}

/**
 * Crée une demande `pending`. Idempotente : si une demande `pending` existe déjà
 * pour ce couple (affilié, produit), elle est renvoyée telle quelle (aucune
 * seconde ligne — l'index unique partiel le garantirait de toute façon).
 * Retourne `{ request, created }` (`created = false` si une demande existait).
 */
export async function createProductRequest(
  db: D1Database,
  input: CreateProductRequestInput
): Promise<{ request: ProductRequestRow; created: boolean }> {
  const existing = await getPendingProductRequest(db, input.affiliateId, input.productId);
  if (existing) return { request: existing, created: false };

  const now = input.now ?? Date.now();
  const request: ProductRequestRow = {
    id: crypto.randomUUID(),
    affiliate_id: input.affiliateId,
    user_id: input.userId,
    product_id: input.productId,
    status: "pending",
    created_at: now,
    decided_at: null,
    decided_by: null,
    note: input.note?.trim() ? input.note.trim().slice(0, 500) : null,
  };
  try {
    await db
      .prepare(
        `INSERT INTO product_requests
           (id, affiliate_id, user_id, product_id, status, created_at, decided_at, decided_by, note)
         VALUES (?, ?, ?, ?, 'pending', ?, NULL, NULL, ?)`
      )
      .bind(request.id, request.affiliate_id, request.user_id, request.product_id, now, request.note)
      .run();
  } catch (err) {
    // Course : une demande pending vient d'être créée par une requête concurrente.
    if (isUniqueViolation(err)) {
      const raced = await getPendingProductRequest(db, input.affiliateId, input.productId);
      if (raced) return { request: raced, created: false };
    }
    throw err;
  }
  return { request, created: true };
}

/** true si l'erreur est une violation de contrainte UNIQUE D1 (idempotence). */
function isUniqueViolation(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /unique constraint failed/i.test(message);
}

/* ---------------------------------- Lecture ---------------------------------- */

export async function getProductRequestById(
  db: D1Database,
  id: string
): Promise<ProductRequestRow | null> {
  return (
    (await db.prepare("SELECT * FROM product_requests WHERE id = ?").bind(id).first<ProductRequestRow>()) ??
    null
  );
}

export async function getPendingProductRequest(
  db: D1Database,
  affiliateId: string,
  productId: string
): Promise<ProductRequestRow | null> {
  const row = await db
    .prepare(
      "SELECT * FROM product_requests WHERE affiliate_id = ? AND product_id = ? AND status = 'pending' LIMIT 1"
    )
    .bind(affiliateId, productId)
    .first<ProductRequestRow>();
  return row ?? null;
}

/** Identifiants des produits pour lesquels l'affilié a une demande `pending`. */
export async function listPendingRequestProductIds(
  db: D1Database,
  affiliateId: string
): Promise<Set<string>> {
  const { results = [] } = await db
    .prepare("SELECT product_id FROM product_requests WHERE affiliate_id = ? AND status = 'pending'")
    .bind(affiliateId)
    .all<{ product_id: string }>();
  return new Set((results || []).map((r) => r.product_id));
}

/** Liste admin (filtre optionnel par statut), plus récentes d'abord. */
export async function listProductRequestsAdmin(
  db: D1Database,
  status?: string | null
): Promise<ProductRequestWithContext[]> {
  const select = `
    SELECT pr.*, a.code AS affiliate_code, u.pseudo AS affiliate_pseudo, p.title AS product_title
      FROM product_requests pr
      LEFT JOIN affiliates a ON a.id = pr.affiliate_id
      LEFT JOIN users u ON u.id = pr.user_id
      LEFT JOIN products p ON p.id = pr.product_id
  `;
  const order = " ORDER BY pr.created_at DESC, pr.id DESC";
  const { results = [] } = status
    ? await db
        .prepare(`${select} WHERE pr.status = ?${order}`)
        .bind(status)
        .all<ProductRequestWithContext>()
    : await db.prepare(`${select}${order}`).all<ProductRequestWithContext>();
  return results || [];
}

/* --------------------------------- Décision --------------------------------- */

/**
 * Statements de décision d'une demande (à exécuter avec les autres écritures,
 * typiquement le passage du produit en éligible). Garde : la demande doit être
 * encore `pending` (l'UPDATE conditionnel renvoie 0 ligne sinon).
 */
export function decideProductRequestStatement(
  db: D1Database,
  input: {
    id: string;
    status: ProductRequestStatus;
    decidedBy: string;
    note?: string | null;
    now?: number;
  }
): D1PreparedStatement {
  const now = input.now ?? Date.now();
  return db
    .prepare(
      `UPDATE product_requests
          SET status = ?, decided_at = ?, decided_by = ?, note = COALESCE(?, note)
        WHERE id = ? AND status = 'pending'`
    )
    .bind(input.status, now, input.decidedBy, input.note?.trim() ? input.note.trim().slice(0, 500) : null, input.id);
}
