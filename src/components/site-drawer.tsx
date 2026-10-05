"use client";

/**
 * Sidebar / menu secondaire (refonte 05/10, spec §8-9).
 *
 * Drawer latéral droit, discret, ouvert par le bouton ☰ du header.
 * Il regroupe TOUT ce qui est important mais secondaire :
 *   Compte       — compte, panier, portefeuille, produits, affiliation
 *   Communauté   — rejoindre Telegram (si le lien est configuré en admin)
 *   Apparence    — Système / Clair / Sombre
 *   Langue       — FR / EN
 *   Informations — pages légales
 *
 * Fermeture : bouton ✕, clic sur l'overlay, touche Échap, ou navigation.
 * Le défilement de la page est verrouillé pendant l'ouverture.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { useUser } from "@/hooks/use-user";
import { apiFetch } from "@/lib/api";
import { LANGUAGES, useI18n } from "@/lib/i18n";
import { useTheme, type ThemePref } from "@/lib/theme";

export function SiteDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useUser();
  const { t, lang, setLang } = useI18n();
  const { pref, setPref } = useTheme();
  // Lien Telegram : réglage public (admin → Paramètres → Communauté).
  // Absent = la section Communauté n'est pas affichée (jamais de lien inventé).
  const [telegramUrl, setTelegramUrl] = useState<string>("");

  useEffect(() => {
    if (!open || telegramUrl) return;
    let cancelled = false;
    apiFetch<{ telegramUrl?: string }>("/api/site-config", { timeoutMs: 4000 })
      .then((res) => {
        if (!cancelled && typeof res.telegramUrl === "string") setTelegramUrl(res.telegramUrl);
      })
      .catch(() => {
        /* API injoignable : la section reste masquée */
      });
    return () => {
      cancelled = true;
    };
  }, [open, telegramUrl]);

  // Échap ferme le menu ; défilement verrouillé tant qu'il est ouvert.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  const isAffiliate = user?.role === "affiliate" || user?.role === "super_affiliate";

  const rowClass =
    "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[0.9rem] text-tx2 transition-colors hover:bg-panel hover:text-tx1";

  return (
    <div
      className="fixed inset-0 z-[120]"
      role="dialog"
      aria-modal="true"
      aria-label={t("menu_title")}
    >
      {/* Voile — le clic ferme */}
      <div
        className="absolute inset-0 bg-[var(--overlay)]"
        onClick={onClose}
        aria-hidden="true"
      />

      <aside className="absolute inset-y-0 right-0 flex w-[min(88vw,360px)] flex-col border-l border-line bg-s1 shadow-[-24px_0_60px_rgba(0,0,0,0.35)]">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <p className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-tx3">
            {t("menu_title")}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("menu_close_aria")}
            className="grid h-9 w-9 place-items-center rounded-full border border-line bg-s2 text-tx2 transition-colors hover:border-line2 hover:text-tx1"
          >
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 py-3">
          {/* ---------- Compte ---------- */}
          <Section title={t("drawer_account")} first>
            {user ? (
              <>
                <Link href="/compte/" className={rowClass} onClick={onClose}>
                  {t("drawer_account_page")}
                </Link>
                <Link href="/compte/panier/" className={rowClass} onClick={onClose}>
                  {t("drawer_cart")}
                </Link>
                <Link href="/compte/portefeuille/" className={rowClass} onClick={onClose}>
                  {t("drawer_wallet")}
                </Link>
                <Link href="/compte/produits/" className={rowClass} onClick={onClose}>
                  {t("drawer_mine")}
                </Link>
                <Link
                  href={isAffiliate ? "/affilie/" : "/affiliation/"}
                  className={rowClass}
                  onClick={onClose}
                >
                  {isAffiliate ? t("drawer_affiliate") : t("drawer_become_affiliate")}
                </Link>
              </>
            ) : (
              <>
                <Link href="/connexion/" className={rowClass} onClick={onClose}>
                  {t("drawer_login")}
                </Link>
                <Link href="/inscription/" className={rowClass} onClick={onClose}>
                  {t("drawer_register")}
                </Link>
                <Link href="/affiliation/" className={rowClass} onClick={onClose}>
                  {t("drawer_become_affiliate")}
                </Link>
              </>
            )}
          </Section>

          {/* ---------- Communauté ---------- */}
          {telegramUrl && (
            <Section title={t("drawer_community")}>
              <a
                href={telegramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={rowClass}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className="text-[#2a9d8f]">
                  <path
                    d="M21.9 4.6 19 19.3c-.2 1-.8 1.2-1.6.8l-4.4-3.2-2.1 2c-.2.2-.4.4-.9.4l.3-4.5 8.2-7.4c.4-.3-.1-.5-.6-.2L7.8 12.8l-4.3-1.4c-.9-.3-.9-.9.2-1.3L20.5 3.3c.8-.3 1.5.2 1.4 1.3z"
                    fill="currentColor"
                  />
                </svg>
                {t("drawer_telegram")}
                <span className="ml-auto text-tx3" aria-hidden="true">↗</span>
              </a>
            </Section>
          )}

          {/* ---------- Apparence ---------- */}
          <Section title={t("drawer_appearance")}>
            <div className="flex gap-1.5 px-1 pt-1">
              {(
                [
                  { id: "system", label: t("theme_system") },
                  { id: "light", label: t("theme_light") },
                  { id: "dark", label: t("theme_dark") },
                ] as { id: ThemePref; label: string }[]
              ).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setPref(option.id)}
                  aria-pressed={pref === option.id}
                  className={`flex-1 rounded-lg border px-2 py-2 text-[0.82rem] font-semibold transition-colors ${
                    pref === option.id
                      ? "border-[rgba(230,57,70,0.5)] bg-[rgba(230,57,70,0.08)] text-tx1"
                      : "border-line text-tx2 hover:border-line2 hover:text-tx1"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </Section>

          {/* ---------- Langue ---------- */}
          <Section title={t("drawer_language")}>
            <div className="flex gap-1.5 px-1 pt-1">
              {LANGUAGES.map(({ code, label }) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLang(code)}
                  aria-pressed={lang === code}
                  aria-label={label}
                  className={`flex-1 rounded-lg border px-2 py-2 font-mono text-[0.82rem] font-semibold transition-colors ${
                    lang === code
                      ? "border-[rgba(230,57,70,0.5)] bg-[rgba(230,57,70,0.08)] text-tx1"
                      : "border-line text-tx2 hover:border-line2 hover:text-tx1"
                  }`}
                >
                  {code.toUpperCase()}
                </button>
              ))}
            </div>
          </Section>

          {/* ---------- Informations ---------- */}
          <Section title={t("drawer_info")} last>
            <Link href="/confidentialite/" className={rowClass} onClick={onClose}>
              {t("footer_privacy")}
            </Link>
            <Link href="/conditions/" className={rowClass} onClick={onClose}>
              {t("footer_terms")}
            </Link>
            <Link href="/mentions-legales/" className={rowClass} onClick={onClose}>
              {t("footer_notice")}
            </Link>
          </Section>
        </nav>
      </aside>
    </div>
  );
}

function Section({
  title,
  children,
  first,
  last,
}: {
  title: string;
  children: React.ReactNode;
  first?: boolean;
  last?: boolean;
}) {
  return (
    <section className={`${first ? "" : "border-t border-line "}${last ? "" : "pb-3 pt-3"}`}>
      <h2 className="px-2 pb-1 font-mono text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-tx3">
        {title}
      </h2>
      {children}
    </section>
  );
}
