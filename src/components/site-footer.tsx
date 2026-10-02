/**
 * Pied de page commun — aucun lien vers l'admin : la porte n'est atteignable
 * que par son URL directe (https://arsenal-tools.pages.dev/admin).
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-[#333] bg-[#0d0d0d] py-4">
      <div className="container-arsenal">
        <p className="mx-auto max-w-[70ch] text-center text-[0.8rem] text-[#666]">
          © 2026 <strong className="text-[#a0a0a0]">Arsenal Tools</strong> — Forge ouverte aux
          créateurs digitaux.
        </p>
      </div>
    </footer>
  );
}
