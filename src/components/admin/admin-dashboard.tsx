"use client";

/**
 * Shell du dashboard admin — header + 7 onglets + déconnexion
 */

import Link from "next/link";
import { useState } from "react";
import { AffiliatesTab } from "./affiliates-tab";
import { AnalyticsTab } from "./analytics-tab";
import { ChariowTab } from "./chariow-tab";
import { MediaTab } from "./media-tab";
import { ProductsTab } from "./products-tab";
import { PurchasesTab } from "./purchases-tab";
import { SettingsTab } from "./settings-tab";
import { BrandLogo } from "@/components/brand-logo";
import { clearAdminToken } from "@/lib/products";
import { Product } from "@/lib/products";
import { ToastHost } from "@/lib/toast";

type Tab = "products" | "media" | "analytics" | "affiliates" | "purchases" | "chariow" | "settings";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  {
    id: "products",
    label: "Produits",
    icon: (
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2 3 7v10l9 5 9-5V7z" />
        <path d="M3 7l9 5 9-5M12 12v10" />
      </svg>
    ),
  },
  {
    id: "media",
    label: "Médiathèque",
    icon: (
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="9" cy="10" r="1.6" />
        <path d="m4 18 5-5 3 3 3-3 5 5" />
      </svg>
    ),
  },
  {
    id: "analytics",
    label: "Analytique",
    icon: (
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M4 20V10m6 10V4m6 16v-7m4 7V8" />
      </svg>
    ),
  },
  {
    id: "affiliates",
    label: "Affiliés",
    icon: (
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    id: "purchases",
    label: "Commandes",
    icon: (
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h2l2.4 10.5a2 2 0 0 0 2 1.5h7.4a2 2 0 0 0 2-1.6L21 8H6" />
        <circle cx="10" cy="20" r="1.3" />
        <circle cx="17.5" cy="20" r="1.3" />
      </svg>
    ),
  },
  {
    id: "chariow",
    label: "Chariow",
    icon: (
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9h18l-1.5 11.5a1 1 0 0 1-1 .9H5.5a1 1 0 0 1-1-.9z" />
        <path d="M8 9V6.5a4 4 0 0 1 8 0V9" />
        <path d="M9.5 13.5h5" />
      </svg>
    ),
  },
  {
    id: "settings",
    label: "Paramètres",
    icon: (
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
      </svg>
    ),
  },
];

export function AdminDashboard({
  products,
  apiAvailable,
  reload,
  onLogout,
}: {
  products: Product[];
  apiAvailable: boolean;
  reload: () => Promise<void>;
  onLogout: () => void;
}) {
  const [tab, setTab] = useState<Tab>("products");

  const logout = () => {
    clearAdminToken();
    onLogout();
  };

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-[#333] bg-[rgba(10,10,10,0.95)]">
        <div className="container-arsenal flex flex-wrap items-center gap-3 py-2.5">
          <Link href="/admin" className="flex items-center gap-2">
            <BrandLogo size={28} />
            <span className="text-[0.95rem] font-bold tracking-wide">
              Arsenal <span className="text-[#e63946]">Tools</span>
            </span>
          </Link>
          <span className="rounded-full border border-[rgba(230,57,70,0.45)] bg-[rgba(230,57,70,0.1)] px-2.5 py-1 font-mono text-[0.62rem] uppercase tracking-[0.1em] text-[#f0808a]">
            Dashboard Admin
          </span>
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[0.64rem]"
            style={
              apiAvailable
                ? { color: "#56b8a8", borderColor: "rgba(42,157,143,0.4)", background: "rgba(42,157,143,0.07)" }
                : { color: "#f4a261", borderColor: "rgba(244,162,97,0.4)", background: "rgba(244,162,97,0.07)" }
            }
            title={
              apiAvailable
                ? "Données partagées entre tous les visiteurs"
                : "API injoignable — modifications stockées localement"
            }
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "currentColor" }} />
            {apiAvailable ? "Backend connecté" : "Mode local"}
          </span>

          <div className="ml-auto flex items-center gap-2">
            <Link href="/" className="btn-arsenal btn-ghost btn-sm" target="_blank">
              Voir le site
            </Link>
            <button type="button" onClick={logout} className="btn-arsenal btn-danger btn-sm">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
              Déconnexion
            </button>
          </div>
        </div>

        {/* Onglets */}
        <nav className="flex gap-1 overflow-x-auto border-b border-[#333] bg-[rgba(8,8,8,0.5)] px-2" aria-label="Sections du dashboard">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`relative inline-flex items-center gap-2 whitespace-nowrap px-4 py-3 text-[0.86rem] font-semibold transition-colors ${
                tab === t.id ? "text-[#4fb3a1]" : "text-[#666] hover:text-[#a0a0a0]"
              }`}
              aria-selected={tab === t.id}
              role="tab"
            >
              {t.icon}
              {t.label}
              {tab === t.id && (
                <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-t bg-[#e63946]" />
              )}
            </button>
          ))}
        </nav>
      </header>

      {/* Corps */}
      <main className="flex-1">
        <div className="container-arsenal flex flex-col gap-5 py-6">
          {tab === "products" && <ProductsTab products={products} apiAvailable={apiAvailable} reload={reload} />}
          {tab === "media" && <MediaTab products={products} apiAvailable={apiAvailable} />}
          {tab === "analytics" && <AnalyticsTab apiAvailable={apiAvailable} />}
          {tab === "affiliates" && (
            <AffiliatesTab apiAvailable={apiAvailable} products={products} />
          )}
          {tab === "purchases" && <PurchasesTab apiAvailable={apiAvailable} />}
          {tab === "chariow" && <ChariowTab apiAvailable={apiAvailable} products={products} />}
          {tab === "settings" && <SettingsTab apiAvailable={apiAvailable} onLogout={logout} />}
        </div>
      </main>

      <ToastHost />
    </div>
  );
}
