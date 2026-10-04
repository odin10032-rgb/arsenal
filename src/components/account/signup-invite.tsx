"use client";

/**
 * Invitation contextuelle à créer un compte (vague 5).
 *
 * Public : un VISITEUR NON CONNECTÉ venu par un lien affilié (jeton de tracking
 * présent). Le compte est le SEUL identifiant qui traverse les appareils : c'est
 * la promesse sobre faite ici — ses achats, sa bibliothèque et ses données le
 * suivent d'un appareil à l'autre.
 *
 * Exigence du cahier des charges : JAMAIS agressif ni répétitif. Un refus ou un
 * simple déjà-vu est mémorisé dans `localStorage` (§ clé `arsenal_signup_invite_seen`)
 * et l'invitation ne se repropose pas avant 7 jours. Un clic sur « Créer un compte »
 * = vu DÉFINITIVEMENT (aucune nouvelle proposition).
 *
 * Ce n'est PAS une modale : c'est un encart discret rendu DANS le flux (bannière
 * en bas de la zone d'action), qui ne voile jamais l'écran et ne bloque jamais la
 * lecture du produit. Il n'affiche rien tant qu'aucune décision n'a été prise côté
 * client (évite tout flash) ni tant que le visiteur est connecté.
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "@/hooks/use-user";
import { readTrackingToken } from "@/lib/purchases";

/** Clé localStorage de mémorisation (refus / déjà-vu) — contrat de la vague 5. */
export const SIGNUP_INVITE_KEY = "arsenal_signup_invite_seen";
/** Délai de re-proposition après un refus : 7 jours. */
export const SIGNUP_INVITE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

interface InviteSeen {
  /** Instant de l'enregistrement (ms epoch). */
  at: number;
  /** `true` = clic « Créer un compte » : vu définitivement, plus jamais reproposé. */
  definitive: boolean;
}

/**
 * Enregistre un refus (cooldown 7 j) ou une acceptation (définitif).
 * Jamais d'exception : un `localStorage` indisponible n'empêche pas l'invitation
 * de se fermer pour la session en cours.
 */
function markInviteSeen(definitive: boolean): void {
  try {
    const payload: InviteSeen = { at: Date.now(), definitive };
    localStorage.setItem(SIGNUP_INVITE_KEY, JSON.stringify(payload));
  } catch {
    /* storage indisponible : ignoré (aucune promesse tenue à l'utilisateur) */
  }
}

/**
 * `true` si l'invitation ne doit PAS se montrer : acceptation définitive déjà
 * enregistrée, ou refus encore dans la fenêtre de 7 jours. Lecture défensive
 * (valeur absente/illisible → l'invitation est autorisée).
 */
function isInviteSuppressed(): boolean {
  try {
    const raw = localStorage.getItem(SIGNUP_INVITE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Partial<InviteSeen>;
    if (parsed?.definitive === true) return true;
    const at = typeof parsed?.at === "number" ? parsed.at : 0;
    if (!at) return false;
    return Date.now() - at < SIGNUP_INVITE_COOLDOWN_MS;
  } catch {
    return false;
  }
}

/**
 * Encart d'invitation à créer un compte.
 *
 * Monté par l'appelant (ici `buy-with-a.tsx`) pour un visiteur non connecté venu
 * d'un lien affilié. Le composant se garde lui-même de parler à un utilisateur
 * connecté ou à un visiteur sans jeton — il peut donc être monté sans condition,
 * mais l'appelant filtre déjà pour éviter un rendu inutile.
 */
export function SignupInvite() {
  const { user, loading } = useUser();
  // `null` = décision pas encore prise (aucun affichage) → pas de flash à l'hydratation.
  const [visible, setVisible] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Décide une seule fois, après montage client : visiteur anonyme, venu d'un
  // lien affilié (jeton présent) et invitation non supprimée.
  useEffect(() => {
    if (loading || user) return;
    if (!readTrackingToken()) return;
    if (isInviteSuppressed()) return;
    setVisible(true);
  }, [loading, user]);

  const dismiss = useCallback(() => {
    markInviteSeen(false); // refus → cooldown 7 jours
    setVisible(false);
  }, []);

  const accept = useCallback(() => {
    // Clic « Créer un compte » = vu définitivement (ne se reproposera jamais).
    markInviteSeen(true);
    setVisible(false);
  }, []);

  // Fermeture au clavier (Escape) + focus initial sur la fermeture.
  useEffect(() => {
    if (!visible) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, dismiss]);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="signup-invite-title"
      aria-describedby="signup-invite-desc"
      className="mt-4 rounded-[10px] border border-[#333] bg-[#141414] p-4"
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <p
            id="signup-invite-title"
            className="font-display text-[0.95rem] font-bold leading-tight"
          >
            Créez un compte gratuit pour garder vos achats
          </p>
          <p id="signup-invite-desc" className="mt-1.5 text-[0.82rem] leading-relaxed text-[#a0a0a0]">
            Votre compte vous donne accès à vos achats et à votre bibliothèque, le suivi de vos
            commandes, et vos données vous suivent d&apos;un appareil à l&apos;autre. C&apos;est
            gratuit.
          </p>
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={dismiss}
          aria-label="Fermer l'invitation"
          className="ml-auto inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[#666] transition-colors hover:text-[#a0a0a0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4fb3a1]"
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>

      <div className="mt-3.5 flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <Link
          href="/inscription"
          onClick={accept}
          className="btn-arsenal btn-primary w-full sm:w-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4fb3a1]"
        >
          Créer un compte
        </Link>
        <button
          type="button"
          onClick={dismiss}
          className="text-[0.8rem] text-[#666] underline-offset-2 transition-colors hover:text-[#a0a0a0] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4fb3a1]"
        >
          Plus tard
        </button>
      </div>
    </div>
  );
}
