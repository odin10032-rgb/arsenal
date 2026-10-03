"use client";

/**
 * /affilie/produits — « Mes produits » (contrat Phase 2 + plafonds vague 4)
 *
 * GET /api/affiliate/me/products : produits éligibles + performance + plafonds.
 * ⚠️ La CONSULTATION ne crée plus aucun lien : l'activation est un acte VOLONTAIRE
 * (bouton « Activer le lien »). Les plafonds (3 liens actifs / 20 ventes par lien
 * pour un affilié normal) sont affichés ; en cas de plafond atteint l'API répond
 * 409 et le front propose un CHOIX (désactiver un lien actif, ou abandonner).
 *
 * Garde : non connecté → /connexion ; connecté non affilié actif → accès refusé.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { useUser } from "@/hooks/use-user";
import { ApiError } from "@/lib/api";
import {
  activateAffiliateProductLink,
  asLinkLimitConflict,
  createAffiliateLink,
  deactivateAffiliateLink,
  fetchAffiliateMe,
  fetchAffiliateProducts,
  type Affiliate,
  type AffiliateLimits,
  type AffiliateLinkState,
  type AffiliateProduct,
  type LinkLimitConflict,
} from "@/lib/affiliate";
import { fmt } from "@/lib/format";
import { logout } from "@/lib/user-auth";

/** Devise affichée pour une commission fixe (défaut du schéma : FCFA) */
const CURRENCY = "FCFA";

/** Plafonds par défaut si l'API n'a pas encore ces champs (tolérant). */
const DEFAULT_LIMITS: AffiliateLimits = {
  maxActiveLinks: 3,
  maxSalesPerLink: 20,
  activeCount: 0,
  isSuper: false,
};

/** « 3/3 liens actifs » ou « illimité » pour un Super. */
function activeLinksLabel(limits: AffiliateLimits): string {
  if (limits.maxActiveLinks === 0) return `${fmt(limits.activeCount)} / illimité`;
  return `${fmt(limits.activeCount)}/${limits.maxActiveLinks}`;
}

/** « 30 % » ou « 5 000 FCFA » — valeur toujours fournie par l'API */
function commissionLabel(p: AffiliateProduct): string {
  if (p.commissionType === "fixed") return `${fmt(p.commissionValue)} ${CURRENCY}`;
  return `${fmt(p.commissionValue)} %`;
}

/** Copie presse-papiers : API moderne, puis repli textarea (contexte non sécurisé) */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* repli ci-dessous */
  }
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

export default function AffiliateProductsPage() {
  const { user, loading } = useUser();
  const router = useRouter();
  const [affiliate, setAffiliate] = useState<Affiliate | null>(null);
  const [products, setProducts] = useState<AffiliateProduct[]>([]);
  const [limits, setLimits] = useState<AffiliateLimits>(DEFAULT_LIMITS);
  const [pageLoading, setPageLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<{ id: string; ok: boolean } | null>(null);
  const [notice, setNotice] = useState("");
  const [regenerating, setRegenerating] = useState<AffiliateProduct | null>(null);
  const [busyRegenerate, setBusyRegenerate] = useState(false);
  /** Produit en cours d'activation (désactive le bouton pendant l'appel). */
  const [activatingId, setActivatingId] = useState<string | null>(null);
  /** Conflit de plafond : le front propose un CHOIX (désactiver lequel / abandonner). */
  const [conflict, setConflict] = useState<{ product: AffiliateProduct; info: LinkLimitConflict } | null>(null);
  const [busyDeactivate, setBusyDeactivate] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Garde : session absente → porte de connexion (une fois le boot terminé)
  useEffect(() => {
    if (!loading && !user) router.replace("/connexion");
  }, [loading, user, router]);

  const flash = useCallback((id: string, ok: boolean) => {
    setCopied({ id, ok });
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(null), 1500);
  }, []);

  const flashNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(""), 2500);
  }, []);

  const load = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      try {
        const me = await fetchAffiliateMe();
        setAffiliate(me);
        if (me && me.status === "active") {
          const data = await fetchAffiliateProducts();
          setProducts(data.products);
          setLimits(data.limits);
        } else {
          setProducts([]);
        }
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
        setRefreshing(false);
      }
    },
    [router],
  );

  // Chargement unique au boot
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current || loading || !user) return;
    startedRef.current = true;
    void load();
  }, [loading, user, load]);

  // Nettoyage des minuteurs d'affichage (retour visuel « Copié ! », notices)
  useEffect(
    () => () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    },
    [],
  );

  const copyLink = async (p: AffiliateProduct) => {
    flash(p.id, await copyText(p.link));
  };

  /** Applique un lien (état réel) au produit correspondant dans la liste. */
  const applyLinkState = useCallback((productId: string, link: AffiliateLinkState) => {
    setProducts((prev) =>
      prev.map((p) =>
        p.id === productId
          ? {
              ...p,
              link: link.link,
              linkCode: link.linkCode,
              linkId: link.id,
              linkStatus: link.status,
              salesCount: link.salesCount,
            }
          : p,
      ),
    );
  }, []);

  /**
   * Activation volontaire d'un produit. Sur 409 « plafond atteint », on ouvre le
   * panneau de choix au lieu d'afficher une impasse : le serveur reste décideur
   * (il renvoie la liste des liens actifs et la vraie décision est rejouée après
   * désactivation).
   */
  const activate = async (p: AffiliateProduct) => {
    if (activatingId) return;
    setActivatingId(p.id);
    setError("");
    try {
      const res = await activateAffiliateProductLink(p.id);
      applyLinkState(p.id, res.link);
      setLimits(res.limits);
      flashNotice("Lien activé.");
    } catch (err) {
      const conflictInfo = asLinkLimitConflict(err);
      if (conflictInfo) {
        setLimits(conflictInfo.limits);
        setConflict({ product: p, info: conflictInfo });
      } else {
        setError(err instanceof Error ? err.message : "Activation impossible.");
      }
    } finally {
      setActivatingId(null);
    }
  };

  /** Désactive un lien actif — libère un emplacement pour l'activation en attente. */
  const confirmDeactivate = async (link: AffiliateLinkState) => {
    if (busyDeactivate) return;
    setBusyDeactivate(true);
    setError("");
    try {
      const updated = await deactivateAffiliateLink(link.id);
      applyLinkState(updated.productId || link.productId, updated);
      const me = await fetchAffiliateMe();
      setAffiliate(me);
      // Le conflit est résolu : on relance l'activation du produit initialement demandé.
      const target = conflict?.product ?? null;
      setConflict(null);
      setLimits((prev) => ({ ...prev, activeCount: Math.max(0, prev.activeCount - 1) }));
      flashNotice("Lien désactivé.");
      if (target) await activate(target);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Désactivation impossible.");
    } finally {
      setBusyDeactivate(false);
    }
  };

  const confirmRegenerate = async () => {
    if (!regenerating || busyRegenerate) return;
    const target = regenerating;
    setBusyRegenerate(true);
    setError("");
    try {
      const link = await createAffiliateLink(target.id);
      if (!link.link) throw new Error("Lien non renvoyé par le serveur.");
      setProducts((prev) =>
        prev.map((p) =>
          p.id === target.id ? { ...p, link: link.link, linkCode: link.linkCode || p.linkCode } : p,
        ),
      );
      flashNotice("Nouveau lien généré.");
      setRegenerating(null);
    } catch (err) {
      setRegenerating(null);
      setError(err instanceof Error ? err.message : "Génération du lien impossible.");
    } finally {
      setBusyRegenerate(false);
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
      <div className="mx-auto w-full max-w-[720px]">
        <Link
          href="/affilie"
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
          Espace Affilié
        </Link>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-[1.35rem] font-bold">Mes produits</h1>
            <p className="mt-1 text-[0.84rem] text-[#a0a0a0]">
              Copiez un lien, partagez-le : chaque clic et chaque vente sont comptés ici.
            </p>
          </div>
          {affiliate?.status === "active" && (
            <button
              type="button"
              onClick={() => void load(true)}
              disabled={refreshing}
              className="btn-arsenal btn-ghost"
            >
              {refreshing && <span className="spin" />}
              Actualiser
            </button>
          )}
        </div>

        {error && (
          <p
            className="mt-5 rounded-lg border border-[rgba(230,57,70,0.4)] bg-[rgba(230,57,70,0.1)] px-3 py-2 text-[0.8rem] text-[#fda4af]"
            role="alert"
          >
            {error}
          </p>
        )}

        {notice && (
          <p
            className="mt-5 rounded-lg border border-[rgba(42,157,143,0.4)] bg-[rgba(42,157,143,0.1)] px-3 py-2 text-[0.8rem] text-[#7fd4cb]"
            role="status"
          >
            {notice}
          </p>
        )}

        {pageLoading ? (
          <p className="mt-8 font-mono text-[0.8rem] text-[#666]">Chargement de vos produits…</p>
        ) : !affiliate ? (
          <AccessCard
            title="Espace réservé aux affiliés"
            message="Vous n'êtes pas encore affilié. Présentez votre candidature pour obtenir vos liens de suivi."
            ctaLabel="Devenir affilié"
            ctaHref="/affilie"
          />
        ) : affiliate.status !== "active" ? (
          <AccessCard
            title={
              affiliate.accountStatus === "suspended"
                ? "Compte affilié suspendu"
                : affiliate.accountStatus === "rejected"
                  ? "Candidature refusée"
                  : affiliate.accountStatus === "withdrawn"
                    ? "Retiré du programme d'affiliation"
                    : "Candidature en attente de validation"
            }
            message={
              affiliate.accountStatus === "suspended"
                ? "Vos liens ne sont plus actifs. Vos produits réapparaîtront ici dès le rétablissement de votre compte."
                : affiliate.accountStatus === "rejected"
                  ? "Votre candidature n'a pas été retenue : aucun lien ne peut être activé. Vous conservez votre compte et votre solde A."
                  : affiliate.accountStatus === "withdrawn"
                    ? "Vous vous êtes retiré du programme : vos liens sont désactivés. Une nouvelle candidature reste possible depuis votre espace affilié."
                    : "Vos produits et vos liens seront disponibles dès la validation de votre candidature par l'équipe."
            }
            ctaLabel="Voir mon espace affilié"
            ctaHref="/affilie"
          />
        ) : products.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-[#333] bg-[#141414] p-6 text-center sm:p-8">
            <p className="font-display text-[1rem] font-bold">Aucun produit éligible</p>
            <p className="mx-auto mt-2 max-w-[42ch] text-[0.84rem] leading-relaxed text-[#a0a0a0]">
              Aucun produit n&apos;est ouvert à l&apos;affiliation pour le moment. Revenez bientôt :
              les nouveautés apparaissent ici automatiquement.
            </p>
          </div>
        ) : (
          <>
            {/* Plafonds (vague 4) : liens actifs + ventes par lien */}
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-[#333] bg-[#1a1a1a] px-2.5 py-1 font-mono text-[0.74rem] text-[#a0a0a0]">
                <span className="text-[#666]">Liens actifs</span>
                <span className="font-semibold tabular-nums text-[#f0f0f0]">
                  {activeLinksLabel(limits)}
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-[#333] bg-[#1a1a1a] px-2.5 py-1 font-mono text-[0.74rem] text-[#a0a0a0]">
                <span className="text-[#666]">Plafond par lien</span>
                <span className="font-semibold tabular-nums text-[#f0f0f0]">
                  {limits.maxSalesPerLink > 0 ? fmt(limits.maxSalesPerLink) : "illimité"} ventes
                </span>
              </span>
              {limits.isSuper && (
                <span className="rounded-md border border-[rgba(42,157,143,0.4)] bg-[rgba(42,157,143,0.08)] px-2.5 py-1 font-mono text-[0.74rem] font-semibold text-[#4fb3a1]">
                  Super affilié — sans plafond
                </span>
              )}
            </div>
            <p className="mt-2 font-mono text-[0.74rem] text-[#666]">
              {products.length} produit{products.length > 1 ? "s" : ""} éligible
              {products.length > 1 ? "s" : ""}
            </p>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {products.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  maxSalesPerLink={limits.maxSalesPerLink}
                  activating={activatingId === p.id}
                  copied={copied}
                  onCopy={() => void copyLink(p)}
                  onRegenerate={() => setRegenerating(p)}
                  onActivate={() => void activate(p)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {regenerating && (
        <ConfirmDialog
          title="Régénérer ce lien ?"
          message={`Un nouveau lien de suivi sera créé pour « ${regenerating.title} ». Le lien précédent peut cesser de fonctionner — pensez à mettre à jour vos partages.`}
          confirmLabel="Régénérer"
          busy={busyRegenerate}
          onCancel={() => setRegenerating(null)}
          onConfirm={() => void confirmRegenerate()}
        />
      )}

      {/* Panneau de CHOIX en cas de plafond atteint : désactiver un lien, ou abandonner */}
      {conflict && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-[480px] rounded-2xl border border-[#333] bg-[#141414] p-6">
            <h2 className="font-display text-[1.05rem] font-bold">Plafond de liens atteint</h2>
            <p className="mt-2 text-[0.84rem] leading-relaxed text-[#a0a0a0]">
              Vous avez déjà {fmt(conflict.info.limits.activeCount)} lien
              {conflict.info.limits.activeCount > 1 ? "s" : ""} actif
              {conflict.info.limits.activeCount > 1 ? "s" : ""} sur un maximum de{" "}
              {conflict.info.limits.maxActiveLinks === 0
                ? "illimité"
                : fmt(conflict.info.limits.maxActiveLinks)}
              . Pour activer « {conflict.product.title} », désactivez un lien : son emplacement se
              libérera. Les ventes déjà acquises sur le lien désactivé sont conservées.
            </p>
            <ul className="mt-4 flex flex-col gap-2">
              {conflict.info.activeLinks.length === 0 ? (
                <li className="text-[0.82rem] text-[#f4a261]">
                  Aucun lien actif renvoyé par le serveur — actualisez la page.
                </li>
              ) : (
                conflict.info.activeLinks.map((l) => (
                  <li
                    key={l.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-[#333] bg-[rgba(255,255,255,0.02)] px-3 py-2"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-[0.76rem] text-[#a0a0a0]">
                        {l.linkCode}
                      </span>
                      <span className="block font-mono text-[0.68rem] tabular-nums text-[#666]">
                        {fmt(l.salesCount)} /{" "}
                        {conflict.info.limits.maxSalesPerLink > 0
                          ? fmt(conflict.info.limits.maxSalesPerLink)
                          : "∞"}{" "}
                        ventes
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => void confirmDeactivate(l)}
                      disabled={busyDeactivate}
                      className="btn-arsenal btn-ghost flex-shrink-0"
                    >
                      {busyDeactivate && <span className="spin" />}
                      Désactiver
                    </button>
                  </li>
                ))
              )}
            </ul>
            <button
              type="button"
              onClick={() => setConflict(null)}
              disabled={busyDeactivate}
              className="btn-arsenal btn-ghost mt-4 w-full"
            >
              Abandonner
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Cartes ---------------- */

function AccessCard({
  title,
  message,
  ctaLabel,
  ctaHref,
}: {
  title: string;
  message: string;
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <div className="mt-6 rounded-2xl border border-[#333] bg-[#141414] p-6 sm:p-8">
      <h2 className="font-display text-[1.05rem] font-bold">{title}</h2>
      <p className="mt-2 text-[0.86rem] leading-relaxed text-[#a0a0a0]">{message}</p>
      <Link href={ctaHref} className="btn-arsenal btn-ghost mt-6 w-full">
        {ctaLabel}
      </Link>
    </div>
  );
}

function ProductCard({
  product,
  maxSalesPerLink,
  activating,
  copied,
  onCopy,
  onRegenerate,
  onActivate,
}: {
  product: AffiliateProduct;
  maxSalesPerLink: number;
  activating: boolean;
  copied: { id: string; ok: boolean } | null;
  onCopy: () => void;
  onRegenerate: () => void;
  onActivate: () => void;
}) {
  const isCopied = copied?.id === product.id;
  const status = product.linkStatus;
  const isActive = status === "active";
  const isSaturated = status === "saturated";
  const isInactive = status === "inactive";
  const neverActivated = product.linkId === null;

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-[#333] bg-[#141414] transition-colors duration-200 hover:border-[#444]">
      <div className="aspect-[16/9] w-full overflow-hidden border-b border-[#333] bg-[#1a1a1a]">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
            alt={`Visuel de ${product.title}`}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-[1rem] font-bold leading-snug">{product.title}</h3>
          {isSaturated ? (
            <span className="flex-shrink-0 rounded-md border border-[rgba(230,57,70,0.45)] bg-[rgba(230,57,70,0.1)] px-2 py-0.5 font-mono text-[0.66rem] font-semibold uppercase text-[#fda4af]">
              Saturé
            </span>
          ) : isActive ? (
            <span className="flex-shrink-0 rounded-md border border-[rgba(42,157,143,0.45)] bg-[rgba(42,157,143,0.1)] px-2 py-0.5 font-mono text-[0.66rem] font-semibold uppercase text-[#7fd4cb]">
              Actif
            </span>
          ) : isInactive ? (
            <span className="flex-shrink-0 rounded-md border border-[#333] bg-[#1a1a1a] px-2 py-0.5 font-mono text-[0.66rem] font-semibold uppercase text-[#a0a0a0]">
              Inactif
            </span>
          ) : null}
        </div>
        {product.price && (
          <p className="mt-1.5 font-mono text-[0.82rem] text-[#f0808a]">{product.price}</p>
        )}

        {/* Commission + récompense A */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-[rgba(42,157,143,0.4)] bg-[rgba(42,157,143,0.08)] px-2 py-0.5 font-mono text-[0.72rem] font-semibold text-[#4fb3a1]">
            Commission {commissionLabel(product)}
          </span>
          {product.rewardA > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md border border-[rgba(212,175,55,0.4)] bg-[rgba(212,175,55,0.08)] px-2 py-0.5 font-mono text-[0.72rem] font-semibold text-gold">
              +{fmt(product.rewardA)} A
            </span>
          )}
        </div>

        {/* Performance */}
        <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-dashed border-[#333] pt-4">
          {[
            { label: "Clics", value: fmt(product.clicks) },
            { label: "Ventes", value: fmt(product.sales) },
            { label: "Conversion", value: `${fmt(product.conversion)} %` },
          ].map((s) => (
            <div key={s.label}>
              <dt className="font-mono text-[0.6rem] uppercase tracking-[0.1em] text-[#666]">
                {s.label}
              </dt>
              <dd className="mt-0.5 font-mono text-[0.9rem] font-semibold tabular-nums text-[#f0f0f0]">
                {s.value}
              </dd>
            </div>
          ))}
        </dl>

        {/* Plafond de ventes du lien (si un lien existe) */}
        {product.linkId && maxSalesPerLink > 0 && (
          <p className="mt-3 font-mono text-[0.72rem] tabular-nums text-[#666]">
            <span className={isSaturated ? "text-[#fda4af]" : "text-[#a0a0a0]"}>
              {fmt(product.salesCount)} / {fmt(maxSalesPerLink)}
            </span>{" "}
            ventes sur ce lien
          </p>
        )}

        {/* Lien de suivi + actions */}
        <div className="mt-auto pt-4">
          {isActive ? (
            <>
              <p className="font-mono text-[0.6rem] uppercase tracking-[0.1em] text-[#666]">
                Lien de suivi
              </p>
              <p className="mt-1.5 break-all rounded-lg border border-[#333] bg-[#111] px-3 py-2 font-mono text-[0.74rem] text-[#a0a0a0]">
                {product.link}
              </p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={onCopy}
                  className="btn-arsenal btn-ghost flex-1"
                  style={
                    isCopied && copied?.ok
                      ? { color: "#4fb3a1", borderColor: "rgba(42,157,143,0.5)" }
                      : undefined
                  }
                  aria-live="polite"
                >
                  {isCopied ? (copied?.ok ? "Copié !" : "Copie impossible") : "Copier le lien"}
                </button>
                <button type="button" onClick={onRegenerate} className="btn-arsenal btn-ghost">
                  Régénérer
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="font-mono text-[0.6rem] uppercase tracking-[0.1em] text-[#666]">
                Lien de suivi
              </p>
              <p className="mt-1.5 text-[0.78rem] leading-relaxed text-[#a0a0a0]">
                {isSaturated
                  ? "Ce lien a atteint son plafond de ventes et a été désactivé automatiquement. Vos ventes acquises sont conservées : activez-le pour repartir, ou choisissez un autre produit."
                  : neverActivated
                    ? "Aucun lien actif pour ce produit. Activez-le pour obtenir votre lien de suivi et commencer à partager."
                    : "Ce lien est désactivé. Réactivez-le pour qu'il attribue de nouveau clics et ventes."}
              </p>
              <button
                type="button"
                onClick={onActivate}
                disabled={activating}
                className="btn-arsenal btn-primary mt-3 w-full"
              >
                {activating && <span className="spin" />}
                {isSaturated || isInactive ? "Réactiver le lien" : "Activer le lien"}
              </button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
