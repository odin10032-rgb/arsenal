"use client";

/**
 * /compte/produits — « Mes produits » (contrat figé : docs/chantier/07-contrat-paiement-a.md)
 *
 * GET /api/purchases (Bearer) : achats en A de l'utilisateur, triés du plus récent au plus ancien.
 * Par carte : image, titre, « Obtenu le <date> », montant A tel que renvoyé par l'API, statut
 * de livraison et accès :
 *   • fulfillment_pending / failed → état « livraison en cours / en échec » bien visible
 *     avec bouton Relancer (POST /api/purchases/:id/retry, idempotent) ;
 *   • fulfilled → panneau d'accès (portail Chariow app.ateliat.com clé par l'email, ou
 *     instructions fournies par l'admin).
 *
 * Aucun montant ni statut n'est calculé ici : tout vient de l'API.
 * Garde : non connecté → /connexion (pattern des pages /compte).
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CoinA } from "@/components/account/coin-a";
import { PurchaseAccessPanel } from "@/components/product/buy-with-a";
import { useUser } from "@/hooks/use-user";
import { ApiError } from "@/lib/api";
import { fmt } from "@/lib/format";
import {
  canRetryPurchase,
  fetchMyPurchases,
  isDeliveryFailed,
  isDeliveryPending,
  retryPurchase,
  type Purchase,
  type PurchaseStatus,
} from "@/lib/purchases";
import { logout } from "@/lib/user-auth";

/** Libellés + teintes de statut (statuts du schéma serveur, aucune valeur inventée) */
const STATUS_STYLE: Record<PurchaseStatus, { label: string; color: string; border: string; bg: string }> = {
  pending: { label: "En attente", color: "#f4a261", border: "rgba(244,162,97,0.4)", bg: "rgba(244,162,97,0.08)" },
  paid: { label: "Payé", color: "#f4a261", border: "rgba(244,162,97,0.4)", bg: "rgba(244,162,97,0.08)" },
  fulfillment_pending: {
    label: "Livraison en cours",
    color: "#f4a261",
    border: "rgba(244,162,97,0.4)",
    bg: "rgba(244,162,97,0.08)",
  },
  fulfilled: { label: "Obtenu", color: "#56b8a8", border: "rgba(42,157,143,0.4)", bg: "rgba(42,157,143,0.08)" },
  failed: { label: "Livraison en échec", color: "#fda4af", border: "rgba(230,57,70,0.45)", bg: "rgba(230,57,70,0.1)" },
  cancelled: { label: "Annulé", color: "#a0a0a0", border: "#333", bg: "#1a1a1a" },
  refunded: { label: "Remboursé", color: "#a0a0a0", border: "#333", bg: "#1a1a1a" },
};

function formatDate(ts: number | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Fusion défensive après une relance : un champ absent de la réponse ne perd pas l'affichage */
function mergePurchase(prev: Purchase, next: Purchase): Purchase {
  return {
    ...prev,
    ...next,
    product: next.product?.id ? next.product : prev.product,
    fulfillment: next.fulfillment ?? prev.fulfillment,
    access: next.access ?? prev.access,
  };
}

export default function MyProductsPage() {
  const { user, loading } = useUser();
  const router = useRouter();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Garde : session absente → porte de connexion (une fois le boot terminé)
  useEffect(() => {
    if (!loading && !user) router.replace("/connexion");
  }, [loading, user, router]);

  const flashNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 3500);
  }, []);

  const load = useCallback(async () => {
    try {
      setPurchases(await fetchMyPurchases());
      setError("");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // Session invalide ou expirée : nettoyage local + porte de connexion
        await logout();
        router.replace("/connexion");
        return;
      }
      setError(err instanceof Error ? err.message : "Impossible de charger vos produits.");
    } finally {
      setPageLoading(false);
    }
  }, [router]);

  // Chargement unique au boot (une fois la session connue)
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current || loading || !user) return;
    startedRef.current = true;
    void load();
  }, [loading, user, load]);

  useEffect(() => {
    return () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, []);

  const retry = async (purchase: Purchase) => {
    if (retryingId) return;
    setRetryingId(purchase.id);
    setError("");
    try {
      const updated = await retryPurchase(purchase.id);
      setPurchases((prev) =>
        prev.map((p) => (p.id === purchase.id ? mergePurchase(p, updated) : p)),
      );
      flashNotice("Livraison relancée — l'accès s'activera dès qu'elle sera confirmée.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await logout();
        router.replace("/connexion");
        return;
      }
      setError(err instanceof Error ? err.message : "Relance impossible pour le moment.");
    } finally {
      setRetryingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-10">
        <p className="font-mono text-[0.85rem] text-[#666]">Chargement de vos produits…</p>
      </div>
    );
  }

  if (!user) return null; // redirection en cours

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

        <h1 className="mt-3 font-display text-[1.35rem] font-bold">Mes produits</h1>
        <p className="mt-1 text-[0.84rem] text-[#a0a0a0]">
          Les produits obtenus avec vos A et leurs accès.
        </p>

        {error && (
          <p
            className="mt-5 rounded-lg border border-[rgba(230,57,70,0.4)] bg-[rgba(230,57,70,0.1)] px-3.5 py-2.5 text-[0.82rem] text-[#fda4af]"
            role="alert"
          >
            {error}
          </p>
        )}
        {notice && (
          <p
            className="mt-5 rounded-lg border border-[rgba(42,157,143,0.4)] bg-[rgba(42,157,143,0.08)] px-3.5 py-2.5 text-[0.82rem] text-[#56b8a8]"
            role="status"
          >
            {notice}
          </p>
        )}

        {pageLoading ? (
          <p className="mt-8 font-mono text-[0.82rem] text-[#666]">Chargement…</p>
        ) : purchases.length === 0 ? (
          /* État vide soigné */
          <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[#333] bg-[#141414] px-6 py-10 text-center">
            <CoinA size={40} />
            <p className="font-display text-[1.05rem] font-semibold">
              Aucun produit pour le moment
            </p>
            <p className="max-w-[42ch] text-[0.84rem] leading-relaxed text-[#a0a0a0]">
              Les produits que vous obtenez avec vos A apparaissent ici, avec leur accès. Votre
              solde se recharge via les récompenses d&apos;affiliation et les ajustements de
              l&apos;équipe.
            </p>
            <div className="mt-2 flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row">
              <Link href="/" className="btn-arsenal btn-primary">
                Explorer le catalogue
              </Link>
              <Link href="/compte/portefeuille" className="btn-arsenal btn-ghost">
                Voir mon solde A
              </Link>
            </div>
          </div>
        ) : (
          <ul className="mt-6 flex flex-col gap-4">
            {purchases.map((p) => {
              const style = STATUS_STYLE[p.status];
              const pending = isDeliveryPending(p);
              const failed = isDeliveryFailed(p);
              const retryable = canRetryPurchase(p);
              const busy = retryingId === p.id;

              return (
                <li key={p.id} className="rounded-2xl border border-[#333] bg-[#141414] p-4 sm:p-5">
                  <div className="flex gap-4">
                    {/* Image */}
                    <div className="h-[64px] w-[96px] flex-shrink-0 overflow-hidden rounded-lg border border-[#333] bg-[#1a1a1a]">
                      {p.product.imageUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={p.product.imageUrl}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.visibility = "hidden";
                          }}
                        />
                      ) : null}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-[1rem] font-semibold leading-snug">
                        {p.product.title || "Produit"}
                      </p>
                      <p className="mt-0.5 text-[0.72rem] text-[#666]">
                        {p.status === "fulfilled"
                          ? `Obtenu le ${formatDate(p.fulfilledAt || p.createdAt)}`
                          : `Commandé le ${formatDate(p.createdAt)}`}
                        <span className="mx-1.5">·</span>
                        <span className="tabular-nums">{fmt(p.amountA)}</span>
                        <span className="text-gold"> A</span>
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span
                          className="rounded-md border px-2 py-0.5 font-mono text-[0.62rem] uppercase tracking-[0.08em]"
                          style={{ color: style.color, borderColor: style.border, background: style.bg }}
                        >
                          {style.label}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Livraison en cours */}
                  {pending && (
                    <div className="mt-4 rounded-[10px] border border-[rgba(244,162,97,0.4)] bg-[rgba(244,162,97,0.07)] px-3.5 py-3">
                      <p className="text-[0.84rem] font-semibold text-[#f4c886]">
                        Livraison en cours
                      </p>
                      <p className="mt-1 text-[0.78rem] leading-relaxed text-[#a0a0a0]">
                        Votre commande est enregistrée et vos A ont été débités une seule fois.
                        L&apos;accès s&apos;active dès que la livraison aboutit.
                      </p>
                    </div>
                  )}

                  {/* Livraison en échec */}
                  {!pending && failed && (
                    <div className="mt-4 rounded-[10px] border border-[rgba(230,57,70,0.4)] bg-[rgba(230,57,70,0.1)] px-3.5 py-3">
                      <p className="text-[0.84rem] font-semibold text-[#fda4af]">
                        Livraison en échec
                      </p>
                      <p className="mt-1 text-[0.78rem] leading-relaxed text-[#a0a0a0]">
                        Vos A ne sont pas perdus : relancez la livraison, ou contactez l&apos;équipe
                        Arsenal qui peut rembourser la commande en A.
                      </p>
                      {p.fulfillment?.lastError && (
                        <p className="mt-1.5 break-words font-mono text-[0.68rem] text-[#666]">
                          {p.fulfillment.lastError}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Accès */}
                  {p.status === "fulfilled" && (
                    <div className="mt-4 border-t border-dashed border-[#333] pt-4">
                      <PurchaseAccessPanel purchase={p} sessionEmail={user.email} />
                    </div>
                  )}

                  {/* Remboursé / annulé : solde recrédité par le serveur */}
                  {(p.status === "refunded" || p.status === "cancelled") && (
                    <p className="mt-4 border-t border-dashed border-[#333] pt-4 text-[0.78rem] leading-relaxed text-[#a0a0a0]">
                      {p.status === "refunded"
                        ? `Commande remboursée${p.refundedAt ? ` le ${formatDate(p.refundedAt)}` : ""} — les A correspondants ont été recrédités sur votre solde.`
                        : "Commande annulée — aucun accès associé."}
                    </p>
                  )}

                  {/* Relance */}
                  {retryable && (
                    <button
                      type="button"
                      onClick={() => void retry(p)}
                      disabled={busy || retryingId !== null}
                      className="btn-arsenal btn-ghost mt-4 w-full"
                    >
                      {busy && <span className="spin" />}
                      Relancer la livraison
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-6 text-center font-mono text-[0.7rem] leading-relaxed text-[#666]">
          Un accès manquant, une question ? Contactez l&apos;équipe Arsenal depuis la page
          d&apos;accueil du site.
        </p>
      </div>
    </div>
  );
}
