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
    // Refonte 05/10 — navigation principale + menu
    nav_aria: "Navigation principale",
    nav_home: "Accueil",
    nav_catalog: "Catalogue",
    nav_feed: "Feed",
    menu_title: "Menu",
    menu_open_aria: "Ouvrir le menu",
    menu_close_aria: "Fermer le menu",
    drawer_account: "Compte",
    drawer_community: "Communauté",
    drawer_appearance: "Apparence",
    drawer_language: "Langue",
    drawer_info: "Informations",
    drawer_login: "Connexion",
    drawer_register: "Créer un compte",
    drawer_account_page: "Mon compte",
    drawer_cart: "Mon panier",
    drawer_wallet: "Portefeuille",
    drawer_mine: "Mes produits",
    drawer_affiliate: "Espace affilié",
    drawer_become_affiliate: "Programme d'affiliation",
    drawer_telegram: "Rejoindre Telegram",
    theme_system: "Système",
    theme_light: "Clair",
    theme_dark: "Sombre",
    // Accueil + catalogue + feed
    home_hero_title: "L'arsenal des bâtisseurs du web",
    home_hero_sub:
      "SaaS, applications desktop, PWA mobiles, e-books et packs d'automations — triés par popularité réelle, testés par la communauté.",
    home_doors_title: "Deux portes, deux intentions",
    home_door_catalog_title: "Je cherche un outil",
    home_door_catalog_text: "Filtrez le catalogue par catégorie, badge, langue et popularité.",
    home_door_feed_title: "Je veux découvrir",
    home_door_feed_text: "Analyses, guides et coulisses — la couche éditoriale d'Arsenal Tools.",
    home_top_products: "Les plus populaires",
    home_latest_posts: "Derniers articles",
    home_see_all_catalog: "Tout le catalogue",
    home_see_all_feed: "Tout le feed",
    catalog_title: "Catalogue",
    catalog_sub: "Tous les outils Arsenal — recherche, filtres et tri.",
    feed_title: "Feed",
    feed_sub: "La couche éditoriale d'Arsenal Tools — analyse et découverte.",
    feed_empty: "Aucun article publié pour le moment.",
    feed_back: "Retour au feed",
    feed_published_on: "Publié le",
    feed_related_product: "Produit présenté",
    feed_share: "Partager",
    feed_share_copied: "Lien copié.",
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
    // Refonte 05/10 — header + drawer
    nav_aria: "Main navigation",
    nav_home: "Home",
    nav_catalog: "Catalog",
    nav_feed: "Feed",
    menu_title: "Menu",
    menu_open_aria: "Open menu",
    menu_close_aria: "Close menu",
    drawer_account: "Account",
    drawer_community: "Community",
    drawer_appearance: "Appearance",
    drawer_language: "Language",
    drawer_info: "Information",
    drawer_login: "Sign in",
    drawer_register: "Create an account",
    drawer_account_page: "My account",
    drawer_cart: "My cart",
    drawer_wallet: "Wallet",
    drawer_mine: "My products",
    drawer_affiliate: "Affiliate space",
    drawer_become_affiliate: "Affiliate program",
    drawer_telegram: "Join Telegram",
    theme_system: "System",
    theme_light: "Light",
    theme_dark: "Dark",
    // Home + catalog + feed
    home_hero_title: "The arsenal for web builders",
    home_hero_sub:
      "SaaS, desktop apps, mobile PWAs, e-books and automation packs — sorted by real popularity, tested by the community.",
    home_doors_title: "Two doors, two intents",
    home_door_catalog_title: "I'm looking for a tool",
    home_door_catalog_text: "Filter the catalog by category, badge, language and popularity.",
    home_door_feed_title: "I want to discover",
    home_door_feed_text: "Analysis, guides and behind the scenes — the editorial layer of Arsenal Tools.",
    home_top_products: "Most popular",
    home_latest_posts: "Latest articles",
    home_see_all_catalog: "Full catalog",
    home_see_all_feed: "Full feed",
    catalog_title: "Catalog",
    catalog_sub: "Every Arsenal tool — search, filters and sorting.",
    feed_title: "Feed",
    feed_sub: "The editorial layer of Arsenal Tools — analysis and discovery.",
    feed_empty: "No article published yet.",
    feed_back: "Back to feed",
    feed_published_on: "Published on",
    feed_related_product: "Featured product",
    feed_share: "Share",
    feed_share_copied: "Link copied.",
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
