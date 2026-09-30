"use client";

/**
 * /affilie/produits — « Mes produits » (contrat Phase 2)
 *
 * GET /api/affiliate/me/products : produits éligibles (affiliate_enabled = 1) + performance
 * et lien de suivi (créé à la volée côté serveur, idempotent par couple affilié/produit).
 * Lien toujours en font-mono + bouton « Copier » (retour visuel « Copié ! » ~1,5 s).
 * POST …/:productId/link permet de (re)générer un lien — confirmation explicite,
 * l'ancien lien pouvant cesser de fonctionner.
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
  createAffiliateLink,
  fetchAffiliateMe,
  fetchAffiliateProducts,
  type Affiliate,
  type AffiliateProduct,
} from "@/lib/affiliate";
import { fmt } from "@/lib/format";
import { logout } from "@/lib/user-auth";

/** Devise affichée pour une commission fixe (défaut du schéma : FCFA) */
const CURRENCY = "FCFA";

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
  const [pageLoading, setPageLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<{ id: string; ok: boolean } | null>(null);
  const [notice, setNotice] = useState("");
  const [regenerating, setRegenerating] = useState<AffiliateProduct | null>(null);
  const [busyRegenerate, setBusyRegenerate] = useState(false);
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
        setProducts(me && me.status === "active" ? await fetchAffiliateProducts() : []);
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
              affiliate.status === "suspended"
                ? "Compte affilié suspendu"
                : "Candidature en attente de validation"
            }
            message={
              affiliate.status === "suspended"
                ? "Vos liens ne sont plus actifs. Vos produits réapparaîtront ici dès le rétablissement de votre compte."
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
            <p className="mt-5 font-mono text-[0.74rem] text-[#666]">
              {products.length} produit{products.length > 1 ? "s" : ""} éligible
              {products.length > 1 ? "s" : ""}
            </p>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {products.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  copied={copied}
                  onCopy={() => void copyLink(p)}
                  onRegenerate={() => setRegenerating(p)}
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
  copied,
  onCopy,
  onRegenerate,
}: {
  product: AffiliateProduct;
  copied: { id: string; ok: boolean } | null;
  onCopy: () => void;
  onRegenerate: () => void;
}) {
  const isCopied = copied?.id === product.id;

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
        <h3 className="font-display text-[1rem] font-bold leading-snug">{product.title}</h3>
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

        {/* Lien de suivi */}
        <div className="mt-auto pt-4">
          <p className="font-mono text-[0.6rem] uppercase tracking-[0.1em] text-[#666]">
            Lien de suivi
          </p>
          {product.link ? (
            <>
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
            <p className="mt-1.5 text-[0.78rem] text-[#f4a261]">
              Lien indisponible pour le moment — régénérez-le.
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
