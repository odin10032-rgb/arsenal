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
import {
  applyToAffiliate,
  fetchAffiliateMe,
  fetchAffiliateMeData,
  fetchAffiliateProducts,
  fetchMyCampaigns,
  joinCampaign,
  requestProductAvailability,
  requestSuperUpgrade,
  withdrawFromAffiliate,
  type Affiliate,
  type AffiliateCampaign,
  type AffiliateLimits,
  type AffiliateStats,
  type SuperProgress,
} from "@/lib/affiliate";
import { getUnlock, markUnlockSeen, type UnlockStatus as UnlockStatusValue } from "@/lib/unlock";
import { UnlockAnimation } from "@/components/unlock-animation";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { CoinA } from "@/components/account/coin-a";
import { UserAvatar } from "@/components/account/user-avatar";
import { AffiliateNav } from "@/components/account/affiliate-nav";
import { AffiliateNotifications } from "@/components/account/affiliate-notifications";
import { useUser } from "@/hooks/use-user";
import { ApiError, apiFetch } from "@/lib/api";
import { fmt } from "@/lib/format";
import { logout } from "@/lib/user-auth";

/**
 * Plafonds par défaut du programme (alignés sur le schéma serveur) : affichés
 * même si GET …/me/products n'a pas encore répondu. Aucune valeur inventée —
 * ce sont les défauts documentés (3 liens actifs / 20 ventes par lien / 50 partages).
 */
const DEFAULT_LIMITS: AffiliateLimits = {
  maxActiveLinks: 3,
  maxSalesPerLink: 20,
  activeCount: 0,
  isSuper: false,
};

/** Partage récompensé : quota journalier par défaut (réglage `share_max_per_day`). */
const DEFAULT_SHARE_MAX_PER_DAY = 50;

/** Transaction A — forme minimale de GET /api/me/transactions (contrat Phase 1). */
interface TransactionA {
  id: string;
  delta: number;
  type: string;
  label: string;
  createdAt: number;
}

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
  // Phase 3 : animation de déblocage (contrôlée serveur) + progression Super + campagnes
  const [unlockStatus, setUnlockStatus] = useState<UnlockStatusValue | null>(null);
  const [superProgress, setSuperProgress] = useState<SuperProgress | null>(null);
  const [campaigns, setCampaigns] = useState<AffiliateCampaign[] | null>(null);

  // Garde : session absente → porte de connexion (une fois le boot terminé)
  useEffect(() => {
    if (!loading && !user) router.replace("/connexion");
  }, [loading, user, router]);

  const load = useCallback(async () => {
    try {
      const me = await fetchAffiliateMeData();
      setAffiliate(me?.affiliate ?? null);
      setSuperProgress(me?.super ?? null);
      // Phase 3 : animation — on interroge /api/me/unlock si un événement est en attente.
      setUnlockStatus(me?.unlockPending ?? null);
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

  // Phase 3 : campagnes actives (rechargées après une participation).
  const loadCampaigns = useCallback(async () => {
    try {
      setCampaigns(await fetchMyCampaigns());
    } catch {
      setCampaigns([]);
    }
  }, []);

  // Chargement unique au boot : profil revalidé + état d'affiliation
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current || loading || !user) return;
    startedRef.current = true;
    void refresh();
    void load();
    void loadCampaigns();
  }, [loading, user, refresh, load, loadCampaigns]);

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
        <p className="font-mono text-[0.85rem] text-tx3">Chargement de votre espace…</p>
      </div>
    );
  }

  if (!user) return null; // redirection en cours

  // Phase 3 : animation de déblocage — jouée AVANT le dashboard, une seule fois.
  const showUnlock = !affLoading && !!affiliate && !!unlockStatus;

  return (
    <div className="container-arsenal py-10 sm:py-14">
      {showUnlock && (
        <UnlockAnimation status={unlockStatus!} pseudo={user.pseudo} onDone={() => setUnlockStatus(null)} />
      )}
      <div className="mx-auto w-full max-w-[560px]">
        <Link
          href="/compte"
          className="inline-flex items-center gap-1.5 text-[0.78rem] text-tx3 transition-colors hover:text-tx1"
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
        <p className="mt-1 text-[0.84rem] text-tx2">
          Vos liens, vos performances et vos commissions.
        </p>

        {/* Navigation de l'espace (onglet « Vue d'ensemble » actif) */}
        <AffiliateNav active="overview" />

        {/* Notifications du cycle de vie (produits retirés, campagnes…) — uniquement
            pour un affilié existant : un visiteur sans profil n'a rien à lire. */}
        {affiliate && <AffiliateNotifications />}

        {error && (
          <p
            className="mt-5 rounded-lg border border-[rgba(230,57,70,0.4)] bg-[rgba(230,57,70,0.1)] px-3 py-2 text-[0.8rem] text-dangertx"
            role="alert"
          >
            {error}
          </p>
        )}

        {affLoading ? (
          <p className="mt-8 font-mono text-[0.8rem] text-tx3">
            Chargement de votre espace affilié…
          </p>
        ) : !affiliate ? (
          <ApplicationCard note={note} setNote={setNote} busy={busy} onSubmit={submit} />
        ) : affiliate.status === "active" ? (
          <ActiveView
            affiliate={affiliate}
            pseudo={user.pseudo}
            userId={user.id}
            balanceA={user.balanceA}
            superProgress={superProgress}
            campaigns={campaigns}
                        onCampaignJoined={() => void loadCampaigns()}
            onWithdrawn={() => void load()}
          />
        ) : affiliate.status === "suspended" ? (
          <SuspendedCard affiliate={affiliate} />
        ) : affiliate.accountStatus === "rejected" ? (
          <RejectedCard affiliate={affiliate} />
        ) : affiliate.accountStatus === "withdrawn" ? (
          <WithdrawnCard affiliate={affiliate} />
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
    <form onSubmit={onSubmit} className="mt-6 rounded-2xl border border-line bg-s1 p-6 sm:p-8">
      <h2 className="font-display text-[1.05rem] font-bold">Devenir affilié</h2>
      <p className="mt-2 text-[0.86rem] leading-relaxed text-tx2">
        Partagez les outils du catalogue avec votre audience : chaque vente réalisée avec votre lien
        vous rapporte une commission, plus une récompense en A lorsqu&apos;elle est prévue.
      </p>

      <ul className="mt-5 flex flex-col gap-2.5 border-t border-dashed border-line pt-5">
        {[
          "Un lien de suivi dédié pour chaque produit éligible.",
          "Clics, ventes et conversion suivis en temps réel.",
          "Commissions validées puis payées par l'équipe, en toute transparence.",
        ].map((line) => (
          <li key={line} className="flex gap-2.5 text-[0.84rem] leading-relaxed text-tx2">
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              aria-hidden="true"
              className="mt-1 flex-shrink-0 text-teal"
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

      <div className="mt-6 border-t border-dashed border-line pt-6">
        <label htmlFor="note" className="mb-1.5 block text-[0.8rem] text-tx2">
          Un mot sur votre audience <span className="text-tx3">(optionnel)</span>
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
        <p className="mt-3 text-[0.74rem] leading-relaxed text-tx3">
          Votre candidature est examinée par l&apos;équipe. Vos liens sont activés dès sa validation.
          Le programme encadre un compte standard à <b className="text-tx2">3 liens actifs</b> et{" "}
          <b className="text-tx2">20 ventes par lien</b> (un lien saturé est désactivé
          automatiquement et libère sa place).{" "}
          <Link href="/affiliation" className="text-teal hover:underline">
            En savoir plus
          </Link>
        </p>
      </div>
    </form>
  );
}

/* ---------------- État 2 : en attente ---------------- */

function PendingCard({ affiliate }: { affiliate: Affiliate }) {
  return (
    <div className="mt-6 rounded-2xl border border-line bg-s1 p-6 sm:p-8">
      <span className="inline-flex items-center gap-2 rounded-md border border-[rgba(244,162,97,0.4)] bg-[rgba(244,162,97,0.08)] px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-wide text-warn">
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        En attente de validation
      </span>
      <h2 className="mt-4 font-display text-[1.05rem] font-bold">Candidature reçue</h2>
      <p className="mt-2 text-[0.86rem] leading-relaxed text-tx2">
        Votre dossier du {formatDate(affiliate.appliedAt)} est en cours d&apos;examen. Vous pourrez
        générer vos liens de suivi dès sa validation.
      </p>
      {affiliate.code && (
        <p className="mt-4 flex flex-wrap items-center gap-2 border-t border-dashed border-line pt-4 text-[0.8rem] text-tx3">
          Votre code affilié
          <span className="rounded-md border border-line bg-s2 px-2 py-0.5 font-mono text-[0.8rem] text-tx1">
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
  userId,
  balanceA,
  superProgress,
  campaigns,
  onCampaignJoined,
  onWithdrawn,
}: {
  affiliate: Affiliate;
  pseudo: string;
  userId: string;
  balanceA: number;
  superProgress: SuperProgress | null;
  campaigns: AffiliateCampaign[] | null;
  onCampaignJoined: () => void;
  onWithdrawn: () => void;
}) {
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [busyWithdraw, setBusyWithdraw] = useState(false);
  const [withdrawError, setWithdrawError] = useState("");

  const withdraw = async () => {
    if (busyWithdraw) return;
    setBusyWithdraw(true);
    setWithdrawError("");
    try {
      await withdrawFromAffiliate();
      setConfirmWithdraw(false);
      onWithdrawn();
    } catch (err) {
      setWithdrawError(err instanceof Error ? err.message : "Retrait impossible.");
      setConfirmWithdraw(false);
    } finally {
      setBusyWithdraw(false);
    }
  };

  return (
    <>
      {/* ── 1. Identité + statut ─────────────────────────────────────────── */}
      <div className="mt-6 rounded-2xl border border-line bg-s1 p-6 sm:p-8">
        <div className="flex items-center gap-4">
          <UserAvatar pseudo={pseudo} seed={userId} size={54} />
          <div className="min-w-0">
            <p className="truncate font-display text-[1.2rem] font-bold leading-tight">{pseudo}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="rounded-md border border-[rgba(42,157,143,0.45)] bg-[rgba(42,157,143,0.1)] px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wide text-teal2">
                {affiliate.isSuper ? "Super affilié" : "Affilié"}
              </span>
              <span className="text-[0.74rem] text-tx3">
                Affilié depuis le {formatDate(affiliate.activatedAt)}
              </span>
            </div>
          </div>
        </div>

        {affiliate.code && (
          <p className="mt-4 flex flex-wrap items-center gap-2 border-t border-dashed border-line pt-4 text-[0.8rem] text-tx3">
            Code affilié
            <span className="rounded-md border border-line bg-s2 px-2 py-0.5 font-mono text-[0.8rem] text-tx1">
              {affiliate.code}
            </span>
          </p>
        )}

        <Link href="/affilie/produits" className="btn-arsenal btn-primary mt-6 w-full">
          Mes produits &amp; mes liens
        </Link>
      </div>

      {/* ── 2. Chiffres clés ─────────────────────────────────────────────── */}
      <Section
        title="Chiffres clés"
        hint="Chiffres cumulés depuis l'activation de votre compte affilié."
      >
        <StatsGrid stats={affiliate.stats} />
      </Section>

      {/* ── 3. Portefeuille A ────────────────────────────────────────────── */}
      <WalletSection balanceA={balanceA} />

      {/* ── 4. Règles et limites du programme ────────────────────────────── */}
      <RulesSection isSuper={affiliate.isSuper} />

      {/* ── 6. Campagnes ─────────────────────────────────────────────────── */}
      <CampaignsSection campaigns={campaigns} onJoined={onCampaignJoined} />

      {/* Super Affiliate : progression (non Super) ou demande de produit (Super) */}
      {!affiliate.isSuper && (
        <SuperAffiliateCard progress={superProgress} pseudo={pseudo} />
      )}

      {/* ── 7. Demande de disponibilité produit (Super) ──────────────────── */}
      {affiliate.isSuper && <ProductAvailabilityRequest />}

      {/*
        Sortie du programme — action RARE : un simple lien texte, pas un bloc qui
        occupe l'écran. La confirmation (obligatoire) porte le détail des
        conséquences, donc rien n'est caché à l'affilié qui la déclenche.
      */}
      <div className="mt-6 flex justify-center">
        <button
          type="button"
          onClick={() => setConfirmWithdraw(true)}
          className="text-[0.74rem] text-tx3 underline-offset-2 transition-colors hover:text-dangertx hover:underline"
        >
          Quitter le programme
        </button>
      </div>
      {withdrawError && (
        <p className="mt-2 text-center text-[0.78rem] text-brand">{withdrawError}</p>
      )}

      {confirmWithdraw && (
        <ConfirmDialog
          title="Quitter le programme d'affiliation ?"
          message="Vos liens seront désactivés et vous ne serez plus affilié. Vos commissions déjà acquises et votre solde A sont conservés. Cette action peut être rejouée par une nouvelle candidature."
          confirmLabel="Me retirer"
          busy={busyWithdraw}
          onCancel={() => setConfirmWithdraw(false)}
          onConfirm={() => void withdraw()}
        />
      )}
    </>
  );
}

/* -------- Vague 4 : demande de disponibilité produit (Super uniquement) -------- */

function ProductAvailabilityRequest() {
  const [productId, setProductId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const id = productId.trim();
    if (!id) {
      setError("Indiquez l'identifiant du produit souhaité.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { created } = await requestProductAvailability(id, note);
      setMessage(
        created
          ? "Demande envoyée — l'équipe Arsenal l'examinera."
          : "Une demande est déjà en attente pour ce produit.",
      );
      setProductId("");
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demande impossible.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-4 rounded-2xl border border-line bg-s1 p-6">
      <h2 className="font-display text-[1rem] font-bold">Demander un produit</h2>
      <p className="mt-1 text-[0.78rem] leading-relaxed text-tx3">
        En tant que Super affilié, proposez un produit du catalogue à rendre éligible à
        l&apos;affiliation : l&apos;équipe validera son ouverture.
      </p>
      <label htmlFor="req-product" className="mt-4 mb-1.5 block text-[0.78rem] text-tx2">
        Identifiant du produit
      </label>
      <input
        id="req-product"
        value={productId}
        onChange={(e) => setProductId(e.target.value)}
        maxLength={120}
        placeholder="ex. arsenal-pro-annual"
        className="input-arsenal"
      />
      <label htmlFor="req-note" className="mt-3 mb-1.5 block text-[0.78rem] text-tx2">
        Motif <span className="text-tx3">(optionnel)</span>
      </label>
      <textarea
        id="req-note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={500}
        rows={3}
        placeholder="Pourquoi ce produit mérite-t-il d'être ouvert à l'affiliation ?"
        className="input-arsenal min-h-[80px] resize-y"
      />
      {error && <p className="mt-3 text-[0.8rem] text-brand">{error}</p>}
      {message && <p className="mt-3 text-[0.8rem] text-teal">{message}</p>}
      <button type="submit" disabled={busy} className="btn-arsenal btn-primary mt-4 w-full">
        {busy && <span className="spin" />}
        Envoyer la demande
      </button>
    </form>
  );
}

/* ---------------- Phase 3 : Super Affiliate ---------------- */

function SuperAffiliateCard({
  progress,
  pseudo,
}: {
  progress: SuperProgress | null;
  pseudo: string;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState("");

  // Progression par défaut si l'API n'a pas encore ces champs (tolérant).
  const criteria = progress?.criteria ?? { minSales: 10, minClicks: 100 };
  const progressData = progress?.progress ?? { sales: 0, clicks: 0 };
  const eligible = progress?.eligible ?? false;
  const requested = progress?.requested || done;

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await requestSuperUpgrade();
      setDone(true);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Demande impossible.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 rounded-2xl border border-line bg-s1 p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-[1rem] font-bold">Super Affiliate</h2>
        <span className="rounded-md border border-line bg-s2 px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wide text-tx2">
          {eligible ? "Éligible" : "En progression"}
        </span>
      </div>
      <p className="mt-1 text-[0.78rem] text-tx3">
        Atteignez les critères, puis demandez votre promotion — elle est validée par
        l&apos;équipe Arsenal.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {[
          { label: "Ventes", current: progressData.sales, goal: criteria.minSales },
          { label: "Clics", current: progressData.clicks, goal: criteria.minClicks },
        ].map((row) => (
          <div key={row.label} className="rounded-xl border border-line bg-panel p-3">
            <p className="text-[0.68rem] uppercase tracking-wider text-tx3">{row.label}</p>
            <p className="mt-1 font-mono text-[1.05rem] font-bold tabular-nums text-tx1">
              {fmt(row.current)}
              <span className="text-[0.75rem] font-normal text-tx3"> / {fmt(row.goal)}</span>
            </p>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-s3">
              <div
                className="h-full rounded-full bg-ok"
                style={{ width: Math.min(100, Math.round((row.current / Math.max(1, row.goal)) * 100)) + "%" }}
              />
            </div>
          </div>
        ))}
      </div>

      {message && <p className="mt-3 text-[0.8rem] text-brand">{message}</p>}
      {requested ? (
        <p className="mt-4 rounded-lg border border-[rgba(244,162,97,0.4)] bg-[rgba(244,162,97,0.08)] px-3 py-2 text-[0.8rem] text-warn">
          Demande envoyée — en attente de validation par l&apos;équipe Arsenal.
        </p>
      ) : (
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !eligible}
          className="btn-arsenal btn-primary mt-4 w-full"
        >
          {busy && <span className="spin" />}
          Demander le statut Super Affiliate
        </button>
      )}
      <p className="mt-2 text-center text-[0.7rem] text-tx3">
        Les privilèges Super Affiliate seront débloqués après validation.
      </p>
    </div>
  );
}

/* ---------------- Phase 3 : campagnes ---------------- */

function CampaignsSection({
  campaigns,
  onJoined,
}: {
  campaigns: AffiliateCampaign[] | null;
  onJoined: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set());

  const join = async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    try {
      await joinCampaign(id);
      setJoinedIds((prev) => new Set(prev).add(id));
      onJoined();
    } catch {
      /* erreur silencieuse pour l'UI affilié */
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mt-4 rounded-2xl border border-line bg-s1 p-6">
      <h2 className="font-display text-[1rem] font-bold">Campagnes</h2>
      <p className="mt-1 text-[0.78rem] text-tx3">
        Des commissions et récompenses renforcées sur des produits sélectionnés.
      </p>

      {campaigns === null ? (
        <p className="mt-4 font-mono text-[0.8rem] text-tx3">Chargement…</p>
      ) : campaigns.length === 0 ? (
        <p className="mt-4 text-[0.84rem] text-tx3">
          Aucune campagne active pour le moment.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {campaigns.map((c) => {
            const isJoined = c.joined || joinedIds.has(c.id);
            const goal = c.goalSales ?? 0;
            const pctDone = goal > 0 ? Math.min(100, Math.round((c.mySales / goal) * 100)) : 0;
            return (
              <li key={c.id} className="rounded-xl border border-line bg-panel p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[0.9rem] font-semibold text-tx1">{c.name}</p>
                    <p className="mt-0.5 truncate text-[0.74rem] text-tx3">
                      {c.productName ?? "Produit Arsenal"}
                      {c.endsAt ? " · jusqu'au " + new Date(c.endsAt).toLocaleDateString("fr-FR") : ""}
                    </p>
                  </div>
                  {isJoined && (
                    <span className="flex-shrink-0 rounded-md border border-[rgba(42,157,143,0.45)] bg-[rgba(42,157,143,0.1)] px-2 py-0.5 text-[0.66rem] font-semibold uppercase text-teal2">
                      Participant
                    </span>
                  )}
                </div>
                <p className="mt-2 text-[0.78rem] text-tx2">
                  Commission{" "}
                  {c.commissionType === "percent"
                    ? (c.commissionValue ?? 0) + " %"
                    : fmt(c.commissionValue ?? 0) + " FCFA"}
                  {c.rewardA > 0 && (
                    <>
                      {" "}
                      · <span className="text-gold">+{fmt(c.rewardA)} A</span>
                    </>
                  )}
                </p>
                {goal > 0 && (
                  <div className="mt-2">
                    <div className="h-1 overflow-hidden rounded-full bg-s3">
                      <div className="h-full rounded-full bg-ok" style={{ width: pctDone + "%" }} />
                    </div>
                    <p className="mt-1 font-mono text-[0.7rem] tabular-nums text-tx3">
                      {fmt(c.mySales)} / {fmt(goal)} ventes
                    </p>
                  </div>
                )}
                {!c.joined && !joinedIds.has(c.id) && (
                  <button
                    type="button"
                    onClick={() => void join(c.id)}
                    disabled={busyId === c.id || c.expired}
                    className="btn-arsenal btn-ghost mt-3 w-full"
                  >
                    {busyId === c.id && <span className="spin" />}
                    {c.expired ? "Campagne terminée" : "Participer"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
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
  unitClass = "text-tx3",
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
          : "border-line bg-s1"
      }`}
    >
      <span className="font-mono text-[0.62rem] uppercase tracking-[0.1em] text-tx3">
        {label}
      </span>
      <span className="whitespace-nowrap font-mono text-[1.35rem] font-bold leading-tight tabular-nums text-tx1">
        {value}
        {unit && <span className={`ml-1.5 text-[0.8rem] font-semibold ${unitClass}`}>{unit}</span>}
      </span>
      {hint && <span className="text-[0.68rem] text-tx3">{hint}</span>}
    </div>
  );
}

/* ---------------- Vue d'ensemble : sections ajoutées (vague 6) ---------------- */

/**
 * Carte de section titrée — même enveloppe que le reste de l'espace (bordure
 * #333, fond #141414, coins arrondis). Réutilisée pour homogénéiser la page.
 */
function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-4 rounded-2xl border border-line bg-s1 p-6">
      <h2 className="font-display text-[1rem] font-bold">{title}</h2>
      {hint && <p className="mt-1 text-[0.78rem] text-tx3">{hint}</p>}
      {children}
    </section>
  );
}

function txTypeLabel(type: string): string {
  switch (type) {
    case "reward":
      return "Récompense";
    case "spend":
      return "Dépense";
    case "adjustment":
      return "Ajustement";
    default:
      return type;
  }
}

function txDate(ts: number): string {
  return new Date(ts).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Section « Portefeuille A » : solde, accès au portefeuille complet et résumé
 * des dernières transactions (GET /api/me/transactions?limit=5).
 *
 * ⚠️ DISTINCTION DES MONNAIES : le solde et l'historique affichés ici sont en A,
 * la monnaie interne. Les commissions d'affiliation (FCFA, bloc « Chiffres clés »)
 * sont une AUTRE monnaie : elles ne se cumulent jamais et ne se convertissent pas
 * (décision propriétaire). On n'affiche donc AUCUN total unique qui mélangerait les deux.
 *
 * Chargement best-effort non bloquant : en cas d'échec (réseau, non-membre), le
 * solde reste affiché et la liste retombe sur un message neutre.
 */
function WalletSection({ balanceA }: { balanceA: number }) {
  const [txs, setTxs] = useState<TransactionA[] | null>(null);

  useEffect(() => {
    let alive = true;
    void apiFetch<{ ok: boolean; transactions?: TransactionA[] }>(
      "/api/me/transactions?limit=5&offset=0",
      { bearer: true, timeoutMs: 4000 },
    )
      .then((res) => {
        if (alive) setTxs(res.transactions || []);
      })
      .catch(() => {
        if (alive) setTxs([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Section
      title="Portefeuille A"
      hint="Votre monnaie interne — indépendante des commissions FCFA ci-dessus."
    >
      <div className="mt-3 flex items-center gap-3">
        <CoinA size={30} />
        <p className="whitespace-nowrap font-mono text-[1.7rem] font-bold leading-none tabular-nums text-tx1">
          {fmt(balanceA)}
          <span className="ml-2 text-[1rem] text-gold">A</span>
        </p>
      </div>

      <div className="mt-5 border-t border-dashed border-line pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[0.74rem] font-semibold uppercase tracking-wider text-tx3">
            Dernières opérations
          </p>
          <Link href="/compte/portefeuille" className="text-[0.78rem] text-teal hover:underline">
            Tout voir
          </Link>
        </div>

        {txs === null ? (
          <p className="mt-3 font-mono text-[0.78rem] text-tx3">Chargement…</p>
        ) : txs.length === 0 ? (
          <p className="mt-3 text-[0.82rem] text-tx3">Aucune opération pour le moment.</p>
        ) : (
          <ul className="mt-1">
            {txs.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-[0.84rem] text-tx1">{t.label}</p>
                  <p className="mt-0.5 text-[0.7rem] text-tx3">
                    {txTypeLabel(t.type)} · {txDate(t.createdAt)}
                  </p>
                </div>
                <span
                  className={`flex-shrink-0 font-mono text-[0.82rem] font-semibold tabular-nums ${
                    t.delta >= 0 ? "text-ok" : "text-brand"
                  }`}
                >
                  {t.delta > 0 ? "+" : ""}
                  {fmt(t.delta)} A
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Link href="/compte/portefeuille" className="btn-arsenal btn-ghost mt-5 w-full">
        Ouvrir le portefeuille
      </Link>
    </Section>
  );
}

/**
 * Section « Règles et limites du programme » — pédagogie : les plafonds RÉELS
 * sont affichés AVANT que l'affilié ne se les fasse opposer (exigence du cahier
 * des charges : « éviter que l'utilisateur découvre une restriction uniquement
 * après avoir tenté une action »).
 *
 * Les plafonds proviennent de GET /api/affiliate/me/products (`limits`) ; en cas
 * d'échec, on retombe sur les défauts documentés du schéma (3 / 20). Le quota de
 * partage (50/jour) est un réglage serveur sans exposition dédiée dans l'API
 * affilié : on affiche le défaut documenté.
 */
function RulesSection({ isSuper }: { isSuper: boolean }) {
  const [limits, setLimits] = useState<AffiliateLimits>(DEFAULT_LIMITS);

  useEffect(() => {
    let alive = true;
    void fetchAffiliateProducts()
      .then((data) => {
        if (alive) setLimits(data.limits);
      })
      .catch(() => {
        /* défauts conservés */
      });
    return () => {
      alive = false;
    };
  }, []);

  const maxLinks = limits.maxActiveLinks > 0 ? fmt(limits.maxActiveLinks) : "illimité";
  const maxSales = limits.maxSalesPerLink > 0 ? fmt(limits.maxSalesPerLink) : "illimité";

  const rows: { label: string; value: string }[] = [
    {
      label: "Liens actifs simultanés",
      value: isSuper ? "illimité (Super affilié)" : `${maxLinks} liens`,
    },
    {
      label: "Ventes par lien",
      value: `${maxSales} ventes`,
    },
    { label: "Saturation automatique", value: `au plafond, le lien se désactive et libère sa place` },
    { label: "Partages récompensés", value: `${fmt(DEFAULT_SHARE_MAX_PER_DAY)} par jour` },
    {
      label: "Statut Super affilié",
      value: isSuper ? "actif sur votre compte" : "progressif — voir « Super Affiliate » ci-dessous",
    },
  ];

  return (
    <Section
      title="Règles et limites du programme"
      hint="Ce que le programme autorise — pour ne jamais découvrir une limite au moment où elle refuse une action."
    >
      <dl className="mt-4 flex flex-col gap-2.5 border-t border-dashed border-line pt-4">
        {rows.map((r) => (
          <div key={r.label} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <dt className="text-[0.82rem] text-tx2">{r.label}</dt>
            <dd className="font-mono text-[0.8rem] tabular-nums text-tx1">{r.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-[0.74rem] leading-relaxed text-tx3">
        Les gains en <span className="text-gold">A</span> et les commissions en{" "}
        <b className="text-tx2">FCFA</b> sont deux monnaies distinctes : elles ne se
        cumulent jamais et ne se convertissent pas.
      </p>
    </Section>
  );
}

/* ---------------- État 4 : suspendu ---------------- */

function SuspendedCard({ affiliate }: { affiliate: Affiliate }) {
  return (
    <div className="mt-6 rounded-2xl border border-[rgba(230,57,70,0.45)] bg-s1 p-6 sm:p-8">
      <span className="inline-flex items-center gap-2 rounded-md border border-[rgba(230,57,70,0.45)] bg-[rgba(230,57,70,0.1)] px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-wide text-dangertx">
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        Compte suspendu
      </span>
      <h2 className="mt-4 font-display text-[1.05rem] font-bold">Affiliation suspendue</h2>
      <p className="mt-2 text-[0.86rem] leading-relaxed text-tx2">
        Votre compte affilié{affiliate.code ? ` (${affiliate.code})` : ""} est actuellement suspendu :
        vos liens ne comptabilisent plus de clics ni de ventes, et vos produits ne sont plus
        accessibles depuis cet espace.
      </p>
      <p className="mt-3 text-[0.86rem] leading-relaxed text-tx2">
        Vos commissions déjà acquises restent enregistrées. Contactez l&apos;équipe pour rétablir
        votre compte.
      </p>
      <div className="mt-6 flex flex-col gap-3 border-t border-dashed border-line pt-6">
        <Link href="/compte" className="btn-arsenal btn-ghost w-full">
          Retour à mon compte
        </Link>
      </div>
    </div>
  );
}

/* ---------------- État 5 : candidature refusée ---------------- */

function RejectedCard({ affiliate }: { affiliate: Affiliate }) {
  return (
    <div className="mt-6 rounded-2xl border border-[rgba(230,57,70,0.45)] bg-s1 p-6 sm:p-8">
      <span className="inline-flex items-center gap-2 rounded-md border border-[rgba(230,57,70,0.45)] bg-[rgba(230,57,70,0.1)] px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-wide text-dangertx">
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        Candidature refusée
      </span>
      <h2 className="mt-4 font-display text-[1.05rem] font-bold">Candidature non retenue</h2>
      <p className="mt-2 text-[0.86rem] leading-relaxed text-tx2">
        Votre candidature du {formatDate(affiliate.appliedAt)} n&apos;a pas été retenue. Vous
        conservez votre compte utilisateur et votre solde A ; seul l&apos;accès au programme
        d&apos;affiliation est fermé.
      </p>
      <div className="mt-6 flex flex-col gap-3 border-t border-dashed border-line pt-6">
        <Link href="/compte" className="btn-arsenal btn-ghost w-full">
          Retour à mon compte
        </Link>
      </div>
    </div>
  );
}

/* ---------------- État 6 : retrait volontaire ---------------- */

function WithdrawnCard({ affiliate }: { affiliate: Affiliate }) {
  return (
    <div className="mt-6 rounded-2xl border border-line bg-s1 p-6 sm:p-8">
      <span className="inline-flex items-center gap-2 rounded-md border border-line bg-s2 px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-wide text-tx2">
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        Retiré du programme
      </span>
      <h2 className="mt-4 font-display text-[1.05rem] font-bold">Vous avez quitté l&apos;affiliation</h2>
      <p className="mt-2 text-[0.86rem] leading-relaxed text-tx2">
        Vous vous êtes retiré du programme d&apos;affiliation
        {affiliate.code ? ` (code ${affiliate.code})` : ""}. Vos liens sont désactivés. Vos
        commissions déjà acquises, votre solde A et votre adhésion sont conservés.
      </p>
      <p className="mt-3 text-[0.86rem] leading-relaxed text-tx2">
        Vous souhaitez revenir ? Une nouvelle candidature est possible depuis cette page.
      </p>
      <div className="mt-6 flex flex-col gap-3 border-t border-dashed border-line pt-6">
        <Link href="/compte" className="btn-arsenal btn-ghost w-full">
          Retour à mon compte
        </Link>
      </div>
    </div>
  );
}
