"use client";

/**
 * /catalogue — la grille complète (déplacée de l'accueil le 05/10, refonte
 * front) : recherche (Ctrl+K) · filtres catégories/badges/langues (ET) · tri ·
 * compteur · état vide · skeletons · stale-while-revalidate.
 *
 * L'accueil (/), lui, n'est plus qu'un point d'entrée : hero, deux portes
 * (Catalogue / Feed), produits populaires et derniers articles.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ProductCard } from "@/components/product-card";
import { useCatalog } from "@/hooks/use-catalog";
import { useI18n } from "@/lib/i18n";
import { trackVisit } from "@/lib/track";
import { fmt } from "@/lib/format";
import {
  BADGES,
  CATEGORIES,
  Category,
  DEFAULT_FILTERS,
  PRODUCT_LANGUAGES,
  Product,
  ProductFilters,
  SortMode,
  filterProducts,
} from "@/lib/products";

const SKELETONS = [0, 1, 2, 3];

/**
 * Pastilles de catégorie — « Tous » INCLUS. Historiquement la pastille « Tous »
 * ne s'affichait jamais (branche morte `cat === "all"` sur un tableau qui
 * n'existait pas) : le retour à « tout » ne passait que par « Réinitialiser ».
 * Corrigé ici (refonte 05/10).
 */
const CATEGORY_FILTERS: ("all" | Category)[] = ["all", "saas", "desktop", "mobile", "ebook", "prompts"];

/** Couleur de texte d'un badge — jetons de thème (jamais de hex en dur). */
const BADGE_TEXT_COLOR: Record<string, string> = {
  gratuit: "var(--teal-text)",
  premium: "var(--badge-premium)",
  beta: "var(--warn-text)",
  nouveau: "var(--badge-nouveau)",
};

export default function CatalogPage() {
  const { products, initialLoaded, source } = useCatalog();
  const { t } = useI18n();
  const [filters, setFilters] = useState<ProductFilters>(DEFAULT_FILTERS);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    trackVisit();
  }, []);

  // Raccourci Ctrl+K / Cmd+K → focus recherche
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Cycle de vie (migration 0014) : les produits SUPPRIMÉS (soft delete) et
  // INDISPONIBLES ne figurent plus dans la grille publique — leurs pages
  // dédiées restent accessibles par lien direct avec un état explicite.
  const visibleProducts = useMemo(
    () => products.filter((p) => p.deletedAt == null && p.unavailableAt == null),
    [products]
  );
  const filtered = useMemo(
    () => filterProducts(visibleProducts, filters),
    [visibleProducts, filters]
  );

  const total = visibleProducts.length;

  // Rangée « Langue » affichée uniquement si au moins un produit en déclare (migration 0007)
  const hasLanguages = products.some((p) => p.languages?.length);

  const filtersActive =
    filters.q !== "" ||
    filters.category !== "all" ||
    filters.badges.length > 0 ||
    filters.languages.length > 0;

  const toggleBadge = (b: (typeof BADGES)[number]) => {
    setFilters((f) => ({
      ...f,
      badges: f.badges.includes(b) ? f.badges.filter((x) => x !== b) : [...f.badges, b],
    }));
  };

  const toggleLanguage = (code: string) => {
    setFilters((f) => ({
      ...f,
      languages: f.languages.includes(code)
        ? f.languages.filter((x) => x !== code)
        : [...f.languages, code],
    }));
  };

  return (
    <>
      {/* ---------- En-tête de page ---------- */}
      <section className="py-6 md:py-9">
        <div className="container-arsenal">
          <h1 className="font-display text-[clamp(1.6rem,3.6vw,2.4rem)] font-bold leading-tight tracking-tight">
            {t("catalog_title")}
          </h1>
          <p className="mt-2 max-w-[56ch] leading-relaxed text-tx2">{t("catalog_sub")}</p>
        </div>
      </section>

      {/* ---------- Filtres & tri ---------- */}
      <section className="container-arsenal flex flex-col gap-3 pb-2" aria-label={t("catalog_aria_filters")}>
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-line bg-s1 px-3.5 py-2.5 text-tx3 transition-colors focus-within:border-[rgba(230,57,70,0.6)] focus-within:bg-s2">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="flex-shrink-0">
              <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              ref={searchRef}
              type="search"
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              placeholder={t("catalog_search_placeholder")}
              aria-label={t("catalog_aria_search")}
              className="min-w-0 flex-1 border-none bg-transparent text-[0.92rem] text-tx1 outline-none placeholder:text-tx3"
            />
            {filters.q && (
              <button
                type="button"
                onClick={() => setFilters((f) => ({ ...f, q: "" }))}
                className="grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-s2 text-tx3 hover:text-brand"
                aria-label={t("catalog_aria_clear")}
              >
                <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            )}
            <kbd className="hidden whitespace-nowrap rounded border border-line px-1.5 py-0.5 font-mono text-[0.62rem] text-tx3 sm:block">
              Ctrl K
            </kbd>
          </div>
        </div>

        {/* Catégories */}
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("catalog_aria_category")}>
          {CATEGORY_FILTERS.map((cat) => (
            <FilterPill
              key={cat}
              label={cat === "all" ? undefined : CATEGORIES[cat]}
              active={filters.category === cat}
              onClick={() => setFilters((f) => ({ ...f, category: cat }))}
            >
              {cat === "all" ? t("catalog_filter_all") : undefined}
            </FilterPill>
          ))}
        </div>

        {/* Badges + tri */}
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("catalog_aria_badge")}>
            <span className="mr-1 font-mono text-[0.68rem] uppercase tracking-[0.1em] text-tx3">
              {t("catalog_badges_label")}
            </span>
            {BADGES.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => toggleBadge(b)}
                aria-pressed={filters.badges.includes(b)}
                className="rounded-md border px-2.5 py-1 text-[0.8rem] font-semibold transition-colors aria-pressed:before:mr-1 aria-pressed:before:content-['✕']"
                style={
                  filters.badges.includes(b)
                    ? {
                        color: BADGE_TEXT_COLOR[b],
                        borderColor: "currentColor",
                        background: "var(--panel-strong)",
                      }
                    : undefined
                }
                onMouseEnter={(e) => {
                  if (!filters.badges.includes(b)) {
                    e.currentTarget.style.color = "var(--text-primary)";
                    e.currentTarget.style.borderColor = "var(--border-hover)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!filters.badges.includes(b)) {
                    e.currentTarget.style.color = "";
                    e.currentTarget.style.borderColor = "";
                  }
                }}
              >
                {t(`badge_${b}`)}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="sort-select" className="font-mono text-[0.68rem] uppercase tracking-[0.1em] text-tx3">
              {t("catalog_sort_label")}
            </label>
            <select
              id="sort-select"
              value={filters.sort}
              onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value as SortMode }))}
              className="cursor-pointer rounded-md border border-line bg-s1 px-3 py-1.5 text-[0.85rem] text-tx1 hover:border-line2"
            >
              <option value="popular">{t("catalog_sort_popular")}</option>
              <option value="recent">{t("catalog_sort_recent")}</option>
            </select>
          </div>
        </div>

        {/* Langues (migration 0007) — multi-sélection en ET, style des badges */}
        {hasLanguages && (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("catalog_aria_language")}>
            <span className="mr-1 font-mono text-[0.68rem] uppercase tracking-[0.1em] text-tx3">
              {t("catalog_lang_label")}
            </span>
            {Object.entries(PRODUCT_LANGUAGES).map(([code]) => (
              <button
                key={code}
                type="button"
                onClick={() => toggleLanguage(code)}
                aria-pressed={filters.languages.includes(code)}
                className="rounded-md border px-2.5 py-1 text-[0.8rem] font-semibold transition-colors aria-pressed:before:mr-1 aria-pressed:before:content-['✕']"
                style={
                  filters.languages.includes(code)
                    ? {
                        color: "var(--teal-text)",
                        borderColor: "currentColor",
                        background: "var(--panel-strong)",
                      }
                    : undefined
                }
                onMouseEnter={(e) => {
                  if (!filters.languages.includes(code)) {
                    e.currentTarget.style.color = "var(--text-primary)";
                    e.currentTarget.style.borderColor = "var(--border-hover)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!filters.languages.includes(code)) {
                    e.currentTarget.style.color = "";
                    e.currentTarget.style.borderColor = "";
                  }
                }}
              >
                {t(`lang_name_${code}`)}
              </button>
            ))}
          </div>
        )}

        {/* Compteur + reset */}
        <div className="flex min-h-[26px] items-center justify-between gap-3">
          <p className="font-mono text-[0.8rem] text-tx3" aria-live="polite">
            {initialLoaded ? (
              filtered.length === 0 ? (
                t("catalog_count_none")
              ) : (
                <>
                  <b className="font-semibold text-teal">{fmt(filtered.length)}</b>{" "}
                  {filtered.length > 1 ? t("catalog_count_plural") : t("catalog_count_one")}{" "}
                  {fmt(total)}
                  {source === "demo" && t("catalog_demo_source")}
                </>
              )
            ) : (
              t("catalog_loading")
            )}
          </p>
          {filtersActive && (
            <button
              type="button"
              onClick={() => setFilters({ ...DEFAULT_FILTERS, sort: filters.sort })}
              className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(230,57,70,0.4)] bg-[rgba(230,57,70,0.07)] px-3 py-1.5 text-[0.76rem] font-semibold text-brand hover:bg-[rgba(230,57,70,0.16)]"
            >
              <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
                <path d="M3 12a9 9 0 1 0 2.6-6.3L3 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M3 3v5h5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              {t("catalog_reset")}
            </button>
          )}
        </div>
      </section>

      {/* ---------- Grille ---------- */}
      <section className="container-arsenal pb-14 pt-4">
        {!initialLoaded ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
            {SKELETONS.map((i) => (
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
        ) : filtered.length === 0 ? (
          <EmptyState onReset={() => setFilters(DEFAULT_FILTERS)} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-live="polite">
            {filtered.map((p: Product) => (
              <ProductCard key={p.id} p={p} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function FilterPill({
  label,
  active,
  onClick,
  children,
}: {
  label?: string;
  active: boolean;
  onClick: () => void;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex-shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-[0.85rem] font-medium transition-colors ${
        active
          ? "border-[rgba(230,57,70,0.65)] bg-[rgba(230,57,70,0.28)] text-tx1"
          : "border-line bg-panel text-tx2 hover:border-line2 hover:bg-s2 hover:text-tx1"
      }`}
    >
      {children ?? label}
    </button>
  );
}

function EmptyState({ onReset }: { onReset: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center text-tx3">
      <svg viewBox="0 0 24 24" width="46" height="46" aria-hidden="true" className="mb-1 opacity-60">
        <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.5" />
        <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.5" />
      </svg>
      <h3 className="text-[1.15rem] font-semibold text-tx2">{t("catalog_empty_title")}</h3>
      <p className="max-w-[40ch] text-[0.88rem]">{t("catalog_empty_text")}</p>
      <button type="button" onClick={onReset} className="btn-arsenal btn-primary btn-sm mt-2">
        {t("catalog_reset")}
      </button>
    </div>
  );
}
