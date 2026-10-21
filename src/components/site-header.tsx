"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BalancePill } from "./account/balance-pill";
import { BrandLogo } from "./brand-logo";
import { SiteDrawer } from "./site-drawer";
import { useI18n } from "@/lib/i18n";

/**
 * En-tête public (refonte 21/10) — identité et compte uniquement :
 *   Logo · pill compte · [☰ Menu].
 *
 * Les trois portes du site (Accueil, Catalogue, Feed) ont été déplacées dans
 * la barre de navigation basse (`SiteBottomNav`) ; le header ne les duplique
 * plus. Aucun lien vers l'admin : la porte n'est atteignable que par son URL
 * directe.
 */

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
      </header>

      <SiteDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}
