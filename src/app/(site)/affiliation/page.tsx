"use client";

/**
 * /affiliation — page PUBLIQUE de présentation du programme d'affiliation.
 *
 * Elle explique le programme (comment ça marche, récompenses, limites, avantage
 * Super) — elle ne porte PAS la candidature : celle-ci reste dans /affilie.
 * Le bouton d'action s'adapte à la session (useUser) :
 *  • connecté non affilié → « Rejoindre le programme » (→ /affilie)
 *  • non connecté         → « Créer un compte » (→ /inscription) + « Se connecter »
 *  • affilié / super      → « Accéder à mon espace » (→ /affilie)
 *
 * Rejoindre le programme est un acte volontaire : rien n'est jamais présenté
 * comme obligatoire. Aucun montant n'est inventé ; les récompenses sont décrites
 * en principe (source : src/lib/server/affiliation.ts → AFFILIATE_SETTING_DEFAULTS).
 */

import Link from "next/link";
import { useUser } from "@/hooks/use-user";
import type { UserRole } from "@/lib/user-auth";

const AFFILIATE_ROLES: UserRole[] = ["affiliate", "super_affiliate"];

export default function AffiliationPage() {
  const { user, loading } = useUser();
  const isAffiliate = !!user && AFFILIATE_ROLES.includes(user.role);

  return (
    <div className="container-arsenal pb-16 pt-8 sm:pt-12">
      <div className="mx-auto w-full max-w-[720px]">
        <p className="font-mono text-[0.7rem] uppercase tracking-[0.14em] text-tx3">
          Programme d&apos;affiliation
        </p>
        <h1 className="mt-3 font-display text-[clamp(1.7rem,4vw,2.5rem)] font-bold leading-[1.15] tracking-tight">
          Gagnez des A en partageant les produits Arsenal
        </h1>
        <p className="mt-3 max-w-[62ch] leading-relaxed text-tx2">
          Recommandez les outils du catalogue avec un lien de suivi dédié : vous suivez vos clics,
          vos ventes et vos gains en temps réel. Rejoindre le programme est un choix libre —
          l&apos;inscription au site n&apos;y donne pas accès, et l&apos;affiliation n&apos;est
          jamais obligatoire.
        </p>

        {/* Action contextuelle */}
        <div className="mt-6 flex flex-wrap gap-3">
          {loading ? (
            <span className="h-[42px]" aria-hidden="true" />
          ) : isAffiliate ? (
            <Link href="/affilie" className="btn-arsenal btn-primary">
              Accéder à mon espace affilié
            </Link>
          ) : user ? (
            <Link href="/affilie" className="btn-arsenal btn-primary">
              Rejoindre le programme
            </Link>
          ) : (
            <>
              <Link href="/inscription" className="btn-arsenal btn-primary">
                Créer un compte
              </Link>
              <Link href="/connexion" className="btn-arsenal btn-ghost">
                Se connecter
              </Link>
            </>
          )}
        </div>

        {/* Comment ça marche */}
        <section className="mt-10">
          <h2 className="font-display text-[1.1rem] font-bold">Comment ça marche</h2>
          <ol className="mt-4 flex flex-col gap-3">
            {[
              {
                title: "Être membre",
                text: "Créez votre compte Arsenal, puis déposez votre candidature depuis votre espace. L'équipe l'examine et active vos liens.",
              },
              {
                title: "Partager un lien",
                text: "Pour chaque produit éligible, générez un lien de suivi dédié et partagez-le avec votre audience.",
              },
              {
                title: "Gagner des A et des commissions",
                text: "Chaque vente attribuée à votre lien vous rapporte une récompense en A et une commission, validées puis payées en toute transparence.",
              },
            ].map((step, i) => (
              <li
                key={step.title}
                className="flex gap-4 rounded-2xl border border-line bg-s1 p-5"
              >
                <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full border border-[rgba(42,157,143,0.45)] font-mono text-[0.85rem] font-bold text-teal2">
                  {i + 1}
                </span>
                <div>
                  <h3 className="text-[0.95rem] font-semibold text-tx1">{step.title}</h3>
                  <p className="mt-1 text-[0.86rem] leading-relaxed text-tx2">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Récompenses */}
        <section className="mt-8 rounded-2xl border border-line bg-s1 p-6">
          <h2 className="font-display text-[1.1rem] font-bold">Vos récompenses</h2>
          <p className="mt-2 text-[0.86rem] leading-relaxed text-tx2">
            À chaque vente attribuée à votre lien, vous recevez une <strong className="text-gold">récompense en A</strong>{" "}
            (la monnaie interne d&apos;Arsenal) et une <strong className="text-tx1">commission</strong> sur
            la vente. Le montant exact dépend du produit et des réglages du programme — il est toujours
            affiché sur la fiche de chaque produit éligible avant de générer votre lien.
          </p>
          <ul className="mt-4 flex flex-col gap-2.5 border-t border-dashed border-line pt-4">
            {[
              "Clics, ventes et conversion suivis en temps réel.",
              "Récompenses A créditées sur votre solde.",
              "Commissions validées par l'équipe puis payées — en toute transparence.",
            ].map((line) => (
              <li key={line} className="flex gap-2.5 text-[0.84rem] leading-relaxed text-tx2">
                <svg
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  aria-hidden="true"
                  className="mt-1 flex-shrink-0 text-teal"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                {line}
              </li>
            ))}
          </ul>
        </section>

        {/* Limites — affichées noir sur blanc */}
        <section className="mt-8 rounded-2xl border border-line bg-s1 p-6">
          <h2 className="font-display text-[1.1rem] font-bold">Les limites, sans surprise</h2>
          <p className="mt-2 text-[0.86rem] leading-relaxed text-tx2">
            Pour garder le programme équitable, un compte affilié standard est encadré :
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-panel p-4">
              <p className="font-mono text-[1.4rem] font-bold leading-none text-tx1">3</p>
              <p className="mt-1.5 text-[0.82rem] text-tx2">
                liens actifs maximum en même temps.
              </p>
            </div>
            <div className="rounded-xl border border-line bg-panel p-4">
              <p className="font-mono text-[1.4rem] font-bold leading-none text-tx1">20</p>
              <p className="mt-1.5 text-[0.82rem] text-tx2">
                ventes maximum par lien : un lien saturé est désactivé automatiquement et libère sa place.
              </p>
            </div>
          </div>
        </section>

        {/* Avantage Super */}
        <section className="mt-8 rounded-2xl border border-[rgba(42,157,143,0.35)] bg-[rgba(42,157,143,0.06)] p-6">
          <span className="inline-flex items-center gap-2 rounded-md border border-[rgba(42,157,143,0.45)] bg-[rgba(42,157,143,0.1)] px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-wide text-teal2">
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            Super affilié
          </span>
          <h2 className="mt-4 font-display text-[1.1rem] font-bold">Et pour aller plus loin</h2>
          <p className="mt-2 text-[0.86rem] leading-relaxed text-tx2">
            Une fois les critères de performance atteints, vous pouvez demander le statut Super
            affilié — validé par l&apos;équipe. Il lève les plafonds et ouvre des possibilités
            supplémentaires :
          </p>
          <ul className="mt-4 flex flex-col gap-2.5 border-t border-dashed border-[rgba(42,157,143,0.3)] pt-4">
            {[
              "Aucun plafond de liens actifs.",
              "Possibilité de demander à rendre un produit éligible à l'affiliation.",
              "Affiliation cumulée sur plusieurs produits.",
            ].map((line) => (
              <li key={line} className="flex gap-2.5 text-[0.84rem] leading-relaxed text-tx2">
                <svg
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  aria-hidden="true"
                  className="mt-1 flex-shrink-0 text-teal2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                {line}
              </li>
            ))}
          </ul>
        </section>

        {/* Rappel d'action en bas de page */}
        {!loading && !user && (
          <div className="mt-8 flex flex-wrap gap-3 border-t border-dashed border-line pt-8">
            <Link href="/inscription" className="btn-arsenal btn-primary">
              Créer un compte
            </Link>
            <Link href="/connexion" className="btn-arsenal btn-ghost">
              Se connecter
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
