"use client";

/**
 * Navigation entre les sections de l'espace affilié.
 *
 * Quatre onglets sobres (même langage visuel que le dashboard admin : rôle
 * `tab`, soulignement de l'actif, scroll horizontal sur mobile) :
 *  • Vue d'ensemble → /affilie            (tableau de bord de l'affiliation)
 *  • Mes liens      → /affilie/produits   (produits éligibles + liens de suivi)
 *  • Portefeuille   → /compte/portefeuille (solde A + historique — page partagée)
 *  • Mes produits   → /compte/produits     (produits achetés en A — page partagée)
 *
 * ⚠️ Les deux derniers onglets SORTENT de l'espace affilié (`/affilie/*`) : ce
 * sont les pages partagées de l'espace utilisateur. C'est assumé : le portefeuille
 * et les produits achetés ne sont pas propres à l'affiliation (tout membre les
 * possède), les dupliquer sous /affilie créerait deux vues à maintenir. On y
 * accède donc depuis la nav pour éviter à l'affilié de repasser par /compte.
 *
 * Composant purement présentationnel : l'onglet actif est fourni par l'appelant
 * (les liens sont des `next/link`, la navigation reste côté client).
 */

import Link from "next/link";

export type AffiliateNavTab = "overview" | "links" | "wallet" | "products";

interface NavItem {
  id: AffiliateNavTab;
  href: string;
  label: string;
  /** L'onglet mène hors de /affilie (page partagée de l'espace utilisateur). */
  external: boolean;
}

const TABS: NavItem[] = [
  { id: "overview", href: "/affilie", label: "Vue d'ensemble", external: false },
  { id: "links", href: "/affilie/produits", label: "Mes liens", external: false },
  { id: "wallet", href: "/compte/portefeuille", label: "Portefeuille", external: true },
  { id: "products", href: "/compte/produits", label: "Mes produits", external: true },
];

export function AffiliateNav({ active }: { active: AffiliateNavTab }) {
  return (
    <nav
      className="mt-5 flex gap-1 overflow-x-auto border-b border-[#333]"
      aria-label="Sections de l'espace affilié"
    >
      {TABS.map((t) => {
        const isActive = t.id === active;
        return (
          <Link
            key={t.id}
            href={t.href}
            role="tab"
            aria-selected={isActive}
            title={t.external ? "Page de votre compte utilisateur" : undefined}
            className={`relative inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-[0.84rem] font-semibold transition-colors ${
              isActive
                ? "border-[#e63946] text-[#4fb3a1]"
                : "border-transparent text-[#666] hover:text-[#a0a0a0]"
            }`}
          >
            {t.label}
            {t.external && (
              <svg
                viewBox="0 0 24 24"
                width="11"
                height="11"
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="opacity-70"
              >
                <path d="M7 17 17 7M8 7h9v9" />
              </svg>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
