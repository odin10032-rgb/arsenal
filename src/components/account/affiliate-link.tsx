"use client";

/**
 * Lien « affiliation » du header — visible pour toute session connectée.
 *  • rôle affilié / super affilié → « Espace affilié » (→ /affilie)
 *  • utilisateur connecté non affilié → « Devenir affilié » (→ /affiliation)
 *  • déconnecté → rien
 * Pendant le boot de session : rien (aucun flash pour un visiteur).
 *
 * ⚠️ `useUser()` (lib/user-auth.ts) expose `role` mais PAS `membership` (concept
 * serveur uniquement) : la distinction se fait donc sur le rôle affilié.
 */

import Link from "next/link";
import { useUser } from "@/hooks/use-user";
import type { UserRole } from "@/lib/user-auth";

const AFFILIATE_ROLES: UserRole[] = ["affiliate", "super_affiliate"];

export function AffiliateLink() {
  const { user, loading } = useUser();

  if (loading || !user) return null;

  const isAffiliate = AFFILIATE_ROLES.includes(user.role);
  const href = isAffiliate ? "/affilie" : "/affiliation";

  return (
    <Link
      href={href}
      className="relative flex h-[38px] items-center rounded-xl border border-transparent px-2.5 text-[0.8rem] text-[#a0a0a0] transition-colors after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-[''] hover:border-[#333] hover:bg-[#1a1a1a] hover:text-[#f0f0f0] sm:px-3"
    >
      {isAffiliate ? "Espace affilié" : "Devenir affilié"}
    </Link>
  );
}
