"use client";

/**
 * Mentions légales — page publique (chantier B).
 * Le contenu est rédigé par l'admin (Paramètres → Pages légales) et lu via
 * GET /api/legal. Texte BRUT multi-lignes, jamais de markdown. Tant que
 * l'admin n'a rien écrit, la page affiche un état neutre : aucun texte
 * juridique n'est jamais inventé.
 */

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface LegalResponse {
  ok?: boolean;
  privacy?: string;
  terms?: string;
  notice?: string;
}

export default function MentionsLegalesPage() {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [text, setText] = useState("");

  useEffect(() => {
    let cancelled = false;
    apiFetch<LegalResponse>("/api/legal", { timeoutMs: 6000 })
      .then((res) => {
        if (cancelled) return;
        setText(typeof res.notice === "string" ? res.notice : "");
        setState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <article className="container-arsenal max-w-3xl pb-16 pt-8">
      <h1 className="font-display text-[clamp(1.6rem,3.6vw,2.2rem)] font-bold leading-tight tracking-tight">
        Mentions légales
      </h1>

      <div className="mt-6 max-w-[72ch]">
        {state === "loading" ? (
          <p className="font-mono text-[0.85rem] text-tx3">Chargement…</p>
        ) : state === "error" ? (
          <p className="text-[0.92rem] leading-relaxed text-tx2">
            Le contenu de cette page est momentanément indisponible.
          </p>
        ) : text.trim() ? (
          <p className="whitespace-pre-line text-[0.95rem] leading-[1.75] text-tx2">{text}</p>
        ) : (
          <div className="rounded-2xl border border-line bg-s1 p-5">
            <p className="text-[0.92rem] leading-relaxed text-tx2">
              Cette page n&rsquo;est pas encore renseignée.
            </p>
          </div>
        )}
      </div>
    </article>
  );
}
