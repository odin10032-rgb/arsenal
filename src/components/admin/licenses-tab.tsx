"use client";

/**
 * Onglet Licences — clés générées par les achats des produits en mode « Clé de licence »
 * (contrat : GET /api/admin/licenses, POST /api/admin/licenses/:id/revoke)
 *
 * • liste filtrable par statut (toutes / actives / révoquées) : utilisateur (pseudo/email),
 *   produit, clé (mono, copiable), activations n / max, statut et dates ;
 * • Révocation via ConfirmDialog — irréversible, ton explicite ;
 * • rappel factuel : ce sont les applications du propriétaire qui vérifient la clé via
 *   POST /api/licenses/verify (aucune action possible depuis ce dashboard).
 */

import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "./confirm-dialog";
import {
  fetchAdminLicenses,
  isAdminLicenseRevoked,
  revokeLicense,
  type AdminLicense,
  type AdminLicenseStatusFilter,
} from "@/lib/admin";
import { fmt } from "@/lib/format";
import { toast } from "@/lib/toast";

const FILTERS: { id: AdminLicenseStatusFilter; label: string }[] = [
  { id: "all", label: "Toutes" },
  { id: "active", label: "Actives" },
  { id: "revoked", label: "Révoquées" },
];

const STATUS_STYLE: Record<string, { label: string; color: string; border: string; bg: string }> = {
  active: { label: "Active", color: "#56b8a8", border: "rgba(42,157,143,0.4)", bg: "rgba(42,157,143,0.08)" },
  revoked: { label: "Révoquée", color: "#fda4af", border: "rgba(230,57,70,0.45)", bg: "rgba(230,57,70,0.1)" },
};

/** Statut inconnu : affiché tel quel, sans inventer de libellé métier */
function statusStyle(license: AdminLicense): { label: string; color: string; border: string; bg: string } {
  return (
    STATUS_STYLE[license.status] ?? {
      label: license.status || "—",
      color: "#a0a0a0",
      border: "#333",
      bg: "#1a1a1a",
    }
  );
}

function formatDate(ts: number | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function LicensesTab({ apiAvailable }: { apiAvailable: boolean }) {
  const [filter, setFilter] = useState<AdminLicenseStatusFilter>("all");
  const [rows, setRows] = useState<AdminLicense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revoking, setRevoking] = useState<AdminLicense | null>(null);
  const [busyRevoke, setBusyRevoke] = useState(false);

  const load = useCallback(async () => {
    if (!apiAvailable) {
      setLoading(false);
      setError("Liste des licences disponible uniquement avec le backend connecté.");
      return;
    }
    setLoading(true);
    try {
      setRows(await fetchAdminLicenses(filter));
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

  const copyKey = async (licenseKey: string) => {
    try {
      await navigator.clipboard.writeText(licenseKey);
      toast("Clé copiée dans le presse-papiers.", "success");
    } catch {
      toast("Copie impossible sur ce navigateur.", "error");
    }
  };

  const confirmRevoke = async () => {
    if (!revoking || busyRevoke) return;
    const target = revoking;
    setBusyRevoke(true);
    try {
      await revokeLicense(target.id);
      toast(`Licence de ${target.pseudo || target.email || "cet utilisateur"} révoquée.`, "success");
      setRevoking(null);
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Révocation impossible.", "error");
    } finally {
      setBusyRevoke(false);
    }
  };

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="font-display text-[1.2rem] font-bold">Licences</h2>
        <span className="rounded-full border border-[#333] bg-[#141414] px-2.5 py-1 font-mono text-[0.64rem] text-[#666]">
          clés d&apos;activation
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
              {["Utilisateur", "Produit", "Clé de licence", "Activations", "Statut", "Dates", "Action"].map(
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
            {rows.map((l) => {
              const style = statusStyle(l);
              const revoked = isAdminLicenseRevoked(l);
              return (
                <tr key={l.id} className="border-b border-[#222] last:border-0 hover:bg-[rgba(255,255,255,0.025)]">
                  <td className="px-3 py-2.5">
                    <span className="block font-medium text-[#f0f0f0]">{l.pseudo || "—"}</span>
                    <span className="block text-[0.72rem] text-[#666]">{l.email || "—"}</span>
                  </td>
                  <td className="px-3 py-2.5 text-[#f0f0f0]">{l.productTitle || "—"}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="max-w-[240px] break-all font-mono text-[0.74rem] text-[#f0f0f0]">
                        {l.licenseKey || "—"}
                      </span>
                      {l.licenseKey && (
                        <button
                          type="button"
                          onClick={() => void copyKey(l.licenseKey)}
                          className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg border border-[#333] bg-[#141414] text-[#a0a0a0] transition-colors hover:border-[#444] hover:text-[#4fb3a1]"
                          aria-label="Copier la clé"
                          title="Copier la clé"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            width="14"
                            height="14"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <rect x="9" y="9" width="12" height="12" rx="2" />
                            <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono tabular-nums text-[#f0f0f0]">
                    {fmt(l.activationsCount)} / {l.maxActivations > 0 ? fmt(l.maxActivations) : "—"}
                    <span className="text-[#666]"> appareils</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <span
                      className="rounded-md border px-2 py-0.5 font-mono text-[0.64rem] uppercase tracking-[0.08em]"
                      style={{ color: style.color, borderColor: style.border, background: style.bg }}
                    >
                      {style.label}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[0.72rem] text-[#666]">
                    Créée : {formatDate(l.createdAt)}
                    {l.revokedAt && <span className="block">Révoquée : {formatDate(l.revokedAt)}</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    {revoked ? (
                      <span className="font-mono text-[0.7rem] text-[#666]">—</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setRevoking(l)}
                        className="btn-arsenal btn-danger btn-sm"
                      >
                        Révoquer
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && rows.length === 0 && !error && (
          <p className="px-4 py-6 text-center font-mono text-[0.78rem] text-[#666]">
            Aucune licence pour ce filtre.
          </p>
        )}
        {loading && rows.length === 0 && !error && (
          <p className="px-4 py-6 text-center font-mono text-[0.78rem] text-[#666]">Chargement…</p>
        )}
      </div>

      {/* Rappel du périmètre : la vérification est faite par les applications du propriétaire */}
      <div className="mt-5 rounded-2xl border border-[#333] bg-[#141414] p-5">
        <h3 className="mb-1 text-[0.95rem] font-semibold">Vérification des clés</h3>
        <p className="text-[0.78rem] leading-relaxed text-[#666]">
          Les clés sont attribuées automatiquement à l&apos;achat des produits en mode « Clé de
          licence ». Ce sont les applications / CLI du propriétaire qui les vérifient
          (POST /api/licenses/verify avec la clé et l&apos;identifiant d&apos;appareil) : aucun test
          n&apos;est possible depuis ce dashboard. Une révocation est définitive : les appareils déjà
          activés perdent l&apos;accès.
        </p>
      </div>

      {/* Révocation : irréversible */}
      {revoking && (
        <ConfirmDialog
          title="Révoquer cette licence ?"
          message={`La clé de ${
            revoking.pseudo || revoking.email || "cet utilisateur"
          } pour « ${revoking.productTitle || "ce produit"} » sera définitivement invalidée : les ${
            revoking.activationsCount > 0 ? `${revoking.activationsCount} ` : ""
          }appareil(s) déjà activé(s) perdront l'accès. Cette action est irréversible.`}
          confirmLabel="Révoquer définitivement"
          busy={busyRevoke}
          onCancel={() => setRevoking(null)}
          onConfirm={() => void confirmRevoke()}
        />
      )}
    </section>
  );
}
