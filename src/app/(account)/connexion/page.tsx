"use client";

/**
 * /connexion — connexion utilisateur (email OU pseudo) + mot de passe.
 * Contrat Phase 1 : POST /api/auth/session (401 → « Identifiants incorrects. »).
 * ⚠️ POST /api/auth/login reste le login ADMIN — on ne l'utilise pas ici.
 * Au succès → /compte. Déjà connecté → redirection /compte.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CoinA } from "@/components/account/coin-a";
import { useUser } from "@/hooks/use-user";

export default function ConnexionPage() {
  const { user, loading, login } = useUser();
  const router = useRouter();
  const [identifiant, setIdentifiant] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Garde inverse : déjà connecté → espace compte (une fois le boot terminé)
  useEffect(() => {
    if (!loading && user) router.replace("/compte");
  }, [loading, user, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifiant.trim() || !password || busy) return;
    setBusy(true);
    setError("");
    try {
      await login(identifiant, password);
      router.replace("/compte");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connexion impossible.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container-arsenal py-10 sm:py-14">
      <form
        onSubmit={submit}
        className="mx-auto flex w-full max-w-[400px] flex-col gap-4 rounded-2xl border border-line bg-s1 p-6 sm:p-8"
      >
        <div className="flex justify-center">
          <CoinA size={46} />
        </div>
        <div className="text-center">
          <h1 className="font-display text-[1.35rem] font-bold">Connexion</h1>
          <p className="mt-1 text-[0.84rem] text-tx2">
            Accédez à votre espace et à votre solde A.
          </p>
        </div>

        {error && (
          <p
            className="rounded-lg border border-[rgba(230,57,70,0.4)] bg-[rgba(230,57,70,0.1)] px-3 py-2 text-[0.8rem] text-dangertx"
            role="alert"
          >
            {error}
          </p>
        )}

        <div>
          <label htmlFor="identifiant" className="mb-1.5 block text-[0.8rem] text-tx2">
            Email ou pseudo
          </label>
          <input
            id="identifiant"
            type="text"
            required
            value={identifiant}
            onChange={(e) => setIdentifiant(e.target.value)}
            placeholder="florian ou florian@example.com"
            autoComplete="username"
            className="input-arsenal"
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-[0.8rem] text-tx2">
            Mot de passe
          </label>
          <div className="relative">
            <input
              id="password"
              type={show ? "text" : "password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              autoComplete="current-password"
              className="input-arsenal pr-11"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-tx3 transition-colors hover:text-tx1"
              aria-label="Afficher/masquer le mot de passe"
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
          </div>
        </div>

        <button
          type="submit"
          disabled={busy || !identifiant.trim() || !password}
          className="btn-arsenal btn-primary"
        >
          {busy && <span className="spin" />}
          Se connecter
        </button>

        <p className="border-t border-dashed border-line pt-3 text-center text-[0.8rem] text-tx2">
          Pas encore de compte ?{" "}
          <Link
            href="/inscription"
            className="text-pricetx transition-colors hover:text-brand hover:underline"
          >
            Créer un compte
          </Link>
        </p>
      </form>
    </div>
  );
}
