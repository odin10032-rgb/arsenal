"use client";

/**
 * Analytique — auto-refresh 5 s : 4 stat-cards, graphique 7 jours,
 * top produits, table complète des clics.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Analytics, fetchAnalytics } from "@/lib/admin";
import { fmt, weekdayLabel } from "@/lib/format";

function last7Days(): string[] {
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

export function AnalyticsTab({ apiAvailable }: { apiAvailable: boolean }) {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState("");
  const busyRef = useRef(false);

  useEffect(() => {
    if (!apiAvailable) {
      setError("Analytique disponible uniquement avec le backend connecté.");
      return;
    }
    let stopped = false;

    const load = async () => {
      if (busyRef.current) return;
      busyRef.current = true;
      try {
        const d = await fetchAnalytics();
        if (!stopped) {
          setData(d);
          setError("");
        }
      } catch (err) {
        if (!stopped) setError(err instanceof Error ? err.message : "Chargement impossible.");
      } finally {
        busyRef.current = false;
      }
    };

    void load();
    const timer = setInterval(load, 5000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [apiAvailable]);

  const days = useMemo(() => last7Days(), []);
  const maxDay = useMemo(() => {
    if (!data) return 0;
    return Math.max(1, ...days.map((d) => data.visitsByDay?.[d] || 0));
  }, [data, days]);

  const top = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.clicksByProduct || {})
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6);
  }, [data]);
  const maxTop = top.length ? Math.max(1, top[0][1]) : 1;

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="font-display text-[1.2rem] font-bold">Analytique</h2>
        <span className="inline-flex items-center gap-1.5 font-mono text-[0.68rem] text-[#666]">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M3 12a9 9 0 1 0 2.6-6.3L3 8M3 3v5h5" />
          </svg>
          actualisation auto · 5 s
        </span>
      </div>

      {error && (
        <p className="rounded-lg border border-[rgba(244,162,97,0.4)] bg-[rgba(244,162,97,0.07)] px-4 py-3 text-[0.85rem] text-[#f4a261]">
          {error}
        </p>
      )}

      {!data && !error && <p className="py-10 text-center font-mono text-[#666]">Chargement des statistiques…</p>}

      {data && (
        <>
          {/* Stat-cards */}
          <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
            <StatCard label="Visites globales" value={fmt(data.visits)} />
            <StatCard label="Clics produits" value={fmt(data.actionsTotal)} />
            <StatCard label="Produits" value={fmt(data.productCount)} />
            <StatCard
              label="En ligne (60 s)"
              value={fmt(data.onlineNow)}
              dot
            />
          </div>

          {/* Graphique 7 jours */}
          <div className="mt-5 rounded-2xl border border-[#333] bg-[#141414] p-5">
            <h3 className="mb-4 flex items-center gap-2 text-[0.98rem] font-semibold">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-[#4fb3a1]">
                <path d="M4 20V10m6 10V4m6 16v-7m4 7V8" />
              </svg>
              Visites — 7 derniers jours
            </h3>
            <div className="flex h-[130px] items-end justify-between gap-2 pt-2">
              {days.map((d) => {
                const v = data.visitsByDay?.[d] || 0;
                return (
                  <div key={d} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                    <span className="font-mono text-[0.58rem] text-[#a0a0a0]">{v || ""}</span>
                    <div
                      className="w-full max-w-[46px] rounded-t-md bg-gradient-to-b from-[#2a9d8f] to-[rgba(230,57,70,0.75)]"
                      style={{ height: `${Math.max(4, (v / maxDay) * 100)}%` }}
                      title={`${d} : ${v} visites`}
                    />
                    <span className="font-mono text-[0.6rem] uppercase text-[#666]">
                      {weekdayLabel(d)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top produits */}
          <div className="mt-5 rounded-2xl border border-[#333] bg-[#141414] p-5">
            <h3 className="mb-4 text-[0.98rem] font-semibold">Top produits par clics</h3>
            <div className="flex flex-col gap-3">
              {top.map(([id, clicks], idx) => {
                const title = data.productTitles?.[id] || id;
                const color = idx === 0 ? "#f4a261" : idx === 1 ? "#cccccc" : idx === 2 ? "#c96f2f" : "#666";
                return (
                  <div key={id} className="flex items-center gap-3">
                    <span className="w-5 flex-shrink-0 text-center font-display text-[0.8rem] font-bold" style={{ color }}>
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="mb-1.5 truncate text-[0.8rem] font-semibold">{title}</p>
                      <div className="h-[7px] overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[rgba(230,57,70,0.85)] to-[#2a9d8f]"
                          style={{ width: `${(clicks / maxTop) * 100}%` }}
                        />
                      </div>
                    </div>
                    <span className="flex-shrink-0 font-mono text-[0.7rem] text-[#4fb3a1]">{fmt(clicks)}</span>
                  </div>
                );
              })}
              {top.length === 0 && <p className="font-mono text-[0.8rem] text-[#666]">Aucun clic enregistré.</p>}
            </div>
          </div>

          {/* Table clics */}
          <div className="mt-5 overflow-x-auto rounded-2xl border border-[#333] bg-[#141414]">
            <table className="w-full border-collapse text-[0.8rem]">
              <thead>
                <tr>
                  {["Produit", "Catégorie", "Clics", "Part"].map((h) => (
                    <th key={h} className="border-b border-[#444] px-3 py-2.5 text-left font-mono text-[0.62rem] uppercase tracking-[0.1em] text-[#666]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.clicksByProduct || {})
                  .sort(([, a], [, b]) => b - a)
                  .map(([id, clicks]) => {
                    const title = data.productTitles?.[id] || id;
                    const image = data.productImages?.[id];
                    const share = data.actionsTotal ? Math.round((clicks / data.actionsTotal) * 100) : 0;
                    return (
                      <tr key={id} className="border-b border-[#222] hover:bg-[rgba(255,255,255,0.025)]">
                        <td className="px-3 py-2.5">
                          <span className="flex items-center gap-2.5">
                            {image && (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={image} alt="" loading="lazy" className="h-6 w-9 flex-shrink-0 rounded border border-[#333] object-cover" />
                            )}
                            <span className="font-medium text-[#f0f0f0]">{title}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-[#a0a0a0]">{categoryOf(data, id)}</td>
                        <td className="px-3 py-2.5 font-mono text-[#4fb3a1]">{fmt(clicks)}</td>
                        <td className="px-3 py-2.5 font-mono text-[#a0a0a0]">{share} %</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
            <p className="px-3 py-2.5 text-[0.7rem] text-[#666]">
              Ces clics alimentent le tri « Plus populaires » du catalogue.
            </p>
          </div>
        </>
      )}
    </section>
  );
}

/** L'API /api/analytics ne renvoie pas les catégories : tiret plutôt que valeur inventée */
function categoryOf(_data: Analytics, _id: string): string {
  return "—";
}

function StatCard({ label, value, dot }: { label: string; value: string; dot?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-[#333] bg-[#141414] p-4">
      <span className="flex items-center gap-1.5 font-mono text-[0.62rem] uppercase tracking-[0.1em] text-[#666]">
        {label}
      </span>
      <span className="font-display text-[1.75rem] font-bold leading-tight">
        {value}
        {dot && (
          <span className="ml-2 inline-block h-2 w-2 rounded-full bg-[#2a9d8f] align-middle" title="Actifs maintenant" />
        )}
      </span>
    </div>
  );
}
