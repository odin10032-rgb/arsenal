"use client";

/**
 * /compte — espace utilisateur : identité, rôle, solde A, actions.
 * Contrat Phase 1 : objet user { id, pseudo, email, role, balanceA, createdAt }.
 * Garde : non connecté → /connexion (pattern admin/page.tsx).
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { CoinA } from "@/components/account/coin-a";
import { useUser } from "@/hooks/use-user";
import { fmt } from "@/lib/format";
import type { UserRole } from "@/lib/user-auth";

const ROLE_LABELS: Record<UserRole, string> = {
  user: "Utilisateur",
  affiliate: "Affilié",
  super_affiliate: "Super affilié",
  admin: "Admin",
};

/** Badge de rôle sobre — teintes de la palette existante (rouge staff, vert affiliés) */
function roleBadgeClass(role: UserRole): string {
  if (role === "admin") {
    return "border-[rgba(230,57,70,0.45)] bg-[rgba(230,57,70,0.1)] text-[#fda4af]";
  }
  if (role === "affiliate" || role === "super_affiliate") {
    return "border-[rgba(42,157,143,0.45)] bg-[rgba(42,157,143,0.1)] text-[#7fd4cb]";
  }
  return "border-[#333] bg-[#1a1a1a] text-[#a0a0a0]";
}

export default function ComptePage() {
  const { user, loading, logout } = useUser();
  const router = useRouter();

  // Garde : session absente → porte de connexion (une fois le boot terminé)
  useEffect(() => {
    if (!loading && !user) router.replace("/connexion");
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex justify-center p-10">
        <p className="font-mono text-[0.85rem] text-[#666]">Chargement de votre espace…</p>
      </div>
    );
  }

  if (!user) return null; // redirection en cours

  const memberSince = new Date(user.createdAt).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="container-arsenal py-10 sm:py-14">
      <div className="mx-auto w-full max-w-[440px]">
        <h1 className="font-display text-[1.35rem] font-bold">Mon compte</h1>
        <p className="mt-1 text-[0.84rem] text-[#a0a0a0]">Votre profil et votre solde A.</p>

        <div className="mt-6 rounded-2xl border border-[#333] bg-[#141414] p-6 sm:p-8">
          {/* Identité */}
          <div className="flex items-center gap-4">
            <CoinA size={54} />
            <div className="min-w-0">
              <p className="truncate font-display text-[1.2rem] font-bold leading-tight">
                {user.pseudo}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span
                  className={`rounded-md border px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wide ${roleBadgeClass(user.role)}`}
                >
                  {ROLE_LABELS[user.role]}
                </span>
                <span className="text-[0.74rem] text-[#666]">
                  Membre depuis le {memberSince}
                </span>
              </div>
            </div>
          </div>

          {/* Solde A */}
          <div className="mt-6 border-t border-dashed border-[#333] pt-6">
            <p className="text-[0.74rem] font-semibold uppercase tracking-wider text-[#666]">
              Solde
            </p>
            <div className="mt-2 flex items-center gap-3">
              <CoinA size={34} />
              <p className="whitespace-nowrap font-mono text-[2rem] font-bold leading-none tabular-nums text-[#f0f0f0]">
                {fmt(user.balanceA)}
                <span className="ml-2 text-[1.1rem] text-gold">A</span>
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 flex flex-col gap-3 border-t border-dashed border-[#333] pt-6">
            <Link href="/compte/portefeuille" className="btn-arsenal btn-ghost w-full">
              Voir le portefeuille
            </Link>
            <button type="button" onClick={() => void logout()} className="btn-arsenal btn-danger w-full">
              Se déconnecter
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
