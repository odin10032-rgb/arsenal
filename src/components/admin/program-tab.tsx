"use client";

/**
 * Onglet « Programme » (vague 5) — administration du programme d'affiliation
 * et ajustement de la monnaie A.
 *
 * Quatre sections sobres, dans le style des onglets existants :
 *  1. Réglages du programme — plafonds, récompenses, anti-spam, seuils Super,
 *     commission/récompense par défaut (édition nombre + Enregistrer par ligne) ;
 *  2. Transferts de A — table (date, de, vers, montant), LECTURE SEULE ;
 *  3. Paniers abandonnés — table (porteur, articles, dernier mouvement) + filtre « depuis » ;
 *  4. Ajustement de A — formulaire (utilisateur, montant signé, motif) avec
 *     confirmation OBLIGATOIRE rappelant le montant ET le motif, puis nouveau solde.
 */

import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "./confirm-dialog";
import {
  creditAdminUser,
  fetchAdminAbandonedCarts,
  fetchAdminProgramSettings,
  fetchAdminTransfers,
  saveAdminProgramSetting,
  type AdminAbandonedCart,
  type AdminProgramSettings,
  type AdminTransfer,
} from "@/lib/admin-program";
import { fetchAdminUsers, type AdminUser } from "@/lib/admin-users";
import { fmt } from "@/lib/format";
import { toast } from "@/lib/toast";

/* ------------------------------ Métadonnées réglages ------------------------------ */

/** Plafond d'article : bornes de saisie (le serveur normalise de toute façon). */
const MAX_SETTING_VALUE = 1_000_000;

interface SettingMeta {
  key: keyof AdminProgramSettings;
  label: string;
  help: string;
  /** 0 est une valeur SENSIBLE (illimité) : affiché explicitement. */
  zeroMeansUnlimited?: boolean;
}

const SETTING_META: SettingMeta[] = [
  { key: "max_active_links", label: "Liens actifs max (affilié)", help: "Plafond de liens ACTIFS par affilié (0 = illimité)." },
  { key: "max_sales_per_link", label: "Ventes max par lien", help: "Au-delà, le lien passe automatiquement en « saturé »." },
  { key: "super_max_active_links", label: "Liens actifs max (Super)", help: "Plafond du Super-affilié — 0 = illimité.", zeroMeansUnlimited: true },
  { key: "reward_share_a", label: "Récompense par partage (A)", help: "A crédités par partage enregistré." },
  { key: "reward_click_a", label: "Récompense par clic (A)", help: "A crédités par clic compté." },
  { key: "share_max_per_day", label: "Partages max / jour", help: "Anti-spam : limite quotidienne de partages récompensés." },
  { key: "super_min_sales", label: "Seuil Super — ventes", help: "Ventes confirmées requises pour la promotion Super." },
  { key: "super_min_clicks", label: "Seuil Super — clics", help: "Clics requis pour la promotion Super." },
  { key: "default_commission_percent", label: "Commission par défaut (%)", help: "Taux appliqué quand ni produit ni campagne ne le fixent." },
  { key: "default_reward_a", label: "Récompense par défaut (A)", help: "Rémunération en A par défaut des commandes affiliées." },
  { key: "affiliate_min_sales", label: "Seuil affilié — ventes", help: "Ventes minimales d'éligibilité au programme." },
];

/* --------------------------------- Utilitaires -------------------------------- */

const HOURS_FILTERS: { id: number; label: string }[] = [
  { id: 24, label: "24 h" },
  { id: 24 * 7, label: "7 j" },
  { id: 24 * 30, label: "30 j" },
];

function formatDateTime(ts: number): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ------------------------------------ Onglet ------------------------------------ */

export function ProgramTab({ apiAvailable }: { apiAvailable: boolean }) {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-[1.2rem] font-bold">Programme</h2>
        <span className="rounded-full border border-[#333] bg-[#141414] px-2.5 py-1 font-mono text-[0.64rem] text-[#666]">
          réglages &amp; monnaie A
        </span>
      </div>

      <ProgramSettingsSection apiAvailable={apiAvailable} />
      <TransfersSection apiAvailable={apiAvailable} />
      <AbandonedCartsSection apiAvailable={apiAvailable} />
      <CreditSection apiAvailable={apiAvailable} />
    </section>
  );
}

/* ============================ 1. Réglages du programme ============================ */

function ProgramSettingsSection({ apiAvailable }: { apiAvailable: boolean }) {
  const [settings, setSettings] = useState<AdminProgramSettings | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<keyof AdminProgramSettings, string>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingKey, setSavingKey] = useState<keyof AdminProgramSettings | null>(null);

  const load = useCallback(async () => {
    if (!apiAvailable) {
      setLoading(false);
      setError("Réglages du programme disponibles uniquement avec le backend connecté.");
      return;
    }
    setLoading(true);
    try {
      const s = await fetchAdminProgramSettings();
      setSettings(s);
      setDrafts({});
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

  const save = async (key: keyof AdminProgramSettings) => {
    if (!settings || savingKey) return;
    const raw = drafts[key];
    const value = raw === undefined ? settings[key] : Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      toast("Valeur invalide (entier positif attendu).", "error");
      return;
    }
    setSavingKey(key);
    try {
      const next = await saveAdminProgramSetting(key, Math.trunc(value));
      setSettings(next);
      setDrafts((d) => {
        const copy = { ...d };
        delete copy[key];
        return copy;
      });
      toast("Réglage enregistré.", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Enregistrement impossible.", "error");
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="rounded-2xl border border-[#333] bg-[#141414] p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h3 className="text-[0.98rem] font-semibold">Réglages du programme</h3>
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
      <p className="mb-3 text-[0.78rem] leading-relaxed text-[#666]">
        Ces réglages pilotent les plafonds et les récompenses du programme d&apos;affiliation.
      </p>

      {error && (
        <p className="rounded-lg border border-[rgba(244,162,97,0.4)] bg-[rgba(244,162,97,0.07)] px-4 py-3 text-[0.85rem] text-[#f4a261]">
          {error}
        </p>
      )}

      {settings && (
        <div className="flex flex-col divide-y divide-[#222]">
          {SETTING_META.map((meta) => {
            const current = settings[meta.key];
            const draft = drafts[meta.key];
            const value = draft === undefined ? String(current) : draft;
            const dirty = draft !== undefined && Number(draft) !== current;
            return (
              <div key={meta.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <div className="min-w-[220px] flex-1">
                  <span className="block text-[0.84rem] font-medium text-[#f0f0f0]">{meta.label}</span>
                  <span className="block text-[0.72rem] text-[#666]">{meta.help}</span>
                  {meta.zeroMeansUnlimited && current === 0 && (
                    <span className="mt-0.5 inline-block rounded border border-[#333] bg-[#1a1a1a] px-1.5 py-0.5 font-mono text-[0.62rem] text-[#56b8a8]">
                      illimité
                    </span>
                  )}
                </div>
                <input
                  type="number"
                  min={0}
                  max={MAX_SETTING_VALUE}
                  inputMode="numeric"
                  className="input-arsenal w-[130px] font-mono text-[0.82rem]"
                  value={value}
                  onChange={(e) => setDrafts((d) => ({ ...d, [meta.key]: e.target.value }))}
                  aria-label={meta.label}
                />
                <button
                  type="button"
                  onClick={() => void save(meta.key)}
                  disabled={!dirty || savingKey !== null}
                  className="btn-arsenal btn-primary btn-sm"
                >
                  {savingKey === meta.key && <span className="spin" />}
                  Enregistrer
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================== 2. Transferts de A ============================== */

function TransfersSection({ apiAvailable }: { apiAvailable: boolean }) {
  const [rows, setRows] = useState<AdminTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!apiAvailable) {
      setLoading(false);
      setError("Transferts disponibles uniquement avec le backend connecté.");
      return;
    }
    setLoading(true);
    try {
      setRows(await fetchAdminTransfers(200));
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
    <div className="rounded-2xl border border-[#333] bg-[#141414] p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h3 className="text-[0.98rem] font-semibold">Transferts de A</h3>
        <span className="rounded-full border border-[#333] bg-[#1a1a1a] px-2 py-0.5 font-mono text-[0.62rem] text-[#666]">
          lecture seule
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
        <p className="mb-3 rounded-lg border border-[rgba(244,162,97,0.4)] bg-[rgba(244,162,97,0.07)] px-4 py-3 text-[0.85rem] text-[#f4a261]">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-[#333]">
        <table className="w-full border-collapse text-[0.8rem]">
          <thead>
            <tr>
              {["Date", "De", "Vers", "Montant"].map((h) => (
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
            {rows.map((t) => (
              <tr key={t.refId} className="border-b border-[#222] last:border-0 hover:bg-[rgba(255,255,255,0.025)]">
                <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[0.72rem] text-[#666]">
                  {formatDateTime(t.createdAt)}
                </td>
                <td className="px-3 py-2.5 text-[#f0f0f0]">{t.fromPseudo ?? "compte supprimé"}</td>
                <td className="px-3 py-2.5 text-[#f0f0f0]">{t.toPseudo ?? "compte supprimé"}</td>
                <td className="whitespace-nowrap px-3 py-2.5 font-mono tabular-nums text-gold">
                  {fmt(t.amount)} A
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && rows.length === 0 && !error && (
          <p className="px-4 py-6 text-center font-mono text-[0.78rem] text-[#666]">
            Aucun transfert enregistré.
          </p>
        )}
        {loading && rows.length === 0 && !error && (
          <p className="px-4 py-6 text-center font-mono text-[0.78rem] text-[#666]">Chargement…</p>
        )}
      </div>
    </div>
  );
}

/* ============================ 3. Paniers abandonnés ============================ */

function AbandonedCartsSection({ apiAvailable }: { apiAvailable: boolean }) {
  const [hours, setHours] = useState(24);
  const [rows, setRows] = useState<AdminAbandonedCart[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!apiAvailable) {
      setLoading(false);
      setError("Paniers abandonnés disponibles uniquement avec le backend connecté.");
      return;
    }
    setLoading(true);
    try {
      setRows(await fetchAdminAbandonedCarts(hours, 200));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }, [apiAvailable, hours]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="rounded-2xl border border-[#333] bg-[#141414] p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h3 className="text-[0.98rem] font-semibold">Paniers abandonnés</h3>
        <span className="rounded-full border border-[#333] bg-[#1a1a1a] px-2 py-0.5 font-mono text-[0.62rem] text-[#666]">
          paniers non convertis
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

      {/* Filtre « depuis » : fenêtre d'inactivité */}
      <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Filtrer la fenêtre d'inactivité">
        <span className="text-[0.78rem] text-[#666]">Depuis :</span>
        {HOURS_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setHours(f.id)}
            aria-pressed={hours === f.id}
            className="relative inline-flex h-9 items-center rounded-xl border px-3.5 text-[0.82rem] font-semibold transition-colors duration-200"
            style={
              hours === f.id
                ? { color: "#f0f0f0", borderColor: "#444", background: "#1a1a1a" }
                : { color: "#a0a0a0", borderColor: "#333", background: "#141414" }
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="mb-3 rounded-lg border border-[rgba(244,162,97,0.4)] bg-[rgba(244,162,97,0.07)] px-4 py-3 text-[0.85rem] text-[#f4a261]">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-[#333]">
        <table className="w-full border-collapse text-[0.8rem]">
          <thead>
            <tr>
              {["Porteur", "Articles", "Valeur publique", "Dernier mouvement"].map((h) => (
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
            {rows.map((cartRow) => (
              <tr key={cartRow.cartId} className="border-b border-[#222] last:border-0 hover:bg-[rgba(255,255,255,0.025)]">
                <td className="px-3 py-2.5">
                  {cartRow.hasAccount ? (
                    <span className="text-[#f0f0f0]">{cartRow.owner}</span>
                  ) : (
                    <span className="font-mono text-[0.74rem] text-[#666]">visiteur</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 font-mono tabular-nums text-[#a0a0a0]">
                  {fmt(cartRow.itemCount)}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 font-mono tabular-nums text-[#f0f0f0]">
                  {fmt(Math.round(cartRow.publicValue))} FCFA
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[0.72rem] text-[#666]">
                  {formatDateTime(cartRow.updatedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && rows.length === 0 && !error && (
          <p className="px-4 py-6 text-center font-mono text-[0.78rem] text-[#666]">
            Aucun panier abandonné sur cette fenêtre.
          </p>
        )}
        {loading && rows.length === 0 && !error && (
          <p className="px-4 py-6 text-center font-mono text-[0.78rem] text-[#666]">Chargement…</p>
        )}
      </div>
    </div>
  );
}

/* ============================= 4. Ajustement de A ============================= */

function CreditSection({ apiAvailable }: { apiAvailable: boolean }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AdminUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [target, setTarget] = useState<AdminUser | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastBalance, setLastBalance] = useState<{ pseudo: string; balanceA: number } | null>(null);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiAvailable) return;
    setSearching(true);
    try {
      setResults(await fetchAdminUsers(query.trim()));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const parsedAmount = Number(amount);
  const amountValid = Number.isInteger(parsedAmount) && parsedAmount !== 0;
  const reasonValid = reason.trim().length > 0;
  const ready = Boolean(target) && amountValid && reasonValid;

  const reset = () => {
    setTarget(null);
    setAmount("");
    setReason("");
    setResults([]);
    setQuery("");
  };

  const apply = async () => {
    if (!target || !ready || busy) return;
    // Cle d'idempotence generee a l'OUVERTURE de la confirmation : un renvoi
    // reseau de cette MEME tentative est reconnu par la route et ignore.
    const idempotencyKey = crypto.randomUUID();
    setBusy(true);
    try {
      const res = await creditAdminUser(target.id, Math.trunc(parsedAmount), reason.trim(), idempotencyKey);
      toast(
        `${res.amount > 0 ? "Crédit" : "Débit"} de ${fmt(Math.abs(res.amount))} A appliqué à ${
          res.pseudo || target.pseudo
        }.`,
        "success",
      );
      setLastBalance({ pseudo: res.pseudo || target.pseudo, balanceA: res.balanceA });
      setConfirming(false);
      reset();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Ajustement impossible.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[#333] bg-[#141414] p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h3 className="text-[0.98rem] font-semibold">Ajustement de A</h3>
        <span className="rounded-full border border-[rgba(230,57,70,0.4)] bg-[rgba(230,57,70,0.08)] px-2 py-0.5 font-mono text-[0.62rem] uppercase tracking-[0.08em] text-[#fda4af]">
          action sensible
        </span>
      </div>
      <p className="mb-3 text-[0.78rem] leading-relaxed text-[#666]">
        Crédite ou débite manuellement la monnaie A d&apos;un MEMBRE. Un montant positif crédite,
        un montant négatif débite (jamais sous le solde disponible). Le motif est obligatoire et
        journalisé.
      </p>

      {lastBalance && (
        <p className="mb-3 rounded-lg border border-[rgba(42,157,143,0.4)] bg-[rgba(42,157,143,0.07)] px-4 py-3 text-[0.85rem] text-[#56b8a8]">
          Nouveau solde de {lastBalance.pseudo || "ce compte"} :{" "}
          <span className="font-mono text-gold">{fmt(lastBalance.balanceA)} A</span>
        </p>
      )}

      {/* Sélection d'un utilisateur (recherche pseudo/email) */}
      {!target ? (
        <>
          <form onSubmit={search} className="mb-3 flex flex-wrap items-center gap-2">
            <input
              className="input-arsenal max-w-[340px] flex-1 font-mono text-[0.82rem]"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un pseudo ou un email…"
              aria-label="Rechercher l'utilisateur à ajuster"
            />
            <button type="submit" className="btn-arsenal btn-primary btn-sm" disabled={searching}>
              {searching && <span className="spin" />}
              Rechercher
            </button>
          </form>

          {results.length > 0 && (
            <ul className="mb-3 max-h-[240px] overflow-y-auto rounded-xl border border-[#333]">
              {results.map((u) => (
                <li key={u.id} className="border-b border-[#222] last:border-0">
                  <button
                    type="button"
                    onClick={() => {
                      setTarget(u);
                      setResults([]);
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[rgba(255,255,255,0.03)]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.84rem] text-[#f0f0f0]">{u.pseudo || "—"}</span>
                      <span className="block truncate text-[0.72rem] text-[#666]">{u.email || "—"}</span>
                    </span>
                    <span className="whitespace-nowrap font-mono text-[0.76rem] tabular-nums text-gold">
                      {fmt(u.balanceA)} A
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-[#333] bg-[#1a1a1a] px-4 py-3">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.84rem] text-[#f0f0f0]">{target.pseudo || "—"}</span>
            <span className="block truncate text-[0.72rem] text-[#666]">{target.email || "—"}</span>
          </span>
          <span className="whitespace-nowrap font-mono text-[0.82rem] tabular-nums">
            <span className="text-gold">{fmt(target.balanceA)} A</span>
          </span>
          <button type="button" onClick={reset} className="btn-arsenal btn-ghost btn-sm">
            Changer
          </button>
        </div>
      )}

      {/* Montant signé + motif */}
      <div className="flex flex-wrap items-start gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[0.78rem] font-semibold text-[#a0a0a0]">Montant (A, signé)</span>
          <input
            type="number"
            className="input-arsenal w-[160px] font-mono text-[0.82rem]"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="ex. 500 ou -200"
            aria-label="Montant signé en A"
          />
        </label>
        <label className="flex min-w-[240px] flex-1 flex-col gap-1.5">
          <span className="text-[0.78rem] font-semibold text-[#a0a0a0]">Motif (obligatoire)</span>
          <input
            className="input-arsenal text-[0.82rem]"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="ex. Geste commercial — incident livraison"
            aria-label="Motif de l'ajustement"
          />
        </label>
      </div>

      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={!ready}
          className="btn-arsenal btn-primary"
        >
          Ajuster
        </button>
      </div>

      {/* Confirmation obligatoire : montant ET motif rappelés */}
      {confirming && target && (
        <ConfirmDialog
          title="Confirmer l'ajustement de A ?"
          message={`${parsedAmount > 0 ? "Créditer" : "Débiter"} ${fmt(Math.abs(parsedAmount))} A sur le compte de ${
            target.pseudo || target.email || "cet utilisateur"
          } — motif : « ${reason.trim()} ». Cette opération est journalisée et irréversible.`}
          confirmLabel={`${parsedAmount > 0 ? "Créditer" : "Débiter"} ${fmt(Math.abs(Math.trunc(parsedAmount)))} A`}
          busy={busy}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void apply()}
        />
      )}
    </div>
  );
}
