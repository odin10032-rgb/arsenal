"use client";

import { useI18n } from "@/lib/i18n";

/**
 * Pied de page minimal (refonte 05/10, spec §10) — la navigation secondaire
 * (langue, pages légales) vit dans le menu ☰ ; le footer ne garde que la
 * référence minimale : copyright + signature. Aucun lien vers l'admin.
 */
export function SiteFooter() {
  const { t } = useI18n();

  return (
    <footer className="border-t border-line bg-s1 py-5">
      <div className="container-arsenal">
        <p className="text-center text-[0.8rem] text-tx3">
          © 2026 <strong className="font-semibold text-tx2">Arsenal Tools</strong> —{" "}
          {t("footer_copyright_part1")}
        </p>
      </div>
    </footer>
  );
}
