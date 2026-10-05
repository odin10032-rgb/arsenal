"use client";

/**
 * /r/?code=<linkCode> — redirection d'un lien affilié (contrat Phase 2).
 *
 * Appelle POST /api/track/affiliate-click (route publique), puis remplace l'URL par
 * celle du produit (`window.location.replace`). Le code peut arriver par query
 * (`?code=` — cas normal via public/_redirects), par hash (`#CODE`) ou par chemin (`/r/CODE`).
 * Une fois le code validé, il est mémorisé 30 jours (storeAffiliateRef) pour attribuer
 * les achats en A à venir (contrat Paiement en A).
 *
 * Page nue (aucun header/footer) : elle ne vit que le temps de la redirection.
 * Repli : message court + lien vers le catalogue — jamais d'impasse.
 */

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { trackAffiliateClick } from "@/lib/affiliate";
import { storeAffiliateRef, storeTrackingToken } from "@/lib/purchases";

const FALLBACK_MESSAGE = "Ce lien d'affiliation est introuvable ou n'est plus actif.";

/** Message d'échec lisible : on relaie l'erreur du contrat, sinon un texte générique */
function failureMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 404 || err.status === 409) return err.message;
    if (err.status === 429) return "Trop de tentatives — réessayez dans une minute.";
  }
  return FALLBACK_MESSAGE;
}

/** Seules les URL http(s) sont suivies (aucune redirection pilotée par le serveur hors ce schéma) */
function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="w-full max-w-[360px] text-center">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-tx3">
          Arsenal Tools
        </p>
        {children}
      </div>
    </main>
  );
}

function LoadingView() {
  return (
    <>
      <div className="mt-6 flex justify-center">
        <span className="spin" />
      </div>
      <p className="mt-4 font-mono text-[0.8rem] text-tx3" role="status">
        Redirection en cours…
      </p>
    </>
  );
}

function RedirectBody() {
  const queryCode = useSearchParams().get("code") || "";
  // null = code pas encore déterminé (évite un faux « lien introuvable » au premier rendu)
  const [code, setCode] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  // Le code peut venir du chemin ou du hash : lecture côté navigateur uniquement
  useEffect(() => {
    if (queryCode) {
      setCode(queryCode);
      return;
    }
    const hash = window.location.hash.replace(/^#/, "").trim();
    if (hash && !hash.includes("=")) {
      setCode(decodeURIComponent(hash));
      return;
    }
    const m = window.location.pathname.match(/^\/r\/([^/?#]+)/);
    setCode(m ? decodeURIComponent(m[1]) : "");
  }, [queryCode]);

  useEffect(() => {
    if (code === null) return;
    if (!code) {
      setMessage("Aucun code affilié dans cette adresse.");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { url, trackingToken } = await trackAffiliateClick(code);
        if (cancelled) return;
        // Jeton de tracking serveur (vague 1) : mémorisé 30 j AVANT la redirection
        // (il identifie tout le parcours du visiteur — règle « dernier toucher »).
        if (trackingToken) storeTrackingToken(trackingToken);
        // Code validé par le serveur : mémorisé 30 j côté client pour les achats en A
        // (contrat Paiement en A — le serveur revérifie à l'achat). REPLI si le
        // jeton est absent/expiré : le mécanisme actuel continue de fonctionner.
        storeAffiliateRef(code);
        if (!isHttpUrl(url)) {
          setMessage(FALLBACK_MESSAGE);
          return;
        }
        window.location.replace(url.trim());
      } catch (err) {
        if (cancelled) return;
        setMessage(failureMessage(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (message) {
    return (
      <Shell>
        <h1 className="mt-4 font-display text-[1.15rem] font-bold">Lien indisponible</h1>
        <p className="mt-2 text-[0.85rem] leading-relaxed text-tx2">{message}</p>
        <Link href="/" className="btn-arsenal btn-ghost mt-6 w-full">
          Aller au catalogue
        </Link>
      </Shell>
    );
  }

  return (
    <Shell>
      <LoadingView />
    </Shell>
  );
}

export default function AffiliateRedirectPage() {
  return (
    <Suspense
      fallback={
        <Shell>
          <LoadingView />
        </Shell>
      }
    >
      <RedirectBody />
    </Suspense>
  );
}
