"use client";

/**
 * /affiliation — page PUBLIQUE de présentation du programme d'affiliation.
 *
 * Narration (refonte du 05/10) : le visiteur doit comprendre en quelques
 * secondes qu'il peut recommander un produit, et toucher une COMMISSION EN
 * ARGENT RÉEL quand une vente passe par son lien.
 *
 * ⚠️ AUCUNE mention de la monnaie interne du site sur cette page : elle est
 * une mécanique interne distincte du programme, expliquée ailleurs, dans son
 * contexte. Ici : uniquement le programme et les commissions réelles.
 *
 * Les chiffres affichés sont les valeurs RÉELLES du système (taux par défaut,
 * exemples calculés sur de vrais produits du catalogue). Rien n'est inventé,
 * aucun revenu n'est promis.
 *
 * Le bouton d'action s'adapte à la session (useUser) :
 *  • connecté non affilié → « Devenir affilié » (→ /affilie)
 *  • non connecté         → « Créer un compte » (→ /inscription)
 *  • affilié / super      → « Accéder à mon espace » (→ /affilie)
 */

import Link from "next/link";
import { useUser } from "@/hooks/use-user";
import type { UserRole } from "@/lib/user-auth";

const AFFILIATE_ROLES: UserRole[] = ["affiliate", "super_affiliate"];

/** Exemples RÉELS de calcul — produits et taux effectivement en catalogue. */
const COMMISSION_EXAMPLES = [
  { product: "Crée ton site web avec GLM 5.3", price: "4 000 FCFA", rate: "30 %", earn: "1 200 FCFA" },
  { product: "PRODUIT PHYSIQUE OU DIGITAL ? LE BON CHOIX", price: "1 500 FCFA", rate: "40 %", earn: "600 FCFA" },
  { product: "100 techniques infaillibles pour transformer les prospects", price: "3 000 FCFA", rate: "20 %", earn: "600 FCFA" },
];

const STEPS = [
  {
    n: "01",
    title: "Choisissez",
    text: "Trouvez un produit Arsenal Tools que vous souhaitez recommander.",
  },
  {
    n: "02",
    title: "Partagez",
    text: "Utilisez votre lien affilié personnel et partagez-le avec votre audience.",
  },
  {
    n: "03",
    title: "Générez une vente",
    text: "Lorsqu'une personne achète via votre lien, la vente est attribuée à votre compte.",
  },
  {
    n: "04",
    title: "Recevez votre commission",
    text: "Vous recevez une commission en argent réel sur la vente.",
  },
];

const BENEFITS = [
  {
    icon: "💰",
    title: "Gagnez sur vos ventes",
    text: "Chaque vente attribuée à votre lien peut générer une commission.",
  },
  {
    icon: "🔗",
    title: "Vos liens personnels",
    text: "Partagez des liens de suivi qui attribuent les ventes à votre compte.",
  },
  {
    icon: "📊",
    title: "Suivez vos performances",
    text: "Suivez vos clics, vos ventes et vos commissions depuis votre espace affilié.",
  },
  {
    icon: "🛒",
    title: "Un catalogue à recommander",
    text: "Choisissez parmi les produits Arsenal Tools ceux qui correspondent à votre audience.",
  },
  {
    icon: "🚀",
    title: "Concentrez-vous sur la recommandation",
    text: "Vous n'avez pas à créer le produit vous-même : vous recommandez des produits existants.",
  },
];

const AUDIENCE = [
  "créateurs de contenu",
  "entrepreneurs",
  "développeurs",
  "administrateurs de communautés",
  "personnes disposant d'une audience",
  "toute personne capable de faire des recommandations pertinentes",
];

const FAQ = [
  {
    q: "Combien puis-je gagner ?",
    a: "Vos revenus dépendent du nombre de ventes réellement générées par vos liens, du prix des produits et du taux de commission applicable. Aucun montant n'est garanti.",
  },
  {
    q: "Comment une vente est-elle attribuée à mon compte ?",
    a: "Chaque affilié dispose de liens de suivi personnels. Quand un visiteur arrive via votre lien, un identifiant de suivi anonyme relie l'achat à votre compte. La règle appliquée est le dernier lien cliqué (dans une fenêtre de 30 jours).",
  },
  {
    q: "Quand suis-je payé ?",
    a: "Une commission suit un cycle : enregistrée, puis validée après confirmation de la vente, puis payable. Arsenal Tools effectue les paiements de commissions manuellement, après vérification des ventes.",
  },
  {
    q: "Dois-je avoir une grosse audience ?",
    a: "Pas nécessairement. La pertinence de vos recommandations compte davantage que la taille de votre audience : une recommandation juste à la bonne personne peut générer une vente.",
  },
  {
    q: "Puis-je promouvoir plusieurs produits ?",
    a: "Oui. Vous pouvez avoir 3 liens actifs en même temps (les liens liés à une campagne rejointe ne comptent pas dans ce plafond), et chaque lien est limité à 20 ventes attribuées — au-delà il est désactivé automatiquement et remplaçable.",
  },
  {
    q: "Comment devenir affilié ?",
    a: "Créez votre compte Arsenal Tools, puis déposez votre candidature depuis l'espace affilié. Elle est examinée et validée par Arsenal Tools — vous êtes prévenu dans votre espace.",
  },
  {
    q: "Qu'est-ce qu'un Super Affilié ?",
    a: "C'est un statut qui récompense la performance : à partir de 10 ventes attribuées et 100 clics, vos liens ne sont plus plafonnés et vous accédez aux campagnes ainsi qu'aux demandes de mise en affiliation de produits.",
  },
  {
    q: "Est-ce que devenir affilié est payant ?",
    a: "Non. La participation au programme est entièrement gratuite.",
  },
  {
    q: "Les revenus sont-ils garantis ?",
    a: "Non. Les commissions dépendent uniquement des ventes réellement générées grâce à vos liens.",
  },
  {
    q: "Puis-je partager mes liens sur les réseaux sociaux ?",
    a: "Oui, sur les canaux que vous maîtrisez et dans le respect des règles du programme : pas de spam (des limites quotidiennes de partage s'appliquent), pas de fausses promesses, pas de manipulation du suivi. L'auto-achat via son propre lien est interdit.",
  },
];

export default function AffiliationPage() {
  const { user, loading } = useUser();
  const isAffiliate = !!user && AFFILIATE_ROLES.includes(user.role);

  return (
    <div className="container-arsenal max-w-3xl pb-16 pt-8 sm:pt-12">
      {/* ---------- Hero ---------- */}
      <p className="font-mono text-[0.7rem] uppercase tracking-[0.2em] text-tx3">
        Programme d&apos;affiliation
      </p>
      <h1 className="mt-3 font-display text-[clamp(1.7rem,4vw,2.5rem)] font-bold leading-[1.15] tracking-tight">
        Gagnez de l&apos;argent en recommandant les produits Arsenal Tools.
      </h1>
      <p className="mt-3 max-w-[62ch] leading-relaxed text-tx2">
        Partagez les produits que vous aimez avec votre audience. Lorsqu&apos;une
        personne achète via votre lien affilié, vous recevez une commission.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        {loading ? (
          <span className="h-[42px]" aria-hidden="true" />
        ) : isAffiliate ? (
          <Link href="/affilie" className="btn-arsenal btn-primary">
            Accéder à mon espace affilié
          </Link>
        ) : user ? (
          <Link href="/affilie" className="btn-arsenal btn-primary">
            Devenir affilié
          </Link>
        ) : (
          <>
            <Link href="/inscription" className="btn-arsenal btn-primary">
              Devenir affilié
            </Link>
            <Link href="/connexion" className="btn-arsenal btn-ghost">
              Se connecter
            </Link>
          </>
        )}
        <a href="#comment-ca-marche" className="btn-arsenal btn-ghost">
          Comment ça marche ?
        </a>
      </div>

      {/* ---------- Comment ça marche ---------- */}
      <section id="comment-ca-marche" className="mt-12 scroll-mt-24">
        <h2 className="font-display text-[1.3rem] font-bold">Comment ça marche</h2>
        <ol className="mt-5 flex flex-col gap-3">
          {STEPS.map((s) => (
            <li
              key={s.n}
              className="flex items-start gap-4 rounded-2xl border border-line bg-s1 p-4 sm:p-5"
            >
              <span className="font-display text-[1.5rem] font-bold leading-none text-brand">
                {s.n}
              </span>
              <div>
                <h3 className="font-display text-[1rem] font-bold">{s.title}</h3>
                <p className="mt-1 text-[0.88rem] leading-relaxed text-tx2">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
        {/* La chaîne, en une ligne */}
        <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-line bg-panel px-4 py-3 font-mono text-[0.78rem] text-tx2">
          <span className="text-tx1">Produit</span>
          <span aria-hidden="true" className="text-tx3">→</span>
          <span className="text-tx1">Lien</span>
          <span aria-hidden="true" className="text-tx3">→</span>
          <span className="text-tx1">Vente</span>
          <span aria-hidden="true" className="text-tx3">→</span>
          <span className="font-semibold text-teal">Commission</span>
        </p>
      </section>

      {/* ---------- Commissions ---------- */}
      <section id="commissions" className="mt-12 scroll-mt-24">
        <h2 className="font-display text-[1.3rem] font-bold">Les commissions</h2>
        <p className="mt-3 leading-relaxed text-tx2">
          Le taux de commission est affiché sur la fiche de chaque produit. Le taux par
          défaut du programme est de <strong className="text-tx1">30 %</strong> du prix de
          vente ; certains produits appliquent un taux spécifique, et des campagnes
          temporaires peuvent le renforcer.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {COMMISSION_EXAMPLES.map((e) => (
            <div key={e.product} className="flex flex-col rounded-2xl border border-line bg-s1 p-4">
              <p className="line-clamp-2 min-h-[2.6em] text-[0.82rem] font-semibold leading-snug">
                {e.product}
              </p>
              <p className="mt-2 font-mono text-[0.74rem] text-tx3">
                Produit à {e.price} · commission {e.rate}
              </p>
              <p className="mt-2 font-display text-[1.15rem] font-bold text-teal">
                Vous gagnez {e.earn}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[0.78rem] text-tx3">
          Exemples calculés sur des produits réellement au catalogue, au taux affiché sur
          leur fiche. Vos gains réels dépendent des ventes effectivement générées.
        </p>

        <div className="mt-5 rounded-2xl border border-line bg-s1 p-4 sm:p-5">
          <h3 className="font-display text-[0.95rem] font-bold">
            Le cycle d&apos;une commission
          </h3>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[0.76rem] text-tx2">
            <span className="text-tx1">Vente confirmée</span>
            <span aria-hidden="true" className="text-tx3">→</span>
            <span className="text-tx1">Commission validée</span>
            <span aria-hidden="true" className="text-tx3">→</span>
            <span className="text-tx1">Payable</span>
            <span aria-hidden="true" className="text-tx3">→</span>
            <span className="font-semibold text-teal">Payée</span>
          </p>
          <p className="mt-2 text-[0.84rem] leading-relaxed text-tx2">
            Les commissions validées sont payées par Arsenal Tools après vérification des
            ventes. Une vente annulée ou remboursée entraîne l&apos;annulation de la
            commission associée.
          </p>
        </div>
      </section>

      {/* ---------- Argent réel ---------- */}
      <section id="argent-reel" className="mt-12 scroll-mt-24">
        <h2 className="font-display text-[1.3rem] font-bold">
          Vos ventes génèrent de vraies commissions
        </h2>
        <p className="mt-3 leading-relaxed text-tx2">
          Lorsqu&apos;une vente est réalisée grâce à votre lien affilié, vous recevez une
          commission en argent réel. Ce que vous gagnez correspond à des ventes
          réellement passées, pas à des mécanismes internes.
        </p>
        <p className="mt-3 text-[0.84rem] leading-relaxed text-tx3">
          Aucun revenu n&apos;est garanti : vos gains dépendent uniquement des ventes
          générées par vos recommandations.
        </p>
      </section>

      {/* ---------- Suivi des performances ---------- */}
      <section id="suivi" className="mt-12 scroll-mt-24">
        <h2 className="font-display text-[1.3rem] font-bold">Suivez vos performances</h2>
        <p className="mt-3 leading-relaxed text-tx2">
          Votre espace affilié affiche les statistiques réelles de votre activité :
        </p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {["clics sur vos liens", "ventes attribuées", "taux de conversion", "commissions et historique"].map(
            (item) => (
              <li
                key={item}
                className="rounded-xl border border-line bg-s1 px-4 py-2.5 text-[0.88rem] text-tx2"
              >
                {item}
              </li>
            )
          )}
        </ul>
      </section>

      {/* ---------- Avantages ---------- */}
      <section id="avantages" className="mt-12 scroll-mt-24">
        <h2 className="font-display text-[1.3rem] font-bold">Pourquoi rejoindre</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {BENEFITS.map((b) => (
            <div key={b.title} className="rounded-2xl border border-line bg-s1 p-4">
              <p className="text-[1.2rem]" aria-hidden="true">
                {b.icon}
              </p>
              <h3 className="mt-2 font-display text-[0.98rem] font-bold">{b.title}</h3>
              <p className="mt-1 text-[0.85rem] leading-relaxed text-tx2">{b.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Produits à recommander ---------- */}
      <section id="produits" className="mt-12 scroll-mt-24">
        <h2 className="font-display text-[1.3rem] font-bold">Produits à recommander</h2>
        <p className="mt-3 leading-relaxed text-tx2">
          Choisissez les produits qui correspondent le mieux à votre audience et
          recommandez-les avec votre lien affilié. Le catalogue est organisé en
          catégories :
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {["SaaS", "Applications desktop", "Applications mobiles / PWA", "E-books", "Prompts & Automations"].map(
            (c) => (
              <li
                key={c}
                className="rounded-full border border-line bg-panel px-3.5 py-1.5 text-[0.84rem] text-tx2"
              >
                {c}
              </li>
            )
          )}
        </ul>
        <p className="mt-3 text-[0.86rem] leading-relaxed text-tx2">
          Vous pouvez promouvoir jusqu&apos;à 3 produits à la fois (20 ventes par lien,
          renouvelables), et davantage en participant aux campagnes.{" "}
          <Link href="/catalogue/" className="text-teal underline-offset-4 hover:underline">
            Parcourir le catalogue
          </Link>
          .
        </p>
      </section>

      {/* ---------- Super Affilié ---------- */}
      <section id="super" className="mt-12 scroll-mt-24">
        <h2 className="font-display text-[1.3rem] font-bold">Le statut Super Affilié</h2>
        <p className="mt-3 leading-relaxed text-tx2">
          Une progression basée sur votre performance réelle : à partir de{" "}
          <strong className="text-tx1">10 ventes attribuées et 100 clics</strong>, le
          statut Super Affilié vous ouvre :
        </p>
        <ul className="mt-3 flex flex-col gap-2">
          {[
            "vos liens actifs ne sont plus plafonnés ;",
            "accès aux campagnes et à leurs conditions renforcées ;",
            "possibilité de demander la mise en affiliation d'un produit qui ne l'est pas encore.",
          ].map((item) => (
            <li
              key={item}
              className="rounded-xl border border-line bg-s1 px-4 py-2.5 text-[0.88rem] text-tx2"
            >
              {item}
            </li>
          ))}
        </ul>
      </section>

      {/* ---------- Pour qui ---------- */}
      <section id="pour-qui" className="mt-12 scroll-mt-24">
        <h2 className="font-display text-[1.3rem] font-bold">Pour qui ?</h2>
        <p className="mt-3 leading-relaxed text-tx2">
          Le programme peut convenir notamment aux :
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {AUDIENCE.map((a) => (
            <li
              key={a}
              className="rounded-full border border-line bg-panel px-3.5 py-1.5 text-[0.84rem] text-tx2"
            >
              {a}
            </li>
          ))}
        </ul>
      </section>

      {/* ---------- FAQ ---------- */}
      <section id="faq" className="mt-12 scroll-mt-24">
        <h2 className="font-display text-[1.3rem] font-bold">Questions fréquentes</h2>
        <div className="mt-5 flex flex-col gap-2.5">
          {FAQ.map((item) => (
            <details
              key={item.q}
              className="group rounded-2xl border border-line bg-s1 px-4 py-3.5 open:border-line2"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-display text-[0.95rem] font-semibold [&::-webkit-details-marker]:hidden">
                {item.q}
                <span
                  aria-hidden="true"
                  className="flex-shrink-0 text-tx3 transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-2.5 text-[0.88rem] leading-relaxed text-tx2">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ---------- CTA final ---------- */}
      <section className="mt-12 rounded-2xl border border-line bg-s1 p-6 text-center sm:p-8">
        <h2 className="font-display text-[1.25rem] font-bold">Prêt à commencer ?</h2>
        <p className="mx-auto mt-2 max-w-[52ch] text-[0.9rem] leading-relaxed text-tx2">
          Recommandez les produits Arsenal Tools et transformez vos recommandations en
          commissions.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          {isAffiliate ? (
            <Link href="/affilie" className="btn-arsenal btn-primary">
              Accéder à mon espace affilié
            </Link>
          ) : user ? (
            <Link href="/affilie" className="btn-arsenal btn-primary">
              Devenir affilié
            </Link>
          ) : (
            <Link href="/inscription" className="btn-arsenal btn-primary">
              Devenir affilié
            </Link>
          )}
        </div>
        <p className="mt-4 text-[0.78rem] text-tx3">
          Participation gratuite. Règles détaillées dans les{" "}
          <Link href="/conditions-affiliation/" className="text-teal underline-offset-4 hover:underline">
            conditions du programme d&apos;affiliation
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
