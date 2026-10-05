"use client";

/**
 * Pastille compte — discrète, intégrée au header (rien de fixe en overlay, pas de HUD).
 * Connecté : AVATAR utilisateur (jamais la pièce A, réservée à la monnaie) + solde → /compte.
 * Déconnecté : lien « Connexion » discret → /connexion.
 */

import Link from "next/link";
import { UserAvatar } from "./user-avatar";
import { useUser } from "@/hooks/use-user";

export function BalancePill() {
  const { user, loading } = useUser();

  // Pendant le boot : rien (pas de flash « Connexion » pour un utilisateur déjà connecté)
  if (loading) return null;

  if (!user) {
    return (
      <Link
        href="/connexion"
        className="relative flex h-[38px] items-center rounded-xl border border-transparent px-2.5 text-[0.8rem] text-tx2 transition-colors after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-[''] hover:border-line hover:bg-s2 hover:text-tx1 sm:px-3"
      >
        Connexion
      </Link>
    );
  }

  return (
    <Link
      href="/compte"
      title={`Compte de ${user.pseudo}`}
      aria-label={`Compte de ${user.pseudo} — solde ${user.balanceA} A`}
      className="relative flex h-[38px] flex-shrink-0 items-center gap-1.5 rounded-xl border border-line bg-s1 px-2.5 transition-colors after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-[''] hover:border-line2 hover:bg-s2 sm:px-3"
    >
      <UserAvatar pseudo={user.pseudo} seed={user.id} size={22} />
      {/* Compacte sur mobile : l'avatar seul, le solde apparaît dès sm */}
      <span className="hidden whitespace-nowrap font-mono text-[0.8rem] tabular-nums text-tx1 sm:inline">
        {user.balanceA.toLocaleString("fr-FR")}
        <span className="ml-1 text-gold">A</span>
      </span>
    </Link>
  );
}
