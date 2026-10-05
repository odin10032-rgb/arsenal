"use client";

/**
 * Coquille commune des pages légales — hiérarchie sobre et cohérente :
 * titre, date de mise à jour, sommaire de lecture, contenu, liens croisés
 * entre les documents, et rappel de contact.
 *
 * Le contenu est fourni en JSX par chaque page (structure, listes, encadrés) —
 * jamais de faux texte juridique générique : les informations non connues sont
 * affichées « [À COMPLÉTER] » bien en évidence.
 */

import Link from "next/link";
import { LEGAL } from "@/lib/legal";

export interface LegalSection {
  id: string;
  title: string;
  body: React.ReactNode;
}

/** Navigation croisée entre les documents légaux (mêmes liens que le footer). */
export const LEGAL_LINKS: { href: string; label: string }[] = [
  { href: "/mentions-legales/", label: "Mentions légales" },
  { href: "/confidentialite/", label: "Confidentialité" },
  { href: "/cookies/", label: "Cookies" },
  { href: "/conditions/", label: "Conditions d'utilisation" },
  { href: "/conditions-vente/", label: "Conditions de vente" },
  { href: "/conditions-affiliation/", label: "Conditions d'affiliation" },
  { href: "/contact/", label: "Contact" },
];

export function LegalPage({
  title,
  lead,
  sections,
  currentPath,
}: {
  title: string;
  lead?: string;
  sections: LegalSection[];
  /** Chemin courant — exclu des « autres documents ». */
  currentPath: string;
}) {
  const others = LEGAL_LINKS.filter((l) => l.href !== currentPath);
  return (
    <article className="container-arsenal max-w-3xl pb-16 pt-8">
      <nav className="mb-5" aria-label="Retour">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 font-mono text-[0.78rem] text-tx3 hover:text-tx1"
        >
          <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Retour à l&apos;accueil
        </Link>
      </nav>

      <header>
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-tx3">
          Informations légales
        </p>
        <h1 className="mt-2 font-display text-[clamp(1.5rem,3.4vw,2.1rem)] font-bold leading-tight tracking-tight">
          {title}
        </h1>
        <p className="mt-2 font-mono text-[0.72rem] uppercase tracking-[0.1em] text-tx3">
          Dernière mise à jour : {LEGAL.updatedAt}
        </p>
        {lead && <p className="mt-4 leading-relaxed text-tx2">{lead}</p>}
      </header>

      {/* Sommaire — lecture directe, ancres stables */}
      {sections.length > 2 && (
        <nav
          className="mt-7 rounded-xl border border-line bg-s1 p-4"
          aria-label="Sommaire"
        >
          <p className="font-mono text-[0.66rem] uppercase tracking-[0.14em] text-tx3">
            Sommaire
          </p>
          <ol className="mt-2 flex flex-col gap-1.5 text-[0.86rem]">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-tx2 underline-offset-4 hover:text-tx1 hover:underline">
                  {i + 1}. {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}

      <div className="mt-8 flex flex-col gap-9">
        {sections.map((s, i) => (
          <section key={s.id} id={s.id} className="scroll-mt-24">
            <h2 className="font-display text-[1.05rem] font-bold">
              {i + 1}. {s.title}
            </h2>
            <div className="mt-3 flex flex-col gap-3 text-[0.92rem] leading-[1.75] text-tx2">
              {s.body}
            </div>
          </section>
        ))}
      </div>

      <footer className="mt-12 border-t border-line pt-6">
        <p className="text-[0.86rem] text-tx2">
          Une question sur ce document ?{" "}
          <a
            href={`mailto:${LEGAL.siteEmail}`}
            className="text-teal underline-offset-4 hover:underline"
          >
            {LEGAL.siteEmail}
          </a>
        </p>
        <p className="mt-4 font-mono text-[0.68rem] uppercase tracking-[0.14em] text-tx3">
          Autres documents
        </p>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-[0.84rem]">
          {others.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="text-tx2 underline-offset-4 hover:text-tx1 hover:underline">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-[0.8rem] text-tx3">
          {LEGAL.siteName} est une plateforme indépendante créée et exploitée par{" "}
          <strong className="font-semibold text-tx2">{LEGAL.editor}</strong> — elle
          n&apos;est pas une société.
        </p>
      </footer>
    </article>
  );
}

/** Encadré d'information (placeholders à compléter, précisions importantes). */
export function LegalNote({
  children,
  tone = "info",
}: {
  children: React.ReactNode;
  tone?: "info" | "todo";
}) {
  const classes =
    tone === "todo"
      ? "border-[rgba(244,162,97,0.4)] bg-[rgba(244,162,97,0.07)] text-warn"
      : "border-line bg-panel text-tx2";
  return (
    <p className={`rounded-lg border px-4 py-3 text-[0.86rem] leading-relaxed ${classes}`}>
      {children}
    </p>
  );
}

/** Liste simple (puces) — style uniforme sur toutes les pages légales. */
export function LegalList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="ml-1 flex list-disc flex-col gap-1.5 pl-4">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}
