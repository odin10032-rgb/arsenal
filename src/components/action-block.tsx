"use client";

/**
 * Bloc d'action par type de produit — mécaniques répliquées du site validé :
 * - chariow : lien tunnel (label prix/gratuit) + tracking
 * - terminal : fenêtre terminal avec commande (custom ou git clone auto) + copie + lien repo
 * - mobile : APK download + PWA + instructions d'installation par plateforme
 */

import { useState } from "react";
import { Product, safeUrl } from "@/lib/products";
import { trackClick } from "@/lib/track";

/** Commande de repli si le produit terminal n'en définit pas */
function fallbackCommand(actionUrl: string): string {
  const clean = (actionUrl || "").replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(clean)) return "repo";
  const name = clean.split("/").pop()?.replace(/\.git$/i, "") || "repo";
  return `git clone ${clean} && cd ${name} && npm install`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

function TerminalBlock({ product }: { product: Product }) {
  const command = (product.command || "").trim() || fallbackCommand(product.actionUrl);
  const slug = product.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "arsenal";
  const [copied, setCopied] = useState(false);
  const repoUrl = safeUrl(product.actionUrl);

  const onCopy = async () => {
    if (await copyText(command)) {
      setCopied(true);
      trackClick(product.id, "command");
      setTimeout(() => setCopied(false), 2200);
    }
  };

  return (
    <div className="overflow-hidden rounded-[10px] border border-[#333] bg-[#0d0d0d]">
      <div className="flex items-center gap-2 border-b border-[#333] bg-[#141414] px-3.5 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-2 font-mono text-[0.68rem] tracking-wide text-[#666]">
          bash — {slug}
        </span>
      </div>
      <div className="p-4">
        <p className="flex flex-wrap items-baseline gap-2 break-all font-mono text-[0.8rem] leading-relaxed">
          <span className="flex-shrink-0 font-semibold text-[#2a9d8f]">$</span>
          <span className="text-[#7fd4c4]">{command}</span>
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#333] bg-[rgba(255,255,255,0.02)] px-4 py-3">
        <span className="inline-flex items-center rounded-full border border-dashed border-[#444] bg-[rgba(255,255,255,0.025)] px-2.5 py-1 font-mono text-[0.66rem] text-[#666]">
          {product.command ? "commande fournie par l'éditeur" : "commande auto-générée"}
        </span>
        <button type="button" onClick={onCopy} className="btn-arsenal btn-ghost btn-sm font-mono">
          {copied ? (
            <>
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                <path d="m5 13 4 4L19 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Copié !
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                <rect x="9" y="9" width="11" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
                <path d="M5 15V6a2 2 0 0 1 2-2h9" fill="none" stroke="currentColor" strokeWidth="2" />
              </svg>
              Copier la commande
            </>
          )}
        </button>
      </div>
      {repoUrl && (
        <div className="border-t border-[#333] px-4 py-3">
          <a
            href={repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackClick(product.id, "repo")}
            className="inline-flex items-center gap-1.5 text-[0.8rem] font-semibold text-[#4fb3a1] hover:underline"
          >
            Ouvrir le dépôt source
            <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
              <path d="M14 3h7v7M21 3 11 13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </a>
        </div>
      )}
    </div>
  );
}

const INSTALL_HINTS = [
  { platform: "Chrome / Edge (Android)", steps: "menu ⋮ puis « Installer l'application »." },
  { platform: "Safari (iOS)", steps: "bouton Partager ⊕ puis « Sur l'écran d'accueil »." },
  { platform: "Chrome / Safari (desktop)", steps: "icône ⊕ dans la barre d'adresse." },
];

function MobileBlock({ product }: { product: Product }) {
  const [showHint, setShowHint] = useState(false);
  const apkUrl = safeUrl(product.apkUrl || product.actionUrl);
  const pwaUrl = safeUrl(product.pwaUrl);

  return (
    <div className="flex flex-col gap-3">
      {apkUrl && (
        <a
          href={apkUrl}
          download
          onClick={() => trackClick(product.id, "apk")}
          className="btn-arsenal btn-primary"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Télécharger l&apos;APK
        </a>
      )}
      <button
        type="button"
        onClick={() => {
          trackClick(product.id, "pwa");
          if (pwaUrl) window.open(pwaUrl, "_blank", "noopener");
          else setShowHint(true);
        }}
        className="btn-arsenal btn-ghost"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <rect x="7" y="2" width="10" height="20" rx="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M11 18.5h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        Installer la PWA
      </button>
      {showHint && (
        <div className="rounded-[10px] border border-[#333] bg-[#141414] p-4 text-left">
          <p className="mb-2 text-[0.85rem] font-semibold">Installation depuis votre navigateur :</p>
          <div className="flex flex-col gap-1.5 text-[0.84rem] leading-relaxed text-[#a0a0a0]">
            {INSTALL_HINTS.map((h) => (
              <p key={h.platform}>
                <strong className="text-[#4fb3a1]">{h.platform}</strong> — {h.steps}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ActionBlock({ product }: { product: Product }) {
  const ctaUrl = safeUrl(product.actionUrl);

  if (product.actionType === "terminal") {
    return <TerminalBlock product={product} />;
  }
  if (product.actionType === "mobile") {
    return <MobileBlock product={product} />;
  }

  // Produit 100 % A (aucun tunnel externe) : aucune action ni note « Chariow » à afficher.
  if (!ctaUrl) return null;

  const isFree = product.badges.includes("gratuit") || /gratuit/i.test(product.price);
  return (
    <div className="flex flex-col gap-2">
      <a
        href={ctaUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackClick(product.id, "chariow")}
        className="btn-arsenal btn-primary"
      >
        {isFree ? "Accéder gratuitement" : `Obtenir l'accès — ${product.price}`}
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
          <path d="M5 12h14M12 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </a>
      <p className="font-mono text-[0.72rem] text-[#666]">
        {isFree
          ? "Accès direct, sans carte bancaire."
          : "Paiement sécurisé via Chariow — accès immédiat après validation."}
      </p>
    </div>
  );
}
