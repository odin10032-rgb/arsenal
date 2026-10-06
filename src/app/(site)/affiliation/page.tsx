"use client";

/**
 * /affiliation — page PUBLIQUE de présentation du programme d'affiliation.
 *
 * Narration : le visiteur comprend en quelques secondes qu'il peut recommander
 * un produit et toucher une COMMISSION EN ARGENT RÉEL quand une vente passe
 * par son lien. AUCUNE mention de la monnaie interne du site (mécanique
 * distincte, expliquée ailleurs dans son contexte).
 *
 * Chiffres RÉELS du système uniquement (taux par défaut, exemples issus de
 * vrais produits du catalogue). Rien n'est inventé, aucun revenu promis.
 *
 * Le bouton d'action s'adapte à la session (useUser).
 */

import Link from "next/link";
import { useUser } from "@/hooks/use-user";
import { useI18n } from "@/lib/i18n";
import type { UserRole } from "@/lib/user-auth";

const AFFILIATE_ROLES: UserRole[] = ["affiliate", "super_affiliate"];

/** Exemples RÉELS de calcul — produits et taux effectivement en catalogue. */
const COMMISSION_EXAMPLES = [
  { product: "Crée ton site web avec GLM 5.3", price: "4 000 FCFA", rate: "30 %", earn: "1 200 FCFA" },
  { product: "PRODUIT PHYSIQUE OU DIGITAL ? LE BON CHOIX", price: "1 500 FCFA", rate: "40 %", earn: "600 FCFA" },
  { product: "100 techniques infaillibles pour transformer les prospects", price: "3 000 FCFA", rate: "20 %", earn: "600 FCFA" },
];

export default function AffiliationPage() {
  const { user, loading } = useUser();
  const { t } = useI18n();
  const isAffiliate = !!user && AFFILIATE_ROLES.includes(user.role);

  const steps = [1, 2, 3, 4].map((n) => ({
    n: `0${n}`,
    title: t(`aff_step${n}_title`),
    text: t(`aff_step${n}_text`),
  }));

  const benefits = [1, 2, 3, 4, 5].map((n) => ({
    icon: ["💰", "🔗", "📊", "🛒", "🚀"][n - 1],
    title: t(`aff_benefit${n}_title`),
    text: t(`aff_benefit${n}_text`),
  }));

  const faq = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({
    q: t(`aff_faq${n}_q`),
    a: t(`aff_faq${n}_a`),
  }));

  return (
    <div className="container-arsenal max-w-3xl pb-16 pt-8 sm:pt-12">
      {/* ---------- Hero ---------- */}
      <p className="font-mono text-[0.7rem] uppercase tracking-[0.2em] text-tx3">
        {t("aff_eyebrow")}
      </p>
      <h1 className="mt-3 font-display text-[clamp(1.7rem,4vw,2.5rem)] font-bold leading-[1.15] tracking-tight">
        {t("aff_hero_title")}
      </h1>
      <p className="mt-3 max-w-[62ch] leading-relaxed text-tx2">{t("aff_hero_sub")}</p>

      <div className="mt-6 flex flex-wrap gap-3">
        {loading ? (
          <span className="h-[42px]" aria-hidden="true" />
        ) : isAffiliate ? (
          <Link href="/affilie" className="btn-arsenal btn-primary">
            {t("aff_cta_space")}
          </Link>
        ) : user ? (
          <Link href="/affilie" className="btn-arsenal btn-primary">
            {t("aff_cta_become")}
          </Link>
        ) : (
          <>
            <Link href="/inscription" className="btn-arsenal btn-primary">
              {t("aff_cta_become")}
            </Link>
            <Link href="/connexion" className="btn-arsenal btn-ghost">
              {t("aff_cta_login")}
            </Link>
          </>
        )}
        <a href="#comment-ca-marche" className="btn-arsenal btn-ghost">
          {t("aff_cta_how")}
        </a>
      </div>

      {/* ---------- Comment ça marche ---------- */}
      <section id="comment-ca-marche" className="mt-12 scroll-mt-24">
        <h2 className="font-display text-[1.3rem] font-bold">{t("aff_how_title")}</h2>
        <ol className="mt-5 flex flex-col gap-3">
          {steps.map((s) => (
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
        <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-line bg-panel px-4 py-3 font-mono text-[0.78rem] text-tx2">
          <span className="text-tx1">{t("aff_chain_product")}</span>
          <span aria-hidden="true" className="text-tx3">→</span>
          <span className="text-tx1">{t("aff_chain_link")}</span>
          <span aria-hidden="true" className="text-tx3">→</span>
          <span className="text-tx1">{t("aff_chain_sale")}</span>
          <span aria-hidden="true" className="text-tx3">→</span>
          <span className="font-semibold text-teal">{t("aff_chain_commission")}</span>
        </p>
      </section>

      {/* ---------- Commissions ---------- */}
      <section id="commissions" className="mt-12 scroll-mt-24">
        <h2 className="font-display text-[1.3rem] font-bold">{t("aff_commissions_title")}</h2>
        <p className="mt-3 leading-relaxed text-tx2">
          {t("aff_commissions_text_1")}{" "}
          <strong className="text-tx1">{t("aff_commissions_rate")}</strong>{" "}
          {t("aff_commissions_text_2")}
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {COMMISSION_EXAMPLES.map((e) => (
            <div key={e.product} className="flex flex-col rounded-2xl border border-line bg-s1 p-4">
              <p className="line-clamp-2 min-h-[2.6em] text-[0.82rem] font-semibold leading-snug">
                {e.product}
              </p>
              <p className="mt-2 font-mono text-[0.74rem] text-tx3">
                {t("aff_example_meta", { price: e.price, rate: e.rate })}
              </p>
              <p className="mt-2 font-display text-[1.15rem] font-bold text-teal">
                {t("aff_example_earn", { earn: e.earn })}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[0.78rem] text-tx3">{t("aff_examples_note")}</p>

        <div className="mt-5 rounded-2xl border border-line bg-s1 p-4 sm:p-5">
          <h3 className="font-display text-[0.95rem] font-bold">{t("aff_cycle_title")}</h3>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[0.76rem] text-tx2">
            <span className="text-tx1">{t("aff_cycle_confirmed")}</span>
            <span aria-hidden="true" className="text-tx3">→</span>
            <span className="text-tx1">{t("aff_cycle_validated")}</span>
            <span aria-hidden="true" className="text-tx3">→</span>
            <span className="text-tx1">{t("aff_cycle_payable")}</span>
            <span aria-hidden="true" className="text-tx3">→</span>
            <span className="font-semibold text-teal">{t("aff_cycle_paid")}</span>
          </p>
          <p className="mt-2 text-[0.84rem] leading-relaxed text-tx2">{t("aff_cycle_text")}</p>
        </div>
      </section>

      {/* ---------- Argent réel ---------- */}
      <section id="argent-reel" className="mt-12 scroll-mt-24">
        <h2 className="font-display text-[1.3rem] font-bold">{t("aff_real_title")}</h2>
        <p className="mt-3 leading-relaxed text-tx2">{t("aff_real_text")}</p>
        <p className="mt-3 text-[0.84rem] leading-relaxed text-tx3">{t("aff_real_note")}</p>
      </section>

      {/* ---------- Suivi des performances ---------- */}
      <section id="suivi" className="mt-12 scroll-mt-24">
        <h2 className="font-display text-[1.3rem] font-bold">{t("aff_stats_title")}</h2>
        <p className="mt-3 leading-relaxed text-tx2">{t("aff_stats_intro")}</p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {["aff_stat_clicks", "aff_stat_sales", "aff_stat_conversion", "aff_stat_history"].map((key) => (
            <li
              key={key}
              className="rounded-xl border border-line bg-s1 px-4 py-2.5 text-[0.88rem] text-tx2"
            >
              {t(key)}
            </li>
          ))}
        </ul>
      </section>

      {/* ---------- Avantages ---------- */}
      <section id="avantages" className="mt-12 scroll-mt-24">
        <h2 className="font-display text-[1.3rem] font-bold">{t("aff_benefits_title")}</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {benefits.map((b) => (
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
        <h2 className="font-display text-[1.3rem] font-bold">{t("aff_products_title")}</h2>
        <p className="mt-3 leading-relaxed text-tx2">{t("aff_products_text")}</p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {["aff_cat_saas", "aff_cat_desktop", "aff_cat_mobile", "aff_cat_ebook", "aff_cat_prompts"].map(
            (key) => (
              <li
                key={key}
                className="rounded-full border border-line bg-panel px-3.5 py-1.5 text-[0.84rem] text-tx2"
              >
                {t(key)}
              </li>
            )
          )}
        </ul>
        <p className="mt-3 text-[0.86rem] leading-relaxed text-tx2">
          {t("aff_products_limit")}{" "}
          <Link href="/catalogue/" className="text-teal underline-offset-4 hover:underline">
            {t("aff_browse_catalog")}
          </Link>
          .
        </p>
      </section>

      {/* ---------- Super Affilié ---------- */}
      <section id="super" className="mt-12 scroll-mt-24">
        <h2 className="font-display text-[1.3rem] font-bold">{t("aff_super_title")}</h2>
        <p className="mt-3 leading-relaxed text-tx2">
          {t("aff_super_text_1")}{" "}
          <strong className="text-tx1">{t("aff_super_threshold")}</strong>
          {t("aff_super_text_2")}
        </p>
        <ul className="mt-3 flex flex-col gap-2">
          {["aff_super_b1", "aff_super_b2", "aff_super_b3"].map((key) => (
            <li
              key={key}
              className="rounded-xl border border-line bg-s1 px-4 py-2.5 text-[0.88rem] text-tx2"
            >
              {t(key)}
            </li>
          ))}
        </ul>
      </section>

      {/* ---------- Pour qui ---------- */}
      <section id="pour-qui" className="mt-12 scroll-mt-24">
        <h2 className="font-display text-[1.3rem] font-bold">{t("aff_who_title")}</h2>
        <p className="mt-3 leading-relaxed text-tx2">{t("aff_who_intro")}</p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {["aff_aud1", "aff_aud2", "aff_aud3", "aff_aud4", "aff_aud5", "aff_aud6"].map((key) => (
            <li
              key={key}
              className="rounded-full border border-line bg-panel px-3.5 py-1.5 text-[0.84rem] text-tx2"
            >
              {t(key)}
            </li>
          ))}
        </ul>
      </section>

      {/* ---------- FAQ ---------- */}
      <section id="faq" className="mt-12 scroll-mt-24">
        <h2 className="font-display text-[1.3rem] font-bold">{t("aff_faq_title")}</h2>
        <div className="mt-5 flex flex-col gap-2.5">
          {faq.map((item) => (
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
        <h2 className="font-display text-[1.25rem] font-bold">{t("aff_cta_final_title")}</h2>
        <p className="mx-auto mt-2 max-w-[52ch] text-[0.9rem] leading-relaxed text-tx2">
          {t("aff_cta_final_text")}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          {isAffiliate ? (
            <Link href="/affilie" className="btn-arsenal btn-primary">
              {t("aff_cta_space")}
            </Link>
          ) : user ? (
            <Link href="/affilie" className="btn-arsenal btn-primary">
              {t("aff_cta_become")}
            </Link>
          ) : (
            <Link href="/inscription" className="btn-arsenal btn-primary">
              {t("aff_cta_become")}
            </Link>
          )}
        </div>
        <p className="mt-4 text-[0.78rem] text-tx3">
          {t("aff_cta_free")}{" "}
          <Link href="/conditions-affiliation/" className="text-teal underline-offset-4 hover:underline">
            {t("aff_cta_terms")}
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
