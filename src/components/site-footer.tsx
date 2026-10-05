"use client";

import Link from "next/link";
import { LEGAL } from "@/lib/legal";
import { LEGAL_LINKS } from "@/components/legal-page";

/**
 * Pied de page — référence minimale + rangée de liens légaux (§21 de la spec
 * pages légales). La navigation générale vit dans le menu ☰ ; ici, uniquement
 * les documents légaux et la signature. Aucun lien vers l'admin.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-s1 py-6">
      <div className="container-arsenal flex flex-col items-center gap-3">
        <nav aria-label="Documents légaux">
          <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[0.78rem]">
            {LEGAL_LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="text-tx3 underline-offset-4 transition-colors hover:text-tx1 hover:underline"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className="text-center text-[0.8rem] text-tx3">
          © 2026 <strong className="font-semibold text-tx2">Arsenal Tools</strong> — Une
          plateforme indépendante créée par{" "}
          <strong className="font-semibold text-tx2">{LEGAL.editor}</strong>.
        </p>
      </div>
    </footer>
  );
}
