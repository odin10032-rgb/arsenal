"use client";

/**
 * Thème clair / sombre / système (refonte front 05/10/2026).
 *
 * Contrat :
 *  • préférence stockée dans localStorage « arsenal_theme » = "system" | "light" | "dark" ;
 *  • « system » (DÉFAUT) suit `prefers-color-scheme` en direct (changement d'OS
 *    appliqué sans rechargement) ;
 *  • choix explicite = l'utilisateur fige le thème, le système n'est plus suivi
 *    tant qu'il ne repasse pas sur « Système » ;
 *  • le thème est posé en `data-theme` sur <html> — un script inline dans le
 *    layout racine l'applique AVANT la peinture (aucun flash) ; ce provider ne
 *    fait que le maintenir et l'exposer.
 *
 * Le dashboard admin force `data-theme="dark"` localement (voir /admin) :
 * le mode clair ne concerne que le site public.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type ThemePref = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "arsenal_theme";

/** Script anti-flash — injecté dans <head> par le layout racine (avant peinture). */
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem("${THEME_STORAGE_KEY}");var d=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";var t=(p==="light"||p==="dark")?p:d;document.documentElement.setAttribute("data-theme",t);}catch(e){document.documentElement.setAttribute("data-theme","dark");}})();`;

function systemTheme(): ResolvedTheme {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "dark"; // défaut historique du site
  }
}

function detectPref(): ThemePref {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    /* stockage indisponible : défaut système */
  }
  return "system";
}

function applyTheme(resolved: ResolvedTheme) {
  document.documentElement.setAttribute("data-theme", resolved);
}

interface ThemeContextValue {
  /** Préférence utilisateur (system | light | dark). */
  pref: ThemePref;
  /** Thème réellement appliqué après résolution de « system ». */
  resolved: ResolvedTheme;
  /** Change la préférence (persistée) et applique immédiatement. */
  setPref: (p: ThemePref) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Rendu initial : valeurs neutres — le script inline du layout a déjà posé
  // data-theme ; la préférence réelle est lue après montage (anti-hydratation).
  const [pref, setPrefState] = useState<ThemePref>("system");
  const [resolved, setResolved] = useState<ResolvedTheme>("dark");

  useEffect(() => {
    const initial = detectPref();
    setPrefState(initial);
    const first = initial === "system" ? systemTheme() : initial;
    setResolved(first);
    applyTheme(first);
  }, []);

  // « système » : suivre les changements d'OS en direct.
  useEffect(() => {
    if (pref !== "system") return;
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia("(prefers-color-scheme: dark)");
    } catch {
      return;
    }
    const onChange = () => {
      const next = systemTheme();
      setResolved(next);
      applyTheme(next);
    };
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [pref]);

  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p);
    try {
      if (p === "system") localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, p);
    } catch {
      /* stockage indisponible : le thème reste appliqué pour la session */
    }
    const next = p === "system" ? systemTheme() : p;
    setResolved(next);
    applyTheme(next);
  }, []);

  const value = useMemo(() => ({ pref, resolved, setPref }), [pref, resolved, setPref]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme doit être utilisé dans <ThemeProvider>");
  return ctx;
}
