"use client";

/**
 * Internationalisation légère — dictionnaire côté navigateur, sans routes /en
 * (la sortie de l'export statique reste identique côté HTML).
 *
 * Contrat anti-hydratation : le rendu initial (HTML pré-rendu au build ET
 * premier render client) est TOUJOURS en français ; la préférence réelle
 * (localStorage « arsenal_lang », sinon navigator.language) n'est lue qu'après
 * montage, dans un useEffect → aucun mismatch d'hydratation.
 *
 * Vague 1 : header + footer publics. L'administration n'est pas traduite.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type Lang = "fr" | "en";

export const DEFAULT_LANG: Lang = "fr";

/** Clé localStorage — contrat : `arsenal_lang = "fr" | "en"` */
const LANG_STORAGE_KEY = "arsenal_lang";

/** Langues proposées par le sélecteur (label = nom natif, utilisé en aria-label/title) */
export const LANGUAGES: { code: Lang; label: string }[] = [
  { code: "fr", label: "Français" },
  { code: "en", label: "English" },
];

/**
 * Dictionnaire vague 1 — clés snake_case préfixées par zone d'interface.
 * `header_login` et `header_account_aria` sont préparées pour BalancePill
 * (composant externe, traduit dans une vague ultérieure).
 */
const DICT: Record<Lang, Record<string, string>> = {
  fr: {
    header_home_aria: "Arsenal Tools — retour à l'accueil",
    header_login: "Connexion",
    header_account_aria: "Compte de {pseudo} — solde {balance} A",
    footer_copyright_part1: "Forge ouverte aux créateurs digitaux.",
    footer_privacy: "Confidentialité",
    footer_terms: "Conditions",
    footer_notice: "Mentions légales",
    lang_switch_aria: "Changer la langue",
    lang_fr: "Français",
    lang_en: "English",
  },
  en: {
    header_home_aria: "Arsenal Tools — back to home",
    header_login: "Sign in",
    header_account_aria: "Account: {pseudo} — balance {balance} A",
    footer_copyright_part1: "An open forge for digital creators.",
    footer_privacy: "Privacy",
    footer_terms: "Terms",
    footer_notice: "Legal notice",
    lang_switch_aria: "Change language",
    lang_fr: "Français",
    lang_en: "English",
  },
};

function isLang(value: string | null): value is Lang {
  return value === "fr" || value === "en";
}

/**
 * Préférence stockée si présente, sinon langue du navigateur :
 * préfixe « en » → EN, tout le reste → FR (langue de base).
 */
function detectLang(): Lang {
  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    if (isLang(stored)) return stored;
  } catch {
    /* stockage indisponible (mode privé strict…) — repli sur le navigateur */
  }
  const navLang = typeof navigator !== "undefined" ? navigator.language : "";
  return navLang.toLowerCase().startsWith("en") ? "en" : DEFAULT_LANG;
}

/** Remplace les jetons `{nom}` par les valeurs fournies. */
function interpolate(template: string, vars?: Record<string, string>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (token, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : token,
  );
}

type I18nValue = {
  lang: Lang;
  setLang: (next: Lang) => void;
  t: (key: string, vars?: Record<string, string>) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // Rendu initial déterministe : toujours FR (identique au HTML pré-rendu).
  // La préférence n'est appliquée qu'après montage, juste en dessous.
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);

  /** Change la langue et la persiste. */
  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      /* stockage indisponible : le choix reste valable pour la session */
    }
  }, []);

  // Anti-hydratation : lecture de localStorage / navigator.language UNIQUEMENT
  // après montage. Si la préférence détectée diffère de la langue rendue,
  // on l'applique (et on la persiste, y compris la détection du navigateur).
  useEffect(() => {
    const detected = detectLang();
    if (detected !== DEFAULT_LANG) setLang(detected);
  }, [setLang]);

  /** Traduit une clé (repli : FR, puis la clé brute) et interpole `{vars}`. */
  const t = useCallback(
    (key: string, vars?: Record<string, string>) =>
      interpolate(DICT[lang][key] ?? DICT[DEFAULT_LANG][key] ?? key, vars),
    [lang],
  );

  const value = useMemo<I18nValue>(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Contexte i18n — lève une erreur si le provider est absent (bug de montage). */
export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n doit être utilisé sous <LanguageProvider>.");
  return ctx;
}
