/**
 * Arsenal Tools — couche API admin de l'onglet « Programme » (vague 5).
 *
 * Quatre familles d'appels, toutes sous `X-Admin-Auth` (voir `apiFetch` d'./api) :
 *  - transferts de A (traçabilité, lectures) ;
 *  - paniers abandonnés (= achats abandonnés) ;
 *  - réglages du programme d'affiliation (lecture + écriture) ;
 *  - ajustement administratif de A (crédit/débit) — action sensible.
 *
 * Comme les autres modules admin, seule la MISE EN FORME est normalisée côté
 * front : aucune valeur métier n'est inventée, un champ absent reste `null`/0.
 */

import { apiFetch } from "./api";

/* ------------------------------ Transferts de A ------------------------------ */

/** Ligne de GET /api/admin/transfers (trace reconstruite depuis le ledger). */
export interface AdminTransfer {
  refId: string;
  /** Pseudo de l'expéditeur — null si le compte n'existe plus (jamais inventé). */
  fromPseudo: string | null;
  /** Pseudo du destinataire — null si le compte n'existe plus. */
  toPseudo: string | null;
  amount: number;
  createdAt: number;
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/**
 * GET /api/admin/transfers?limit= — transferts de A reconstruits depuis le ledger
 * (paires `transfer_out`/`transfer_in` de même `ref_id`).
 */
export async function fetchAdminTransfers(limit = 100): Promise<AdminTransfer[]> {
  const res = await apiFetch<{ ok: boolean; transfers?: unknown[] }>(
    `/api/admin/transfers?limit=${encodeURIComponent(String(limit))}`,
    { auth: true, timeoutMs: 6000 },
  );
  return (res.transfers || []).map((raw) => {
    const item = (raw || {}) as Record<string, unknown>;
    return {
      refId: str(item.refId) || str(item.ref_id),
      fromPseudo: strOrNull(item.fromPseudo ?? item.from_pseudo),
      toPseudo: strOrNull(item.toPseudo ?? item.to_pseudo),
      amount: Math.trunc(num(item.amount)),
      createdAt: num(item.createdAt ?? item.created_at),
    } satisfies AdminTransfer;
  });
}

/* ------------------------------ Paniers abandonnés ------------------------------ */

/** Ligne de GET /api/admin/abandoned-carts (porteur, articles, valeur publique). */
export interface AdminAbandonedCart {
  cartId: string;
  /** Pseudo si compte, sinon « visiteur » (jamais d'id ni de token côté front). */
  owner: string;
  hasAccount: boolean;
  itemCount: number;
  /** Valeur PUBLIQUE des articles (FCFA) — jamais la valeur en A. */
  publicValue: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * GET /api/admin/abandoned-carts?hours=&limit= — paniers non convertis
 * (= achats abandonnés). `hours` est la fenêtre d'inactivité.
 */
export async function fetchAdminAbandonedCarts(
  hours = 24,
  limit = 100,
): Promise<AdminAbandonedCart[]> {
  const params = new URLSearchParams({ hours: String(hours), limit: String(limit) });
  const res = await apiFetch<{ ok: boolean; carts?: unknown[] }>(
    `/api/admin/abandoned-carts?${params.toString()}`,
    { auth: true, timeoutMs: 6000 },
  );
  return (res.carts || []).map((raw) => {
    const item = (raw || {}) as Record<string, unknown>;
    return {
      cartId: str(item.cartId) || str(item.cart_id),
      owner: str(item.owner) || "visiteur",
      hasAccount: item.hasAccount === true,
      itemCount: Math.trunc(num(item.itemCount ?? item.item_count)),
      publicValue: num(item.publicValue ?? item.public_value),
      createdAt: num(item.createdAt ?? item.created_at),
      updatedAt: num(item.updatedAt ?? item.updated_at),
    } satisfies AdminAbandonedCart;
  });
}

/* ------------------------------ Réglages du programme ------------------------------ */

/**
 * Réglages du programme d'affiliation (GET/POST /api/admin/program-settings).
 * Les clés sont celles du serveur (`affiliation.ts`) : on les relaye brutes,
 * jamais renommées.
 */
export interface AdminProgramSettings {
  max_active_links: number;
  max_sales_per_link: number;
  /** 0 = illimité (Super-affilié). */
  super_max_active_links: number;
  reward_share_a: number;
  reward_click_a: number;
  share_max_per_day: number;
  super_min_sales: number;
  super_min_clicks: number;
  default_commission_percent: number;
  default_reward_a: number;
  affiliate_min_sales: number;
}

const PROGRAM_SETTING_KEYS: (keyof AdminProgramSettings)[] = [
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
];

function normalizeProgramSettings(raw: Record<string, unknown>): AdminProgramSettings {
  const out = {} as AdminProgramSettings;
  for (const key of PROGRAM_SETTING_KEYS) out[key] = Math.trunc(num(raw[key]));
  return out;
}

/** GET /api/admin/program-settings — réglages effectifs (défauts appliqués serveur). */
export async function fetchAdminProgramSettings(): Promise<AdminProgramSettings> {
  const res = await apiFetch<{ ok: boolean; settings?: Record<string, unknown> }>(
    "/api/admin/program-settings",
    { auth: true, timeoutMs: 4000 },
  );
  return normalizeProgramSettings(res.settings || {});
}

/** POST /api/admin/program-settings — écrit une clé whitelistée ({key, value}). */
export async function saveAdminProgramSetting(key: string, value: number): Promise<AdminProgramSettings> {
  const res = await apiFetch<{ ok: boolean; settings?: Record<string, unknown> }>(
    "/api/admin/program-settings",
    {
      method: "POST",
      body: { key, value },
      auth: true,
      timeoutMs: 8000,
    },
  );
  return normalizeProgramSettings(res.settings || {});
}

/* ------------------------------ Ajustement de A ------------------------------ */

/** Réponse de POST /api/admin/users/:id/credit (nouveau solde recalculé). */
export interface AdminCreditResult {
  userId: string;
  pseudo: string;
  amount: number;
  balanceA: number;
}

/**
 * POST /api/admin/users/:id/credit {amount, reason} — ajustement administratif de A.
 * `amount` signé (positif = crédit, négatif = débit) ; `reason` est OBLIGATOIRE
 * (motif humain journalisé). Renvoie le nouveau solde.
 */
export async function creditAdminUser(
  userId: string,
  amount: number,
  reason: string,
  /**
   * Clé d'idempotence générée par l'UI à l'ouverture de la confirmation :
   * un renvoi réseau de la même tentative ne crée qu'UN ajustement.
   */
  idempotencyKey?: string,
): Promise<AdminCreditResult> {
  const res = await apiFetch<{ ok: boolean } & Partial<AdminCreditResult>>(
    `/api/admin/users/${encodeURIComponent(userId)}/credit`,
    {
      method: "POST",
      body: {
        amount: Math.trunc(amount),
        reason: reason.trim(),
        ...(idempotencyKey ? { idempotencyKey } : {}),
      },
      auth: true,
      timeoutMs: 8000,
    },
  );
  return {
    userId: str(res.userId) || userId,
    pseudo: str(res.pseudo),
    amount: Math.trunc(num(res.amount)) || Math.trunc(amount),
    balanceA: Math.trunc(num(res.balanceA)),
  };
}
