"use client";

/**
 * Onglet admin « Feed » — couche éditoriale d'Arsenal (refonte 05/10).
 *
 * Liste (brouillons + publiés) et éditeur latéral : titre, identifiant d'URL,
 * accroche, contenu (paragraphes séparés par une ligne vide), couverture
 * (médiathèque ou URL), catégorie, vidéo YouTube, produit associé.
 * La publication est un acte explicite : « Publier » / « Dépublier ».
 *
 * Aucun contenu n'est inventé : tout ce qui s'affiche est saisi ici.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "./confirm-dialog";
import { fetchUploads, type MediaItem } from "@/lib/admin";
import {
  createAdminArticle,
  deleteAdminArticle,
  fetchAdminFeed,
  setAdminArticleStatus,
  updateAdminArticle,
  type AdminFeedArticle,
} from "@/lib/admin-feed";
import { Product } from "@/lib/products";
import { toast } from "@/lib/toast";

export function FeedTab({
  products,
  apiAvailable,
  reload,
}: {
  products: Product[];
  apiAvailable: boolean;
  reload: () => Promise<void>;
}) {
  const [articles, setArticles] = useState<AdminFeedArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AdminFeedArticle | "new" | null>(null);
  const [deleting, setDeleting] = useState<AdminFeedArticle | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!apiAvailable) {
      setLoading(false);
      return;
    }
    try {
      setArticles(await fetchAdminFeed());
    } catch (err) {
      toast(err instanceof Error ? err.message : "Chargement du feed impossible.", "error");
    } finally {
      setLoading(false);
    }
  }, [apiAvailable]);

  useEffect(() => {
    void load();
  }, [load]);

  const sorted = useMemo(
    () => [...articles].sort((a, b) => b.updatedAt - a.updatedAt),
    [articles]
  );

  const toggleStatus = async (a: AdminFeedArticle) => {
    if (busyId) return;
    setBusyId(a.id);
    try {
      const next = a.status === "published" ? "draft" : "published";
      await setAdminArticleStatus(a.id, next);
      await load();
      toast(next === "published" ? "Article publié." : "Article repassé en brouillon.", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Changement de statut impossible.", "error");
    } finally {
      setBusyId(null);
    }
  };

  const doDelete = async () => {
    if (!deleting || busyId) return;
    setBusyId(deleting.id);
    try {
      await deleteAdminArticle(deleting.id);
      await load();
      toast(`« ${deleting.title} » supprimé.`, "success");
      setDeleting(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Suppression impossible.", "error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="font-display text-[1.2rem] font-bold">Feed éditorial</h2>
        <span className="rounded-full border border-[#333] bg-[#141414] px-2.5 py-1 font-mono text-[0.64rem] text-[#666]">
          {sorted.filter((a) => a.status === "published").length} publié
          {sorted.filter((a) => a.status === "published").length > 1 ? "s" : ""} ·{" "}
          {sorted.filter((a) => a.status === "draft").length} brouillon
          {sorted.filter((a) => a.status === "draft").length > 1 ? "s" : ""}
        </span>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="btn-arsenal btn-primary btn-sm ml-auto"
        >
          + Nouvel article
        </button>
      </div>

      {loading ? (
        <p className="py-10 text-center font-mono text-[0.85rem] text-[#666]">Chargement…</p>
      ) : sorted.length === 0 ? (
        <p className="py-10 text-center font-mono text-[0.85rem] text-[#666]">
          Aucun article. Créez le premier — il n&apos;apparaîtra publiquement qu&apos;une fois publié.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {sorted.map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap items-center gap-3 rounded-[10px] border border-[#333] bg-[rgba(255,255,255,0.035)] p-3"
            >
              {a.coverUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={a.coverUrl}
                  alt=""
                  loading="lazy"
                  className="h-[50px] w-[74px] flex-shrink-0 rounded-md border border-[#333] bg-[#141414] object-cover"
                  onError={(e) => {
                    e.currentTarget.style.visibility = "hidden";
                  }}
                />
              ) : (
                <div className="grid h-[50px] w-[74px] flex-shrink-0 place-items-center rounded-md border border-[#333] bg-[#141414] font-display text-[1.1rem] font-bold text-[#444]">
                  A
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.92rem] font-semibold">{a.title}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 font-mono text-[0.66rem] text-[#666]">
                  <span className="rounded border border-[#333] px-1.5 py-0.5">/{a.slug}</span>
                  {a.category && <span>{a.category}</span>}
                  {a.status === "published" ? (
                    <span className="rounded border border-[rgba(42,157,143,0.45)] bg-[rgba(42,157,143,0.1)] px-1.5 py-0.5 text-[#4fb3a1]">
                      publié
                    </span>
                  ) : (
                    <span className="rounded border border-[rgba(244,162,97,0.45)] bg-[rgba(244,162,97,0.1)] px-1.5 py-0.5 text-[#f4a261]">
                      brouillon
                    </span>
                  )}
                  {a.productId && (() => {
                    const linked = products.find((p) => p.id === a.productId);
                    return linked ? (
                      <span className="rounded border border-[rgba(42,157,143,0.4)] bg-[rgba(42,157,143,0.08)] px-1.5 py-0.5 text-[#4fb3a1]">
                        produit lié
                      </span>
                    ) : null;
                  })()}
                </div>
              </div>
              <div className="flex flex-shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void toggleStatus(a)}
                  disabled={busyId === a.id}
                  className="btn-arsenal btn-ghost btn-sm"
                >
                  {busyId === a.id && <span className="spin" />}
                  {a.status === "published" ? "Dépublier" : "Publier"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(a)}
                  className="grid h-9 w-9 place-items-center rounded-lg border border-[#333] bg-[#141414] text-[#a0a0a0] transition-colors hover:border-[#444] hover:text-[#4fb3a1]"
                  aria-label={`Modifier ${a.title}`}
                  title="Modifier"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setDeleting(a)}
                  className="grid h-9 w-9 place-items-center rounded-lg border border-[#333] bg-[#141414] text-[#a0a0a0] transition-colors hover:border-[rgba(230,57,70,0.55)] hover:bg-[rgba(230,57,70,0.12)] hover:text-[#fda4af]"
                  aria-label={`Supprimer ${a.title}`}
                  title="Supprimer"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <ArticleEditor
          article={editing === "new" ? null : editing}
          products={products}
          apiAvailable={apiAvailable}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
            await reload();
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Supprimer cet article ?"
          message={`« ${deleting.title} » sera définitivement supprimé. Un article publié disparaît immédiatement du Feed public.`}
          confirmLabel="Supprimer"
          busy={busyId === deleting.id}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void doDelete()}
        />
      )}
    </section>
  );
}

/* ------------------------------ Éditeur ------------------------------ */

function ArticleEditor({
  article,
  products,
  apiAvailable,
  onClose,
  onSaved,
}: {
  article: AdminFeedArticle | null;
  products: Product[];
  apiAvailable: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState(article?.title ?? "");
  const [slug, setSlug] = useState(article?.slug ?? "");
  const [excerpt, setExcerpt] = useState(article?.excerpt ?? "");
  const [content, setContent] = useState(article?.content ?? "");
  const [coverUrl, setCoverUrl] = useState(article?.coverUrl ?? "");
  const [category, setCategory] = useState(article?.category ?? "");
  const [videoUrl, setVideoUrl] = useState(article?.videoUrl ?? "");
  const [productId, setProductId] = useState(article?.productId ?? "");
  const [library, setLibrary] = useState<MediaItem[]>([]);
  const [showLibrary, setShowLibrary] = useState(false);
  const [busy, setBusy] = useState(false);

  // Couverture : la médiathèque existante évite de copier des URLs à la main.
  useEffect(() => {
    if (!showLibrary || library.length) return;
    let cancelled = false;
    fetchUploads()
      .then((items) => {
        if (!cancelled) setLibrary(items);
      })
      .catch(() => {
        /* liste indisponible : la saisie d'URL reste possible */
      });
    return () => {
      cancelled = true;
    };
  }, [showLibrary, library.length]);

  const save = async () => {
    if (busy) return;
    if (!apiAvailable) {
      return toast("Enregistrement possible uniquement avec le backend connecté.", "error");
    }
    if (title.trim().length < 2) return toast("Titre requis (2 caractères minimum).", "error");
    setBusy(true);
    const payload = {
      title: title.trim(),
      slug: slug.trim() || undefined,
      excerpt: excerpt.trim(),
      content,
      coverUrl: coverUrl.trim() || null,
      category: category.trim() || null,
      videoUrl: videoUrl.trim() || null,
      productId: productId || null,
    };
    try {
      if (article) {
        await updateAdminArticle(article.id, payload);
        toast("Article mis à jour.", "success");
      } else {
        await createAdminArticle(payload);
        toast("Article créé (brouillon). Publiez-le quand il est prêt.", "success");
      }
      await onSaved();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Enregistrement impossible.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] bg-[rgba(5,5,5,0.7)]" onClick={onClose}>
      <aside
        className="absolute inset-y-0 right-0 flex w-full flex-col border-l border-[#444] bg-[#101010] md:w-[560px]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={article ? "Modifier l'article" : "Nouvel article"}
      >
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-[#333] bg-[rgba(255,255,255,0.02)] px-5 py-4">
          <h3 className="font-display text-[1.05rem] font-bold">
            {article ? "Modifier l'article" : "Nouvel article"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto grid h-9 w-9 place-items-center rounded-full border border-[#333] bg-[#141414] text-[#a0a0a0] hover:border-[#444] hover:text-[#f0f0f0]"
            aria-label="Fermer"
          >
            <svg viewBox="0 0 24 24" width="15" height="15">
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-[0.8rem] text-[#a0a0a0]">Titre *</span>
              <input
                className="input-arsenal"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex : Comment j'ai automatisé ma prospection"
                maxLength={140}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[0.8rem] text-[#a0a0a0]">
                Identifiant d&apos;URL <span className="text-[#666]">(laisser vide = dérivé du titre)</span>
              </span>
              <input
                className="input-arsenal font-mono text-[0.82rem]"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="mon-article"
                maxLength={80}
              />
              <span className="text-[0.72rem] text-[#666]">
                L&apos;article se lit sur /feed/?a={slug.trim() || "&lt;identifiant&gt;"}
              </span>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[0.8rem] text-[#a0a0a0]">
                Accroche <span className="text-[#666]">(cartes et aperçu)</span>
              </span>
              <textarea
                className="input-arsenal min-h-[64px] resize-y"
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
                maxLength={300}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[0.8rem] text-[#a0a0a0]">Contenu</span>
              <textarea
                className="input-arsenal min-h-[220px] resize-y leading-relaxed"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={"Premier paragraphe…\n\nDeuxième paragraphe (une ligne vide sépare les paragraphes)."}
              />
              <span className="text-[0.72rem] text-[#666]">
                Texte simple : une ligne vide = nouveau paragraphe. Les images passent par la
                couverture et la vidéo par le champ dédié.
              </span>
            </label>

            <div className="rounded-xl border border-[#333] bg-[rgba(255,255,255,0.02)] p-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-[0.8rem] text-[#a0a0a0]">Couverture</span>
                <div className="flex gap-2">
                  <input
                    className="input-arsenal flex-1 font-mono text-[0.78rem]"
                    value={coverUrl}
                    onChange={(e) => setCoverUrl(e.target.value)}
                    placeholder="https://… (ou choisir ci-dessous)"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLibrary((v) => !v)}
                    className="btn-arsenal btn-ghost btn-sm flex-shrink-0"
                  >
                    Médiathèque
                  </button>
                </div>
              </label>
              {coverUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={coverUrl}
                  alt="Aperçu de la couverture"
                  className="mt-3 aspect-video w-full rounded-[10px] border border-[#333] object-cover"
                  onError={(e) => {
                    e.currentTarget.style.visibility = "hidden";
                  }}
                />
              )}
              {showLibrary && (
                <div className="mt-3 max-h-[180px] overflow-y-auto rounded-lg border border-[#333] p-2">
                  {library.length === 0 ? (
                    <p className="p-2 font-mono text-[0.72rem] text-[#666]">Médiathèque vide.</p>
                  ) : (
                    <div className="grid grid-cols-4 gap-1.5">
                      {library.map((m) => (
                        <button
                          key={m.url}
                          type="button"
                          onClick={() => {
                            setCoverUrl(m.url);
                            setShowLibrary(false);
                          }}
                          className="overflow-hidden rounded border border-[#333] hover:border-[#e63946]"
                          title={m.filename || m.url}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={m.url} alt="" className="aspect-video w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <label className="flex flex-1 flex-col gap-1.5">
                <span className="text-[0.8rem] text-[#a0a0a0]">
                  Catégorie <span className="text-[#666]">(libre)</span>
                </span>
                <input
                  className="input-arsenal"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Ex : Prospection"
                  maxLength={40}
                />
              </label>
              <label className="flex flex-1 flex-col gap-1.5">
                <span className="text-[0.8rem] text-[#a0a0a0]">
                  Vidéo YouTube <span className="text-[#666]">(optionnel)</span>
                </span>
                <input
                  className="input-arsenal font-mono text-[0.78rem]"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="https://youtu.be/…"
                />
              </label>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-[0.8rem] text-[#a0a0a0]">
                Produit associé <span className="text-[#666]">(l&apos;article pointe vers sa fiche)</span>
              </span>
              <select
                className="input-arsenal cursor-pointer"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
              >
                <option value="">— Aucun —</option>
                {products
                  .filter((p) => p.deletedAt == null && p.unavailableAt == null)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        </div>

        <div className="flex flex-shrink-0 gap-3 border-t border-[#333] px-5 py-4">
          <button type="button" onClick={onClose} className="btn-arsenal btn-ghost flex-1">
            Annuler
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy}
            className="btn-arsenal btn-primary flex-1"
          >
            {busy && <span className="spin" />}
            {article ? "Enregistrer" : "Créer le brouillon"}
          </button>
        </div>
      </aside>
    </div>
  );
}
