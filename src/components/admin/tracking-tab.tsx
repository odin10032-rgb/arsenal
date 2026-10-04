"use client";

/**
 * Onglet admin « Suivi » — pont de tracking (vague 6).
 *
 * Trois sections en LECTURE SEULE (mêmes codes que users-tab / purchases-tab :
 * `apiAvailable`, états de chargement, tableaux sobres) :
 *   1. Parcours récents   — a-t-il cliqué, regardé, ajouté au panier, acheté ? ;
 *   2. Conflits de liens  — visiteurs venus par PLUSIEURS liens, affilié retenu ;
 *   3. Recrutements       — parrainages de comptes et récompense versée ou non.
 *
 * MINIMISATION (§37) : aucune IP, aucun email, aucun identifiant de compte complet ;
 * les jetons sont TRONQUÉS côté serveur. La règle « dernier toucher » est rappelée
 * à l'écran car elle explique le résultat affiché.
 */

import { useCallback, useEffect, useState } from "react";
import {
  fetchTrackingConflicts,
  fetchTrackingReferrals,
  fetchTrackingSessions,
  type TrackingConflict,
  type TrackingReferral,
  type TrackingSession,
} from "@/lib/admin-tracking";

/** Libellés lisibles des étapes suivies (repli : la clé brute, jamais inventée). */
const STEP_LABELS: Record<string, string> = {
  product_view: "Vue produit",
  add_to_cart: "Panier",
  checkout_start: "Paiement",
  purchase: "Achat",
};

function stepLabel(step: string): string {
  return STEP_LABELS[step] ?? step.replace(/_+/g, " ");
}

function formatDateTime(ts: number | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Durée compacte : secondes → minutes → heures → jours (jamais de valeur inventée). */
function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} j`;
}

/** Petits compteurs d'étapes (pastilles monospace) — jamais affichés s'ils sont absents. */
function StepCounters({ steps }: { steps: Record<string, number> }) {
  const entries = Object.entries(steps);
  if (!entries.length) return <span className="text-[0.72rem] text-[#666]">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([step, count]) => (
        <span
          key={step}
          className="inline-flex items-center gap-1 rounded-md border border-[#333] bg-[#1a1a1a] px-1.5 py-0.5 font-mono text-[0.64rem] text-[#a0a0a0]"
          title={stepLabel(step)}
        >
          <span className="tabular-nums text-[#f0f0f0]">{count}</span>
          <span className="text-[#666]">×</span>
          <span>{stepLabel(step)}</span>
        </span>
      ))}
    </div>
  );
}

/** Section homogène (titre + compteur + description optionnelle). */
function Section({
  title,
  badge,
  description,
  children,
}: {
  title: string;
  badge: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[#333] bg-[#141414] p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h3 className="font-display text-[1.05rem] font-bold">{title}</h3>
        <span className="rounded-full border border-[#333] bg-[#1a1a1a] px-2.5 py-1 font-mono text-[0.62rem] text-[#666]">
          {badge}
        </span>
      </div>
      {description && (
        <p className="mb-3 text-[0.78rem] leading-relaxed text-[#666]">{description}</p>
      )}
      {children}
    </div>
  );
}

export function TrackingTab({ apiAvailable }: { apiAvailable: boolean }) {
  const [sessions, setSessions] = useState<TrackingSession[]>([]);
  const [conflicts, setConflicts] = useState<TrackingConflict[]>([]);
  const [referrals, setReferrals] = useState<TrackingReferral[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!apiAvailable) {
      setLoading(false);
      setError("Le suivi est disponible uniquement avec le backend connecté.");
      return;
    }
    setLoading(true);
    try {
      // Les trois lectures sont indépendantes : elles se chargent en parallèle.
      const [s, c, r] = await Promise.all([
        fetchTrackingSessions(100),
        fetchTrackingConflicts(50),
        fetchTrackingReferrals(100),
      ]);
      setSessions(s);
      setConflicts(c);
      setReferrals(r);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }, [apiAvailable]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="font-display text-[1.2rem] font-bold">Suivi</h2>
        <span className="rounded-full border border-[#333] bg-[#141414] px-2.5 py-1 font-mono text-[0.64rem] text-[#666]">
          parcours · liens · recrutement
        </span>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="btn-arsenal btn-ghost btn-sm ml-auto"
        >
          {loading && <span className="spin" />}
          Actualiser
        </button>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-[rgba(244,162,97,0.4)] bg-[rgba(244,162,97,0.07)] px-4 py-3 text-[0.85rem] text-[#f4a261]">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-5">
        {/* 1. Parcours récents */}
        <Section
          title="Parcours récents"
          badge={`${sessions.length} session${sessions.length > 1 ? "s" : ""}`}
          description="A-t-il cliqué, regardé, acheté ? Jeton tronqué, affilié d'origine et étapes agrégées (durée = première → dernière action)."
        >
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[0.8rem]">
              <thead>
                <tr>
                  {["Dernière activité", "Affilié d'origine", "Produit", "Étapes", "Durée"].map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap border-b border-[#444] px-3 py-2.5 text-left font-mono text-[0.62rem] uppercase tracking-[0.1em] text-[#666]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sessions.map((s, i) => (
                  <tr
                    key={`${s.token}-${i}`}
                    className="border-b border-[#222] last:border-0 hover:bg-[rgba(255,255,255,0.025)]"
                  >
                    <td className="whitespace-nowrap px-3 py-2.5 text-[0.72rem] text-[#a0a0a0]">
                      {formatDateTime(s.lastSeenAt)}
                      <span className="block font-mono text-[0.66rem] text-[#666]">{s.token}</span>
                    </td>
                    <td className="px-3 py-2.5 text-[#f0f0f0]">{s.affiliatePseudo || "—"}</td>
                    <td className="px-3 py-2.5 text-[#a0a0a0]">{s.productTitle || "—"}</td>
                    <td className="px-3 py-2.5">
                      <StepCounters steps={s.steps} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono tabular-nums text-[#a0a0a0]">
                      {formatDuration(s.durationMs)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && sessions.length === 0 && !error && (
              <p className="px-4 py-6 text-center font-mono text-[0.78rem] text-[#666]">
                Aucun parcours enregistré.
              </p>
            )}
            {loading && sessions.length === 0 && !error && (
              <p className="px-4 py-6 text-center font-mono text-[0.78rem] text-[#666]">Chargement…</p>
            )}
          </div>
        </Section>

        {/* 2. Conflits de liens */}
        <Section
          title="Conflits de liens"
          badge={`${conflicts.length} conflit${conflicts.length > 1 ? "s" : ""}`}
          description="Visiteurs venus par plusieurs liens : chaque toucher est conservé. Règle appliquée — DERNIER TOUCHER : c'est le dernier lien en date qui est retenu pour l'attribution."
        >
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[0.8rem]">
              <thead>
                <tr>
                  {["Visiteur", "Touchers successifs", "Affilié retenu"].map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap border-b border-[#444] px-3 py-2.5 text-left font-mono text-[0.62rem] uppercase tracking-[0.1em] text-[#666]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {conflicts.map((cf, i) => (
                  <tr
                    key={`${cf.token}-${i}`}
                    className="border-b border-[#222] last:border-0 hover:bg-[rgba(255,255,255,0.025)]"
                  >
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[0.68rem] text-[#666]">
                      {cf.token}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-col gap-1">
                        {cf.touches.map((t, ti) => (
                          <span key={ti} className="text-[0.74rem] text-[#a0a0a0]">
                            <span className="text-[#f0f0f0]">{t.affiliatePseudo || "—"}</span>
                            <span className="text-[#666]"> · {formatDateTime(t.at)}</span>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span className="rounded-md border px-2 py-0.5 font-mono text-[0.66rem]" style={{ color: "#7fd4cb", borderColor: "rgba(42,157,143,0.45)", background: "rgba(42,157,143,0.1)" }}>
                        {cf.retainedAffiliatePseudo || "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && conflicts.length === 0 && !error && (
              <p className="px-4 py-6 text-center font-mono text-[0.78rem] text-[#666]">
                Aucun conflit de liens détecté.
              </p>
            )}
          </div>
        </Section>

        {/* 3. Recrutements */}
        <Section
          title="Recrutements"
          badge={`${referrals.length} parrainage${referrals.length > 1 ? "s" : ""}`}
          description="Un compte créé via un lien affilié reste lié à son affilié d'origine : à son premier achat, une récompense A de recrutement est versée — une seule fois."
        >
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[0.8rem]">
              <thead>
                <tr>
                  {["Filleul", "Affilié recruteur", "Parrainé le", "Récompense"].map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap border-b border-[#444] px-3 py-2.5 text-left font-mono text-[0.62rem] uppercase tracking-[0.1em] text-[#666]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {referrals.map((r, i) => (
                  <tr
                    key={`${r.referredPseudo}-${i}`}
                    className="border-b border-[#222] last:border-0 hover:bg-[rgba(255,255,255,0.025)]"
                  >
                    <td className="px-3 py-2.5 text-[#f0f0f0]">{r.referredPseudo || "—"}</td>
                    <td className="px-3 py-2.5 text-[#a0a0a0]">{r.affiliatePseudo || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[0.72rem] text-[#666]">
                      {formatDateTime(r.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      {r.rewardedAt ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="rounded-md border px-2 py-0.5 font-mono text-[0.66rem]"
                            style={{ color: "#56b8a8", borderColor: "rgba(42,157,143,0.4)", background: "rgba(42,157,143,0.08)" }}
                          >
                            Versée
                          </span>
                          {r.rewardAmountA != null && (
                            <span className="font-mono tabular-nums text-[0.72rem] text-[#a0a0a0]">
                              {r.rewardAmountA}
                              <span className="text-gold"> A</span>
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="rounded-md border border-[#333] bg-[#1a1a1a] px-2 py-0.5 font-mono text-[0.66rem] text-[#666]">
                          En attente
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && referrals.length === 0 && !error && (
              <p className="px-4 py-6 text-center font-mono text-[0.78rem] text-[#666]">
                Aucun parrainage enregistré.
              </p>
            )}
          </div>
        </Section>

        {/* Rappel de minimisation (§37) */}
        <p className="text-[0.72rem] leading-relaxed text-[#666]">
          Minimisation des données : le suivi est anonyme (jeton opaque tronqué, aucune IP,
          aucun email, aucun identifiant de compte complet). Seuls le pseudonyme de l&apos;affilié
          et le titre du produit sont affichés.
        </p>
      </div>
    </section>
  );
}
