"use client";

/**
 * Bloc vidéo démo — auto-détection du format (TikTok/Shorts → 9:16, YouTube → 16:9)
 */

import { ParsedVideo } from "@/lib/video";

export function MediaEmbed({ video }: { video: ParsedVideo }) {
  return (
    <div>
      {video.vertical ? (
        <div className="flex justify-center rounded-[10px] border border-line bg-bg py-3">
          <div className="relative h-[min(66dvh,560px)] max-w-full overflow-hidden rounded-xl shadow-[0_24px_48px_rgba(0,0,0,0.55)]" style={{ aspectRatio: "9/16" }}>
            <iframe
              src={video.embedUrl}
              title="Démonstration vidéo"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              className="absolute inset-0 h-full w-full border-0"
            />
          </div>
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-[10px] border border-line2 bg-bg shadow-[0_18px_44px_rgba(0,0,0,0.45)]" style={{ aspectRatio: "16/9" }}>
          <iframe
            src={video.embedUrl}
            title="Démonstration vidéo"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            className="absolute inset-0 h-full w-full border-0"
          />
        </div>
      )}
      <p className="mt-2 inline-flex items-center gap-1.5 font-mono text-[0.62rem] uppercase tracking-[0.08em] text-tx3">
        Format détecté : <b className="font-semibold text-teal">{video.label}</b> — intégration{" "}
        {video.vertical ? "verticale 9:16" : "horizontale 16:9"}
      </p>
    </div>
  );
}
