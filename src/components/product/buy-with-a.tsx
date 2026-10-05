"use client";

/**
 * Bloc d'achat en A — page produit (contrat figé : docs/chantier/07-contrat-paiement-a.md)
 *
 * • 401 / session absente → « Se connecter pour acheter » (porte /connexion)
 * • 402 → message explicite « Il vous manque N A » (payload du serveur) + lien portefeuille
 * • 409 → « Vous possédez déjà ce produit » + lien Mes produits
 * • succès → « Produit obtenu » + accès (même panneau que la page Mes produits)
 *
 * Aucun montant n'est calculé ici : le prix vient du produit et le solde de GET /api/me,
 * tous deux renvoyés par l'API. Le solde restant affiché dans la confirmation est une
 * simple estimation d'affichage ; le solde définitif est relu par useUser().refresh()
 * après l'achat (le serveur reste seul maître du débit).
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CoinA } from "@/components/account/coin-a";
import { SignupInvite } from "@/components/account/signup-invite";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { AddToCart } from "@/components/product/add-to-cart";
import { useUser } from "@/hooks/use-user";
import { ApiError } from "@/lib/api";
import { fmt } from "@/lib/format";
import type { Product } from "@/lib/products";
import {
  CHARIOW_PORTAL_URL,
  buyProduct,
  fetchMyPurchases,
  insufficientBalanceInfo,
  isActivePurchase,
  isDeliveryPending,
  readAffiliateRef,
  resolveAccess,
  type Purchase,
} from "@/lib/purchases";
import { logout, isMember } from "@/lib/user-auth";

/* ---------------- Panneau d'accès (partagé avec « Mes produits ») ---------------- */

/**
 * Affiche l'accès d'un achat d'après ce que renvoie le serveur :
 * portail Chariow (app.ateliat.com, clé par l'email) ou instructions/lien de la méthode manuelle.
 */
export function PurchaseAccessPanel({
  purchase,
  sessionEmail = "",
}: {
  purchase: Purchase;
  sessionEmail?: string;
}) {
  const access = resolveAccess(purchase, sessionEmail);

  if (access?.mode === "chariow_portal") {
    return (
      <div className="flex flex-col gap-2">
        <a
          href={CHARIOW_PORTAL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-arsenal btn-primary w-full"
        >
          Accéder
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path
              d="M14 3h7v7M21 3 11 13M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </a>
        <p className="text-[0.76rem] leading-relaxed text-tx2">
          Votre accès est associé à l&apos;adresse{" "}
          <b className="break-all font-mono text-[0.74rem] text-tx1">
            {access.email || sessionEmail || "de votre compte"}
          </b>
          . Ouvrez le portail d&apos;accès et identifiez-vous avec cet email.
        </p>
      </div>
    );
  }

  if (access?.mode === "manual") {
    return (
      <div className="flex flex-col gap-2">
        {access.instructions ? (
          <p className="whitespace-pre-line rounded-[10px] border border-line bg-panel p-3 text-[0.82rem] leading-relaxed text-tx1">
            {access.instructions}
          </p>
        ) : (
          <p className="text-[0.82rem] leading-relaxed text-tx2">
            Votre accès vous est transmis par l&apos;équipe Arsenal (livraison manuelle de cette
            commande).
          </p>
        )}
      </div>
    );
  }

  return (
    <p className="text-[0.8rem] leading-relaxed text-tx2">
      Les instructions d&apos;accès de cette commande apparaîtront ici.
    </p>
  );
}

/* ---------------- Bloc d'achat ---------------- */

type Feedback =
  | { kind: "login"; message: string }
  | { kind: "balance"; message: string; missingA: number | null }
  | { kind: "owned"; message: string }
  | { kind: "generic"; message: string }
  | null;

export function BuyWithA({ product }: { product: Product }) {
  const { user, loading, refresh } = useUser();
  const priceA = typeof product.priceA === "number" && product.priceA > 0 ? product.priceA : 0;

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Purchase | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  // null = inconnu (vérification silencieuse ou backend indisponible) — le 409 du serveur arbitre
  const [owned, setOwned] = useState<boolean | null>(null);

  // Déjà possédé ? Simple confort d'affichage : le serveur reste l'arbitre (409 à l'achat).
  useEffect(() => {
    let cancelled = false;
    if (!user || result) {
      setOwned(null);
      return;
    }
    void (async () => {
      try {
        const purchases = await fetchMyPurchases();
        if (cancelled) return;
        setOwned(purchases.some((p) => p.productId === product.id && isActivePurchase(p)));
      } catch {
        if (!cancelled) setOwned(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, product.id, result]);

  const buy = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const purchase = await buyProduct(product.id, readAffiliateRef());
      setResult(purchase);
      setOwned(true);
      setConfirmOpen(false);
      // Solde relu depuis l'API (jamais recalculé côté client)
      void refresh();
    } catch (err) {
      setConfirmOpen(false);
      if (err instanceof ApiError) {
        if (err.status === 401) {
          await logout();
          setFeedback({
            kind: "login",
            message: "Votre session a expiré. Reconnectez-vous pour acheter.",
          });
          return;
        }
        if (err.status === 402) {
          const info = insufficientBalanceInfo(err);
          setFeedback({
            kind: "balance",
            message: err.message || "Solde A insuffisant.",
            missingA: info?.missingA ?? null,
          });
          return;
        }
        if (err.status === 409) {
          setOwned(true);
          setFeedback({ kind: "owned", message: err.message || "Vous possédez déjà ce produit." });
          return;
        }
        if (err.status === 429) {
          setFeedback({ kind: "generic", message: "Trop de tentatives — réessayez dans une minute." });
          return;
        }
      }
      setFeedback({
        kind: "generic",
        message: err instanceof Error ? err.message : "Achat impossible pour le moment.",
      });
    } finally {
      setBusy(false);
    }
  }, [busy, product.id, refresh]);

  if (priceA <= 0) return null;

  const remainingA = user ? Math.max(0, user.balanceA - priceA) : 0;

  /**
   * Non-membre (connecté sans adhésion) : la monnaie A ne lui est PAS accessible.
   * On n'affiche donc pas le bloc d'achat A, mais une invitation CONTEXTUELLE
   * sobre vers le programme (jamais de popup, jamais répétitive). Un visiteur NON
   * connecté, lui, garde l'écran « Se connecter pour acheter » ci-dessous : on ne
   * lui impose pas le discours membre avant qu'il ait un compte.
   */
  if (user && !isMember(user)) {
    return (
      <div className="rounded-[10px] border border-line bg-s1 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <CoinA size={30} />
          <div className="min-w-0">
            <p className="font-mono text-[0.66rem] uppercase tracking-[0.12em] text-tx3">
              Paiement en A
            </p>
            <p className="font-display text-[1.05rem] font-bold leading-tight">
              Réservé aux membres
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2.5 border-t border-dashed border-line pt-4">
          <p className="text-[0.84rem] leading-relaxed text-tx2">
            L&apos;achat en A est réservé aux membres. Découvrez le programme pour gagner des A.
          </p>
          <Link href="/affiliation" className="btn-arsenal btn-ghost w-full">
            Découvrir le programme
          </Link>
          {/* Le panier reste accessible : mettre de côté n'exige pas l'adhésion */}
          <AddToCart productId={product.id} />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[10px] border border-line bg-s1 p-4 sm:p-5">
      {/* En-tête : prix en A */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <CoinA size={30} />
        <div className="min-w-0">
          <p className="font-mono text-[0.66rem] uppercase tracking-[0.12em] text-tx3">
            Paiement en A
          </p>
          <p className="font-display text-[1.05rem] font-bold leading-tight">
            Obtenir pour{" "}
            <span className="tabular-nums">{fmt(priceA)}</span>
            <span className="text-gold"> A</span>
          </p>
        </div>
        {user && (
          <p className="ml-auto whitespace-nowrap font-mono text-[0.72rem] text-tx2">
            Solde : <span className="tabular-nums">{fmt(user.balanceA)}</span>
            <span className="text-gold"> A</span>
          </p>
        )}
      </div>

      {/* Accès obtenu (succès) */}
      {result && (
        <div className="mt-4 flex flex-col gap-3 border-t border-dashed border-line pt-4">
          <p className="flex items-center gap-2 text-[0.9rem] font-semibold text-teal">
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
              <path
                d="m5 13 4 4L19 7"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {isDeliveryPending(result) ? "Commande enregistrée" : "Produit obtenu"}
          </p>

          {isDeliveryPending(result) ? (
            <>
              <p className="text-[0.82rem] leading-relaxed text-tx2">
                Livraison en cours : votre accès s&apos;activera dès que la commande sera livrée.
                Vos A sont débités une seule fois et rien n&apos;est perdu en cas d&apos;échec.
              </p>
              <Link href="/compte/produits" className="btn-arsenal btn-ghost w-full">
                Suivre dans Mes produits
              </Link>
            </>
          ) : (
            <PurchaseAccessPanel purchase={result} sessionEmail={user?.email || ""} />
          )}
        </div>
      )}

      {/* Erreurs du contrat */}
      {feedback && (
        <div
          role="alert"
          className="mt-4 flex flex-col gap-2.5 rounded-[10px] border px-3.5 py-3"
          style={
            feedback.kind === "login" || feedback.kind === "generic"
              ? { borderColor: "rgba(230,57,70,0.4)", background: "rgba(230,57,70,0.1)" }
              : { borderColor: "rgba(244,162,97,0.4)", background: "rgba(244,162,97,0.08)" }
          }
        >
          <p
            className="text-[0.84rem] leading-relaxed"
            style={{ color: feedback.kind === "balance" ? "var(--warn-text)" : "var(--danger-text)" }}
          >
            {feedback.kind === "balance" && feedback.missingA !== null
              ? `Il vous manque ${fmt(feedback.missingA)} A pour obtenir ce produit.`
              : feedback.kind === "owned"
                ? "Vous possédez déjà ce produit."
                : feedback.message}
          </p>
          {feedback.kind === "login" && (
            <Link href="/connexion" className="btn-arsenal btn-primary w-full sm:w-auto">
              Se connecter
            </Link>
          )}
          {feedback.kind === "balance" && (
            <Link href="/compte/portefeuille" className="btn-arsenal btn-ghost w-full sm:w-auto">
              Voir mon portefeuille A
            </Link>
          )}
          {feedback.kind === "owned" && (
            <Link href="/compte/produits" className="btn-arsenal btn-ghost w-full sm:w-auto">
              Voir Mes produits
            </Link>
          )}
        </div>
      )}

      {/* État du bloc selon la session */}
      {!result && !loading && !user && (
        <div className="mt-4 flex flex-col gap-2.5 border-t border-dashed border-line pt-4">
          <Link href="/connexion" className="btn-arsenal btn-primary w-full">
            Se connecter pour acheter
          </Link>
          <p className="text-[0.76rem] leading-relaxed text-tx3">
            L&apos;achat se règle avec votre solde A, sans carte bancaire.
          </p>
          {/* Le panier reste ouvert à tous, même sans compte */}
          <AddToCart productId={product.id} />
          {/* Visiteur venu d'un lien affilié : invitation contextuelle à créer un
              compte (encart discret, jamais répétitif — voir SignupInvite). */}
          <SignupInvite />
        </div>
      )}

      {!result && user && owned !== true && (
        <div className="mt-4 flex flex-col gap-2.5 border-t border-dashed border-line pt-4">
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={busy}
            className="btn-arsenal btn-primary w-full"
          >
            <CoinA size={17} />
            Obtenir pour {fmt(priceA)} A
          </button>
          <p className="text-[0.76rem] leading-relaxed text-tx3">
            Débit immédiat de votre solde A. L&apos;accès est ouvert dès que la livraison est
            confirmée par le serveur.
          </p>
          <AddToCart productId={product.id} />
        </div>
      )}

      {!result && user && owned === true && (
        <div className="mt-4 flex flex-col gap-2.5 border-t border-dashed border-line pt-4">
          <p className="text-[0.86rem] text-tx2">Vous possédez déjà ce produit.</p>
          <Link href="/compte/produits" className="btn-arsenal btn-ghost w-full">
            Voir Mes produits
          </Link>
        </div>
      )}

      {/* Confirmation : prix rappelé + solde estimé après achat */}
      {confirmOpen && user && (
        <ConfirmDialog
          title={`Obtenir « ${product.title} » ?`}
          message={`Vous allez utiliser ${fmt(priceA)} A de votre solde (${fmt(user.balanceA)} A). Solde estimé après achat : ${fmt(remainingA)} A — le solde définitif est confirmé par le serveur.`}
          confirmLabel={`Payer ${fmt(priceA)} A`}
          busy={busy}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => void buy()}
        />
      )}
    </div>
  );
}
