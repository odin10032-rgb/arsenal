"use client";

/**
 * Carte produit — visuel SANS filigrane (ni badge, ni catégorie : ils vivent
 * sur la page produit), heat clics, image lazy.
 */

import Link from "next/link";
import { BADGE_LABELS, Badge, Product, safeUrl } from "@/lib/products";
import { fmt } from "@/lib/format";

const FALLBACK_IMAGE =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='640' height='400'><rect width='640' height='400' fill='%23141414'/><path d='M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z' fill='%23666666' transform='translate(272 152) scale(4)'/></svg>",
  );

const BADGE_CLASSES: Record<Badge, string> = {
  gratuit: "text-teal border-[rgba(42,157,143,0.45)] bg-[rgba(42,157,143,0.1)]",
  premium: "text-bpremium border-[rgba(155,93,229,0.5)] bg-[rgba(155,93,229,0.14)]",
  beta: "text-goldtx border-[rgba(244,162,97,0.45)] bg-[rgba(244,162,97,0.1)]",
  nouveau: "text-bnew border-[rgba(0,180,216,0.45)] bg-[rgba(0,180,216,0.1)]",
};

export function BadgePill({ badge }: { badge: Badge }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[0.6rem] font-bold uppercase tracking-[0.09em] ${BADGE_CLASSES[badge]}`}
    >
      {BADGE_LABELS[badge]}
    </span>
  );
}

export function ProductCard({ p }: { p: Product }) {
  const image = safeUrl(p.imageUrl);
  return (
    <Link
      href={`/produit?id=${encodeURIComponent(p.id)}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-s1 transition-transform duration-200 hover:-translate-y-0.5 hover:border-line2"
      aria-label={`Voir les détails de ${p.title}`}
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-s2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image || FALLBACK_IMAGE}
          alt={`Couverture de ${p.title}`}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={(e) => {
            const img = e.currentTarget;
            if (img.src !== FALLBACK_IMAGE) img.src = FALLBACK_IMAGE;
          }}
        />
        {/* Aucun filigrane sur le visuel (décision propriétaire du 05/10) :
            ni badge de statut ni genre de produit sur les cartes — l'acheteur
            voit ces informations sur la PAGE DU PRODUIT uniquement. Les filtres
            du catalogue restent, eux, pleinement actifs. */}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-[1.02rem] font-semibold leading-snug tracking-tight">{p.title}</h3>
          <span
            className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-[rgba(244,162,97,0.25)] bg-[rgba(244,162,97,0.08)] px-2 py-0.5 font-mono text-[0.66rem] font-semibold text-warn"
            title="Nombre de clics"
          >
            <svg viewBox="0 0 24 24" width="10" height="10" aria-hidden="true">
              <path
                d="M12 22c4 0 7-2.6 7-6.5 0-4-3-6-4-9.5-2.5 1.5-3 4-3 4s-.5-2-2-3.5c-.5 2-1 3-2.5 4.5S5 12.5 5 15.5C5 19.4 8 22 12 22z"
                fill="currentColor"
              />
            </svg>
            {fmt(p.clicks)}
          </span>
        </div>

        <p className="line-clamp-2 text-[0.84rem] leading-relaxed text-tx2">
          {p.shortDescription}
        </p>

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-3">
          <span className="font-mono text-[0.78rem] font-semibold text-pricetx">{p.price}</span>
          <span className="inline-flex items-center gap-1.5 text-[0.78rem] font-semibold text-teal transition-all group-hover:gap-2.5 group-hover:text-ok">
            Détails
            <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
              <path d="M14 3h7v7M21 3 11 13M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>
      </div>
    </Link>
  );
}
