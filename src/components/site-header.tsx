"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BalancePill } from "./account/balance-pill";
import { BrandLogo } from "./brand-logo";
import { SiteDrawer } from "./site-drawer";
import { useI18n } from "@/lib/i18n";

/**
 * En-tête public (refonte 05/10) — navigation principale minimale :
 *   Logo · Accueil · Catalogue · Feed · [☰ Menu] · pill compte.
 *
 * Le lien « Affilié » de l'ancien header a été rangé dans le menu (section
 * Compte) : l'en-tête ne montre que les trois portes du site + le compte.
 * Aucun lien vers l'admin : la porte n'est atteignable que par son URL directe.
 */

const NAV_ITEMS = [
  { href: "/", key: "nav_home", exact: true },
  { href: "/catalogue/", key: "nav_catalog", exact: false },
  { href: "/feed/", key: "nav_feed", exact: false },
] as const;

export function SiteHeader() {
  const { t } = useI18n();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // Fermeture du menu à chaque navigation (un clic sur un lien du drawer
  // change le pathname → le drawer se referme tout seul).
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-line bg-[var(--header-bg)] backdrop-blur-sm">
        <div className="container-arsenal flex items-center justify-between gap-3 py-2">
          <Link
            href="/"
            className="flex flex-shrink-0 items-center gap-2"
            aria-label={t("header_home_aria")}
          >
            <BrandLogo size={34} />
            <span className="whitespace-nowrap text-[1.06rem] font-bold tracking-wide text-tx1">
              Arsenal <span className="text-[#e63946]">Tools</span>
            </span>
          </Link>

          {/* Navigation principale — desktop uniquement (mobile : rangée sous le logo) */}
          <nav aria-label={t("nav_aria")} className="hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => {
              const active = item.exact
                ? pathname === "/"
                : pathname.startsWith(item.href.replace(/\/$/, ""));
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-lg px-3 py-1.5 text-[0.9rem] font-semibold transition-colors ${
                    active
                      ? "text-tx1 underline decoration-[#e63946] decoration-2 underline-offset-[6px]"
                      : "text-tx2 hover:bg-panel hover:text-tx1"
                  }`}
                >
                  {t(item.key)}
                </Link>
              );
            })}
          </nav>

          <div className="flex flex-shrink-0 items-center gap-1.5">
            <BalancePill />
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label={t("menu_open_aria")}
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
              className="grid h-[38px] w-[38px] place-items-center rounded-xl border border-line bg-s1 text-tx2 transition-colors hover:border-line2 hover:text-tx1"
            >
              <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
                <path
                  d="M4 7h16M4 12h16M4 17h16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Navigation mobile — les trois portes, toujours visibles (spec §17) */}
        <nav
          aria-label={t("nav_aria")}
          className="container-arsenal flex items-center gap-1 border-t border-line py-1.5 md:hidden"
        >
          {NAV_ITEMS.map((item) => {
            const active = item.exact
              ? pathname === "/"
              : pathname.startsWith(item.href.replace(/\/$/, ""));
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex-1 rounded-lg px-3 py-1.5 text-center text-[0.86rem] font-semibold transition-colors ${
                  active
                    ? "bg-panel text-tx1 underline decoration-[#e63946] decoration-2 underline-offset-4"
                    : "text-tx2 hover:bg-panel hover:text-tx1"
                }`}
              >
                {t(item.key)}
              </Link>
            );
          })}
        </nav>
      </header>

      <SiteDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}
