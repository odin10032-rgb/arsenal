"use client";

/**
 * Porte de connexion admin — mot de passe + œil + erreur
 */

import { useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { adminLogin } from "@/lib/admin";
import { writeAdminToken } from "@/lib/products";

export function AdminLogin({ onLogin }: { onLogin: (token: string) => void }) {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError("");
    try {
      const token = await adminLogin(password);
      writeAdminToken(token);
      onLogin(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connexion impossible.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <form
        onSubmit={submit}
        className="flex w-full max-w-[400px] flex-col gap-4 rounded-2xl border border-[#333] bg-[#141414] p-8 text-center"
      >
        <div className="flex justify-center">
          <BrandLogo size={46} />
        </div>
        <div>
          <h1 className="font-display text-[1.35rem] font-bold">Zone administrateur</h1>
          <p className="mt-1 text-[0.84rem] text-[#a0a0a0]">
            Arsenal Tools — Dashboard &amp; médiathèque.
          </p>
        </div>

        {error && (
          <p className="rounded-lg border border-[rgba(230,57,70,0.4)] bg-[rgba(230,57,70,0.1)] px-3 py-2 text-[0.8rem] text-[#fda4af]" role="alert">
            {error}
          </p>
        )}

        <div className="relative">
          <label htmlFor="admin-password" className="sr-only">
            Mot de passe administrateur
          </label>
          <input
            id="admin-password"
            type={show ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••••"
            autoComplete="current-password"
            className="input-arsenal pr-11"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#666] hover:text-[#f0f0f0]"
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

        <button type="submit" disabled={busy || !password} className="btn-arsenal btn-primary">
          {busy && <span className="spin" />}
          Déverrouiller le dashboard
        </button>

        <p className="border-t border-dashed border-[#333] pt-3 text-[0.72rem] leading-relaxed text-[#666]">
          Modifiable dans <em>Paramètres → Sécurité</em> une fois connecté.
        </p>
      </form>
    </div>
  );
}
