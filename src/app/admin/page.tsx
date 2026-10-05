"use client";

/**
 * Page admin dédiée — /admin
 * Token en session → dashboard ; sinon porte de connexion.
 * (Page propre : le header/footer publics n'apparaissent pas ici.)
 */

import { useEffect, useState } from "react";
import { AdminLogin } from "@/components/admin/admin-login";
import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { useCatalog } from "@/hooks/use-catalog";
import { readAdminToken } from "@/lib/products";
import { useTheme } from "@/lib/theme";

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [booted, setBooted] = useState(false);
  const { products, apiAvailable, reload } = useCatalog();

  useEffect(() => {
    setToken(readAdminToken() || null);
    setBooted(true);
  }, []);

  // L'admin est un TABLEAU DE BORD : toujours sombre, quel que soit le thème
  // choisi pour le site public (le mode clair ne concerne que le site). Le
  // forçage passe par le ThemeProvider — un data-theme posé directement ici
  // serait écrasé par l'effet du provider (les effets parents s'exécutent
  // après ceux des enfants).
  const { setForcedDark } = useTheme();
  useEffect(() => {
    setForcedDark(true);
    return () => setForcedDark(false);
  }, [setForcedDark]);

  if (!booted) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="font-mono text-[0.85rem] text-[#666]">Chargement de la console…</p>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex min-h-dvh flex-col">
        <AdminLogin onLogin={setToken} />
      </div>
    );
  }

  return (
    <AdminDashboard
      products={products}
      apiAvailable={apiAvailable}
      reload={reload}
      onLogout={() => setToken(null)}
    />
  );
}
