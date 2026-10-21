"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";

/**
 * Barre de navigation principale — fixée en bas de l'écran (refonte 21/10).
 *
 * Les trois portes du site (Accueil, Catalogue, Feed) vivaient dans le header ;
 * elles sont désormais regroupées dans une barre basse persistante, façon
 * application mobile. Le header ne garde que l'identité, le solde et le menu ☰.
 */

const NAV_ITEMS = [
  {
    href: "/",
    key: "nav_home",
    exact: true,
    // Maison
    path: "M3 10.5 12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5",
  },
  {
    href: "/catalogue/",
    key: "nav_catalog",
    exact: false,
    // Grille de quatre cases
    path: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  },
  {
    href: "/feed/",
    key: "nav_feed",
    exact: false,
    // Lignes éditoriales
    path: "M4 6h16M4 12h10M4 18h7",
  },
] as const;

export function SiteBottomNav() {
  const { t } = useI18n();
  const pathname = usePathname();

  return (
    <nav
      aria-label={t("nav_aria")}
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-[var(--header-bg)] backdrop-blur-sm"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="container-arsenal flex items-stretch">
        {NAV_ITEMS.map((item) => {
          const active = item.exact
            ? pathname === "/"
            : pathname.startsWith(item.href.replace(/\/$/, ""));
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`relative flex h-[58px] flex-1 flex-col items-center justify-center gap-1 text-[0.72rem] font-semibold transition-colors ${
                active ? "text-brand" : "text-tx2 hover:text-tx1"
              }`}
            >
              {active && (
                <span
                  className="absolute inset-x-0 top-0 mx-auto h-0.5 w-8 rounded-b bg-brand"
                  aria-hidden="true"
                />
              )}
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path
                  d={item.path}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>{t(item.key)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
