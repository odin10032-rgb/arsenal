"use client";

import { useEffect } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { captureTrackingTokenFromUrl } from "@/lib/purchases";

/**
 * Layout public : header + contenu + footer (collé en bas).
 *
 * PONT DE TRACKING — capture du jeton affilié (`?ars=`) au montage de TOUTE page
 * publique. Placé ici et non sur la seule accueil : le pont redirige souvent le
 * visiteur DIRECTEMENT vers une fiche produit (`/produit?id=…&ars=…`) ; capturer
 * sur l'accueil uniquement laisserait ce parcours sans jeton, donc sans aucune
 * étape enregistrée (trou constaté le 03/10/2026).
 *
 * `captureTrackingTokenFromUrl` est idempotente : elle mémorise le jeton s'il est
 * présent et nettoie l'URL, sinon ne fait rien.
 */
export default function SiteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  useEffect(() => {
    captureTrackingTokenFromUrl();
  }, []);

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
