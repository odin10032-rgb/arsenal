"use client";

/**
 * /feed/ — le Feed éditorial d'Arsenal (refonte 05/10, spec §11-15).
 *
 * Deux vues, même route :
 *  • /feed/            → la liste : article principal + grille
 *  • /feed/?a=<slug>   → l'article (URL propre par article, query survivant à
 *    la normalisation trailingSlash — même mécanique que /produit/?id=)
 *
 * Le Feed n'est PAS un réseau social : contenu publié par Arsenal uniquement,
 * aucun commentaire. Chaque article peut présenter un produit du catalogue
 * (Feed → Catalogue).
 *
 * Le rendu est client (export statique) ; le contenu vient de l'API publique
 * `GET /api/feed`.
 */

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { ArticleCard } from "@/components/article-card";
import { useCatalog } from "@/hooks/use-catalog";
import { ProductCard } from "@/components/product-card";
import { MediaEmbed } from "@/components/media-embed";
import { toast } from "@/lib/toast";
import {
  fetchFeed,
  fetchFeedArticle,
  formatArticleDate,
  type FeedArticle,
  type FeedArticleListItem,
} from "@/lib/feed";
import { useI18n } from "@/lib/i18n";
import { trackStep } from "@/lib/purchases";
import { parseVideoUrl } from "@/lib/video";

function FeedBody() {
  const { t } = useI18n();
  const [slug, setSlug] = useState("");

  // Slug lu depuis ?a= (query) ou #<slug> (partage) — jamais depuis le chemin
  // (le 308 de trailingSlash perd les segments, constat du 03/10).
  useEffect(() => {
    const applyLocation = () => {
      const query = new URLSearchParams(window.location.search).get("a");
      if (query) {
        setSlug(query.trim().toLowerCase());
        return;
      }
      const hash = window.location.hash.replace(/^#/, "").trim();
      setSlug(hash && !hash.includes("=") ? decodeURIComponent(hash).toLowerCase() : "");
    };
    applyLocation();
    window.addEventListener("hashchange", applyLocation);
    return () => window.removeEventListener("hashchange", applyLocation);
  }, []);

  return slug ? <ArticleView slug={slug} /> : <FeedList t={t} />;
}

/* ------------------------------- Liste ------------------------------- */

function FeedList({ t }: { t: (key: string) => string }) {
  const [articles, setArticles] = useState<FeedArticleListItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchFeed()
      .then((list) => {
        if (!cancelled) setArticles(list);
      })
      .catch(() => {
        /* état vide sobre */
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [featured, ...rest] = articles;

  return (
    <>
      <section className="py-6 md:py-9">
        <div className="container-arsenal">
          <h1 className="font-display text-[clamp(1.6rem,3.6vw,2.4rem)] font-bold leading-tight tracking-tight">
            {t("feed_title")}
          </h1>
          <p className="mt-2 max-w-[56ch] leading-relaxed text-tx2">{t("feed_sub")}</p>
        </div>
      </section>

      <section className="container-arsenal pb-14">
        {!loaded ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="overflow-hidden rounded-2xl border border-line bg-s1">
                <div className="aspect-[16/9] bg-s2" />
                <div className="p-4">
                  <div className="mb-2 h-3 w-2/5 rounded bg-s2" />
                  <div className="mb-2 h-3 w-4/5 rounded bg-s2" />
                  <div className="h-3 w-3/5 rounded bg-s2" />
                </div>
              </div>
            ))}
          </div>
        ) : articles.length === 0 ? (
          <p className="py-14 text-center font-mono text-[0.85rem] text-tx3">{t("feed_empty")}</p>
        ) : (
          <>
            {/* Article principal — premier de la liste */}
            <Link
              href={`/feed/?a=${encodeURIComponent(featured.slug)}`}
              className="group mb-4 grid overflow-hidden rounded-2xl border border-line bg-s1 transition-colors hover:border-line2 hover:bg-s2 sm:grid-cols-[1.2fr_1fr]"
            >
              {featured.coverUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={featured.coverUrl}
                  alt=""
                  className="aspect-[16/9] h-full w-full border-b border-line object-cover sm:border-b-0 sm:border-r"
                />
              ) : (
                <div className="flex aspect-[16/9] w-full items-center justify-center border-b border-line bg-s2 font-display text-[2rem] font-bold text-tx3 sm:border-b-0 sm:border-r">
                  A
                </div>
              )}
              <div className="flex flex-col justify-center p-5 sm:p-6">
                <p className="flex items-center gap-2 font-mono text-[0.64rem] uppercase tracking-[0.12em] text-tx3">
                  <span className="rounded border border-[rgba(230,57,70,0.45)] bg-[rgba(230,57,70,0.08)] px-1.5 py-0.5 text-brand">
                    {t("feed_title")}
                  </span>
                  {featured.category && <span className="text-teal">{featured.category}</span>}
                  {featured.publishedAt && <span>{formatArticleDate(featured.publishedAt)}</span>}
                </p>
                <h2 className="mt-2 font-display text-[clamp(1.2rem,2.6vw,1.6rem)] font-bold leading-snug text-tx1 group-hover:underline group-hover:decoration-[#e63946] group-hover:decoration-2 group-hover:underline-offset-4">
                  {featured.title}
                </h2>
                {featured.excerpt && (
                  <p className="mt-2 line-clamp-3 text-[0.88rem] leading-relaxed text-tx2">
                    {featured.excerpt}
                  </p>
                )}
              </div>
            </Link>

            {rest.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map((a) => (
                  <ArticleCard key={a.slug} article={a} />
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}

/* ------------------------------- Article ------------------------------- */

function ArticleView({ slug }: { slug: string }) {
  const { t } = useI18n();
  const [article, setArticle] = useState<FeedArticle | null>(null);
  const [loaded, setLoaded] = useState(false);
  const { products } = useCatalog();

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    fetchFeedArticle(slug)
      .then((a) => {
        if (!cancelled) setArticle(a);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Étape du parcours (pont de tracking) — best-effort, jamais bloquant.
  useEffect(() => {
    if (article) void trackStep("feed_view");
  }, [article]);

  if (!loaded) {
    return (
      <p className="container-arsenal py-24 text-center font-mono text-[0.85rem] text-tx3">
        Chargement…
      </p>
    );
  }

  if (!article) {
    return (
      <div className="container-arsenal flex flex-col items-center gap-3 py-24 text-center text-tx3">
        <h1 className="text-[1.3rem] font-semibold text-tx2">Article introuvable</h1>
        <p className="max-w-[44ch] text-[0.9rem]">
          Cet article n&apos;existe pas ou n&apos;est pas publié.
        </p>
        <Link href="/feed/" className="btn-arsenal btn-primary btn-sm mt-2">
          {t("feed_back")}
        </Link>
      </div>
    );
  }

  const video = parseVideoUrl(article.videoUrl ?? "");
  const relatedProduct =
    (article.productId && products.find((p) => p.id === article.productId)) || null;
  const paragraphs = article.content
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const share = async () => {
    const url = `${window.location.origin}/feed/?a=${encodeURIComponent(article.slug)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: article.title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast(t("feed_share_copied"), "success");
    } catch {
      /* partage annulé : silencieux */
    }
  };

  return (
    <article className="container-arsenal max-w-3xl pb-16 pt-8">
      <nav className="mb-5" aria-label={t("feed_back")}>
        <Link
          href="/feed/"
          className="inline-flex items-center gap-1.5 font-mono text-[0.78rem] text-tx3 hover:text-tx1"
        >
          <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {t("feed_back")}
        </Link>
      </nav>

      {article.coverUrl && (
        <div className="relative mb-6 aspect-[16/9] overflow-hidden rounded-xl border border-line bg-s1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={article.coverUrl} alt="" className="h-full w-full object-cover" />
        </div>
      )}

      <header>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[0.68rem] uppercase tracking-[0.12em] text-tx3">
          {article.category && <span className="text-teal">{article.category}</span>}
          {article.publishedAt && (
            <span>
              {t("feed_published_on")} {formatArticleDate(article.publishedAt)}
            </span>
          )}
        </p>
        <h1 className="mt-2 font-display text-[clamp(1.5rem,3.4vw,2.1rem)] font-bold leading-tight tracking-tight text-tx1">
          {article.title}
        </h1>
        {article.excerpt && (
          <p className="mt-3 text-[1rem] leading-relaxed text-tx2">{article.excerpt}</p>
        )}
      </header>

      {paragraphs.length > 0 && (
        <div className="mt-7 flex flex-col gap-5">
          {paragraphs.map((block, i) => (
            <p key={i} className="whitespace-pre-line text-[0.97rem] leading-[1.8] text-tx2">
              {block}
            </p>
          ))}
        </div>
      )}

      {video && (
        <section className="mt-8">
          <MediaEmbed video={video} />
        </section>
      )}

      {relatedProduct && (
        <section className="mt-10">
          <h2 className="mb-3 flex items-center gap-2.5 font-mono text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-tx3">
            {t("feed_related_product")}
            <span className="h-px flex-1 bg-line" />
          </h2>
          <div className="max-w-[420px]">
            <ProductCard p={relatedProduct} />
          </div>
        </section>
      )}

      <footer className="mt-10 flex items-center justify-between border-t border-line pt-5">
        <button type="button" onClick={() => void share()} className="btn-arsenal btn-ghost btn-sm">
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 3v13M7 8l5-5 5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {t("feed_share")}
        </button>
        <Link href="/feed/" className="font-mono text-[0.76rem] text-tx3 hover:text-tx1">
          {t("feed_back")} →
        </Link>
      </footer>
    </article>
  );
}

export default function FeedPage() {
  return (
    <Suspense
      fallback={
        <p className="container-arsenal py-24 text-center font-mono text-[0.85rem] text-tx3">
          Chargement…
        </p>
      }
    >
      <FeedBody />
    </Suspense>
  );
}
