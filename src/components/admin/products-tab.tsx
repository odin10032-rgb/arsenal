"use client";

/**
 * Onglet Produits — liste (tri updatedAt desc), recherche locale,
 * suppression avec confirmation, ouverture du formulaire
 */

import { useMemo, useState } from "react";
import { ConfirmDialog } from "./confirm-dialog";
import { ProductForm } from "./product-form";
import { BadgePill } from "@/components/product-card";
import { productDelete } from "@/lib/admin";
import { CATEGORIES, Product } from "@/lib/products";
import { parseVideoUrl } from "@/lib/video";
import { fmt } from "@/lib/format";
import { toast } from "@/lib/toast";

export function ProductsTab({
  products,
  apiAvailable,
  reload,
}: {
  products: Product[];
  apiAvailable: boolean;
  reload: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Product | null>(null); // produit en édition
  const [creating, setCreating] = useState(false); // formulaire en création
  const [deleting, setDeleting] = useState<Product | null>(null); // confirmation
  const [busyDelete, setBusyDelete] = useState(false);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...products]
      .filter((p) => !q || p.title.toLowerCase().includes(q) || CATEGORIES[p.category].toLowerCase().includes(q))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [products, query]);

  const doDelete = async () => {
    if (!deleting || busyDelete) return;
    setBusyDelete(true);
    try {
      if (apiAvailable) {
        await productDelete(deleting.id);
      }
      await reload();
      toast(`« ${deleting.title} » supprimé du catalogue.`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Suppression impossible.", "error");
    } finally {
      setBusyDelete(false);
      setDeleting(null);
    }
  };

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="font-display text-[1.2rem] font-bold">Gestionnaire de produits</h2>
        <span className="rounded-full border border-[#333] bg-[#141414] px-2.5 py-1 font-mono text-[0.64rem] text-[#666]">
          sync API
        </span>
        <div className="ml-auto flex flex-1 items-center justify-end gap-2.5">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrer les produits…"
            aria-label="Filtrer les produits"
            className="input-arsenal max-w-[240px] py-2"
          />
          <button type="button" className="btn-arsenal btn-primary btn-sm" onClick={() => setCreating(true)}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Ajouter un produit
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        {list.map((p) => (
          <div
            key={p.id}
            className="flex flex-wrap items-center gap-3 rounded-[10px] border border-[#333] bg-[rgba(255,255,255,0.035)] p-3 transition-colors hover:border-[#444] hover:bg-[#1a1a1a]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.imageUrl}
              alt=""
              loading="lazy"
              className="h-[50px] w-[74px] flex-shrink-0 rounded-md border border-[#333] object-cover bg-[#141414]"
              onError={(e) => {
                e.currentTarget.style.visibility = "hidden";
              }}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.92rem] font-semibold">{p.title}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 font-mono text-[0.66rem] text-[#666]">
                <span>{CATEGORIES[p.category]}</span>
                {p.badges.slice(0, 3).map((b) => (
                  <BadgePill key={b} badge={b} />
                ))}
                {parseVideoUrl(p.videoUrl) && (
                  <span className="rounded border border-[rgba(0,180,216,0.4)] bg-[rgba(0,180,216,0.08)] px-1.5 py-0.5 text-[#4fb3d8]">
                    vidéo
                  </span>
                )}
                {/* Cycle de vie (migration 0014) : états visibles côté admin —
                    un produit supprimé restant listé pour traçabilité. */}
                {p.deletedAt != null && (
                  <span className="rounded border border-[rgba(230,57,70,0.45)] bg-[rgba(230,57,70,0.1)] px-1.5 py-0.5 text-[#fda4af]">
                    supprimé
                  </span>
                )}
                {p.deletedAt == null && p.unavailableAt != null && (
                  <span className="rounded border border-[rgba(244,162,97,0.45)] bg-[rgba(244,162,97,0.1)] px-1.5 py-0.5 text-[#f4a261]">
                    indisponible
                  </span>
                )}
              </div>
            </div>
            <div className="text-right font-mono text-[0.7rem] text-[#666]">
              <b className="block text-[0.95rem] font-semibold text-[#4fb3a1]">{fmt(p.clicks)}</b>
              clics
            </div>
            <div className="flex flex-shrink-0 gap-1.5">
              <button
                type="button"
                onClick={() => setEditing(p)}
                className="grid h-9 w-9 place-items-center rounded-lg border border-[#333] bg-[#141414] text-[#a0a0a0] transition-colors hover:border-[#444] hover:text-[#4fb3a1]"
                aria-label={`Modifier ${p.title}`}
                title="Modifier"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setDeleting(p)}
                className="grid h-9 w-9 place-items-center rounded-lg border border-[#333] bg-[#141414] text-[#a0a0a0] transition-colors hover:border-[rgba(230,57,70,0.55)] hover:bg-[rgba(230,57,70,0.12)] hover:text-[#fda4af]"
                aria-label={`Supprimer ${p.title}`}
                title="Supprimer"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                </svg>
              </button>
            </div>
          </div>
        ))}
        {list.length === 0 && (
          <p className="py-10 text-center font-mono text-[0.85rem] text-[#666]">
            {products.length === 0 ? "Aucun produit au catalogue." : "Aucun produit ne correspond au filtre."}
          </p>
        )}
      </div>

      {/* Formulaire (création / édition) */}
      {(creating || editing) && (
        <ProductForm
          product={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={async () => {
            setCreating(false);
            setEditing(null);
            await reload();
          }}
        />
      )}

      {/* Confirmation de suppression */}
      {deleting && (
        <ConfirmDialog
          title="Supprimer ce produit ?"
          message={`« ${deleting.title} » disparaîtra du catalogue public. Cette action est irréversible.`}
          confirmLabel="Supprimer définitivement"
          busy={busyDelete}
          onCancel={() => setDeleting(null)}
          onConfirm={doDelete}
        />
      )}
    </section>
  );
}
