"use client";

import Link from "next/link";
import { LanguageSwitcher } from "./language-switcher";
import { useI18n } from "@/lib/i18n";

/**
 * Pied de page commun — aucun lien vers l'admin : la porte n'est atteignable
 * que par son URL directe (https://arsenal-tools.pages.dev/admin).
 * Chantier B : trois liens discrets vers les pages légales (contenu éditable
 * depuis l'admin, lecture publique).
 * i18n vague 1 : copyright + liens légaux traduits, sélecteur de langue ajouté.
 * Les href restent les routes françaises (pas de routes /en).
 */
export function SiteFooter() {
  const { t } = useI18n();

  return (
    <footer className="border-t border-[#333] bg-[#0d0d0d] py-4">
      <div className="container-arsenal">
        <p className="mx-auto max-w-[70ch] text-center text-[0.8rem] text-[#666]">
          © 2026 <strong className="text-[#a0a0a0]">Arsenal Tools</strong> —{" "}
          {t("footer_copyright_part1")}
        </p>
        <p className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center font-mono text-[0.72rem]">
          <Link href="/confidentialite" className="text-[#666] hover:text-[#f0f0f0]">
            {t("footer_privacy")}
          </Link>
          <span aria-hidden="true" className="text-[#666]">
            ·
          </span>
          <Link href="/conditions" className="text-[#666] hover:text-[#f0f0f0]">
            {t("footer_terms")}
          </Link>
          <span aria-hidden="true" className="text-[#666]">
            ·
          </span>
          <Link href="/mentions-legales" className="text-[#666] hover:text-[#f0f0f0]">
            {t("footer_notice")}
          </Link>
          <span aria-hidden="true" className="text-[#666]">
            ·
          </span>
          <LanguageSwitcher />
        </p>
      </div>
    </footer>
  );
}
