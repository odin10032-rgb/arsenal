"use client";

/**
 * Arsenal Admin — onglet Campagnes (Phase 3) : liste, création, activation.
 * Les montants et statuts sont toujours lus/envoyés via l'API ; aucun calcul
 * métier côté client.
 */

import { useCallback, useEffect, useState } from "react";
import {
  createAdminCampaign,
  deleteAdminCampaign,
  fetchAdminCampaigns,
  fetchCampaignEligibility,
  setCampaignState,
  type CampaignEligibility,
  type AdminCampaign,
} from "@/lib/admin";
import type { Product } from "@/lib/products";
import { ConfirmDialog } from "./confirm-dialog";
import { fmt } from "@/lib/format";
import { toast } from "@/lib/toast";

type StatusFilter = "all" | "draft" | "active" | "ended";

const STATUS_LABELS: Record<AdminCampaign["status"], string> = {
  draft: "Brouillon",
  active: "Active",
  ended: "Terminée",
};

const STATUS_STYLES: Record<AdminCampaign["status"], string> = {
  draft: "border-[#333] bg-[#1a1a1a] text-[#a0a0a0]",
  active: "border-[rgba(42,157,143,0.45)] bg-[rgba(42,157,143,0.1)] text-[#7fd4cb]",
  ended: "border-[rgba(230,57,70,0.4)] bg-[rgba(230,57,70,0.08)] text-[#fda4af]",
};

export function CampaignsTab({
  apiAvailable,
  products,
}: {
  apiAvailable: boolean;
  products: Product[];
}) {
  const [campaigns, setCampaigns] = useState<AdminCampaign[] | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<AdminCampaign | null>(null);

  const load = useCallback(async () => {
    try {
      setCampaigns(await fetchAdminCampaigns());
    } catch {
      setCampaigns([]);
    }
  }, []);

  useEffect(() => {
    if (apiAvailable) void load();
  }, [apiAvailable, load]);

  const changeState = async (id: string, status: "active" | "ended" | "draft") => {
    if (busyId) return;
    setBusyId(id);
    try {
      await setCampaignState(id, status);
      toast("Campagne mise à jour.", "success");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Mise à jour impossible.", "error");
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteAdminCampaign(toDelete.id);
      toast("Campagne supprimée.", "success");
      setToDelete(null);
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Suppression impossible.", "error");
    }
  };

  if (!apiAvailable) {
    return (
      <div className="rounded-2xl border border-[#333] bg-[#141414] p-6">
        <p className="text-[0.86rem] text-[#a0a0a0]">
          Backend indisponible — les campagnes nécessitent l&apos;API.
        </p>
      </div>
    );
  }

  const visible = (campaigns || []).filter((c) => filter === "all" || c.status === filter);

  return (
    <div>
      {/* Actions en tête */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(["all", "draft", "active", "ended"] as StatusFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`h-11 rounded-xl border px-4 text-[0.78rem] transition-colors ${
                filter === f
                  ? "border-[#e63946] bg-[rgba(230,57,70,0.1)] text-[#f0f0f0]"
                  : "border-[#333] bg-[#141414] text-[#a0a0a0] hover:border-[#444]"
              }`}
            >
              {f === "all" ? "Toutes" : STATUS_LABELS[f as AdminCampaign["status"]]}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="btn-arsenal btn-primary px-5"
        >
          {creating ? "Annuler" : "Nouvelle campagne"}
        </button>
      </div>

      {creating && (
        <CampaignForm
          products={products}
          onCreated={() => {
            setCreating(false);
            void load();
          }}
        />
      )}

      {/* Liste */}
      {campaigns === null ? (
        <p className="mt-6 font-mono text-[0.82rem] text-[#666]">Chargement des campagnes…</p>
      ) : visible.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-[#333] bg-[#141414] p-6 text-[0.86rem] text-[#a0a0a0]">
          Aucune campagne{filter !== "all" ? " dans ce filtre" : ""}.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {visible.map((c) => (
            <li key={c.id} className="rounded-2xl border border-[#333] bg-[#141414] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-display text-[0.98rem] font-bold">{c.name}</p>
                  <p className="mt-0.5 truncate text-[0.76rem] text-[#666]">
                    {c.productName ?? c.productId}
                    {c.endsAt ? ` · jusqu'au ${new Date(c.endsAt).toLocaleDateString("fr-FR")}` : ""}
                  </p>
                </div>
                <span
                  className={`rounded-md border px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wide ${STATUS_STYLES[c.status]}`}
                >
                  {STATUS_LABELS[c.status]}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[0.78rem] text-[#a0a0a0]">
                <span>
                  Commission :{" "}
                  <b className="text-[#f0f0f0]">
                    {c.commissionType === "percent" ? `${fmt(c.commissionValue ?? 0)} %` : `${fmt(c.commissionValue ?? 0)} FCFA`}
                  </b>
                </span>
                {c.rewardA > 0 && (
                  <span>
                    Récompense : <b className="text-gold">+{fmt(c.rewardA)} A</b>
                  </span>
                )}
                {c.goalSales != null && c.goalSales > 0 && (
                  <span>
                    Objectif : <b className="text-[#f0f0f0]">{fmt(c.goalSales)} ventes</b>
                  </span>
                )}
                <span>{fmt(c.participants)} participant(s)</span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {c.status !== "active" && (
                  <button
                    type="button"
                    disabled={busyId === c.id}
                    onClick={() => void changeState(c.id, "active")}
                    className="btn-arsenal btn-primary h-10 px-4 text-[0.78rem]"
                  >
                    {busyId === c.id && <span className="spin" />}
                    Activer
                  </button>
                )}
                {c.status === "active" && (
                  <button
                    type="button"
                    disabled={busyId === c.id}
                    onClick={() => void changeState(c.id, "ended")}
                    className="btn-arsenal btn-ghost h-10 px-4 text-[0.78rem]"
                  >
                    Terminer
                  </button>
                )}
                {c.status === "draft" && (
                  <button
                    type="button"
                    onClick={() => setToDelete(c)}
                    className="btn-arsenal btn-danger h-10 px-4 text-[0.78rem]"
                  >
                    Supprimer
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {toDelete && (
        <ConfirmDialog
          title="Supprimer la campagne"
          message={`« ${toDelete.name} » sera définitivement supprimée. Cette action est irréversible.`}
          confirmLabel="Supprimer"
          onConfirm={() => void confirmDelete()}
          onCancel={() => setToDelete(null)}
        />
      )}
    </div>
  );
}

/* ---------------- Formulaire de création ---------------- */

function CampaignForm({
  products,
  onCreated,
}: {
  products: Product[];
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [productId, setProductId] = useState("");
  const [commissionType, setCommissionType] = useState<"percent" | "fixed">("percent");
  const [commissionValue, setCommissionValue] = useState("");
  const [rewardA, setRewardA] = useState("");
  const [goalSales, setGoalSales] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /** Activité réelle par produit (liens, ventes, campagne en cours). */
  const [eligibility, setEligibility] = useState<CampaignEligibility[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchCampaignEligibility()
      .then((rows) => { if (!cancelled) setEligibility(rows); })
      .catch(() => { /* l'info est un confort : jamais bloquante */ });
    return () => { cancelled = true; };
  }, []);

  const eligible = products.filter((p) => p.affiliateEnabled);
  /** Détail du produit choisi (activité des liens + campagne active). */
  const selected = eligibility.find((e) => e.id === productId) ?? null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError("");
    const value = Number(commissionValue);
    if (name.trim().length < 3) return setError("Nom trop court (3 caractères minimum).");
    if (!productId) return setError("Choisissez un produit.");
    if (!Number.isFinite(value) || value < 0) return setError("Commission invalide.");
    if (commissionType === "percent" && value > 100) return setError("Pourcentage ≤ 100 requis.");
    try {
      await createAdminCampaign({
        name: name.trim(),
        productId,
        commissionType,
        commissionValue: value,
        rewardA: rewardA.trim() ? Math.trunc(Number(rewardA)) || 0 : 0,
        goalSales: goalSales.trim() ? Math.trunc(Number(goalSales)) || 0 : null,
        endsAt: endsAt ? new Date(endsAt).getTime() : null,
      });
      toast("Campagne créée (brouillon) — activez-la quand vous êtes prêt.", "success");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Création impossible.");
    }
  };

  return (
    <form
      onSubmit={submit}
      className="mt-4 rounded-2xl border border-[#333] bg-[#141414] p-5 sm:p-6"
    >
      <h3 className="font-display text-[0.98rem] font-bold">Nouvelle campagne</h3>
      {eligible.length === 0 ? (
        <p className="mt-3 text-[0.82rem] text-[#f4a261]">
          Aucun produit éligible à l&apos;affiliation — activez l&apos;affiliation sur un
          produit d&apos;abord (onglet Produits).
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-[0.78rem] text-[#a0a0a0]">Nom *</span>
            <input className="input-arsenal" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-[0.78rem] text-[#a0a0a0]">Produit affilié *</span>
            <select
              className="input-arsenal cursor-pointer"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
            >
              <option value="">— Choisir —</option>
              {eligible.map((p) => {
                const e = eligibility.find((x) => x.id === p.id);
                return (
                  <option key={p.id} value={p.id}>
                    {p.title}
                    {e && e.links.active > 0 ? ` — ${e.links.active} lien(s) actif(s)` : " — aucun lien actif"}
                  </option>
                );
              })}
            </select>
            {/* « Avant de lancer » : ce que l'on sait du produit choisi. */}
            {selected && (
              <div className="mt-2 flex flex-col gap-1.5 rounded-[10px] border border-[#333] bg-[rgba(255,255,255,0.02)] px-3.5 py-3 text-[0.74rem] leading-relaxed">
                <p className="text-[#a0a0a0]">
                  Règle actuelle :{" "}
                  <b className="text-[#f0f0f0]">
                    {selected.commissionType === "fixed"
                      ? `${fmt(selected.commissionValue ?? 0)} FCFA`
                      : selected.commissionType === "percent"
                        ? `${fmt(selected.commissionValue ?? 0)} %`
                        : "aucune (réglage par défaut)"}
                  </b>
                  {selected.rewardA > 0 && (
                    <>
                      {" · "}
                      <b className="text-gold">+{fmt(selected.rewardA)} A</b>
                    </>
                  )}
                </p>
                <p className={selected.links.total > 0 ? "text-[#a0a0a0]" : "text-[#f4a261]"}>
                  Liens affiliés : <b className="text-[#f0f0f0]">{selected.links.total}</b> créé(s)
                  {" · "}
                  <b className="text-[#f0f0f0]">{selected.links.active}</b> actif(s)
                  {" · "}
                  <b className="text-[#f0f0f0]">{fmt(selected.links.sales)}</b> vente(s)
                  {selected.links.active === 0 && (
                    <span className="mt-0.5 block">
                      Aucun affilié ne promeut ce produit pour l&apos;instant : la campagne ne
                      touchera personne tant qu&apos;un lien n&apos;est pas activé.
                    </span>
                  )}
                </p>
                {selected.activeCampaign && !selected.activeCampaign.expired && (
                  <p className="text-[#f4a261]">
                    ⚠ Une campagne est <b>déjà active</b> sur ce produit («{" "}
                    {selected.activeCampaign.name} »). La nouvelle ne prendra effet qu&apos;après
                    la fin ou l&apos;arrêt de celle-ci.
                  </p>
                )}
              </div>
            )}
          </label>
          <label>
            <span className="mb-1.5 block text-[0.78rem] text-[#a0a0a0]">Type de commission</span>
            <select
              className="input-arsenal cursor-pointer"
              value={commissionType}
              onChange={(e) => setCommissionType(e.target.value as "percent" | "fixed")}
            >
              <option value="percent">Pourcentage</option>
              <option value="fixed">Montant fixe (FCFA)</option>
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-[0.78rem] text-[#a0a0a0]">
              {commissionType === "percent" ? "Commission (%)" : "Commission (FCFA)"}
            </span>
            <input
              className="input-arsenal font-mono"
              inputMode="decimal"
              value={commissionValue}
              onChange={(e) => setCommissionValue(e.target.value)}
              placeholder={commissionType === "percent" ? "40" : "2000"}
            />
          </label>
          <label>
            <span className="mb-1.5 block text-[0.78rem] text-[#a0a0a0]">
              Récompense A par vente <span className="text-[#666]">(optionnel)</span>
            </span>
            <input
              className="input-arsenal font-mono"
              inputMode="numeric"
              value={rewardA}
              onChange={(e) => setRewardA(e.target.value)}
              placeholder="80"
            />
          </label>
          <label>
            <span className="mb-1.5 block text-[0.78rem] text-[#a0a0a0]">
              Objectif de ventes <span className="text-[#666]">(optionnel)</span>
            </span>
            <input
              className="input-arsenal font-mono"
              inputMode="numeric"
              value={goalSales}
              onChange={(e) => setGoalSales(e.target.value)}
              placeholder="50"
            />
          </label>
          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-[0.78rem] text-[#a0a0a0]">
              Date de fin <span className="text-[#666]">(optionnel)</span>
            </span>
            <input
              type="date"
              className="input-arsenal"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </label>
        </div>
      )}

      {error && <p className="mt-3 text-[0.8rem] text-[#e63946]" role="alert">{error}</p>}

      {eligible.length > 0 && (
        <button type="submit" disabled={busy} className="btn-arsenal btn-primary mt-4 w-full">
          {busy && <span className="spin" />}
          Créer la campagne
        </button>
      )}
      <p className="mt-2 text-[0.7rem] text-[#666]">
        La campagne naît en brouillon — activez-la pour que les affiliés la voient.
      </p>
    </form>
  );
}
