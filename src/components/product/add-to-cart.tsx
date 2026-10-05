"use client";

/**
 * Bouton « Ajouter au panier » — page produit.
 *
 * Sobre, à côté de l'achat : utilisé par TOUS (visiteur, simple utilisateur,
 * membre). Un visiteur sans compte remplit son panier sans friction ; aucune
 * monnaie A n'est évoquée ici (le prix affiché vient de la fiche produit).
 *
 * États :
 *  • repos   → « Ajouter au panier »
 *  • en cours → désactivé, libellé « Ajout… »
 *  • ajouté   → « Ajouté au panier ✓ » pendant ~2 s, plus un lien vers le panier
 *  • erreur   → message bref, le bouton redevient actionnable
 *
 * L'état local (compteur d'articles) est mis à jour par lib/cart.ts, qui émet
 * « arsenal-cart-changed » — un badge éventuel dans le header s'y abonne.
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { addToCart } from "@/lib/cart";
import { trackStep } from "@/lib/purchases";

type Status = "idle" | "busy" | "added" | "error";

export function AddToCart({ productId }: { productId: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const timerRef = useRef<number | null>(null);

  // Nettoyage du minuteur de feedback au démontage
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const add = useCallback(async () => {
    if (status === "busy") return;
    setStatus("busy");
    setError("");
    try {
      await addToCart(productId, 1);
      setStatus("added");
      // Étape du parcours (vague 4) — best-effort, jamais bloquant.
      void trackStep("add_to_cart");
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setStatus("idle"), 2200);
    } catch (err) {
      setStatus("error");
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Ajout impossible pour le moment."
      );
    }
  }, [productId, status]);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => void add()}
        disabled={status === "busy"}
        className="btn-arsenal btn-ghost w-full"
      >
        {status === "added" ? (
          <>
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
              <path
                d="m5 13 4 4L19 7"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Ajouté au panier
          </>
        ) : status === "busy" ? (
          "Ajout…"
        ) : (
          "Ajouter au panier"
        )}
      </button>

      {status === "added" && (
        <Link href="/compte/panier" className="text-center text-[0.78rem] text-teal hover:underline">
          Voir mon panier
        </Link>
      )}
      {status === "error" && (
        <p role="alert" className="text-[0.78rem] leading-relaxed text-dangertx">
          {error}
        </p>
      )}
    </div>
  );
}
