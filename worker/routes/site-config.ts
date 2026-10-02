import { Hono } from "hono";
import { getSetting } from "../../src/lib/server/store";
import type { App, Env } from "../env";

/**
 * Configuration d'AFFICHAGE du site public — lisible sans authentification.
 *
 * - `home_show_stats` : « 1 » (défaut) affiche la rangée de statistiques de la
 *   page d'accueil (outils au catalogue / gratuits / clics cumulés) ; « 0 » la
 *   masque. Réglée depuis Paramètres → Affichage, côté dashboard admin.
 *
 * Aucune donnée sensible ici (un simple drapeau d'affichage) — les secrets
 * restent masqués dans les réglages admin comme partout ailleurs.
 */

export const SITE_SETTING_KEYS = {
  homeShowStats: "home_show_stats",
} as const;

export type SiteSettingKey = (typeof SITE_SETTING_KEYS)[keyof typeof SITE_SETTING_KEYS];

/** Validation de la whitelist d'écriture (`POST /api/admin/settings`). */
export function isSiteSettingKey(key: string): key is SiteSettingKey {
  return (Object.values(SITE_SETTING_KEYS) as string[]).includes(key);
}

/**
 * Normalise une valeur d'affichage : seuls « 1 » / « 0 » (ou booléens) sont
 * acceptés — toute autre valeur est refusée (null), jamais stockée telle quelle.
 */
export function normalizeSiteSetting(key: SiteSettingKey, raw: unknown): string | null {
  if (key !== SITE_SETTING_KEYS.homeShowStats) return null;
  if (raw === true || raw === 1 || raw === "1" || raw === "true") return "1";
  if (raw === false || raw === 0 || raw === "0" || raw === "false") return "0";
  return null;
}

/** Défaut : statistiques AFFICHÉES (comportement historique du site). */
export async function readHomeShowStats(db: D1Database): Promise<boolean> {
  return (await getSetting(db, SITE_SETTING_KEYS.homeShowStats)) !== "0";
}

/** GET /api/site-config — drapeaux d'affichage publics (aucune authentification). */
export const siteConfigRoutes: App = new Hono<{ Bindings: Env }>().get(
  "/api/site-config",
  async (c) => c.json({ ok: true, showHomeStats: await readHomeShowStats(c.env.DB) })
);
