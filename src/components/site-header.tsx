import Link from "next/link";
import { BrandLogo } from "./brand-logo";

/**
 * En-tête commun — logo clé + marque + accès admin discret
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

        <Link
          href="/admin"
          className="flex h-[38px] w-[38px] items-center justify-center rounded-xl border border-transparent text-[#666] transition-colors hover:border-[#333] hover:bg-[#1a1a1a] hover:text-[#f0f0f0]"
          title="Espace administrateur"
          aria-label="Espace administrateur"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
        </Link>
      </div>
    </header>
  );
}
