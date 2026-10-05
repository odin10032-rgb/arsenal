"use client";

/**
 * Page produit dédiée — /produit?id=<uuid> (et /produit/<uuid> via _redirects)
 * Contenu : cover, badges, description complète, vidéo démo (16:9 / 9:16),
 * bloc d'action par type. Le tracking "open" est envoyé à l'affichage.
 */

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ActionBlock } from "@/components/action-block";
import { MediaEmbed } from "@/components/media-embed";
import { BadgePill } from "@/components/product-card";
import { BuyWithA } from "@/components/product/buy-with-a";
import { useCatalog } from "@/hooks/use-catalog";
import { fmt, timeAgo } from "@/lib/format";
import { CATEGORIES, PRODUCT_LANGUAGES } from "@/lib/products";
import { trackStep } from "@/lib/purchases";
import { trackClick } from "@/lib/track";
import { parseVideoUrl } from "@/lib/video";

function ProductBody() {
  const searchId = useSearchParams().get("id") || "";
  // Trois formats d'URL supportés :
  //  /produit/?id=<id>       (liens internes — le plus fiable)
  //  /produit/#<id>          (partage d'URL propre)
  //  /produit/<id>           (rewrite Pages : pathname réécrit, hash requis)
  const [pathId, setPathId] = useState("");
  useEffect(() => {
    const applyLocation = () => {
      const hash = window.location.hash.replace(/^#/, "").trim();
      if (hash && !hash.includes("=")) {
        setPathId(decodeURIComponent(hash));
        return;
      }
      const m = window.location.pathname.match(/^\/produit\/([^/?#]+)/);
      if (m) setPathId(decodeURIComponent(m[1]));
    };
    applyLocation();
    window.addEventListener("hashchange", applyLocation);
    return () => window.removeEventListener("hashchange", applyLocation);
  }, []);
  const id = searchId || pathId;

  const { products, initialLoaded } = useCatalog();
  const product = products.find((p) => p.id === id) || null;
  const video = parseVideoUrl(product?.videoUrl);

  useEffect(() => {
    // Cycle de vie : un produit SUPPRIMÉ ne compte plus d'ouverture (la page
    // n'est qu'un message d'adieu pour les liens qui traînent encore).
    if (product && product.deletedAt == null) {
      trackClick(product.id, "open");
      // Étape du parcours (vague 4) — best-effort, jamais bloquant.
      void trackStep("product_view");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id, product?.deletedAt]);

  if (!initialLoaded) {
    return <p className="container-arsenal py-24 text-center font-mono text-tx3">Chargement…</p>;
  }

  if (!product) {
    return (
      <div className="container-arsenal flex flex-col items-center gap-3 py-24 text-center text-tx3">
        <h1 className="text-[1.3rem] font-semibold text-tx2">Produit introuvable</h1>
        <p className="max-w-[44ch] text-[0.9rem]">
          Cet outil n&apos;existe pas ou plus. Il a peut-être été retiré du catalogue.
        </p>
        <Link href="/" className="btn-arsenal btn-primary btn-sm mt-2">
          Retour au catalogue
        </Link>
      </div>
    );
  }

  // Cycle de vie (migration 0014, option A — suppression DOUCE) : le produit
  // supprimé garde une page d'accueil explicite pour les liens existants
  // (réseaux, affiliés) — jamais un « introuvable » sec qui laisse croire à une
  // erreur. Les ACHETEURS conservent leur accès dans leur compte.
  if (product.deletedAt != null) {
    return (
      <div className="container-arsenal flex flex-col items-center gap-3 py-24 text-center text-tx3">
        <h1 className="text-[1.3rem] font-semibold text-tx2">
          Ce produit n&apos;est plus disponible
        </h1>
        <p className="max-w-[46ch] text-[0.9rem]">
          « {product.title} » a été retiré du catalogue. Si vous l&apos;avez acheté, votre accès
          reste disponible depuis votre compte.
        </p>
        <Link href="/" className="btn-arsenal btn-primary btn-sm mt-2">
          Découvrir d&apos;autres produits
        </Link>
      </div>
    );
  }

  const unavailable = product.unavailableAt != null;

  return (
    <article className="container-arsenal max-w-3xl pb-16 pt-8">
      {/* Fil d'ariane discret */}
      <nav className="mb-5" aria-label="Retour">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 font-mono text-[0.78rem] text-tx3 hover:text-tx1"
        >
          <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Retour au catalogue
        </Link>
      </nav>

      {/* En-tête */}
      <header className="flex flex-col gap-4">
        <div className="relative aspect-[16/9] overflow-hidden rounded-xl border border-line bg-s1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={product.imageUrl} alt={`Couverture de ${product.title}`} className="h-full w-full object-cover" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {product.badges.map((b) => (
            <BadgePill key={b} badge={b} />
          ))}
          <span className="rounded-md border border-[rgba(42,157,143,0.3)] bg-[rgba(42,157,143,0.08)] px-2 py-0.5 font-mono text-[0.62rem] font-bold uppercase tracking-[0.09em] text-teal">
            {CATEGORIES[product.category]}
          </span>
        </div>

        <h1 className="font-display text-[clamp(1.5rem,3.4vw,2.1rem)] font-bold leading-tight tracking-tight">
          {product.title}
        </h1>

        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[0.78rem] text-tx2">
          <span className="inline-flex items-center gap-1 text-warn">
            <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
              <path d="M12 22c4 0 7-2.6 7-6.5 0-4-3-6-4-9.5-2.5 1.5-3 4-3 4s-.5-2-2-3.5c-.5 2-1 3-2.5 4.5S5 12.5 5 15.5C5 19.4 8 22 12 22z" fill="currentColor" />
            </svg>
            {fmt(product.clicks)} clics
          </span>
          <span>{timeAgo(product.createdAt)}</span>
          <span className="font-semibold text-pricetx">{product.price}</span>
          {/* Langues disponibles (migration 0007) — ligne discrète si déclarées */}
          {product.languages && product.languages.length > 0 && (
            <span>
              Disponible en :{" "}
              {product.languages.map((code) => PRODUCT_LANGUAGES[code] ?? code).join(" · ")}
            </span>
          )}
        </p>
      </header>

      {/* Cycle de vie : produit momentanément indisponible — bandeau explicite,
          la fiche reste consultable (description, médias) mais l'achat est fermé. */}
      {unavailable && (
        <p className="mt-5 rounded-lg border border-[rgba(244,162,97,0.35)] bg-[rgba(244,162,97,0.08)] px-4 py-3 text-[0.86rem] leading-relaxed text-warn">
          Ce produit est momentanément indisponible. Revenez plus tard — les liens de cette page
          restent valides.
        </p>
      )}

      {/* Description */}
      <section className="mt-8">
        <h2 className="mb-3 flex items-center gap-2.5 font-mono text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-tx3">
          Description
          <span className="h-px flex-1 bg-line" />
        </h2>
        <p className="whitespace-pre-line text-[0.95rem] leading-[1.75] text-tx2">
          {product.description || product.shortDescription}
        </p>
      </section>

      {/* Vidéo démo */}
      {video && (
        <section className="mt-8">
          <h2 className="mb-3 flex items-center gap-2.5 font-mono text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-tx3">
            <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" className="text-brand">
              <rect x="3" y="5" width="13" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="m16 10 5-3v10l-5-3z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            </svg>
            Média · démo
            <span className="h-px flex-1 bg-line" />
          </h2>
          <MediaEmbed video={video} />
        </section>
      )}

      {/* Action */}
      <section className="mt-8">
        <h2 className="mb-3 flex items-center gap-2.5 font-mono text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-tx3">
          Accès · {CATEGORIES[product.category]}
          <span className="h-px flex-1 bg-line" />
        </h2>
        {unavailable ? (
          <p className="text-[0.88rem] text-tx3">
            L&apos;achat est temporairement fermé pour ce produit. Suivez son retour depuis le
            catalogue.
          </p>
        ) : (
          <>
            {/* Achat en A — au-dessus des canaux existants, qui restent intacts */}
            {product.purchasable && (product.priceA ?? 0) > 0 && (
              <div className="mb-3">
                <BuyWithA product={product} />
              </div>
            )}
            <ActionBlock product={product} />
          </>
        )}
      </section>
    </article>
  );
}

export default function ProductPage() {
  return (
    <Suspense
      fallback={<p className="container-arsenal py-24 text-center font-mono text-tx3">Chargement…</p>}
    >
      <ProductBody />
    </Suspense>
  );
}
