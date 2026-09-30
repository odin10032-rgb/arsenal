"use client";

/**
 * Onglet Affiliés (contrat Phase 2)
 *
 * • liste GET /api/admin/affiliates — filtre par statut, pseudo/email, code, clics, ventes,
 *   commissions (payable/payé) et dates ; actions Valider / Suspendre / Réactiver
 *   (POST /api/admin/affiliates/:id/status) avec confirmation ;
 * • repli « Ajouter une vente manuelle » : POST /api/admin/sales
 *   (crée la vente confirmée + la commission en attente) avec toast succès/erreur.
 */

import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "./confirm-dialog";
import type { AffiliateStatus } from "@/lib/affiliate";
import {
  createManualSale,
  fetchAdminAffiliates,
  setAffiliateStatus,
  type AdminAffiliate,
  type AffiliateStatusFilter,
} from "@/lib/admin";
import { fmt } from "@/lib/format";
import { Product } from "@/lib/products";
import { toast } from "@/lib/toast";

const FILTERS: { id: AffiliateStatusFilter; label: string }[] = [
  { id: "all", label: "Tous" },
  { id: "pending", label: "En attente" },
  { id: "active", label: "Actifs" },
  { id: "suspended", label: "Suspendus" },
];

const STATUS_STYLE: Record<AffiliateStatus, { label: string; color: string; border: string; bg: string }> = {
  pending: { label: "En attente", color: "#f4a261", border: "rgba(244,162,97,0.4)", bg: "rgba(244,162,97,0.08)" },
  active: { label: "Actif", color: "#56b8a8", border: "rgba(42,157,143,0.4)", bg: "rgba(42,157,143,0.08)" },
  suspended: { label: "Suspendu", color: "#fda4af", border: "rgba(230,57,70,0.45)", bg: "rgba(230,57,70,0.1)" },
};

function formatDate(ts: number | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Action en attente de confirmation sur une ligne */
type PendingAction = { row: AdminAffiliate; next: "active" | "suspended" };

function actionLabels(action: PendingAction) {
  if (action.next === "suspended") {
    return {
      title: "Suspendre cet affilié ?",
      message: `« ${action.row.pseudo || action.row.code} » ne comptabilisera plus de clics ni de ventes, et ses produits seront inaccessibles. Ses commissions acquises sont conservées.`,
      confirmLabel: "Suspendre",
    };
  }
  if (action.row.status === "suspended") {
    return {
      title: "Réactiver cet affilié ?",
      message: `Les liens de « ${action.row.pseudo || action.row.code} » refonctionneront immédiatement et son espace affilié redeviendra accessible.`,
      confirmLabel: "Réactiver",
    };
  }
  return {
    title: "Valider cette candidature ?",
    message: `« ${action.row.pseudo || action.row.code} » obtiendra le rôle affilié et pourra générer ses liens de suivi.`,
    confirmLabel: "Valider",
  };
}

export function AffiliatesTab({
  apiAvailable,
  products,
}: {
  apiAvailable: boolean;
  products: Product[];
}) {
  const [filter, setFilter] = useState<AffiliateStatusFilter>("all");
  const [rows, setRows] = useState<AdminAffiliate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [action, setAction] = useState<PendingAction | null>(null);
  const [busyAction, setBusyAction] = useState(false);

  const load = useCallback(async () => {
    if (!apiAvailable) {
      setLoading(false);
      setError("Liste des affiliés disponible uniquement avec le backend connecté.");
      return;
    }
    setLoading(true);
    try {
      setRows(await fetchAdminAffiliates(filter));
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

  const confirmAction = async () => {
    if (!action || busyAction) return;
    const { row, next } = action;
    const target = actionLabels(action);
    setBusyAction(true);
    try {
      await setAffiliateStatus(row.id, next);
      toast(
        `${row.pseudo || row.code} — ${next === "active" ? "affiliation active" : "compte suspendu"}.`,
        "success",
      );
      setAction(null);
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : `${target.confirmLabel} impossible.`, "error");
    } finally {
      setBusyAction(false);
    }
  };

  const labels = action ? actionLabels(action) : null;

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="font-display text-[1.2rem] font-bold">Affiliés</h2>
        <span className="rounded-full border border-[#333] bg-[#141414] px-2.5 py-1 font-mono text-[0.64rem] text-[#666]">
          commissions &amp; liens
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
              {["Affilié", "Code", "Statut", "Clics", "Ventes", "Payable", "Payé", "Dates", "Actions"].map(
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
              return (
                <tr key={r.id} className="border-b border-[#222] last:border-0 hover:bg-[rgba(255,255,255,0.025)]">
                  <td className="px-3 py-2.5">
                    <span className="block font-medium text-[#f0f0f0]">{r.pseudo || "—"}</span>
                    <span className="block text-[0.72rem] text-[#666]">{r.email || "—"}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[0.76rem] text-[#a0a0a0]">
                    {r.code || "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <span
                      className="rounded-md border px-2 py-0.5 font-mono text-[0.64rem] uppercase tracking-[0.08em]"
                      style={{ color: style.color, borderColor: style.border, background: style.bg }}
                    >
                      {style.label}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-mono tabular-nums text-[#a0a0a0]">{fmt(r.clicks)}</td>
                  <td className="px-3 py-2.5 font-mono tabular-nums text-[#a0a0a0]">{fmt(r.sales)}</td>
                  <td className="px-3 py-2.5 font-mono tabular-nums text-[#4fb3a1]">{fmt(r.payable)}</td>
                  <td className="px-3 py-2.5 font-mono tabular-nums text-[#a0a0a0]">{fmt(r.paid)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[0.72rem] text-[#666]">
                    Demande : {formatDate(r.appliedAt)}
                    <span className="block">Activation : {formatDate(r.activatedAt)}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <div className="flex gap-2">
                      {r.status !== "active" && (
                        <button
                          type="button"
                          onClick={() => setAction({ row: r, next: "active" })}
                          className="btn-arsenal btn-primary btn-sm"
                        >
                          {r.status === "suspended" ? "Réactiver" : "Valider"}
                        </button>
                      )}
                      {r.status === "active" && (
                        <button
                          type="button"
                          onClick={() => setAction({ row: r, next: "suspended" })}
                          className="btn-arsenal btn-danger btn-sm"
                        >
                          Suspendre
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
            Aucun affilié pour ce filtre.
          </p>
        )}
        {loading && rows.length === 0 && !error && (
          <p className="px-4 py-6 text-center font-mono text-[0.78rem] text-[#666]">Chargement…</p>
        )}
      </div>

      {/* Repli : vente manuelle (webhook indisponible) */}
      <ManualSaleCard products={products} apiAvailable={apiAvailable} onCreated={load} />

      {action && labels && (
        <ConfirmDialog
          title={labels.title}
          message={labels.message}
          confirmLabel={labels.confirmLabel}
          busy={busyAction}
          onCancel={() => setAction(null)}
          onConfirm={() => void confirmAction()}
        />
      )}
    </section>
  );
}

/* ---------------- Vente manuelle ---------------- */

function ManualSaleCard({
  products,
  apiAvailable,
  onCreated,
}: {
  products: Product[];
  apiAvailable: boolean;
  onCreated: () => Promise<void>;
}) {
  const [affiliateCode, setAffiliateCode] = useState("");
  const [productId, setProductId] = useState("");
  const [saleRef, setSaleRef] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("FCFA");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!apiAvailable) return toast("Ajout possible uniquement avec le backend connecté.", "error");
    const value = Number(amount.replace(",", "."));
    if (!affiliateCode.trim() || !productId.trim() || !saleRef.trim())
      return toast("Code affilié, produit et référence de vente sont obligatoires.", "error");
    // Même garde que l'API (montant négatif refusé) ; le serveur reste seul juge de la commission
    if (!Number.isFinite(value) || value < 0) return toast("Montant invalide.", "error");

    setBusy(true);
    try {
      await createManualSale({
        affiliateCode: affiliateCode.trim(),
        productId: productId.trim(),
        saleRef: saleRef.trim(),
        amount: value,
        currency: currency.trim() || "FCFA",
      });
      toast("Vente enregistrée — commission créée en attente.", "success");
      setAffiliateCode("");
      setProductId("");
      setSaleRef("");
      setAmount("");
      await onCreated();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Enregistrement impossible.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-5 rounded-2xl border border-[#333] bg-[#141414] p-5">
      <h3 className="mb-1 flex items-center gap-2.5 text-[1rem] font-semibold">
        <span className="text-[#f0808a]">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </span>
        Ajouter une vente manuelle
      </h3>
      <p className="mb-4 text-[0.78rem] leading-relaxed text-[#666]">
        Repli lorsque le webhook Chariow n&apos;a pas pu traiter la vente : la vente est enregistrée
        confirmée et la commission correspondante créée en attente. La référence de vente est
        unique (anti-doublon).
      </p>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[0.76rem] font-semibold text-[#a0a0a0]">Code affilié</span>
          <input
            className="input-arsenal font-mono text-[0.8rem]"
            value={affiliateCode}
            onChange={(e) => setAffiliateCode(e.target.value)}
            placeholder="FLORIAN-X7"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[0.76rem] font-semibold text-[#a0a0a0]">Produit</span>
          {products.length > 0 ? (
            <select
              className="input-arsenal"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
            >
              <option value="">— Choisir un produit —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="input-arsenal font-mono text-[0.8rem]"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              placeholder="identifiant du produit"
            />
          )}
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[0.76rem] font-semibold text-[#a0a0a0]">Référence de vente</span>
          <input
            className="input-arsenal font-mono text-[0.8rem]"
            value={saleRef}
            onChange={(e) => setSaleRef(e.target.value)}
            placeholder="CH-2026-0042"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[0.76rem] font-semibold text-[#a0a0a0]">Montant</span>
          <input
            className="input-arsenal font-mono text-[0.8rem]"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="15000"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[0.76rem] font-semibold text-[#a0a0a0]">Devise</span>
          <input
            className="input-arsenal font-mono text-[0.8rem]"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            placeholder="FCFA"
          />
        </label>
      </div>

      <button type="submit" disabled={busy} className="btn-arsenal btn-primary btn-sm mt-4">
        {busy && <span className="spin" />}
        Enregistrer la vente
      </button>
    </form>
  );
}
