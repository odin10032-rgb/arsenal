"use client";

/**
 * Carte d'article du Feed — couverture, catégorie, date, titre, accroche.
 * Utilisée par l'accueil (derniers articles) et la page /feed/.
 * Lien : `/feed/?a=<slug>` (query — survit à la normalisation trailingSlash).
 */

import Link from "next/link";
import { formatArticleDate, type FeedArticleListItem } from "@/lib/feed";

export function ArticleCard({ article }: { article: FeedArticleListItem }) {

  return (
    <Link
      href={`/feed/?a=${encodeURIComponent(article.slug)}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-s1 transition-colors hover:border-line2 hover:bg-s2"
    >
      {article.coverUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={article.coverUrl}
          alt=""
          loading="lazy"
          className="aspect-[16/9] w-full border-b border-line object-cover"
        />
      ) : (
        <div className="flex aspect-[16/9] w-full items-center justify-center border-b border-line bg-s2 font-display text-[1.6rem] font-bold text-tx3">
          A
        </div>
      )}
      <div className="flex flex-1 flex-col p-4">
        <p className="flex items-center gap-2 font-mono text-[0.64rem] uppercase tracking-[0.1em] text-tx3">
          {article.category && <span className="text-teal">{article.category}</span>}
          {article.publishedAt && <span>{formatArticleDate(article.publishedAt)}</span>}
        </p>
        <h3 className="mt-1.5 font-display text-[1rem] font-bold leading-snug text-tx1 group-hover:underline group-hover:decoration-[#e63946] group-hover:decoration-2 group-hover:underline-offset-4">
          {article.title}
        </h3>
        {article.excerpt && (
          <p className="mt-1.5 line-clamp-3 text-[0.84rem] leading-relaxed text-tx2">
            {article.excerpt}
          </p>
        )}
      </div>
    </Link>
  );
}