import { licenseStatementForPurchase } from "./licenses";
import { getSetting } from "./store";

/**
 * Phase 2.6 — génération de licence à la livraison d'un achat.
 *
 * Un produit `delivery_kind = 'license'` ne se « télécharge » pas : chaque
 * achat livré reçoit une clé unique (ARN-XXXX-…), vérifiable par l'application
 * du propriétaire via `POST /api/licenses/verify`.
 *
 * L'idempotence est garantie par la contrainte `purchase_id` UNIQUE de la
 * table (voir migration 0006) : rejouer une livraison ne crée jamais de
 * seconde clé. Le statement est destiné au batch qui marque la livraison
 * aboutie (même atomicité que le débit A).
 */
export async function licenseStatementsIfApplicable(
  db: D1Database,
  input: { purchaseId: string; userId: string; productId: string }
): Promise<D1PreparedStatement[]> {
  // Lire le type de livraison du produit (produit supprimé → pas de licence).
  const row = await db
    .prepare("SELECT delivery_kind FROM products WHERE id = ?")
    .bind(input.productId)
    .first<{ delivery_kind: string | null }>();
  if (!row || row.delivery_kind !== "license") return [];

  const maxSetting = await getSetting(db, "license_max_activations");
  const maxActivations = Math.max(1, Math.trunc(Number(maxSetting ?? 3)) || 3);

  return [
    licenseStatementForPurchase(db, {
      purchaseId: input.purchaseId,
      userId: input.userId,
      productId: input.productId,
      maxActivations,
    }),
  ];
}
