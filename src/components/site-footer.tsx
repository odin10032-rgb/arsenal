import Link from "next/link";

/**
 * Pied de page commun
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-[#333] bg-[#0d0d0d] py-4">
      <div className="container-arsenal flex flex-wrap items-center justify-between gap-3">
        <p className="text-[0.8rem] text-[#666]">
          © 2026 <strong className="text-[#a0a0a0]">Arsenal Tools</strong> — Forge ouverte aux
          créateurs digitaux.
        </p>
        <nav aria-label="Liens discrets">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 rounded-lg border border-transparent px-3 py-1.5 font-mono text-[0.74rem] text-[#666] transition-colors hover:border-[#333] hover:bg-[#1a1a1a] hover:text-[#f0808a]"
          >
            <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
              <rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
            Espace administrateur
          </Link>
        </nav>
      </div>
    </footer>
  );
}
