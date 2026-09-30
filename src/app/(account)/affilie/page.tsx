"use client";

/**
 * /affilie — Espace Affilié (contrat Phase 2 : docs/chantier/05-contrat-api-phase2.md)
 *
 * Quatre états, tous servis par GET /api/affiliate/me :
 *  • affiliate === null → présentation du programme + formulaire de candidature (note optionnelle)
 *  • status « pending »  → candidature en attente de validation
 *  • status « active »   → tableau de bord (identité, solde A, clics, ventes, conversion,
 *                          A gagnés, commissions, payable, payé) + accès à /affilie/produits
 *  • status « suspended » → message dédié
 *
 * Garde : non connecté → /connexion (pattern compte/page.tsx).
 * Aucun chiffre n'est calculé ici : tout vient de l'API.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CoinA } from "@/components/account/coin-a";
import { useUser } from "@/hooks/use-user";
import { ApiError } from "@/lib/api";
import { applyToAffiliate, fetchAffiliateMe, type Affiliate, type AffiliateStats } from "@/lib/affiliate";
import { fmt } from "@/lib/format";
import { logout } from "@/lib/user-auth";

/** Devise affichée pour les montants de commission (défaut du schéma : FCFA) */
const CURRENCY = "FCFA";

function formatDate(ts: number | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function AffiliePage() {
  const { user, loading, refresh } = useUser();
  const router = useRouter();
  const [affiliate, setAffiliate] = useState<Affiliate | null>(null);
  const [affLoading, setAffLoading] = useState(true);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  // Garde : session absente → porte de connexion (une fois le boot terminé)
  useEffect(() => {
    if (!loading && !user) router.replace("/connexion");
  }, [loading, user, router]);

  const load = useCallback(async () => {
    try {
      setAffiliate(await fetchAffiliateMe());
      setError("");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // Session invalide ou expirée : nettoyage local + porte de connexion
        await logout();
        router.replace("/connexion");
        return;
      }
      setError(err instanceof Error ? err.message : "Impossible de charger votre espace affilié.");
    } finally {
      setAffLoading(false);
    }
  }, [router]);

  // Chargement unique au boot : profil revalidé + état d'affiliation
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current || loading || !user) return;
    startedRef.current = true;
    void refresh();
    void load();
  }, [loading, user, refresh, load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      setAffiliate(await applyToAffiliate(note));
      setNote("");
    } catch (err) {
      // 409 « Vous êtes déjà affilié. » : on resynchronise l'état réel plutôt que d'afficher une impasse
      if (err instanceof ApiError && err.status === 409) {
        setError("");
        await load();
      } else {
        setError(err instanceof Error ? err.message : "Candidature impossible.");
      }
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-10">
        <p className="font-mono text-[0.85rem] text-[#666]">Chargement de votre espace…</p>
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
        <h1 className="mt-3 font-display text-[1.35rem] font-bold">Espace Affilié</h1>
        <p className="mt-1 text-[0.84rem] text-[#a0a0a0]">
          Vos liens, vos performances et vos commissions.
        </p>

        {error && (
          <p
            className="mt-5 rounded-lg border border-[rgba(230,57,70,0.4)] bg-[rgba(230,57,70,0.1)] px-3 py-2 text-[0.8rem] text-[#fda4af]"
            role="alert"
          >
            {error}
          </p>
        )}

        {affLoading ? (
          <p className="mt-8 font-mono text-[0.8rem] text-[#666]">
            Chargement de votre espace affilié…
          </p>
        ) : !affiliate ? (
          <ApplicationCard note={note} setNote={setNote} busy={busy} onSubmit={submit} />
        ) : affiliate.status === "active" ? (
          <ActiveView affiliate={affiliate} pseudo={user.pseudo} balanceA={user.balanceA} />
        ) : affiliate.status === "suspended" ? (
          <SuspendedCard affiliate={affiliate} />
        ) : (
          <PendingCard affiliate={affiliate} />
        )}
      </div>
    </div>
  );
}

/* ---------------- État 1 : candidature ---------------- */

function ApplicationCard({
  note,
  setNote,
  busy,
  onSubmit,
}: {
  note: string;
  setNote: (v: string) => void;
  busy: boolean;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="mt-6 rounded-2xl border border-[#333] bg-[#141414] p-6 sm:p-8">
      <h2 className="font-display text-[1.05rem] font-bold">Devenir affilié</h2>
      <p className="mt-2 text-[0.86rem] leading-relaxed text-[#a0a0a0]">
        Partagez les outils du catalogue avec votre audience : chaque vente réalisée avec votre lien
        vous rapporte une commission, plus une récompense en A lorsqu&apos;elle est prévue.
      </p>

      <ul className="mt-5 flex flex-col gap-2.5 border-t border-dashed border-[#333] pt-5">
        {[
          "Un lien de suivi dédié pour chaque produit éligible.",
          "Clics, ventes et conversion suivis en temps réel.",
          "Commissions validées puis payées par l'équipe, en toute transparence.",
        ].map((line) => (
          <li key={line} className="flex gap-2.5 text-[0.84rem] leading-relaxed text-[#a0a0a0]">
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              aria-hidden="true"
              className="mt-1 flex-shrink-0 text-[#4fb3a1]"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
            {line}
          </li>
        ))}
      </ul>

      <div className="mt-6 border-t border-dashed border-[#333] pt-6">
        <label htmlFor="note" className="mb-1.5 block text-[0.8rem] text-[#a0a0a0]">
          Un mot sur votre audience <span className="text-[#666]">(optionnel)</span>
        </label>
        <textarea
          id="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          rows={4}
          placeholder="Blog, chaîne, communauté… dites-nous où vous partagerez vos liens."
          className="input-arsenal min-h-[96px] resize-y"
        />
        <button type="submit" disabled={busy} className="btn-arsenal btn-primary mt-4 w-full">
          {busy && <span className="spin" />}
          Envoyer ma candidature
        </button>
        <p className="mt-3 text-[0.74rem] leading-relaxed text-[#666]">
          Votre candidature est examinée par l&apos;équipe. Vos liens sont activés dès sa validation.
        </p>
      </div>
    </form>
  );
}

/* ---------------- État 2 : en attente ---------------- */

function PendingCard({ affiliate }: { affiliate: Affiliate }) {
  return (
    <div className="mt-6 rounded-2xl border border-[#333] bg-[#141414] p-6 sm:p-8">
      <span className="inline-flex items-center gap-2 rounded-md border border-[rgba(244,162,97,0.4)] bg-[rgba(244,162,97,0.08)] px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-wide text-[#f4a261]">
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        En attente de validation
      </span>
      <h2 className="mt-4 font-display text-[1.05rem] font-bold">Candidature reçue</h2>
      <p className="mt-2 text-[0.86rem] leading-relaxed text-[#a0a0a0]">
        Votre dossier du {formatDate(affiliate.appliedAt)} est en cours d&apos;examen. Vous pourrez
        générer vos liens de suivi dès sa validation.
      </p>
      {affiliate.code && (
        <p className="mt-4 flex flex-wrap items-center gap-2 border-t border-dashed border-[#333] pt-4 text-[0.8rem] text-[#666]">
          Votre code affilié
          <span className="rounded-md border border-[#333] bg-[#1a1a1a] px-2 py-0.5 font-mono text-[0.8rem] text-[#f0f0f0]">
            {affiliate.code}
          </span>
        </p>
      )}
      <Link href="/compte" className="btn-arsenal btn-ghost mt-6 w-full">
        Retour à mon compte
      </Link>
    </div>
  );
}

/* ---------------- État 3 : actif ---------------- */

function ActiveView({
  affiliate,
  pseudo,
  balanceA,
}: {
  affiliate: Affiliate;
  pseudo: string;
  balanceA: number;
}) {
  return (
    <>
      {/* Identité */}
      <div className="mt-6 rounded-2xl border border-[#333] bg-[#141414] p-6 sm:p-8">
        <div className="flex items-center gap-4">
          <CoinA size={54} />
          <div className="min-w-0">
            <p className="truncate font-display text-[1.2rem] font-bold leading-tight">{pseudo}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="rounded-md border border-[rgba(42,157,143,0.45)] bg-[rgba(42,157,143,0.1)] px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wide text-[#7fd4cb]">
                {affiliate.isSuper ? "Super affilié" : "Affilié"}
              </span>
              <span className="text-[0.74rem] text-[#666]">
                Affilié depuis le {formatDate(affiliate.activatedAt)}
              </span>
            </div>
          </div>
        </div>

        {affiliate.code && (
          <p className="mt-4 flex flex-wrap items-center gap-2 border-t border-dashed border-[#333] pt-4 text-[0.8rem] text-[#666]">
            Code affilié
            <span className="rounded-md border border-[#333] bg-[#1a1a1a] px-2 py-0.5 font-mono text-[0.8rem] text-[#f0f0f0]">
              {affiliate.code}
            </span>
          </p>
        )}

        {/* Solde A */}
        <div className="mt-6 border-t border-dashed border-[#333] pt-6">
          <p className="text-[0.74rem] font-semibold uppercase tracking-wider text-[#666]">Solde</p>
          <div className="mt-2 flex items-center gap-3">
            <CoinA size={34} />
            <p className="whitespace-nowrap font-mono text-[2rem] font-bold leading-none tabular-nums text-[#f0f0f0]">
              {fmt(balanceA)}
              <span className="ml-2 text-[1.1rem] text-gold">A</span>
            </p>
          </div>
        </div>

        <Link href="/affilie/produits" className="btn-arsenal btn-primary mt-6 w-full">
          Mes produits &amp; mes liens
        </Link>
      </div>

      {/* Performances */}
      <div className="mt-4 rounded-2xl border border-[#333] bg-[#141414] p-6">
        <h2 className="font-display text-[1rem] font-bold">Performances</h2>
        <p className="mt-1 text-[0.78rem] text-[#666]">
          Chiffres cumulés depuis l&apos;activation de votre compte affilié.
        </p>
        <StatsGrid stats={affiliate.stats} />
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <Link href="/compte/portefeuille" className="btn-arsenal btn-ghost w-full">
          Voir le portefeuille A
        </Link>
      </div>
    </>
  );
}

function StatsGrid({ stats }: { stats: AffiliateStats }) {
  return (
    <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile label="Clics" value={fmt(stats.clicks)} />
      <StatTile label="Ventes" value={fmt(stats.sales)} />
      <StatTile label="Conversion" value={`${fmt(stats.conversion)} %`} />
      <StatTile label="A gagnés" value={fmt(stats.aEarned)} unit="A" unitClass="text-gold" />
      <StatTile
        label="Commissions totales"
        value={fmt(stats.commissionTotal)}
        unit={CURRENCY}
      />
      <StatTile label="En attente" value={fmt(stats.pending)} unit={CURRENCY} />
      <StatTile
        label="Payable"
        value={fmt(stats.payable)}
        unit={CURRENCY}
        tone="accent"
        hint="Montant prêt à être payé"
      />
      <StatTile label="Payé" value={fmt(stats.paid)} unit={CURRENCY} />
    </div>
  );
}

function StatTile({
  label,
  value,
  unit,
  unitClass = "text-[#666]",
  tone,
  hint,
}: {
  label: string;
  value: string;
  unit?: string;
  unitClass?: string;
  tone?: "accent";
  hint?: string;
}) {
  return (
    <div
      className={`flex flex-col gap-1 rounded-2xl border p-4 ${
        tone === "accent"
          ? "border-[rgba(42,157,143,0.35)] bg-[rgba(42,157,143,0.06)]"
          : "border-[#333] bg-[#141414]"
      }`}
    >
      <span className="font-mono text-[0.62rem] uppercase tracking-[0.1em] text-[#666]">
        {label}
      </span>
      <span className="whitespace-nowrap font-mono text-[1.35rem] font-bold leading-tight tabular-nums text-[#f0f0f0]">
        {value}
        {unit && <span className={`ml-1.5 text-[0.8rem] font-semibold ${unitClass}`}>{unit}</span>}
      </span>
      {hint && <span className="text-[0.68rem] text-[#666]">{hint}</span>}
    </div>
  );
}

/* ---------------- État 4 : suspendu ---------------- */

function SuspendedCard({ affiliate }: { affiliate: Affiliate }) {
  return (
    <div className="mt-6 rounded-2xl border border-[rgba(230,57,70,0.45)] bg-[#141414] p-6 sm:p-8">
      <span className="inline-flex items-center gap-2 rounded-md border border-[rgba(230,57,70,0.45)] bg-[rgba(230,57,70,0.1)] px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-wide text-[#fda4af]">
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        Compte suspendu
      </span>
      <h2 className="mt-4 font-display text-[1.05rem] font-bold">Affiliation suspendue</h2>
      <p className="mt-2 text-[0.86rem] leading-relaxed text-[#a0a0a0]">
        Votre compte affilié{affiliate.code ? ` (${affiliate.code})` : ""} est actuellement suspendu :
        vos liens ne comptabilisent plus de clics ni de ventes, et vos produits ne sont plus
        accessibles depuis cet espace.
      </p>
      <p className="mt-3 text-[0.86rem] leading-relaxed text-[#a0a0a0]">
        Vos commissions déjà acquises restent enregistrées. Contactez l&apos;équipe pour rétablir
        votre compte.
      </p>
      <div className="mt-6 flex flex-col gap-3 border-t border-dashed border-[#333] pt-6">
        <Link href="/compte" className="btn-arsenal btn-ghost w-full">
          Retour à mon compte
        </Link>
      </div>
    </div>
  );
}
