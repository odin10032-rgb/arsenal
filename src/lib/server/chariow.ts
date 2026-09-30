/**
 * Arsenal — Chariow (Pulses). Contrat FIGÉ : docs/chantier/05-contrat-api-phase2.md
 *
 * Règle absolue : AUCUN endpoint inventé, AUCUN champ inventé. Seuls les
 * mécanismes officiellement documentés sont utilisés — signature HMAC-SHA256
 * de l'en-tête `x-chariow-signature: sha256=<hex>` calculée sur le corps BRUT,
 * idempotence par `x-pulse-delivery-id` et `sale.id`, événement `successful.sale`.
 *
 * Toute lecture de payload est DÉFENSIVE : un champ absent, d'un type inattendu
 * ou non fini est traité comme « non fourni » (null) — jamais deviné.
 */

/* ------------------------------ Signature HMAC ------------------------------ */

const SIGNATURE_PREFIX = "sha256=";
const SHA256_HEX_LENGTH = 64;

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (hex.length !== SHA256_HEX_LENGTH || !/^[0-9a-f]+$/i.test(hex)) return null;
  const bytes = new Uint8Array(SHA256_HEX_LENGTH / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function toBytes(body: string | ArrayBuffer | Uint8Array): Uint8Array<ArrayBuffer> {
  if (typeof body === "string") return new TextEncoder().encode(body);
  if (body instanceof Uint8Array) return new Uint8Array(body);
  return new Uint8Array(body);
}

/**
 * Vérifie `x-chariow-signature` (HMAC-SHA256 du corps BRUT avec le secret du
 * Pulse) via WebCrypto. Retourne false pour toute anomalie : en-tête absent ou
 * malformé, hex invalide, secret vide, erreur WebCrypto.
 */
export async function verifyChariowSignature(
  rawBody: string | ArrayBuffer | Uint8Array,
  signatureHeader: string | null | undefined,
  secret: string
): Promise<boolean> {
  const header = (signatureHeader ?? "").trim();
  if (!header || !header.toLowerCase().startsWith(SIGNATURE_PREFIX)) return false;
  if (!secret) return false;
  const expected = hexToBytes(header.slice(SIGNATURE_PREFIX.length).trim());
  if (!expected) return false;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    return await crypto.subtle.verify("HMAC", key, expected, toBytes(rawBody));
  } catch {
    return false;
  }
}

/* --------------------------- Lecture défensive du payload --------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Lecture d'un chemin `a.b.c` — undefined si un maillon manque. */
function readPath(source: unknown, path: string): unknown {
  let current: unknown = source;
  for (const segment of path.split(".")) {
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }
  return current;
}

/** Première valeur non vide parmi plusieurs chemins (alias tolérés, aucune invention). */
function readFirst(source: unknown, paths: string[]): unknown {
  for (const path of paths) {
    const value = readPath(source, path);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function readString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Horodatage → epoch ms. Accepte un nombre (secondes si < 1e11, sinon ms) ou
 * une chaîne ISO 8601. Retourne null si non fourni/illisible.
 */
export function readTimestampMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value < 1e11 ? value * 1000 : value);
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value.trim());
    if (Number.isFinite(parsed)) return parsed;
    const n = Number(value.trim());
    if (Number.isFinite(n) && n > 0) return readTimestampMs(n);
  }
  return null;
}

export interface ChariowPulse {
  /** Événement du Pulse (`successful.sale`, …) — null si absent. */
  event: string | null;
  /** En-tête `x-pulse-delivery-id` (idempotence de livraison). */
  deliveryId: string | null;
  /** `sale.id` — référence unique de la vente. */
  saleId: string | null;
  amount: number | null;
  currency: string | null;
  occurredAt: number | null;
  /** Identifiant produit côté Chariow (≠ id Arsenal) — sert de repli d'attribution. */
  productId: string | null;
  productName: string | null;
  /** `custom_metadata.arsenal_link` — code de lien affilié Arsenal. */
  arsenalLink: string | null;
  /** `affiliate.code` — code affilié (repli d'attribution). */
  affiliateCode: string | null;
}

/**
 * Lecture défensive d'un Pulse : les objets `sale`/`data` et les alias de champs
 * sont tolérés, tout champ absent reste null. Aucune valeur n'est déduite du
 * néant (montant non numérique → null, montant 0 légitime → 0).
 */
export function parseChariowPulse(
  payload: unknown,
  headers: { deliveryId?: string | null } = {}
): ChariowPulse {
  const candidate = readFirst(payload, ["sale", "data.sale", "payload.sale", "data"]);
  const sale = isRecord(candidate) ? candidate : null;
  const source = sale ?? payload;

  const amountRaw = readFirst(source, ["amount", "total", "amount_paid", "price"]);
  const amount = readNumber(amountRaw);

  const currency =
    readString(readFirst(source, ["currency", "currency_code"]))?.toUpperCase().slice(0, 8) ?? null;

  return {
    event: readString(readFirst(payload, ["event", "type", "data.event"]))?.toLowerCase() ?? null,
    deliveryId: readString(headers.deliveryId) ?? null,
    // `sale.id` uniquement depuis l'objet vente (jamais l'id racine de l'événement).
    saleId: readString(readFirst(sale ?? null, ["id", "sale_id"])),
    amount,
    currency,
    occurredAt:
      readTimestampMs(readFirst(source, ["created_at", "occurred_at", "paid_at"])) ??
      readTimestampMs(readFirst(payload, ["occurred_at", "created_at"])),
    productId: readString(readFirst(source, ["product.id", "product_id", "product.uuid"])),
    productName: readString(readFirst(source, ["product.name", "product.title", "product_name"])),
    // `custom_metadata` : la position exacte dans un Pulse n'est pas documentée
    // avec certitude (racine, au sein de `sale`, ou sous `data`) — on tolère
    // les trois, sinon une vente attribuée serait comptée sans affilié.
    arsenalLink:
      readString(
        readFirst(source, [
          "custom_metadata.arsenal_link",
          "custom_metadata.arsenalLink",
          "metadata.arsenal_link",
        ])
      ) ??
      readString(
        readFirst(payload, [
          "custom_metadata.arsenal_link",
          "custom_metadata.arsenalLink",
          "metadata.arsenal_link",
          "data.custom_metadata.arsenal_link",
          "data.custom_metadata.arsenalLink",
        ])
      ),
    affiliateCode:
      readString(readFirst(source, ["affiliate.code", "affiliate_code"])) ??
      readString(readFirst(payload, ["affiliate.code", "affiliate_code"])),
  };
}

/** Événement de vente réussie (seul cas traité par le contrat). */
export function isSuccessfulSaleEvent(pulse: ChariowPulse): boolean {
  return pulse.event === "successful.sale";
}
