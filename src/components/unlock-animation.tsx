"use client";

/**
 * Arsenal — animation de déblocage de statut (Phase 3, contrat §2).
 * Identité originale : pièce A en rotation 3D CSS, révélation du statut, bouton
 * « Passer » dès 400 ms. Une seule fois par statut et par utilisateur — l'état
 * « vue » est contrôlé serveur (status_unlock_events) ; ce composant ne fait que
 * le refléter et le marquer via markUnlockSeen().
 * prefers-reduced-motion : version statique en fondu, aucune rotation.
 */

import { useEffect, useState } from "react";
import { CoinA } from "./account/coin-a";
import { markUnlockSeen, type UnlockStatus } from "@/lib/unlock";

const LABELS: Record<UnlockStatus, { title: string; sub: string }> = {
  affiliate: { title: "AFFILIÉ", sub: "Votre espace affilié est débloqué." },
  super_affiliate: { title: "SUPER AFFILIATE", sub: "Nouveau niveau d'accès débloqué." },
};

export function UnlockAnimation({
  status,
  pseudo,
  onDone,
}: {
  status: UnlockStatus;
  pseudo: string;
  onDone: () => void;
}) {
  const [leaving, setLeaving] = useState(false);
  const label = LABELS[status];

  // Fermeture naturelle après 2,4 s (le bouton « Passer » est dispo dès 400 ms).
  useEffect(() => {
    const t = setTimeout(() => finish(), 2400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = () => {
    if (leaving) return;
    setLeaving(true);
    // Marquer vu côté serveur (idempotent) — un échec réseau n'est pas bloquant.
    void markUnlockSeen(status).catch(() => undefined);
    setTimeout(onDone, 260); // laisse le fondu de sortie se jouer
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-[rgba(5,5,5,0.94)] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Statut ${label.title} débloqué`}
      style={{ opacity: leaving ? 0 : 1, transition: "opacity 240ms ease" }}
    >
      <div className="unlock-coin">
        <CoinA size={120} />
      </div>

      <p className="unlock-reveal mt-8 font-mono text-[0.72rem] uppercase tracking-[0.35em] text-[#a0a0a0]">
        Statut débloqué
      </p>
      <h1 className="unlock-reveal unlock-delay-1 mt-3 font-display text-[2rem] font-bold tracking-wide text-gold sm:text-[2.6rem]">
        {label.title}
      </h1>
      <p className="unlock-reveal unlock-delay-2 mt-2 text-[0.9rem] text-[#f0f0f0]">
        {pseudo}
      </p>
      <p className="unlock-reveal unlock-delay-2 mt-1 text-[0.82rem] text-[#a0a0a0]">
        {label.sub}
      </p>

      <button
        type="button"
        onClick={finish}
        className="unlock-delay-3 btn-arsenal btn-ghost mt-10 min-h-[44px] px-8"
      >
        Passer
      </button>
    </div>
  );
}
