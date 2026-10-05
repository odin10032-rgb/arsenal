"use client";

/**
 * Bandeau de notifications de l'espace affilié (cycle de vie, migration 0014).
 *
 * Affiche les notifications NON LUES émises par les événements admin :
 * produit retiré du programme / redevenu éligible / indisponible / supprimé,
 * campagne terminée ou mise en pause. Le contenu vient du SERVEUR (message
 * pré-écrit) — rien n'est calculé côté client.
 *
 * « J'ai compris » marque tout comme lu côté serveur : les notifications ne
 * réapparaissent pas à la prochaine visite.
 */

import { useCallback, useEffect, useState } from "react";
import {
  fetchNotifications,
  markNotificationsRead,
  type AffiliateNotification,
} from "@/lib/affiliate";

export function AffiliateNotifications() {
  const [items, setItems] = useState<AffiliateNotification[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await fetchNotifications());
    } catch {
      /* API injoignable : aucun bandeau, jamais bloquant */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dismiss = async () => {
    if (busy) return;
    setBusy(true);
    // Optimiste : le bandeau disparaît tout de suite, la lecture est best-effort.
    const previous = items;
    setItems([]);
    try {
      await markNotificationsRead();
    } catch {
      setItems(previous); // échec réseau : on rend la main à la prochaine visite
    } finally {
      setBusy(false);
    }
  };

  if (items.length === 0) return null;

  return (
    <section
      className="mt-5 rounded-xl border border-[rgba(244,162,97,0.35)] bg-[rgba(244,162,97,0.07)] p-4"
      aria-label="Notifications"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-mono text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#f4a261]">
          Informations ({items.length})
        </h2>
        <button
          type="button"
          onClick={() => void dismiss()}
          disabled={busy}
          className="btn-arsenal btn-ghost btn-sm flex-shrink-0"
        >
          J&apos;ai compris
        </button>
      </div>
      <ul className="mt-2.5 flex flex-col gap-2">
        {items.map((n) => (
          <li key={n.id} className="text-[0.84rem] leading-relaxed text-[#d8d8d8]">
            {n.message}
          </li>
        ))}
      </ul>
    </section>
  );
}
