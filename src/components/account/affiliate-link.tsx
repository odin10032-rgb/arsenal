"use client";

/**
 * Lien discret « Affilié » du header — affiché uniquement pour une session dont
 * le rôle est affilié ou super affilié (contrat Phase 2).
 * Pendant le boot de session : rien (aucun flash pour un visiteur non affilié).
 */

import Link from "next/link";
import { useUser } from "@/hooks/use-user";
import type { UserRole } from "@/lib/user-auth";

const AFFILIATE_ROLES: UserRole[] = ["affiliate", "super_affiliate"];

export function AffiliateLink() {
  const { user, loading } = useUser();

  if (loading || !user || !AFFILIATE_ROLES.includes(user.role)) return null;

  return (
    <Link
      href="/affilie"
      className="relative flex h-[38px] items-center rounded-xl border border-transparent px-2.5 text-[0.8rem] text-[#a0a0a0] transition-colors after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-[''] hover:border-[#333] hover:bg-[#1a1a1a] hover:text-[#f0f0f0] sm:px-3"
    >
      Affilié
    </Link>
  );
}
