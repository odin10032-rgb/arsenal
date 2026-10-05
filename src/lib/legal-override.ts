"use client";

/**
 * Override admin des pages légales historiques (Paramètres → Pages légales).
 *
 * Les pages /confidentialite, /conditions et /mentions-legales disposent d'un
 * contenu rédigé PAR DÉFAUT dans le code (structure complète, informations
 * réelles). Si l'administrateur a saisi un texte dans les réglages, ce texte
 * REMPLACE le contenu par défaut (il gagne) — le mécanisme d'édition existant
 * est donc conservé. `null` = chargement en cours.
 */

import { useEffect, useState } from "react";
import { apiFetch } from "./api";

export type LegalKey = "privacy" | "terms" | "notice";

export function useLegalOverride(key: LegalKey): string | null {
  const [override, setOverride] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<Record<string, unknown>>("/api/legal", { timeoutMs: 6000 })
      .then((res) => {
        if (cancelled) return;
        const value = res[key];
        setOverride(typeof value === "string" ? value.trim() : "");
      })
      .catch(() => {
        if (!cancelled) setOverride(""); // API injoignable : contenu par défaut
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return override;
}
