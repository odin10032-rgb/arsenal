/**
 * Arsenal Tools — détection de vidéos démo (regex identiques au site validé)
 */

export interface ParsedVideo {
  platform: "tiktok" | "shorts" | "youtube" | "iframe";
  id: string;
  vertical: boolean;
  label: string;
  embedUrl: string;
  sourceUrl: string;
  thumb?: string;
}

/**
 * Parse une URL vidéo : TikTok (9:16), YouTube Shorts (9:16),
 * YouTube classique / youtu.be / live (16:9), iframe directe.
 * Retourne null si l'URL n'est pas reconnue ou non sûre.
 */
export function parseVideoUrl(raw: unknown): ParsedVideo | null {
  if (typeof raw !== "string") return null;
  const url = raw.trim();
  if (!url) return null;
  if (!/^(https?:\/\/|\/)/i.test(url)) return null;

  // TikTok — vidéo verticale.
  // ⚠️ L'ancien endpoint `www.tiktok.com/embed/v2/<id>` ne fonctionne PLUS
  // (vérifié le 03/10/2026 : réponse 503 Service Unavailable) — les vidéos ne
  // s'affichaient donc jamais. Le format valide aujourd'hui est `player/v1/<id>`.
  const tiktok = url.match(/tiktok\.com\/(?:@[\w.-]+\/)?(?:video|photo)\/(\d{6,})/i);
  if (tiktok) {
    return {
      platform: "tiktok",
      id: tiktok[1],
      vertical: true,
      label: "TikTok",
      embedUrl: `https://www.tiktok.com/player/v1/${tiktok[1]}`,
      sourceUrl: url,
    };
  }
  const vmTiktok = url.match(/vm\.tiktok\.com\/([A-Za-z0-9]+)/i);
  if (vmTiktok) {
    return {
      platform: "tiktok",
      id: vmTiktok[1],
      vertical: true,
      label: "TikTok",
      embedUrl: url,
      sourceUrl: url,
    };
  }

  // YouTube Shorts — vertical
  const shorts = url.match(/youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/i);
  if (shorts) {
    return {
      platform: "shorts",
      id: shorts[1],
      vertical: true,
      label: "YouTube Shorts",
      embedUrl: `https://www.youtube-nocookie.com/embed/${shorts[1]}?rel=0&autoplay=0`,
      sourceUrl: url,
      thumb: `https://i.ytimg.com/vi/${shorts[1]}/hqdefault.jpg`,
    };
  }

  // YouTube classique — horizontal
  const youtube = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i,
  );
  if (youtube) {
    return {
      platform: "youtube",
      id: youtube[1],
      vertical: false,
      label: "YouTube",
      embedUrl: `https://www.youtube-nocookie.com/embed/${youtube[1]}?rel=0&autoplay=0`,
      sourceUrl: url,
      thumb: `https://i.ytimg.com/vi/${youtube[1]}/hqdefault.jpg`,
    };
  }

  // iframe directe (player externe)
  if (/\/embed|player\./i.test(url)) {
    return {
      platform: "iframe",
      id: "",
      vertical: false,
      label: "Vidéo intégrée",
      embedUrl: url,
      sourceUrl: url,
    };
  }

  return null;
}
