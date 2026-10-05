"use client";

/**
 * /compte — espace utilisateur : identité, rôle, solde A, actions.
 * Contrat Phase 1 : objet user { id, pseudo, email, role, balanceA, createdAt }.
 * Garde : non connecté → /connexion (pattern admin/page.tsx).
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CoinA } from "@/components/account/coin-a";
import { UserAvatar } from "@/components/account/user-avatar";
import { useUser } from "@/hooks/use-user";
import { fetchAffiliateMe, type AffiliateStatus } from "@/lib/affiliate";
import { fmt } from "@/lib/format";
import type { UserRole } from "@/lib/user-auth";
import { isMember } from "@/lib/user-auth";

const ROLE_LABELS: Record<UserRole, string> = {
  user: "Utilisateur",
  affiliate: "Affilié",
  super_affiliate: "Super affilié",
  admin: "Admin",
};

const AFFILIATE_ROLES: UserRole[] = ["affiliate", "super_affiliate"];

/** Badge de rôle sobre — teintes de la palette existante (rouge staff, vert affiliés) */
function roleBadgeClass(role: UserRole): string {
  if (role === "admin") {
    return "border-[rgba(230,57,70,0.45)] bg-[rgba(230,57,70,0.1)] text-dangertx";
  }
  if (role === "affiliate" || role === "super_affiliate") {
    return "border-[rgba(42,157,143,0.45)] bg-[rgba(42,157,143,0.1)] text-teal2";
  }
  return "border-line bg-s2 text-tx2";
}

export default function ComptePage() {
  const { user, loading, logout } = useUser();
  const router = useRouter();
  // État d'affiliation : null = inconnu/en chargement. Un utilisateur dont le rôle
  // est affilié est « active » sans requête ; les autres interrogent leur état réel.
  const [affStatus, setAffStatus] = useState<AffiliateStatus | null>(null);

  // Garde : session absente → porte de connexion (une fois le boot terminé)
  useEffect(() => {
    if (!loading && !user) router.replace("/connexion");
  }, [loading, user, router]);

  useEffect(() => {
    if (loading || !user) return;
    if (AFFILIATE_ROLES.includes(user.role)) {
      setAffStatus("active");
      return;
    }
    let cancelled = false;
    fetchAffiliateMe()
      .then((a) => {
        if (!cancelled) setAffStatus(a?.status ?? null);
      })
      .catch(() => {
        /* lecture d'état silencieuse : on retombe sur « non affilié » */
        if (!cancelled) setAffStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [loading, user]);

  if (loading) {
    return (
      <div className="flex justify-center p-10">
        <p className="font-mono text-[0.85rem] text-tx3">Chargement de votre espace…</p>
      </div>
    );
  }

  if (!user) return null; // redirection en cours

  // Monnaie A réservée aux MEMBRES : un non-membre ne doit ni voir de solde A,
  // ni de lien portefeuille (son portefeuille n'existe pas tant qu'il n'a pas
  // rejoint le programme). Le solde reste à 0 côté serveur pour ces comptes.
  const member = isMember(user);

  const memberSince = new Date(user.createdAt).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="container-arsenal py-10 sm:py-14">
      <div className="mx-auto w-full max-w-[440px]">
        <h1 className="font-display text-[1.35rem] font-bold">Mon compte</h1>
        <p className="mt-1 text-[0.84rem] text-tx2">
          {member ? "Votre profil et votre solde A." : "Votre profil et vos achats."}
        </p>

        <div className="mt-6 rounded-2xl border border-line bg-s1 p-6 sm:p-8">
          {/* Identité */}
          <div className="flex items-center gap-4">
            <UserAvatar pseudo={user.pseudo} seed={user.id} size={54} />
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
                <span className="text-[0.74rem] text-tx3">
                  Membre depuis le {memberSince}
                </span>
              </div>
            </div>
          </div>

          {/* Solde A — MEMBRES uniquement (un non-membre n'a pas de monnaie A) */}
          {member ? (
            <div className="mt-6 border-t border-dashed border-line pt-6">
              <p className="text-[0.74rem] font-semibold uppercase tracking-wider text-tx3">
                Solde
              </p>
              <div className="mt-2 flex items-center gap-3">
                <CoinA size={34} />
                <p className="whitespace-nowrap font-mono text-[2rem] font-bold leading-none tabular-nums text-tx1">
                  {fmt(user.balanceA)}
                  <span className="ml-2 text-[1.1rem] text-gold">A</span>
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-6 border-t border-dashed border-line pt-6">
              <p className="text-[0.86rem] leading-relaxed text-tx2">
                La monnaie A est réservée aux membres.{" "}
                <Link href="/affiliation" className="text-teal hover:underline">
                  Découvrez le programme
                </Link>{" "}
                pour en gagner.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="mt-6 flex flex-col gap-3 border-t border-dashed border-line pt-6">
            <Link href="/compte/panier" className="btn-arsenal btn-ghost w-full">
              Mon panier
            </Link>
            <Link href="/compte/produits" className="btn-arsenal btn-ghost w-full">
              Mes produits
            </Link>
            {/* Portefeuille A : membres uniquement (le portefeuille n'existe pas pour un non-membre) */}
            {member && (
              <Link href="/compte/portefeuille" className="btn-arsenal btn-ghost w-full">
                Voir le portefeuille
              </Link>
            )}
            <button type="button" onClick={() => void logout()} className="btn-arsenal btn-danger w-full">
              Se déconnecter
            </button>
          </div>
        </div>

        {/* Programme d'affiliation — carte discrète (solde A géré ailleurs) */}
        <AffiliationCard status={affStatus} />
      </div>
    </div>
  );
}

/* ---------------- Programme d'affiliation ---------------- */

function AffiliationCard({ status }: { status: AffiliateStatus | null }) {
  return (
    <div className="mt-4 rounded-2xl border border-line bg-s1 p-6">
      <h2 className="font-display text-[1rem] font-bold">Programme d&apos;affiliation</h2>
      {status === "active" ? (
        <>
          <p className="mt-2 text-[0.86rem] leading-relaxed text-tx2">
            Vous faites partie du programme. Retrouvez vos liens, vos ventes et vos commissions dans
            votre espace affilié.
          </p>
          <Link href="/affilie" className="btn-arsenal btn-ghost mt-4 w-full">
            Votre espace affilié
          </Link>
        </>
      ) : status === "pending" ? (
        <>
          <p className="mt-2 text-[0.86rem] leading-relaxed text-tx2">
            Votre candidature est en attente d&apos;examen par l&apos;équipe. Vos liens seront
            activés dès sa validation.
          </p>
          <Link href="/affilie" className="btn-arsenal btn-ghost mt-4 w-full">
            Voir ma candidature
          </Link>
        </>
      ) : status === "suspended" ? (
        <p className="mt-2 text-[0.86rem] leading-relaxed text-tx2">
          Votre compte affilié est actuellement suspendu. Contactez l&apos;équipe pour rétablir
          votre accès — vos commissions déjà acquises restent enregistrées.
        </p>
      ) : (
        <>
          <p className="mt-2 text-[0.86rem] leading-relaxed text-tx2">
            Partagez les produits Arsenal avec votre audience et gagnez des A plus une commission à
            chaque vente. Rejoindre le programme est un choix libre.
          </p>
          <Link href="/affiliation" className="btn-arsenal btn-ghost mt-4 w-full">
            Devenir affilié
          </Link>
        </>
      )}
    </div>
  );
}
