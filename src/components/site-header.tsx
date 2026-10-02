import Link from "next/link";
import { AffiliateLink } from "./account/affiliate-link";
import { BalancePill } from "./account/balance-pill";
import { BrandLogo } from "./brand-logo";

/**
 * En-tête commun — logo clé + marque + pill de solde A
 * (+ lien discret « Affilié » pour les sessions affilié/super affilié).
 * Aucun lien vers l'admin : la porte n'est atteignable que par son URL directe.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-[#333] bg-[rgba(10,10,10,0.92)]">
      <div className="container-arsenal flex items-center justify-between gap-3 py-2">
        <Link href="/" className="flex flex-shrink-0 items-center gap-2" aria-label="Arsenal Tools — retour à l'accueil">
          <BrandLogo size={34} />
          <span className="whitespace-nowrap text-[1.06rem] font-bold tracking-wide">
            Arsenal <span className="text-[#e63946]">Tools</span>
          </span>
        </Link>

        <div className="flex flex-shrink-0 items-center gap-1.5">
          <AffiliateLink />
          <BalancePill />
        </div>
      </div>
    </header>
  );
}
