import { Hono } from "hono";
import { getSetting } from "../../src/lib/server/store";
import type { App, Env } from "../env";

/**
 * Chantier B — pages légales éditables depuis l'admin (Paramètres → Pages légales).
 *
 * Les trois textes sont stockés BRUTS (texte simple, multi-lignes, jamais de
 * markdown) dans la table `settings` :
 *   - `legal_privacy` → Politique de confidentialité
 *   - `legal_terms`   → Conditions générales
 *   - `legal_notice`  → Mentions légales
 *
 * Valeur absente ou vide ⇒ "" : les pages publiques affichent alors un état
 * neutre « pas encore renseignée » — AUCUN contenu juridique n'est jamais inventé.
 */

/** Clés de réglage des trois pages légales (source unique, réutilisée par l'admin). */
export const LEGAL_SETTING_KEYS = {
  privacy: "legal_privacy",
  terms: "legal_terms",
  notice: "legal_notice",
} as const;

export type LegalSettingKey = (typeof LEGAL_SETTING_KEYS)[keyof typeof LEGAL_SETTING_KEYS];

const LEGAL_SETTING_KEY_LIST: readonly string[] = Object.values(LEGAL_SETTING_KEYS);

/** Validation de la whitelist d'écriture (`POST /api/admin/settings`). */
export function isLegalSettingKey(key: string): key is LegalSettingKey {
  return LEGAL_SETTING_KEY_LIST.includes(key);
}

/** Un texte de page légale — "" si non renseigné (jamais de faux texte). */
export async function readLegalSetting(db: D1Database, key: LegalSettingKey): Promise<string> {
  return (await getSetting(db, key)) ?? "";
}

/** GET /api/legal — lecture PUBLIQUE des trois textes (aucune authentification). */
export const legalRoutes: App = new Hono<{ Bindings: Env }>().get("/api/legal", async (c) => {
  const [privacy, terms, notice] = await Promise.all([
    readLegalSetting(c.env.DB, LEGAL_SETTING_KEYS.privacy),
    readLegalSetting(c.env.DB, LEGAL_SETTING_KEYS.terms),
    readLegalSetting(c.env.DB, LEGAL_SETTING_KEYS.notice),
  ]);
  return c.json({ ok: true, privacy, terms, notice });
});
