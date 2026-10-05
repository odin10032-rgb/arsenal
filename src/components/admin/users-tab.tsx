"use client";

/**
 * Onglet Utilisateurs — profil, solde A et historique d'activité complet par compte.
 *
 * • liste GET /api/admin/users?q= — recherche pseudo/email (LIKE serveur), rôle en
 *   pastille discrète, solde A en mono or, inscription, achats non annulés, affiliation ;
 * • clic sur une ligne → panneau détail dans la même section (sous la table) :
 *   carte profil + compteurs + timeline d'activité fusionnée
 *   (connexions, monnaie A, achats, changements de rôle — GET /api/admin/users/:id/activity) ;
 * • LECTURE SEULE : aucune action de mutation dans cet onglet.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchAdminUser,
  fetchAdminUserActivity,
  fetchAdminUsers,
  type AdminActivityEntry,
  type AdminActivityKind,
  type AdminUser,
  setUserMembership,
  type AdminUserDetail,
} from "@/lib/admin-users";
import { fmt } from "@/lib/format";
import { toast } from "@/lib/toast";

const ROLE_LABELS: Record<string, string> = {
  user: "Utilisateur",
  affiliate: "Affilié",
  super_affiliate: "Super affilié",
  admin: "Admin",
};

/** Pastille de rôle sobre — mêmes teintes que le badge de /compte. */
function roleBadgeStyle(role: string): { color: string; border: string; bg: string } {
  if (role === "admin") {
    return { color: "#fda4af", border: "rgba(230,57,70,0.45)", bg: "rgba(230,57,70,0.1)" };
  }
  if (role === "affiliate" || role === "super_affiliate") {
    return { color: "#7fd4cb", border: "rgba(42,157,143,0.45)", bg: "rgba(42,157,143,0.1)" };
  }
  return { color: "#a0a0a0", border: "#333", bg: "#1a1a1a" };
}

const AFFILIATE_STATUS_STYLE: Record<string, { label: string; color: string; border: string; bg: string }> = {
  pending: { label: "En attente", color: "#f4a261", border: "rgba(244,162,97,0.4)", bg: "rgba(244,162,97,0.08)" },
  active: { label: "Actif", color: "#56b8a8", border: "rgba(42,157,143,0.4)", bg: "rgba(42,157,143,0.08)" },
  suspended: { label: "Suspendu", color: "#fda4af", border: "rgba(230,57,70,0.45)", bg: "rgba(230,57,70,0.1)" },
};

const KIND_LABELS: Record<AdminActivityKind, string> = {
  securite: "Sécurité",
  a: "Monnaie A",
  achat: "Achat",
  role: "Rôle",
};

function formatDate(ts: number | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

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

/** Icône discrète par type d'entrée de la timeline (même style que les onglets). */
function KindIcon({ kind }: { kind: AdminActivityKind }) {
  if (kind === "securite") {
    return (
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    );
  }
  if (kind === "a") {
    return (
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="m8.2 15.5 3.8-7.5 3.8 7.5M9.6 12.9h4.8" />
      </svg>
    );
  }
  if (kind === "achat") {
    return (
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h2l2.4 10.5a2 2 0 0 0 2 1.5h7.4a2 2 0 0 0 2-1.6L21 8H6" />
        <circle cx="10" cy="20" r="1.3" />
        <circle cx="17.5" cy="20" r="1.3" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

/**
 * Détail d'une entrée : nombre (delta A signé — or/rouge), chaîne, ou meta JSON
 * compact « clé : valeur · … ». Rien n'est inventé : un détail absent n'affiche rien.
 */
function DetailLine({ entry }: { entry: AdminActivityEntry }) {
  const d = entry.detail;
  if (d === null || d === undefined || d === "") return null;
  if (typeof d === "number") {
    if (entry.kind === "a") {
      const positive = d >= 0;
      return (
        <span
          className={`block font-mono text-[0.76rem] tabular-nums ${
            positive ? "text-gold" : "text-[#fda4af]"
          }`}
        >
          {positive ? `+${fmt(d)}` : fmt(d)} A
        </span>
      );
    }
    return <span className="block font-mono text-[0.76rem] tabular-nums text-[#a0a0a0]">{fmt(d)}</span>;
  }
  const text = typeof d === "string" ? d : formatMetaDetail(d);
  if (!text) return null;
  return (
    <span className="block break-words font-mono text-[0.72rem] leading-relaxed text-[#a0a0a0]">
      {text}
    </span>
  );
}

/** meta JSON → texte compact lisible (objets imbriqués sérialisés tels quels). */
function formatMetaDetail(detail: unknown): string {
  if (detail === null || detail === undefined) return "";
  if (typeof detail === "string") return detail;
  if (typeof detail === "number" || typeof detail === "boolean") return String(detail);
  if (Array.isArray(detail)) return detail.map((v) => formatMetaDetail(v)).join(", ");
  if (typeof detail === "object") {
    return Object.entries(detail as Record<string, unknown>)
      .filter(([, v]) => v !== null && v !== undefined && v !== "")
      .map(([k, v]) => `${k} : ${typeof v === "object" && v !== null ? JSON.stringify(v) : String(v)}`)
      .join(" · ");
  }
  return String(detail);
}

export function UsersTab({ apiAvailable }: { apiAvailable: boolean }) {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [activity, setActivity] = useState<AdminActivityEntry[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  /** Jeton anti-course : un seul chargement de fiche à la fois (dernier clic gagnant). */
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    if (!apiAvailable) {
      setLoading(false);
      setError("Liste des utilisateurs disponible uniquement avec le backend connecté.");
      return;
    }
    setLoading(true);
    try {
      setRows(await fetchAdminUsers(search));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }, [apiAvailable, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const term = input.trim();
    if (term === search) void load(); // même terme : relance explicite
    else setSearch(term);
  };

  const clearSearch = () => {
    setInput("");
    if (search) setSearch("");
    else void load();
  };

  const openUser = async (u: AdminUser) => {
    if (!apiAvailable) return;
    const token = ++requestRef.current;
    setSelected(u);
    setDetail(null);
    setActivity([]);
    setDetailError("");
    setDetailLoading(true);
    try {
      const [d, a] = await Promise.all([fetchAdminUser(u.id), fetchAdminUserActivity(u.id)]);
      if (token !== requestRef.current) return;
      setDetail(d);
      setActivity(a);
    } catch (err) {
      if (token !== requestRef.current) return;
      setDetailError(err instanceof Error ? err.message : "Chargement de la fiche impossible.");
    } finally {
      if (token === requestRef.current) setDetailLoading(false);
    }
  };

  const closeUser = () => {
    requestRef.current += 1; // invalide un éventuel chargement en cours
    setSelected(null);
    setDetail(null);
    setActivity([]);
    setDetailError("");
    setDetailLoading(false);
  };

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="font-display text-[1.2rem] font-bold">Utilisateurs</h2>
        <span className="rounded-full border border-[#333] bg-[#141414] px-2.5 py-1 font-mono text-[0.64rem] text-[#666]">
          profils &amp; historique
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

      {/* Recherche pseudo/email (LIKE échappé côté serveur) */}
      <form onSubmit={submitSearch} className="mb-4 flex flex-wrap items-center gap-2">
        <input
          className="input-arsenal max-w-[340px] flex-1 font-mono text-[0.82rem]"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Rechercher un pseudo ou un email…"
          aria-label="Rechercher un utilisateur par pseudo ou email"
        />
        <button type="submit" className="btn-arsenal btn-primary btn-sm" disabled={loading}>
          Rechercher
        </button>
        {(search || input) && (
          <button type="button" onClick={clearSearch} className="btn-arsenal btn-ghost btn-sm">
            Effacer
          </button>
        )}
      </form>

      {error && (
        <p className="mb-4 rounded-lg border border-[rgba(244,162,97,0.4)] bg-[rgba(244,162,97,0.07)] px-4 py-3 text-[0.85rem] text-[#f4a261]">
          {error}
        </p>
      )}

      {/* Liste — clic sur une ligne : panneau détail sous la table */}
      <div className="overflow-x-auto rounded-2xl border border-[#333] bg-[#141414]">
        <table className="w-full border-collapse text-[0.8rem]">
          <thead>
            <tr>
              {["Utilisateur", "Rôle", "Solde A", "Inscrit le", "Achats", "Affiliation"].map((h) => (
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
            {rows.map((u) => {
              const roleStyle = roleBadgeStyle(u.role);
              const affiliateStyle = u.affiliate
                ? AFFILIATE_STATUS_STYLE[u.affiliate.status]
                : undefined;
              return (
                <tr
                  key={u.id}
                  onClick={() => void openUser(u)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      void openUser(u);
                    }
                  }}
                  tabIndex={0}
                  aria-label={`Voir la fiche et l'activité de ${u.pseudo || u.email}`}
                  className={`cursor-pointer border-b border-[#222] last:border-0 hover:bg-[rgba(255,255,255,0.025)] ${
                    selected?.id === u.id ? "bg-[rgba(255,255,255,0.04)]" : ""
                  }`}
                >
                  <td className="px-3 py-2.5">
                    <span className="block font-medium text-[#f0f0f0]">{u.pseudo || "—"}</span>
                    <span className="block text-[0.72rem] text-[#666]">{u.email || "—"}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <span
                      className="rounded-md border px-2 py-0.5 font-mono text-[0.64rem] uppercase tracking-[0.08em]"
                      style={{ color: roleStyle.color, borderColor: roleStyle.border, background: roleStyle.bg }}
                    >
                      {ROLE_LABELS[u.role] ?? u.role}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono tabular-nums">
                    <span className="text-gold">{fmt(u.balanceA)}</span>
                    <span className="text-[#666]"> A</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[0.72rem] text-[#666]">
                    {formatDate(u.createdAt)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono tabular-nums text-[#a0a0a0]">
                    {fmt(u.purchasesCount)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    {u.affiliate ? (
                      <span
                        className="rounded-md border px-2 py-0.5 font-mono text-[0.64rem] uppercase tracking-[0.08em]"
                        style={
                          affiliateStyle
                            ? { color: affiliateStyle.color, borderColor: affiliateStyle.border, background: affiliateStyle.bg }
                            : { color: "#a0a0a0", borderColor: "#333", background: "#1a1a1a" }
                        }
                      >
                        {affiliateStyle?.label ?? u.affiliate.status} · {u.affiliate.code}
                      </span>
                    ) : (
                      <span className="text-[0.72rem] text-[#666]">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && rows.length === 0 && !error && (
          <p className="px-4 py-6 text-center font-mono text-[0.78rem] text-[#666]">
            {search ? "Aucun utilisateur pour cette recherche." : "Aucun utilisateur."}
          </p>
        )}
        {loading && rows.length === 0 && !error && (
          <p className="px-4 py-6 text-center font-mono text-[0.78rem] text-[#666]">Chargement…</p>
        )}
      </div>

      {/* Panneau détail — profil + timeline d'activité du compte sélectionné */}
      {selected && (
        <UserDetailPanel
          user={selected}
          detail={detail}
          activity={activity}
          loading={detailLoading}
          error={detailError}
          onClose={closeUser}
        />
      )}
    </section>
  );
}

/* ------------------------------ Panneau détail ------------------------------ */

function UserDetailPanel({
  user,
  detail,
  activity,
  loading,
  error,
  onClose,
}: {
  user: AdminUser;
  detail: AdminUserDetail | null;
  activity: AdminActivityEntry[];
  loading: boolean;
  error: string;
  onClose: () => void;
}) {
  const [membershipBusy, setMembershipBusy] = useState(false);
  /** Accorde/retire l'adhésion — la monnaie A est réservée aux membres. */
  const toggleMembership = useCallback(
    async (next: "member" | "none") => {
      if (membershipBusy) return;
      setMembershipBusy(true);
      try {
        await setUserMembership(user.id, next);
        // Le détail affiché est déjà l'état à jour côté route : on reflète localement.
        toast(
          next === "member"
            ? "Adhésion accordée — la monnaie A est accessible."
            : "Adhésion retirée.",
          "success",
        );
      } catch (err) {
        toast(err instanceof Error ? err.message : "Bascule impossible.", "error");
      } finally {
        setMembershipBusy(false);
      }
    },
    [membershipBusy, user.id],
  );
  const roleStyle = roleBadgeStyle(detail?.user.role ?? user.role);
  const counters = detail
    ? [
        { label: "Transactions A", value: detail.counts.transactions },
        { label: "Achats non annulés", value: detail.counts.purchases },
        { label: "Licences", value: detail.counts.licenses },
        { label: "Téléchargements", value: detail.counts.downloads },
      ]
    : [];

  return (
    <div className="mt-5 rounded-2xl border border-[#333] bg-[#141414] p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h3 className="font-display text-[1.05rem] font-bold">
          Fiche &amp; activité — {user.pseudo || user.email || "compte"}
        </h3>
        <button type="button" onClick={onClose} className="btn-arsenal btn-ghost btn-sm ml-auto">
          Fermer
        </button>
      </div>

      {loading && (
        <p className="font-mono text-[0.78rem] text-[#666]">Chargement de la fiche et de l&apos;activité…</p>
      )}

      {error && !loading && (
        <p className="rounded-lg border border-[rgba(244,162,97,0.4)] bg-[rgba(244,162,97,0.07)] px-4 py-3 text-[0.85rem] text-[#f4a261]">
          {error}
        </p>
      )}

      {detail && !loading && (
        <>
          {/* Carte profil */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-[#333] bg-[#1a1a1a] px-4 py-3.5">
            <div className="min-w-0">
              <span className="block truncate font-medium text-[#f0f0f0]">
                {detail.user.pseudo || "—"}
              </span>
              <span className="block truncate text-[0.75rem] text-[#666]">{detail.user.email || "—"}</span>
            </div>
            <span
              className="rounded-md border px-2 py-0.5 font-mono text-[0.64rem] uppercase tracking-[0.08em]"
              style={{ color: roleStyle.color, borderColor: roleStyle.border, background: roleStyle.bg }}
            >
              {ROLE_LABELS[detail.user.role] ?? detail.user.role}
            </span>
            <span className="font-mono text-[1rem] tabular-nums">
              <span className="text-gold">{fmt(detail.user.balanceA)} A</span>
            </span>
            <span className="text-[0.74rem] text-[#666]">
              Inscrit le {formatDate(detail.user.createdAt)}
            </span>
            {detail.affiliate && (
              <span className="w-full text-[0.76rem] text-[#a0a0a0]">
                Affilié <span className="font-mono text-[#f0f0f0]">{detail.affiliate.code}</span> ·{" "}
                {AFFILIATE_STATUS_STYLE[detail.affiliate.status]?.label ?? detail.affiliate.status} ·{" "}
                {fmt(detail.affiliate.clicks)} clics · {fmt(detail.affiliate.sales)} ventes confirmées
              </span>
            )}
          </div>

          {/* Adhésion — pilote l'accès à la monnaie A (migration 0008). */}
          <div className="mb-3 flex items-center justify-between gap-3 rounded-[10px] border border-[#333] bg-[rgba(255,255,255,0.02)] px-3.5 py-2.5">
            <div className="min-w-0">
              <p className="text-[0.72rem] font-semibold uppercase tracking-wider text-[#666]">
                Adhésion au programme
              </p>
              <p className="mt-0.5 text-[0.74rem] leading-relaxed text-[#a0a0a0]">
                {detail.user.membership === "member"
                  ? "Membre — la monnaie A est accessible."
                  : "Non-membre — achat, transfert et récompenses refusés."}
              </p>
            </div>
            <button
              type="button"
              disabled={membershipBusy}
              onClick={() =>
                void toggleMembership(
                  detail.user.membership === "member" ? "none" : "member",
                )
              }
              className={
                detail.user.membership === "member"
                  ? "btn-arsenal btn-ghost btn-sm flex-shrink-0"
                  : "btn-arsenal btn-primary btn-sm flex-shrink-0"
              }
            >
              {membershipBusy && <span className="spin" />}
              {detail.user.membership === "member" ? "Retirer" : "Accorder"}
            </button>
          </div>

          {/* Compteurs */}
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {counters.map((c) => (
              <div key={c.label} className="rounded-xl border border-[#333] bg-[#141414] px-3 py-2.5">
                <span className="block font-mono text-[0.6rem] uppercase tracking-[0.1em] text-[#666]">
                  {c.label}
                </span>
                <span className="block font-mono text-[0.95rem] tabular-nums text-[#f0f0f0]">
                  {fmt(c.value)}
                </span>
              </div>
            ))}
          </div>

          {/* Timeline d'activité (fusion serveur : sécurité, A, achats, rôles) */}
          <div className="mt-5">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h4 className="text-[0.9rem] font-semibold">Historique d&apos;activité</h4>
              <span className="rounded-full border border-[#333] bg-[#1a1a1a] px-2 py-0.5 font-mono text-[0.62rem] text-[#666]">
                {fmt(activity.length)} entrée{activity.length > 1 ? "s" : ""}
              </span>
            </div>

            {activity.length === 0 ? (
              <p className="rounded-xl border border-[#333] px-4 py-5 text-center font-mono text-[0.78rem] text-[#666]">
                Aucune activité enregistrée pour ce compte.
              </p>
            ) : (
              <ul className="rounded-xl border border-[#333]">
                {activity.map((entry, i) => (
                  <li
                    key={`${entry.at}-${entry.kind}-${i}`}
                    className="flex flex-wrap items-start gap-x-3 gap-y-1 border-b border-[#222] px-4 py-2.5 last:border-0"
                  >
                    <span className="mt-0.5 flex-shrink-0 text-[#666]" title={KIND_LABELS[entry.kind]} aria-hidden="true">
                      <KindIcon kind={entry.kind} />
                    </span>
                    <span className="w-[150px] flex-shrink-0 whitespace-nowrap font-mono text-[0.7rem] text-[#666]">
                      {formatDateTime(entry.at)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.82rem] text-[#f0f0f0]">
                        {entry.label || KIND_LABELS[entry.kind]}
                      </span>
                      <DetailLine entry={entry} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
