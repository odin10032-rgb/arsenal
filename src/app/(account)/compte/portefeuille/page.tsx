"use client";

/**
 * /compte/portefeuille — portefeuille A : solde + historique paginé.
 * Contrat Phase 1 : GET /api/me/transactions?limit=20&offset=0
 * (tri created_at DESC ; delta signé : + gains, − dépenses).
 * Garde : non connecté → /connexion (pattern admin/page.tsx).
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CoinA } from "@/components/account/coin-a";
import { useUser } from "@/hooks/use-user";
import { ApiError, apiFetch } from "@/lib/api";
import { fmt } from "@/lib/format";
import { logout } from "@/lib/user-auth";

interface Transaction {
  id: string;
  delta: number;
  type: "reward" | "spend" | "adjustment";
  label: string;
  refType: string | null;
  refId: string | null;
  createdAt: number;
}

interface TransactionsResponse {
  ok: boolean;
  total: number;
  transactions: Transaction[];
}

const PAGE_SIZE = 20;

const TYPE_LABELS: Record<Transaction["type"], string> = {
  reward: "Récompense",
  spend: "Dépense",
  adjustment: "Ajustement",
};

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PortefeuillePage() {
  const { user, loading, refresh } = useUser();
  const router = useRouter();
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [txLoading, setTxLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [error, setError] = useState("");

  // Garde : session absente → porte de connexion (une fois le boot terminé)
  useEffect(() => {
    if (!loading && !user) router.replace("/connexion");
  }, [loading, user, router]);

  const load = useCallback(
    async (offset: number) => {
      const append = offset > 0;
      if (append) setMoreLoading(true);
      try {
        const res = await apiFetch<TransactionsResponse>(
          `/api/me/transactions?limit=${PAGE_SIZE}&offset=${offset}`,
          { bearer: true, timeoutMs: 4000 },
        );
        setTotal(res.total ?? 0);
        setTxs((prev) =>
          append ? [...prev, ...(res.transactions || [])] : res.transactions || [],
        );
        setError("");
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          // Session invalide ou expirée : nettoyage local + porte de connexion
          await logout();
          router.replace("/connexion");
          return;
        }
        setError(err instanceof Error ? err.message : "Impossible de charger l'historique.");
      } finally {
        setTxLoading(false);
        setMoreLoading(false);
      }
    },
    [router],
  );

  // Chargement unique au boot : solde revalidé (GET /api/me) + première page d'historique
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current || loading || !user) return;
    startedRef.current = true;
    void refresh();
    void load(0);
  }, [loading, user, refresh, load]);

  if (loading) {
    return (
      <div className="flex justify-center p-10">
        <p className="font-mono text-[0.85rem] text-[#666]">Chargement du portefeuille…</p>
      </div>
    );
  }

  if (!user) return null; // redirection en cours

  const hasMore = total !== null && txs.length < total;

  return (
    <div className="container-arsenal py-10 sm:py-14">
      <div className="mx-auto w-full max-w-[560px]">
        <Link
          href="/compte"
          className="inline-flex items-center gap-1.5 text-[0.78rem] text-[#666] transition-colors hover:text-[#f0f0f0]"
        >
          <svg
            viewBox="0 0 24 24"
            width="12"
            height="12"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5m7-7-7 7 7 7" />
          </svg>
          Mon compte
        </Link>
        <h1 className="mt-3 font-display text-[1.35rem] font-bold">Portefeuille A</h1>
        <p className="mt-1 text-[0.84rem] text-[#a0a0a0]">
          Votre monnaie interne et son historique.
        </p>

        {/* Solde */}
        <div className="mt-6 rounded-2xl border border-[#333] bg-[#141414] p-6">
          <p className="text-[0.74rem] font-semibold uppercase tracking-wider text-[#666]">
            Solde
          </p>
          <div className="mt-2 flex items-center gap-3">
            <CoinA size={34} />
            <p className="whitespace-nowrap font-mono text-[2rem] font-bold leading-none tabular-nums text-[#f0f0f0]">
              {fmt(user.balanceA)}
              <span className="ml-2 text-[1.1rem] text-gold">A</span>
            </p>
          </div>
        </div>

        {/* Historique */}
        <div className="mt-4 rounded-2xl border border-[#333] bg-[#141414] p-6">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-[1rem] font-bold">Historique</h2>
            {total !== null && (
              <p className="text-[0.74rem] text-[#666]">
                {fmt(total)} transaction{total > 1 ? "s" : ""}
              </p>
            )}
          </div>

          {error && (
            <p
              className="mt-4 rounded-lg border border-[rgba(230,57,70,0.4)] bg-[rgba(230,57,70,0.1)] px-3 py-2 text-[0.8rem] text-[#fda4af]"
              role="alert"
            >
              {error}
            </p>
          )}

          {txLoading ? (
            <p className="mt-6 font-mono text-[0.8rem] text-[#666]">
              Chargement de l'historique…
            </p>
          ) : txs.length === 0 ? (
            <p className="mt-6 text-[0.84rem] text-[#666]">
              Aucune transaction pour le moment.
            </p>
          ) : (
            <ul className="mt-2">
              {txs.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 border-b border-[#222] py-3 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[0.88rem] text-[#f0f0f0]">{t.label}</p>
                    <p className="mt-0.5 text-[0.72rem] text-[#666]">
                      {TYPE_LABELS[t.type] ?? t.type} · {formatDate(t.createdAt)}
                    </p>
                  </div>
                  <span
                    className={`flex-shrink-0 font-mono text-[0.85rem] font-semibold tabular-nums ${
                      t.delta >= 0 ? "text-[#2a9d8f]" : "text-[#e63946]"
                    }`}
                  >
                    {t.delta > 0 ? "+" : ""}
                    {fmt(t.delta)} A
                  </span>
                </li>
              ))}
            </ul>
          )}

          {hasMore && (
            <button
              type="button"
              onClick={() => void load(txs.length)}
              disabled={moreLoading}
              className="btn-arsenal btn-ghost mt-4 w-full"
            >
              {moreLoading && <span className="spin" />}
              Charger plus
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
