"use client";

/**
 * /inscription — création de compte (minimisation : pseudo, email, mot de passe — rien d'autre).
 * Contrat Phase 1 : POST /api/auth/register (+100 A de bienvenue créés côté serveur).
 * Validation locale en miroir des règles serveur : pseudo 3–24 [a-zA-Z0-9_-], mot de passe ≥ 8.
 * Au succès → /compte. Déjà connecté → redirection /compte.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CoinA } from "@/components/account/coin-a";
import { useUser } from "@/hooks/use-user";

const PSEUDO_RE = /^[a-zA-Z0-9_-]{3,24}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function InscriptionPage() {
  const { user, loading, register } = useUser();
  const router = useRouter();
  const [pseudo, setPseudo] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Garde inverse : déjà connecté → espace compte (une fois le boot terminé)
  useEffect(() => {
    if (!loading && user) router.replace("/compte");
  }, [loading, user, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;

    // Validation locale (mêmes règles que le Worker — contrat Phase 1)
    if (!PSEUDO_RE.test(pseudo.trim())) {
      setError("Le pseudo doit contenir entre 3 et 24 caractères (lettres, chiffres, « - » ou « _ »).");
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      setError("Email invalide.");
      return;
    }
    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (password !== confirm) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      await register(pseudo, email, password);
      router.replace("/compte");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Inscription impossible.");
    } finally {
      setBusy(false);
    }
  };

  const eyeButton = (target: "password" | "confirm") => (
    <button
      type="button"
      onClick={() => setShow((s) => !s)}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#666] transition-colors hover:text-[#f0f0f0]"
      aria-label={
        target === "password"
          ? "Afficher/masquer le mot de passe"
          : "Afficher/masquer la confirmation"
      }
    >
      {show ? (
        <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M17.94 17.94A10.4 10.4 0 0 1 12 19.5C5 19.5 2 12 2 12a19.5 19.5 0 0 1 5.06-5.94M9.9 4.24A9.5 9.5 0 0 1 12 4.5c7 0 10 7.5 10 7.5a19.6 19.6 0 0 1-2.16 3.19M1 1l22 22" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
  );

  return (
    <div className="container-arsenal py-10 sm:py-14">
      <form
        onSubmit={submit}
        className="mx-auto flex w-full max-w-[400px] flex-col gap-4 rounded-2xl border border-[#333] bg-[#141414] p-6 sm:p-8"
      >
        <div className="flex justify-center">
          <CoinA size={46} />
        </div>
        <div className="text-center">
          <h1 className="font-display text-[1.35rem] font-bold">Créer un compte</h1>
          <p className="mt-1 text-[0.84rem] text-[#a0a0a0]">
            Rejoignez Arsenal Tools et démarrez avec un bonus de bienvenue en A.
          </p>
        </div>

        {error && (
          <p
            className="rounded-lg border border-[rgba(230,57,70,0.4)] bg-[rgba(230,57,70,0.1)] px-3 py-2 text-[0.8rem] text-[#fda4af]"
            role="alert"
          >
            {error}
          </p>
        )}

        <div>
          <label htmlFor="pseudo" className="mb-1.5 block text-[0.8rem] text-[#a0a0a0]">
            Pseudo
          </label>
          <input
            id="pseudo"
            type="text"
            required
            value={pseudo}
            onChange={(e) => setPseudo(e.target.value)}
            placeholder="3 à 24 caractères — a-z, 0-9, - _"
            autoComplete="nickname"
            maxLength={24}
            className="input-arsenal"
          />
        </div>

        <div>
          <label htmlFor="email" className="mb-1.5 block text-[0.8rem] text-[#a0a0a0]">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vous@example.com"
            autoComplete="email"
            maxLength={254}
            className="input-arsenal"
          />
        </div>

        <div>
          <label htmlFor="new-password" className="mb-1.5 block text-[0.8rem] text-[#a0a0a0]">
            Mot de passe
          </label>
          <div className="relative">
            <input
              id="new-password"
              type={show ? "text" : "password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8 caractères minimum"
              autoComplete="new-password"
              minLength={8}
              className="input-arsenal pr-11"
            />
            {eyeButton("password")}
          </div>
        </div>

        <div>
          <label htmlFor="confirm-password" className="mb-1.5 block text-[0.8rem] text-[#a0a0a0]">
            Confirmer le mot de passe
          </label>
          <div className="relative">
            <input
              id="confirm-password"
              type={show ? "text" : "password"}
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••••••"
              autoComplete="new-password"
              minLength={8}
              className="input-arsenal pr-11"
            />
            {eyeButton("confirm")}
          </div>
        </div>

        <button type="submit" disabled={busy} className="btn-arsenal btn-primary">
          {busy && <span className="spin" />}
          Créer mon compte
        </button>

        <p className="border-t border-dashed border-[#333] pt-3 text-center text-[0.8rem] text-[#a0a0a0]">
          Déjà inscrit ?{" "}
          <Link
            href="/connexion"
            className="text-[#f0808a] transition-colors hover:text-[#e63946] hover:underline"
          >
            Se connecter
          </Link>
        </p>
      </form>
    </div>
  );
}
