"use client";

/**
 * Médiathèque — uploads backend + médias déduits des produits.
 * Filtres type, recherche, copie du lien, lecteur vidéo clic-pour-charger.
 */

import { useEffect, useMemo, useState } from "react";
import { fetchUploads, MediaItem } from "@/lib/admin";
import { Product } from "@/lib/products";
import { parseVideoUrl, ParsedVideo } from "@/lib/video";
import { toast } from "@/lib/toast";

type Filter = "all" | "image" | "video";

interface Entry {
  url: string;
  kind: "image" | "video";
  source: "produit" | "upload";
  label?: string;
  video?: ParsedVideo;
}

export function MediaTab({
  products,
  apiAvailable,
}: {
  products: Product[];
  apiAvailable: boolean;
}) {
  const [uploads, setUploads] = useState<MediaItem[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [playing, setPlaying] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!apiAvailable) return;
    fetchUploads()
      .then(setUploads)
      .catch(() => {});
  }, [apiAvailable]);

  const entries: Entry[] = useMemo(() => {
    const out: Entry[] = [];
    for (const u of uploads) {
      const v = parseVideoUrl(u.url);
      out.push({
        url: u.url,
        kind: v ? "video" : "image",
        source: "upload",
        video: v || undefined,
      });
    }
    for (const p of products) {
      if (p.imageUrl) out.push({ url: p.imageUrl, kind: "image", source: "produit", label: p.title });
      const v = parseVideoUrl(p.videoUrl);
      if (v) out.push({ url: v.sourceUrl, kind: "video", source: "produit", label: p.title, video: v });
    }
    return out;
  }, [uploads, products]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (filter !== "all" && e.kind !== filter) return false;
      if (q && !e.url.toLowerCase().includes(q) && !(e.label && e.label.toLowerCase().includes(q)))
        return false;
      return true;
    });
  }, [entries, filter, query]);

  const images = entries.filter((e) => e.kind === "image").length;
  const videos = entries.filter((e) => e.kind === "video").length;

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      toast("Lien copié.", "success");
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast("Copie impossible.", "error");
    }
  };

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="font-display text-[1.2rem] font-bold">Médiathèque</h2>
        <span className="rounded-full border border-[#333] bg-[#141414] px-2.5 py-1 font-mono text-[0.64rem] text-[#666]">
          {entries.length} médias ({images} images · {videos} vidéos)
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {(["all", "image", "video"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className="rounded-full border px-3 py-1.5 font-mono text-[0.7rem] uppercase tracking-wide transition-colors"
              style={
                filter === f
                  ? { color: "#e63946", borderColor: "rgba(230,57,70,0.6)", background: "rgba(230,57,70,0.1)" }
                  : { color: "#666", borderColor: "#333" }
              }
            >
              {f === "all" ? "Tout" : f === "image" ? "Images" : "Vidéos"}
            </button>
          ))}
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrer par URL ou produit…"
            aria-label="Filtrer la médiathèque"
            className="input-arsenal max-w-[240px] py-2"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((e, i) => (
          <div
            key={e.url + i}
            className="flex flex-col overflow-hidden rounded-[10px] border border-[#333] bg-[#141414] transition-colors hover:border-[#444]"
          >
            <div className="relative grid aspect-[16/10] place-items-center overflow-hidden bg-[#0d0d0d]">
              {e.kind === "image" ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={e.url} alt={e.label || "Média"} loading="lazy" className="h-full w-full object-cover" />
              ) : playing === e.url && e.video ? (
                <iframe
                  src={e.video.embedUrl}
                  title="Lecteur vidéo"
                  allow="encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                  className="absolute inset-0 h-full w-full border-0"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setPlaying(e.url)}
                  className="grid h-full w-full place-items-center bg-[#101010] text-[#a0a0a0] transition-colors hover:bg-[#161616]"
                  aria-label="Charger la vidéo"
                >
                  <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
                    <rect x="3" y="5" width="13" height="14" rx="2" />
                    <path d="m16 10 5-3v10l-5-3z" />
                  </svg>
                </button>
              )}
            </div>
            <div className="flex flex-col gap-2 p-3">
              <div className="flex items-center gap-2">
                <span
                  className="rounded border px-1.5 py-0.5 font-mono text-[0.56rem] font-bold uppercase tracking-[0.1em]"
                  style={
                    e.kind === "image"
                      ? { color: "#56b8a8", borderColor: "rgba(42,157,143,0.4)", background: "rgba(42,157,143,0.08)" }
                      : { color: "#fda4af", borderColor: "rgba(230,57,70,0.4)", background: "rgba(230,57,70,0.08)" }
                  }
                >
                  {e.kind}
                </span>
                {e.source === "produit" && e.label && (
                  <span className="truncate font-mono text-[0.62rem] text-[#666]">{e.label}</span>
                )}
              </div>
              <p className="max-h-[3em] overflow-hidden break-all rounded-md border border-[#333] bg-[rgba(8,8,8,0.6)] p-1.5 font-mono text-[0.62rem] leading-relaxed text-[#666]">
                {e.url}
              </p>
              <button
                type="button"
                onClick={() => copy(e.url)}
                className="btn-arsenal btn-ghost btn-sm w-full justify-center font-mono"
              >
                {copied === e.url ? "Copié !" : "Copier le lien"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="py-10 text-center font-mono text-[0.85rem] text-[#666]">
          Aucun média ne correspond.
        </p>
      )}
    </section>
  );
}
