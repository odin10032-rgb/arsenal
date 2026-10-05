"use client";

/**
 * Accueil (refonte 05/10) — point d'entrée GÉNÉRAL, volontairement court :
 *   hero + stats · deux portes (Catalogue / Feed) · produits populaires ·
 *   derniers articles · appel au programme d'affiliation (hors affiliés).
 *
 * Le catalogue complet (recherche + filtres) vit sur /catalogue/ ; le Feed
 * (couche éditoriale) sur /feed/ — même niveau de navigation (spec §7).
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ProductCard } from "@/components/product-card";
import { ArticleCard } from "@/components/article-card";
import { useCatalog } from "@/hooks/use-catalog";
import { useUser } from "@/hooks/use-user";
import { apiFetch } from "@/lib/api";
import { fetchFeed, type FeedArticleListItem } from "@/lib/feed";
import { fmt } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { trackVisit } from "@/lib/track";

/** Produits montrés sur l'accueil (les plus populaires). */
const TOP_PRODUCTS_COUNT = 6;
/** Articles montrés sur l'accueil (les plus récents). */
const LATEST_POSTS_COUNT = 3;

export default function HomePage() {
  const { products, initialLoaded } = useCatalog();
  const { user } = useUser();
  const { t } = useI18n();
  // Stats d'accueil pilotées depuis l'admin (Paramètres → Affichage). Défaut :
  // affichées — API injoignable ou drapeau indisponible ⇒ comportement historique.
  const [showStats, setShowStats] = useState<boolean | null>(null);
  const [articles, setArticles] = useState<FeedArticleListItem[]>([]);

  useEffect(() => {
    trackVisit();
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ showHomeStats?: boolean }>("/api/site-config", { timeoutMs: 4000 })
      .then((res) => {
        if (!cancelled) setShowStats(res.showHomeStats !== false);
      })
      .catch(() => {
        if (!cancelled) setShowStats(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Derniers articles — best-effort : section masquée tant que le Feed est vide
  // ou l'API injoignable (jamais de contenu inventé).
  useEffect(() => {
    let cancelled = false;
    fetchFeed(LATEST_POSTS_COUNT)
      .then((list) => {
        if (!cancelled) setArticles(list);
      })
      .catch(() => {
        /* section masquée */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Cycle de vie (migration 0014) : supprimés/indisponibles hors vitrine.
  const visibleProducts = useMemo(
    () => products.filter((p) => p.deletedAt == null && p.unavailableAt == null),
    [products]
  );

  const total = visibleProducts.length;
  const freeCount = visibleProducts.filter((p) => p.badges.includes("gratuit")).length;
  const totalClicks = products.reduce((sum, p) => sum + p.clicks, 0);

  const topProducts = useMemo(
    () => [...visibleProducts].sort((a, b) => b.clicks - a.clicks).slice(0, TOP_PRODUCTS_COUNT),
    [visibleProducts]
  );

  return (
    <>
      {/* ---------- Hero (spec « hero direct » 05/10) ----------
          Hiérarchie voulue : ARSENAL TOOLS → Rentabilisez vos idées. → les deux
          « 3× » (éléments graphiques rouges, plus grands que leur libellé) →
          sous-titre → CTA. Composition verticale, mobile d'abord ; les stats
          réelles du catalogue (pilotables en admin) restent, discrètes, APRÈS
          le CTA — jamais en renfort artificiel de la promesse. */}
      <section className="py-8 md:py-12">
        <div className="container-arsenal">
          <p className="font-mono text-[0.7rem] uppercase tracking-[0.2em] text-tx3">
            {t("home_hero_eyebrow")}
          </p>
          <h1 className="mt-3 max-w-[18ch] font-display text-[clamp(1.9rem,4.6vw,3.3rem)] font-bold leading-[1.12] tracking-tight">
            {t("home_hero_title")}
          </h1>

          {/* Les deux promesses — le « 3× » est l'élément graphique (rouge de
              l'identité, nettement plus grand que le libellé). */}
          <div className="mt-6 flex flex-col gap-2 sm:gap-2.5" aria-label={t("home_hero_title")}>
            <p className="flex items-baseline gap-2.5">
              <span className="font-display text-[clamp(2.4rem,7vw,3.6rem)] font-bold leading-none tracking-tight text-brand">
                3×
              </span>
              <span className="font-display text-[clamp(1.05rem,2.4vw,1.45rem)] font-bold uppercase tracking-[0.06em] text-tx1">
                {t("home_promise_fast")}
              </span>
            </p>
            <p className="flex items-baseline gap-2.5">
              <span className="font-display text-[clamp(2.4rem,7vw,3.6rem)] font-bold leading-none tracking-tight text-brand">
                3×
              </span>
              <span className="font-display text-[clamp(1.05rem,2.4vw,1.45rem)] font-bold uppercase tracking-[0.06em] text-tx1">
                {t("home_promise_cheap")}
              </span>
            </p>
          </div>

          <p className="mt-5 max-w-[56ch] leading-relaxed text-tx2">{t("home_hero_sub")}</p>

          <Link href="/catalogue/" className="btn-arsenal btn-primary mt-6">
            {t("home_cta_explore")} <span aria-hidden="true">→</span>
          </Link>

          {showStats !== false && (
            <div className="mt-8 flex flex-wrap gap-3">
              <HeroStat value={fmt(total)} label="outils au catalogue" />
              <HeroStat value={fmt(freeCount)} label="gratuits" />
              <HeroStat value={fmt(totalClicks)} label="clics cumulés" />
            </div>
          )}
        </div>
      </section>

      {/* ---------- Deux portes : Catalogue / Feed ---------- */}
      <section className="container-arsenal pb-2" aria-label={t("home_doors_title")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/catalogue/"
            className="group flex flex-col rounded-2xl border border-line bg-s1 p-5 transition-colors hover:border-line2 hover:bg-s2"
          >
            <span className="inline-flex items-center gap-2 font-mono text-[0.68rem] uppercase tracking-[0.14em] text-tx3">
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
                <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Inventaire
            </span>
            <span className="mt-2 font-display text-[1.15rem] font-bold text-tx1">
              {t("home_door_catalog_title")}
            </span>
            <span className="mt-1.5 text-[0.86rem] leading-relaxed text-tx2">
              {t("home_door_catalog_text")}
            </span>
            <span className="mt-3 inline-flex items-center gap-1.5 text-[0.8rem] font-semibold text-teal transition-all group-hover:gap-2.5">
              {t("home_see_all_catalog")} →
            </span>
          </Link>

          <Link
            href="/feed/"
            className="group flex flex-col rounded-2xl border border-line bg-s1 p-5 transition-colors hover:border-line2 hover:bg-s2"
          >
            <span className="inline-flex items-center gap-2 font-mono text-[0.68rem] uppercase tracking-[0.14em] text-tx3">
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                <path d="M4 6h16M4 12h10M4 18h7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Éditorial
            </span>
            <span className="mt-2 font-display text-[1.15rem] font-bold text-tx1">
              {t("home_door_feed_title")}
            </span>
            <span className="mt-1.5 text-[0.86rem] leading-relaxed text-tx2">
              {t("home_door_feed_text")}
            </span>
            <span className="mt-3 inline-flex items-center gap-1.5 text-[0.8rem] font-semibold text-teal transition-all group-hover:gap-2.5">
              {t("home_see_all_feed")} →
            </span>
          </Link>
        </div>
      </section>

      {/* ---------- Produits populaires ---------- */}
      <section className="container-arsenal pt-8">
        <div className="mb-4 flex items-end justify-between gap-3">
          <h2 className="font-display text-[1.2rem] font-bold">{t("home_top_products")}</h2>
          <Link
            href="/catalogue/"
            className="font-mono text-[0.74rem] text-tx3 underline-offset-4 hover:text-tx1 hover:underline"
          >
            {t("home_see_all_catalog")} →
          </Link>
        </div>
        {!initialLoaded ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="overflow-hidden rounded-2xl border border-line bg-s1">
                <div className="aspect-[16/10] bg-s2" />
                <div className="p-4">
                  <div className="mb-2 h-3 w-3/5 rounded bg-s2" />
                  <div className="mb-2 h-3 w-full rounded bg-s2" />
                  <div className="h-3 w-4/5 rounded bg-s2" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {topProducts.map((p) => (
              <ProductCard key={p.id} p={p} />
            ))}
          </div>
        )}
      </section>

      {/* ---------- Derniers articles ---------- */}
      {articles.length > 0 && (
        <section className="container-arsenal pt-10">
          <div className="mb-4 flex items-end justify-between gap-3">
            <h2 className="font-display text-[1.2rem] font-bold">{t("home_latest_posts")}</h2>
            <Link
              href="/feed/"
              className="font-mono text-[0.74rem] text-tx3 underline-offset-4 hover:text-tx1 hover:underline"
            >
              {t("home_see_all_feed")} →
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {articles.map((a) => (
              <ArticleCard key={a.slug} article={a} />
            ))}
          </div>
        </section>
      )}

      {/* ---------- Bloc de découverte : programme d'affiliation ---------- */}
      {/*
        Masqué dès que la session est AFFILIÉE (ou Super) : un affilié n'a plus
        besoin qu'on lui vante le programme. Visible pour un visiteur ou un
        simple utilisateur, qui sont les vraies cibles.
      */}
      {user?.role !== "affiliate" && user?.role !== "super_affiliate" && (
        <section className="container-arsenal py-12">
          <div className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-line bg-s1 p-6 sm:flex-row sm:items-center sm:p-7">
            <div className="min-w-0">
              <h2 className="font-display text-[1.05rem] font-bold">
                Gagnez des A en partageant les produits Arsenal
              </h2>
              <p className="mt-1.5 max-w-[60ch] text-[0.86rem] leading-relaxed text-tx2">
                Rejoignez le programme d&apos;affiliation : partagez un lien de suivi et touchez une
                récompense en A plus une commission à chaque vente.
              </p>
            </div>
            <Link
              href="/affiliation/"
              className="btn-arsenal btn-ghost flex-shrink-0 whitespace-nowrap"
            >
              Découvrir le programme
            </Link>
          </div>
        </section>
      )}
    </>
  );
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex min-w-[100px] flex-col rounded-md border border-line bg-s1 px-3 py-2">
      <strong className="text-[1.3rem] font-bold text-brand">{value}</strong>
      <span className="font-mono text-[0.72rem] uppercase tracking-[0.04em] text-tx3">
        {label}
      </span>
    </div>
  );
}
