/**
 * Arsenal — Checkout Chariow serveur-à-serveur (Phase 2.6).
 * Contrat FIGÉ : docs/chantier/07-contrat-paiement-a.md (§ Fulfillment) et
 * audit des capacités réelles : docs/chantier/06-audit-chariow-fulfillment.md.
 *
 * Règle absolue : AUCUN champ inventé. Le corps envoyé contient EXACTEMENT
 * `product_id`, `email`, `first_name?`, `last_name?`, `phone?`, `discount_code?`
 * et `custom_metadata.{arsenal_purchase, arsenal_user}` — rien d'autre (aucun
 * montant : le prix vient du produit Chariow ; `discount_code` est un champ
 * OFFICIEL du `CheckoutRequest` de l'OpenAPI, il porte le code promo réservé à
 * Arsenal sur le produit d'origine — cf. migration 0005).
 *
 * Lecture DÉFENSIVE de la réponse (`step` : completed | payment |
 * already_purchased) et AUCUNE exception qui remonte : toute anomalie (réseau,
 * timeout 10 s, JSON illisible, HTTP non-2xx) devient un résultat typé.
 */

import { getSetting } from "./store";

/* ------------------------------ Constantes ------------------------------ */

/** Base officielle de l'API Chariow (`bearerAuth` — clé `sk_live_…`). */
export const CHARIOW_API_BASE = "https://api.chariow.com/v1";
/** Endpoint officiel de création de commande : `POST /v1/checkout`. */
export const CHARIOW_CHECKOUT_URL = `${CHARIOW_API_BASE}/checkout`;
/** Réglage admin contenant la clé API — JAMAIS renvoyée en clair par une route. */
export const CHARIOW_API_KEY_SETTING = "chariow_api_key";
/** Timeout réseau du contrat : 10 secondes. */
export const CHARIOW_TIMEOUT_MS = 10_000;

/* -------------------------------- Types -------------------------------- */

export interface ChariowCheckoutInput {
  /** Clé API (`sk_live_…`). Absente/vide → `not_configured`, AUCUN appel réseau. */
  apiKey: string | null | undefined;
  /**
   * `product_id` : identifiant (ou slug) du produit Chariow.
   * - méthode `chariow_free_checkout` : produit DUPLIQUÉ en modèle « Gratuit » ;
   * - méthode `chariow_discount_checkout` : produit d'ORIGINE payant, rendu
   *   gratuit par `discountCode`.
   */
  productId: string;
  /**
   * `discount_code` — champ OFFICIEL du `CheckoutRequest` (OpenAPI, maxLength
   * 100) : code promo créé manuellement dans Chariow → Marketing → Réductions.
   * Envoyé UNIQUEMENT s'il est non vide (aucun champ vide dans le corps).
   */
  discountCode?: string | null;
  /** Email de l'acheteur : c'est lui qui porte l'accès sur app.ateliat.com. */
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  /**
   * Téléphone — **exigé par l'API Chariow** (vérifié le 30/09 : 422 sans lui).
   * `country_code` doit être un code ISO à 2 lettres (« CI »), pas « +225 ».
   */
  phoneNumber?: string | null;
  phoneCountry?: string | null;
  /** `custom_metadata.arsenal_purchase` = id de la purchase Arsenal. */
  arsenalPurchase: string;
  /** `custom_metadata.arsenal_user` = id de l'utilisateur Arsenal. */
  arsenalUser: string;
}

/**
 * Résultat typé — jamais d'exception :
 * - `completed` / `payment` / `already_purchased` : `step` renvoyé par Chariow ;
 * - `not_configured` : clé API (ou produit Chariow) absente, aucun appel émis ;
 * - `error` : HTTP non-2xx, JSON illisible, réseau ou timeout.
 */
export type ChariowCheckoutResult =
  | { status: "completed"; purchaseId: string | null; transactionId: string | null }
  | { status: "payment" }
  | { status: "already_purchased" }
  | { status: "not_configured"; error: string }
  | { status: "error"; error: string; httpStatus: number | null };

/* --------------------------- Lecture défensive --------------------------- */

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

/** Première valeur non vide parmi plusieurs chemins (aucun champ déduit du néant). */
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

/* ------------------------------ Configuration ------------------------------ */

/** Clé API Chariow (null si non configurée) — lecture serveur uniquement. */
export async function readChariowApiKey(db: D1Database): Promise<string | null> {
  const value = await getSetting(db, CHARIOW_API_KEY_SETTING);
  const trimmed = (value ?? "").trim();
  return trimmed.length ? trimmed : null;
}

/* ------------------------------- Appel API ------------------------------- */

function messageForHttp(status: number, data: unknown): string {
  const detail = readString(readFirst(data, ["message", "error.message", "error", "detail"]));
  const suffix = detail ? ` — ${detail.slice(0, 200)}` : "";
  if (status === 401 || status === 403) return `Clé API Chariow refusée (HTTP ${status}).${suffix}`;
  if (status === 404) return `Produit Chariow introuvable ou non publié (HTTP 404).${suffix}`;
  if (status === 422) {
    // 422 n'est pas détaillé par l'API : produit non éligible au checkout API
    // (Service/Coaching/prix libre) OU code promo refusé par Chariow.
    return `Chariow a refusé la commande (HTTP 422 : produit non éligible au checkout API ou code promo refusé).${suffix}`;
  }
  if (status === 429) return `Limite de requêtes Chariow atteinte (HTTP 429).${suffix}`;
  return `Chariow a répondu HTTP ${status}.${suffix}`;
}

/**
 * `POST https://api.chariow.com/v1/checkout` (Bearer = clé API).
 * Timeout 10 s via AbortController ; retourne TOUJOURS un résultat typé.
 */
export async function createChariowCheckout(
  input: ChariowCheckoutInput
): Promise<ChariowCheckoutResult> {
  const apiKey = (input.apiKey ?? "").trim();
  if (!apiKey) {
    // Aucune tentative réseau : la clé n'est pas configurée.
    return { status: "not_configured", error: "Clé API Chariow non configurée." };
  }
  const productId = (input.productId ?? "").trim();
  if (!productId) {
    // Erreur de configuration de même nature : aucune tentative réseau non plus.
    return {
      status: "not_configured",
      error: "Produit Chariow non configuré (chariow_product_id manquant).",
    };
  }

  // Corps STRICTEMENT limité aux champs officiels du CheckoutRequest.
  const payload: Record<string, unknown> = {
    product_id: productId,
    email: (input.email ?? "").trim(),
    custom_metadata: {
      arsenal_purchase: input.arsenalPurchase,
      arsenal_user: input.arsenalUser,
    },
  };
  const firstName = (input.firstName ?? "").trim();
  const lastName = (input.lastName ?? "").trim();
  if (firstName) payload.first_name = firstName;
  if (lastName) payload.last_name = lastName;

  // `discount_code` : champ officiel du CheckoutRequest, envoyé seulement s'il
  // est renseigné (méthode `chariow_discount_checkout`). Sans lui, la requête
  // est identique à celle de la méthode « produit gratuit ».
  const discountCode = (input.discountCode ?? "").trim();
  if (discountCode) payload.discount_code = discountCode;

  // Le téléphone est OBLIGATOIRE côté Chariow (contrainte du prestataire vérifiée
  // en conditions réelles) ; sans lui la requête échoue en 422.
  const phoneNumber = (input.phoneNumber ?? "").trim();
  const phoneCountry = (input.phoneCountry ?? "").trim().toUpperCase();
  if (phoneNumber && phoneCountry) {
    payload.phone = { number: phoneNumber, country_code: phoneCountry };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHARIOW_TIMEOUT_MS);
  try {
    const res = await fetch(CHARIOW_CHECKOUT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    if (!res.ok) {
      return { status: "error", error: messageForHttp(res.status, data), httpStatus: res.status };
    }

    const step = readString(readFirst(data, ["step", "data.step"]))?.toLowerCase() ?? null;
    if (step === "completed") {
      return {
        status: "completed",
        purchaseId: readString(readFirst(data, ["purchase.id", "data.purchase.id", "id", "data.id"])),
        transactionId: readString(
          readFirst(data, ["transaction_id", "data.transaction_id", "purchase.transaction_id"])
        ),
      };
    }
    if (step === "payment") return { status: "payment" };
    if (step === "already_purchased") return { status: "already_purchased" };

    return {
      status: "error",
      error: `Réponse Chariow inattendue (step : ${step ?? "absent"}).`,
      httpStatus: res.status,
    };
  } catch (err) {
    const aborted =
      err instanceof Error && (err.name === "AbortError" || /abort/i.test(err.message));
    return {
      status: "error",
      error: aborted
        ? `Délai dépassé (${Math.round(CHARIOW_TIMEOUT_MS / 1000)} s) — Chariow n'a pas répondu.`
        : "Erreur réseau lors de l'appel à Chariow.",
      httpStatus: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

/* ---------------------------- Lecture d'un Pulse ---------------------------- */

/**
 * `custom_metadata.arsenal_purchase` d'un Pulse `successful.sale` : quand ce
 * champ est présent, la vente Chariow est la LIVRAISON d'un achat déjà payé en
 * A — elle ne doit créer ni commission ni récompense (contrat § Pulse).
 *
 * Lecture tolérante (l'emplacement exact de `custom_metadata` dans un Pulse
 * n'est pas documenté avec certitude : racine, `sale` ou `data`), null si absent.
 */
export function readArsenalPurchaseRef(payload: unknown): string | null {
  const paths = [
    "custom_metadata.arsenal_purchase",
    "custom_metadata.arsenalPurchase",
    "metadata.arsenal_purchase",
  ];
  const candidate = readFirst(payload, ["sale", "data.sale", "payload.sale", "data"]);
  const sale = isRecord(candidate) ? candidate : null;
  return (
    readString(readFirst(sale ?? null, paths)) ??
    readString(
      readFirst(payload, [
        ...paths,
        ...paths.map((p) => `data.${p}`),
        ...paths.map((p) => `payload.${p}`),
      ])
    )
  );
}
