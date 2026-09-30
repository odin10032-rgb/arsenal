"use client";

/**
 * Onglet Commandes — achats en A et leur fulfillment
 * (contrat : docs/chantier/07-contrat-paiement-a.md · audit : docs/chantier/06-audit-chariow-fulfillment.md)
 *
 * • liste GET /api/admin/purchases — filtre par statut ; utilisateur (pseudo/email), produit,
 *   montant A, statut, fulfillment (provider/status/attempts + dernière erreur) et dates ;
 * • actions : Relancer (POST …/retry, idempotent ≤ 5 tentatives), Marquer livré
 *   (POST …/fulfill avec référence + note), Rembourser en A (POST …/refund, confirmation
 *   explicite car irréversible) ;
 * • rappel factuel des prérequis Chariow du fulfillment automatique.
 */

import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "./confirm-dialog";
import {
  fetchAdminPurchases,
  fulfillPurchase,
  refundPurchase,
  retryAdminPurchase,
  type AdminPurchase,
  type AdminPurchaseStatusFilter,
} from "@/lib/admin";
import { fmt } from "@/lib/format";
import type { PurchaseStatus } from "@/lib/purchases";
import { toast } from "@/lib/toast";

const FILTERS: { id: AdminPurchaseStatusFilter; label: string }[] = [
  { id: "all", label: "Tous" },
  { id: "fulfillment_pending", label: "Livraison en cours" },
  { id: "fulfilled", label: "Livrées" },
  { id: "failed", label: "Échecs" },
  { id: "refunded", label: "Remboursées" },
  { id: "pending", label: "En attente" },
  { id: "paid", label: "Payées" },
  { id: "cancelled", label: "Annulées" },
];

const STATUS_STYLE: Record<PurchaseStatus, { label: string; color: string; border: string; bg: string }> = {
  pending: { label: "En attente", color: "#f4a261", border: "rgba(244,162,97,0.4)", bg: "rgba(244,162,97,0.08)" },
  paid: { label: "Payée", color: "#f4a261", border: "rgba(244,162,97,0.4)", bg: "rgba(244,162,97,0.08)" },
  fulfillment_pending: {
    label: "Livraison en cours",
    color: "#f4a261",
    border: "rgba(244,162,97,0.4)",
    bg: "rgba(244,162,97,0.08)",
  },
  fulfilled: { label: "Livrée", color: "#56b8a8", border: "rgba(42,157,143,0.4)", bg: "rgba(42,157,143,0.08)" },
  failed: { label: "Échec livraison", color: "#fda4af", border: "rgba(230,57,70,0.45)", bg: "rgba(230,57,70,0.1)" },
  cancelled: { label: "Annulée", color: "#a0a0a0", border: "#333", bg: "#1a1a1a" },
  refunded: { label: "Remboursée", color: "#a0a0a0", border: "#333", bg: "#1a1a1a" },
};

/** Libellés des providers de fulfillment du contrat (chariow | manual | arsonal_link) */
const PROVIDER_LABELS: Record<string, string> = {
  chariow: "Chariow",
  manual: "Manuel",
  arsonal_link: "Lien Arsenal",
};

const FULFILLMENT_STATUS_LABELS: Record<string, string> = {
  pending: "en attente",
  processing: "en cours",
  completed: "terminé",
  failed: "échec",
};

function formatDate(ts: number | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Une commande peut être marquée livrée à la main tant qu'elle est vivante. */
function canFulfill(p: AdminPurchase): boolean {
  return p.status !== "fulfilled" && p.status !== "refunded" && p.status !== "cancelled";
}

/** Relance : réservée aux états éligibles du contrat (409 sinon côté serveur). */
function canRetry(p: AdminPurchase): boolean {
  return p.status === "fulfillment_pending" || p.status === "failed";
}

/** Remboursement en A : possible tant que la commande n'est ni remboursée ni annulée. */
function canRefund(p: AdminPurchase): boolean {
  return p.status !== "refunded" && p.status !== "cancelled";
}

export function PurchasesTab({ apiAvailable }: { apiAvailable: boolean }) {
  const [filter, setFilter] = useState<AdminPurchaseStatusFilter>("all");
  const [rows, setRows] = useState<AdminPurchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [fulfilling, setFulfilling] = useState<AdminPurchase | null>(null);
  const [refunding, setRefunding] = useState<AdminPurchase | null>(null);
  const [busyAction, setBusyAction] = useState(false);

  const load = useCallback(async () => {
    if (!apiAvailable) {
      setLoading(false);
      setError("Liste des commandes disponible uniquement avec le backend connecté.");
      return;
    }
    setLoading(true);
    try {
      setRows(await fetchAdminPurchases(filter));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }, [apiAvailable, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const retry = async (p: AdminPurchase) => {
    if (busyId) return;
    setBusyId(p.id);
    try {
      await retryAdminPurchase(p.id);
      toast("Livraison relancée.", "success");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Relance impossible.", "error");
    } finally {
      setBusyId(null);
    }
  };

  const confirmFulfill = async (reference: string, note: string) => {
    if (!fulfilling || busyAction) return;
    setBusyAction(true);
    try {
      await fulfillPurchase(fulfilling.id, { reference, note });
      toast(
        `Commande de ${fulfilling.pseudo || fulfilling.email || "cet utilisateur"} marquée livrée.`,
        "success",
      );
      setFulfilling(null);
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Marquage impossible.", "error");
    } finally {
      setBusyAction(false);
    }
  };

  const confirmRefund = async () => {
    if (!refunding || busyAction) return;
    const target = refunding;
    setBusyAction(true);
    try {
      await refundPurchase(target.id, "Remboursement admin");
      toast(`Remboursement de ${fmt(target.amountA)} A effectué.`, "success");
      setRefunding(null);
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Remboursement impossible.", "error");
    } finally {
      setBusyAction(false);
    }
  };

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="font-display text-[1.2rem] font-bold">Commandes</h2>
        <span className="rounded-full border border-[#333] bg-[#141414] px-2.5 py-1 font-mono text-[0.64rem] text-[#666]">
          achats en A &amp; livraison
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

      {/* Filtre par statut */}
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filtrer par statut">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className="relative inline-flex h-11 items-center rounded-xl border px-3.5 text-[0.82rem] font-semibold transition-colors duration-200"
            style={
              filter === f.id
                ? { color: "#f0f0f0", borderColor: "#444", background: "#1a1a1a" }
                : { color: "#a0a0a0", borderColor: "#333", background: "#141414" }
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-[rgba(244,162,97,0.4)] bg-[rgba(244,162,97,0.07)] px-4 py-3 text-[0.85rem] text-[#f4a261]">
          {error}
        </p>
      )}

      {/* Liste */}
      <div className="overflow-x-auto rounded-2xl border border-[#333] bg-[#141414]">
        <table className="w-full border-collapse text-[0.8rem]">
          <thead>
            <tr>
              {["Utilisateur", "Produit", "Montant", "Statut", "Livraison", "Dates", "Actions"].map(
                (h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap border-b border-[#444] px-3 py-2.5 text-left font-mono text-[0.62rem] uppercase tracking-[0.1em] text-[#666]"
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const style = STATUS_STYLE[r.status];
              const f = r.fulfillment;
              return (
                <tr key={r.id} className="border-b border-[#222] last:border-0 hover:bg-[rgba(255,255,255,0.025)]">
                  <td className="px-3 py-2.5">
                    <span className="block font-medium text-[#f0f0f0]">{r.pseudo || "—"}</span>
                    <span className="block text-[0.72rem] text-[#666]">{r.email || "—"}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="block text-[#f0f0f0]">{r.productTitle || "—"}</span>
                    {r.linkCode && (
                      <span className="block font-mono text-[0.68rem] text-[#666]">
                        via {r.linkCode}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono tabular-nums text-[#f0f0f0]">
                    {fmt(r.amountA)}
                    <span className="text-gold"> A</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <span
                      className="rounded-md border px-2 py-0.5 font-mono text-[0.64rem] uppercase tracking-[0.08em]"
                      style={{ color: style.color, borderColor: style.border, background: style.bg }}
                    >
                      {style.label}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[0.72rem] text-[#a0a0a0]">
                    {f ? (
                      <>
                        <span className="block">
                          {PROVIDER_LABELS[f.provider] || f.provider} ·{" "}
                          {FULFILLMENT_STATUS_LABELS[f.status] || f.status} · {fmt(f.attempts)} essai
                          {f.attempts > 1 ? "s" : ""}
                        </span>
                        {f.providerReference && (
                          <span className="block font-mono text-[0.68rem] text-[#666]">
                            réf. {f.providerReference}
                          </span>
                        )}
                        {f.lastError && (
                          <span className="mt-1 block max-w-[280px] break-words font-mono text-[0.66rem] text-[#fda4af]">
                            {f.lastError}
                          </span>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[0.72rem] text-[#666]">
                    Commande : {formatDate(r.createdAt)}
                    <span className="block">Livrée : {formatDate(r.fulfilledAt)}</span>
                    {r.refundedAt && <span className="block">Remboursée : {formatDate(r.refundedAt)}</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <div className="flex flex-wrap gap-2">
                      {canRetry(r) && (
                        <button
                          type="button"
                          onClick={() => void retry(r)}
                          disabled={busyId === r.id}
                          className="btn-arsenal btn-ghost btn-sm"
                        >
                          {busyId === r.id && <span className="spin" />}
                          Relancer
                        </button>
                      )}
                      {canFulfill(r) && (
                        <button
                          type="button"
                          onClick={() => setFulfilling(r)}
                          className="btn-arsenal btn-primary btn-sm"
                        >
                          Marquer livré
                        </button>
                      )}
                      {canRefund(r) && (
                        <button
                          type="button"
                          onClick={() => setRefunding(r)}
                          className="btn-arsenal btn-danger btn-sm"
                        >
                          Rembourser
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && rows.length === 0 && !error && (
          <p className="px-4 py-6 text-center font-mono text-[0.78rem] text-[#666]">
            Aucune commande pour ce filtre.
          </p>
        )}
        {loading && rows.length === 0 && !error && (
          <p className="px-4 py-6 text-center font-mono text-[0.78rem] text-[#666]">Chargement…</p>
        )}
      </div>

      {/* Rappel des prérequis réels du fulfillment automatique (audit Chariow) */}
      <div className="mt-5 rounded-2xl border border-[#333] bg-[#141414] p-5">
        <h3 className="mb-1 text-[0.95rem] font-semibold">Fulfillment automatique — prérequis réels</h3>
        <div className="flex flex-col gap-1.5 text-[0.78rem] leading-relaxed text-[#666]">
          <p>
            • La clé API Chariow doit être configurée (onglet Paramètres) : sans elle, aucune
            tentative réseau n&apos;est faite et la commande passe en échec avec ce motif.
          </p>
          <p>
            • Le produit Chariow associé doit être en modèle de tarification « Gratuit » et son id
            renseigné dans le formulaire produit ; le masquer de la boutique est la seule
            atténuation documentée (il reste accessible à qui possède l&apos;URL).
          </p>
          <p>
            • Les types Chariow Service / Coaching et le prix libre ne sont pas acceptés par
            l&apos;API (422) : ces produits relèvent de la méthode « manuelle ».
          </p>
          <p>
            • Aucun mode sandbox n&apos;est documenté côté Chariow : les tests réels utilisent la
            clé live. Les A ne sont jamais perdus en cas d&apos;échec (relance ou remboursement).
          </p>
        </div>
      </div>

      {/* Marquer livré : référence + note */}
      {fulfilling && (
        <FulfillDialog
          purchase={fulfilling}
          busy={busyAction}
          onCancel={() => setFulfilling(null)}
          onConfirm={(reference, note) => void confirmFulfill(reference, note)}
        />
      )}

      {/* Remboursement en A : irréversible */}
      {refunding && (
        <ConfirmDialog
          title="Rembourser cette commande en A ?"
          message={`${fmt(refunding.amountA)} A seront recrédités sur le solde de ${
            refunding.pseudo || refunding.email || "cet utilisateur"
          } et la commande passera en « remboursée ». Le fulfillment associé sera marqué en échec. Cette action est irréversible.`}
          confirmLabel={`Rembourser ${fmt(refunding.amountA)} A`}
          busy={busyAction}
          onCancel={() => setRefunding(null)}
          onConfirm={() => void confirmRefund()}
        />
      )}
    </section>
  );
}

/* ---------------- Marquage manuel d'une livraison ---------------- */

function FulfillDialog({
  purchase,
  busy,
  onCancel,
  onConfirm,
}: {
  purchase: AdminPurchase;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reference: string, note: string) => void;
}) {
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-[rgba(5,5,5,0.8)] p-5"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label="Marquer la commande livrée"
    >
      <div
        className="w-full max-w-[460px] rounded-2xl border border-[#444] bg-[#141414] p-6 text-left shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-[1.1rem] font-bold">Marquer la commande livrée</h3>
        <p className="mt-2 text-[0.82rem] leading-relaxed text-[#a0a0a0]">
          {purchase.pseudo || purchase.email || "Cet utilisateur"} — {purchase.productTitle || "produit"}.
          La commande passera en « livrée » et l&apos;accès apparaîtra dans Mes produits.
        </p>

        <div className="mt-4 flex flex-col gap-3.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-[0.78rem] font-semibold text-[#a0a0a0]">
              Référence <span className="text-[#666]">(facultatif)</span>
            </span>
            <input
              className="input-arsenal font-mono text-[0.82rem]"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="CH-2026-0042, licence, lien…"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[0.78rem] font-semibold text-[#a0a0a0]">
              Note interne <span className="text-[#666]">(facultatif)</span>
            </span>
            <textarea
              className="input-arsenal min-h-[80px] resize-y text-[0.82rem] leading-relaxed"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Accès transmis par email le…"
            />
          </label>
        </div>

        <div className="mt-6 flex gap-3">
          <button type="button" onClick={onCancel} className="btn-arsenal btn-ghost flex-1">
            Annuler
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reference, note)}
            disabled={busy}
            className="btn-arsenal btn-primary flex-1"
          >
            {busy && <span className="spin" />}
            Marquer livré
          </button>
        </div>
      </div>
    </div>
  );
}
