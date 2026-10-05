"use client";

/**
 * Catalogue — réplique fidèle du site validé :
 * hero + stats · recherche (Ctrl+K) · filtres catégories/badges (ET) · tri
 * grille · compteur · état vide · skeletons · stale-while-revalidate
 */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ProductCard } from "@/components/product-card";
import { useCatalog } from "@/hooks/use-catalog";
import { useUser } from "@/hooks/use-user";
import { apiFetch } from "@/lib/api";
import { trackVisit } from "@/lib/track";
import { fmt } from "@/lib/format";
import {
  BADGES,
  BADGE_LABELS,
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

export default function CatalogPage() {
  const { products, initialLoaded, source } = useCatalog();
  const { user } = useUser();
  const [filters, setFilters] = useState<ProductFilters>(DEFAULT_FILTERS);
  const searchRef = useRef<HTMLInputElement>(null);
  // Stats d'accueil pilotées depuis l'admin (Paramètres → Affichage). Défaut :
  // affichées — API injoignable ou drapeau indisponible ⇒ comportement historique.
  const [showStats, setShowStats] = useState<boolean | null>(null);

  useEffect(() => {
    trackVisit();
  }, []);

  // Pont de tracking : capte `?ars=<token>` à l'arrivée, le mémorise et nettoie l'URL.
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
  const freeCount = visibleProducts.filter((p) => p.badges.includes("gratuit")).length;
  const totalClicks = products.reduce((sum, p) => sum + p.clicks, 0);

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
      {/* ---------- Hero ---------- */}
      <section className="py-8 md:py-12">
        <div className="container-arsenal">
          <h1 className="max-w-[15ch] font-display text-[clamp(1.9rem,4.6vw,3.3rem)] font-bold leading-[1.12] tracking-tight">
            L&rsquo;arsenal des bâtisseurs du web
          </h1>
          <p className="mt-3 max-w-[56ch] leading-relaxed text-[#a0a0a0]">
            SaaS, applications desktop, PWA mobiles, e-books et packs d&rsquo;automations — triés
            par popularité réelle, testés par la communauté.
          </p>
          {/* Stats d'accueil — masquables depuis Paramètres → Affichage (défaut : visibles) */}
          {showStats !== false && (
            <div className="mt-6 flex flex-wrap gap-3">
              <HeroStat value={fmt(total)} label="outils au catalogue" />
              <HeroStat value={fmt(freeCount)} label="gratuits" />
              <HeroStat value={fmt(totalClicks)} label="clics cumulés" />
            </div>
          )}
        </div>
      </section>

      {/* ---------- Filtres & tri ---------- */}
      <section className="container-arsenal flex flex-col gap-3 pb-2" aria-label="Filtres et tri des produits">
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-[#333] bg-[#141414] px-3.5 py-2.5 text-[#666] transition-colors focus-within:border-[rgba(230,57,70,0.6)] focus-within:bg-[#1a1a1a]">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="flex-shrink-0">
              <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              ref={searchRef}
              type="search"
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              placeholder="Rechercher un outil, un e-book, un prompt…"
              aria-label="Recherche globale instantanée"
              className="min-w-0 flex-1 border-none bg-transparent text-[0.92rem] text-[#f0f0f0] outline-none placeholder:text-[#666]"
            />
            {filters.q && (
              <button
                type="button"
                onClick={() => setFilters((f) => ({ ...f, q: "" }))}
                className="grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-[#1a1a1a] text-[#666] hover:text-[#e63946]"
                aria-label="Effacer la recherche"
              >
                <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            )}
            <kbd className="hidden whitespace-nowrap rounded border border-[#333] px-1.5 py-0.5 font-mono text-[0.62rem] text-[#666] sm:block">
              Ctrl K
            </kbd>
          </div>
        </div>

        {/* Catégories */}
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrer par catégorie">
          {(Object.keys(CATEGORIES) as Category[]).map((cat) => (
            <FilterPill
              key={cat}
              label={cat === "all" ? undefined : CATEGORIES[cat]}
              active={filters.category === cat}
              onClick={() => setFilters((f) => ({ ...f, category: cat }))}
            >
              {cat === "all" ? "Tous" : undefined}
            </FilterPill>
          ))}
        </div>

        {/* Badges + tri */}
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrer par badge">
            <span className="mr-1 font-mono text-[0.68rem] uppercase tracking-[0.1em] text-[#666]">
              Badges
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
                        color:
                          b === "gratuit" ? "#2a9d8f" : b === "premium" ? "#9b5de5" : b === "beta" ? "#f4a261" : "#00b4d8",
                        borderColor: "currentColor",
                        background: "rgba(255,255,255,0.04)",
                      }
                    : undefined
                }
                onMouseEnter={(e) => {
                  if (!filters.badges.includes(b)) {
                    e.currentTarget.style.color = "#f0f0f0";
                    e.currentTarget.style.borderColor = "#444";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!filters.badges.includes(b)) {
                    e.currentTarget.style.color = "";
                    e.currentTarget.style.borderColor = "";
                  }
                }}
              >
                {BADGE_LABELS[b]}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="sort-select" className="font-mono text-[0.68rem] uppercase tracking-[0.1em] text-[#666]">
              Tri
            </label>
            <select
              id="sort-select"
              value={filters.sort}
              onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value as SortMode }))}
              className="cursor-pointer rounded-md border border-[#333] bg-[#141414] px-3 py-1.5 text-[0.85rem] text-[#f0f0f0] hover:border-[#444]"
            >
              <option value="popular">Plus populaires</option>
              <option value="recent">Plus récents</option>
            </select>
          </div>
        </div>

        {/* Langues (migration 0007) — multi-sélection en ET, style des badges */}
        {hasLanguages && (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrer par langue">
            <span className="mr-1 font-mono text-[0.68rem] uppercase tracking-[0.1em] text-[#666]">
              Langue
            </span>
            {Object.entries(PRODUCT_LANGUAGES).map(([code, label]) => (
              <button
                key={code}
                type="button"
                onClick={() => toggleLanguage(code)}
                aria-pressed={filters.languages.includes(code)}
                className="rounded-md border px-2.5 py-1 text-[0.8rem] font-semibold transition-colors aria-pressed:before:mr-1 aria-pressed:before:content-['✕']"
                style={
                  filters.languages.includes(code)
                    ? {
                        color: "#2a9d8f",
                        borderColor: "currentColor",
                        background: "rgba(255,255,255,0.04)",
                      }
                    : undefined
                }
                onMouseEnter={(e) => {
                  if (!filters.languages.includes(code)) {
                    e.currentTarget.style.color = "#f0f0f0";
                    e.currentTarget.style.borderColor = "#444";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!filters.languages.includes(code)) {
                    e.currentTarget.style.color = "";
                    e.currentTarget.style.borderColor = "";
                  }
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Compteur + reset */}
        <div className="flex min-h-[26px] items-center justify-between gap-3">
          <p className="font-mono text-[0.8rem] text-[#666]" aria-live="polite">
            {initialLoaded ? (
              filtered.length === 0 ? (
                "Aucun résultat"
              ) : (
                <>
                  <b className="font-semibold text-[#4fb3a1]">{fmt(filtered.length)}</b> outil
                  {filtered.length > 1 ? "s" : ""} affiché{filtered.length > 1 ? "s" : ""} sur{" "}
                  {fmt(total)}
                  {source === "demo" && " — catalogue de démonstration chargé"}
                </>
              )
            ) : (
              "Chargement du catalogue…"
            )}
          </p>
          {filtersActive && (
            <button
              type="button"
              onClick={() => setFilters({ ...DEFAULT_FILTERS, sort: filters.sort })}
              className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(230,57,70,0.4)] bg-[rgba(230,57,70,0.07)] px-3 py-1.5 text-[0.76rem] font-semibold text-[#e63946] hover:bg-[rgba(230,57,70,0.16)]"
            >
              <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
                <path d="M3 12a9 9 0 1 0 2.6-6.3L3 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M3 3v5h5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Réinitialiser les filtres
            </button>
          )}
        </div>
      </section>

      {/* ---------- Grille ---------- */}
      <section className="container-arsenal pb-14 pt-4">
        {!initialLoaded ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
            {SKELETONS.map((i) => (
              <div key={i} className="overflow-hidden rounded-2xl border border-[#333] bg-[#141414]">
                <div className="aspect-[16/10] bg-[#151515]" />
                <div className="p-4">
                  <div className="mb-2 h-3 w-3/5 rounded bg-[#151515]" />
                  <div className="mb-2 h-3 w-full rounded bg-[#151515]" />
                  <div className="h-3 w-4/5 rounded bg-[#151515]" />
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

      {/* ---------- Bloc de découverte : programme d'affiliation ---------- */}
      {/*
        Masqué dès que la session est AFFILIÉE (ou Super) : un affilié n'a plus
        besoin qu'on lui vante le programme — c'était redondant et donnait
        l'impression que le site ne tenait pas compte de son statut. Visible pour
        un visiteur ou un simple utilisateur, qui sont les vraies cibles.
      */}
      {user?.role !== "affiliate" && user?.role !== "super_affiliate" && (
      <section className="container-arsenal pb-14">
        <div className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-[#333] bg-[#141414] p-6 sm:flex-row sm:items-center sm:p-7">
          <div className="min-w-0">
            <h2 className="font-display text-[1.05rem] font-bold">
              Gagnez des A en partageant les produits Arsenal
            </h2>
            <p className="mt-1.5 max-w-[60ch] text-[0.86rem] leading-relaxed text-[#a0a0a0]">
              Rejoignez le programme d&apos;affiliation : partagez un lien de suivi et touchez une
              récompense en A plus une commission à chaque vente.
            </p>
          </div>
          <Link
            href="/affiliation"
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
    <div className="flex min-w-[100px] flex-col rounded-md border border-[#333] bg-[#141414] px-3 py-2">
      <strong className="text-[1.3rem] font-bold text-[#e63946]">{value}</strong>
      <span className="font-mono text-[0.72rem] uppercase tracking-[0.04em] text-[#666]">
        {label}
      </span>
    </div>
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
          ? "border-[rgba(230,57,70,0.65)] bg-[rgba(230,57,70,0.28)] text-white"
          : "border-[#333] bg-[rgba(255,255,255,0.035)] text-[#a0a0a0] hover:border-[#444] hover:bg-[#1a1a1a] hover:text-[#f0f0f0]"
      }`}
    >
      {children ?? label}
    </button>
  );
}

function EmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center text-[#666]">
      <svg viewBox="0 0 24 24" width="46" height="46" aria-hidden="true" className="mb-1 opacity-60">
        <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.5" />
        <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.5" />
      </svg>
      <h3 className="text-[1.15rem] font-semibold text-[#a0a0a0]">Aucun outil ne correspond</h3>
      <p className="max-w-[40ch] text-[0.88rem]">
        Essayez un autre mot-clé ou modifiez les filtres actifs.
      </p>
      <button type="button" onClick={onReset} className="btn-arsenal btn-primary btn-sm mt-2">
        Réinitialiser les filtres
      </button>
    </div>
  );
}
