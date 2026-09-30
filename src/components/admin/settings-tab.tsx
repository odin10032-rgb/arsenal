"use client";

/**
 * Paramètres — GitHub (upload d'images), clé API Chariow (fulfillment automatique),
 * sécurité (mot de passe), données (export / import JSON), à propos.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  changeAdminPassword,
  fetchAdminSettings,
  saveAdminSetting,
  sha256hex,
} from "@/lib/admin";
import { Product } from "@/lib/products";
import { toast } from "@/lib/toast";

const GITHUB_KEY = "arsenal_github_config";

interface GithubConfig {
  repo: string;
  branch: string;
  folder: string;
  token: string;
}

export function SettingsTab({
  apiAvailable,
  onLogout,
}: {
  apiAvailable: boolean;
  onLogout: () => void;
}) {
  return (
    <section className="flex max-w-2xl flex-col gap-5">
      <GithubCard />
      <ChariowCard apiAvailable={apiAvailable} />
      <SecurityCard apiAvailable={apiAvailable} onLogout={onLogout} />
      <DataCard />
      <AboutCard apiAvailable={apiAvailable} />
    </section>
  );
}

/* ---------------- GitHub ---------------- */

function GithubCard() {
  const stored = readGithub();
  const [repo, setRepo] = useState(stored?.repo || "");
  const [branch, setBranch] = useState(stored?.branch || "main");
  const [folder, setFolder] = useState(stored?.folder || "arsenal-media");
  const [token, setToken] = useState(stored?.token || "");
  const [testing, setTesting] = useState(false);

  const save = () => {
    if (repo && !/^[\w.-]+\/[\w.-]+$/.test(repo)) return toast("Format attendu : propriétaire/nom-du-repo.", "error");
    if (token && !/^(ghp_|github_pat_)/.test(token)) return toast("Ce jeton ne ressemble pas à un PAT GitHub.", "error");
    const cfg: GithubConfig = { repo, branch: branch || "main", folder: folder || "arsenal-media", token };
    try {
      localStorage.setItem(GITHUB_KEY, JSON.stringify(cfg));
      toast("Configuration GitHub enregistrée.", "success");
    } catch {
      toast("Enregistrement local impossible.", "error");
    }
  };

  const test = async () => {
    if (testing) return;
    if (!repo) return toast("Renseignez d'abord le dépôt.", "error");
    setTesting(true);
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (res.status === 404) toast("Dépôt introuvable (404).", "error");
      else if (res.status === 401) toast("Jeton invalide (401).", "error");
      else if (res.ok) toast(`Connexion OK : ${repo}`, "success");
      else toast(`Réponse GitHub : ${res.status}`, "error");
    } catch {
      toast("GitHub injoignable.", "error");
    } finally {
      setTesting(false);
    }
  };

  return (
    <SettingsCard
      icon={
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.56 9.56 0 0 1 5 0c1.91-1.3 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85V21c0 .27.18.58.69.48A10 10 0 0 0 12 2z" />
        </svg>
      }
      title="Intégration GitHub"
      subtitle="Utilisée comme stockage des images téléversées (repli local si vide)."
    >
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <SettingsField label="Dépôt (propriétaire/nom)">
          <input className="input-arsenal font-mono text-[0.8rem]" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="odin10032-rgb/arsenal" />
        </SettingsField>
        <SettingsField label="Branche">
          <input className="input-arsenal font-mono text-[0.8rem]" value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" />
        </SettingsField>
        <SettingsField label="Dossier de stockage">
          <input className="input-arsenal font-mono text-[0.8rem]" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="arsenal-media" />
        </SettingsField>
        <SettingsField label="Jeton d'accès personnel (PAT)">
          <input className="input-arsenal font-mono text-[0.8rem]" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="ghp_…" />
        </SettingsField>
      </div>
      <div className="flex gap-2.5">
        <button type="button" onClick={save} className="btn-arsenal btn-primary btn-sm">
          Enregistrer
        </button>
        <button type="button" onClick={test} disabled={testing} className="btn-arsenal btn-ghost btn-sm">
          {testing && <span className="spin" />}
          Tester la connexion
        </button>
      </div>
    </SettingsCard>
  );
}

/* ---------------- Clé API Chariow (Phase 2.6) ---------------- */

/**
 * Clé API Chariow — indispensable au fulfillment automatique (`chariow_free_checkout`).
 * La valeur n'est jamais renvoyée par l'API : on n'affiche qu'un état « configurée » quand le
 * backend l'indique (drapeau `chariow_api_key_configured` ou champ masqué), sinon « inconnu ».
 */
function ChariowCard({ apiAvailable }: { apiAvailable: boolean }) {
  const [value, setValue] = useState("");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [stateLoading, setStateLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadState = useCallback(async () => {
    if (!apiAvailable) {
      setConfigured(null);
      setStateLoading(false);
      return;
    }
    setStateLoading(true);
    try {
      const settings = await fetchAdminSettings();
      setConfigured(settings.chariowApiKeyConfigured);
    } catch {
      // État inconnu (route absente ou backend injoignable) — aucune valeur n'est inventée
      setConfigured(null);
    } finally {
      setStateLoading(false);
    }
  }, [apiAvailable]);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  const save = async () => {
    if (busy) return;
    if (!apiAvailable) return toast("Configuration possible uniquement avec le backend connecté.", "error");
    if (!value.trim()) return toast("Collez d'abord la clé API Chariow.", "error");
    setBusy(true);
    try {
      await saveAdminSetting("chariow_api_key", value.trim());
      toast("Clé API Chariow enregistrée — elle n'est plus relisible en clair.", "success");
      setValue("");
      await loadState();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Enregistrement impossible.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsCard
      icon={
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 7a4 4 0 1 1-3.5 5.9L4 20.4V17H6v-2h2l1.1-1.1A4 4 0 0 1 15 7z" />
          <path d="M16.5 10.5h.01" />
        </svg>
      }
      title="Clé API Chariow"
      subtitle="Nécessaire au fulfillment automatique des achats en A (méthode « checkout produit gratuit »). La clé n'est jamais renvoyée en clair par l'API ; enregistrer une nouvelle valeur remplace l'ancienne."
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[0.66rem]"
          style={
            stateLoading
              ? { color: "#a0a0a0", borderColor: "#333", background: "#141414" }
              : configured === true
                ? { color: "#56b8a8", borderColor: "rgba(42,157,143,0.4)", background: "rgba(42,157,143,0.08)" }
                : configured === false
                  ? { color: "#f4a261", borderColor: "rgba(244,162,97,0.4)", background: "rgba(244,162,97,0.08)" }
                  : { color: "#a0a0a0", borderColor: "#333", background: "#141414" }
          }
        >
          {stateLoading
            ? "Vérification…"
            : configured === true
              ? "Clé configurée"
              : configured === false
                ? "Aucune clé configurée"
                : "État non communiqué par le backend"}
        </span>
        <button type="button" onClick={() => void loadState()} disabled={stateLoading} className="btn-arsenal btn-ghost btn-sm">
          {stateLoading && <span className="spin" />}
          Vérifier
        </button>
      </div>

      <SettingsField label="Nouvelle clé (sk_live_…)">
        <input
          className="input-arsenal font-mono text-[0.8rem]"
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="sk_live_…"
          autoComplete="off"
        />
      </SettingsField>

      <div className="flex flex-wrap gap-2.5">
        <button type="button" onClick={save} disabled={busy} className="btn-arsenal btn-primary btn-sm">
          {busy && <span className="spin" />}
          Enregistrer la clé
        </button>
      </div>

      <p className="text-[0.72rem] leading-relaxed text-[#666]">
        Le fulfillment automatique exige aussi un produit Chariow en modèle de tarification
        « Gratuit » et l&apos;id renseigné dans le formulaire produit. Sans clé, les commandes
        passent en échec avec le motif « Clé API Chariow non configurée » et l&apos;équipe peut
        toujours livrer manuellement depuis l&apos;onglet Commandes.
      </p>
    </SettingsCard>
  );
}

/* ---------------- Sécurité ---------------- */

function SecurityCard({ apiAvailable, onLogout }: { apiAvailable: boolean; onLogout: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    if (next.length < 8) return toast("Le nouveau mot de passe doit faire 8 caractères minimum.", "error");
    if (next !== confirm) return toast("La confirmation ne correspond pas.", "error");
    setBusy(true);
    try {
      if (apiAvailable) {
        // Vérification locale du mot de passe actuel : token = sha256(mot de passe actuel)
        const { readAdminToken } = await import("@/lib/products");
        const hash = await sha256hex(current);
        if (hash !== readAdminToken()) {
          toast("Mot de passe actuel incorrect.", "error");
          return;
        }
        const token = await changeAdminPassword(next);
        const { writeAdminToken } = await import("@/lib/products");
        writeAdminToken(token);
        toast("Mot de passe modifié — session mise à jour.", "success");
        setCurrent("");
        setNext("");
        setConfirm("");
      } else {
        toast("Changement possible uniquement avec le backend connecté.", "error");
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Changement impossible.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsCard
      icon={
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      }
      title="Sécurité"
      subtitle="Mot de passe du dashboard — modifiable uniquement avec le backend connecté."
    >
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        <SettingsField label="Mot de passe actuel">
          <input className="input-arsenal" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        </SettingsField>
        <SettingsField label="Nouveau (8 car. min)">
          <input className="input-arsenal" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        </SettingsField>
        <SettingsField label="Confirmer">
          <input className="input-arsenal" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </SettingsField>
      </div>
      <button type="button" onClick={submit} disabled={busy} className="btn-arsenal btn-primary btn-sm w-fit">
        {busy && <span className="spin" />}
        Modifier le mot de passe
      </button>
    </SettingsCard>
  );
}

/* ---------------- Données ---------------- */

function DataCard() {
  const fileRef = useRef<HTMLInputElement>(null);

  const exportJson = async () => {
    const { apiFetch } = await import("@/lib/api");
    try {
      const res = await apiFetch<{ products: Product[] }>("/api/products", { timeoutMs: 6000 });
      const payload = {
        app: "Arsenal Tools",
        version: "3.0",
        exportedAt: new Date().toISOString(),
        products: res.products,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `arsenal-catalogue-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast("Catalogue exporté.", "success");
    } catch {
      toast("Export impossible (API injoignable).", "error");
    }
  };

  const importJson = async (file: File | undefined | null) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const items: Product[] = Array.isArray(parsed) ? parsed : parsed.products;
      if (!Array.isArray(items)) throw new Error("Format attendu : tableau ou {products:[…]}");
      const valid = items.filter((p) => p.title && p.imageUrl);
      if (valid.length === 0) throw new Error("Aucun produit valide dans ce fichier.");
      const { apiFetch: api } = await import("@/lib/api");
      for (const p of valid) {
        await api("/api/products", { method: "POST", body: p, auth: true, timeoutMs: 8000 });
      }
      toast(`${valid.length} produit(s) importé(s). Rechargez la page.`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Import impossible.", "error");
    }
  };

  const resetLocal = () => {
    try {
      ["arsenal_catalog_cache_v3", "arsenal_products_v3", "arsenal_analytics_v3"].forEach((k) =>
        localStorage.removeItem(k),
      );
      toast("Cache local purgé.", "success");
    } catch {
      toast("Purge impossible.", "error");
    }
  };

  return (
    <SettingsCard
      icon={
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 16V4m0 0 4 4m-4-4-4 4M4 20h16" />
        </svg>
      }
      title="Données"
      subtitle="Sauvegarde et restauration du catalogue au format JSON."
    >
      <div className="flex flex-wrap gap-2.5">
        <button type="button" onClick={exportJson} className="btn-arsenal btn-ghost btn-sm">
          Exporter le catalogue
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} className="btn-arsenal btn-ghost btn-sm">
          Importer un fichier JSON
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => void importJson(e.target.files?.[0])}
        />
        <button type="button" onClick={resetLocal} className="btn-arsenal btn-danger btn-sm">
          Purger le cache local
        </button>
      </div>
    </SettingsCard>
  );
}

/* ---------------- À propos ---------------- */

function AboutCard({ apiAvailable }: { apiAvailable: boolean }) {
  return (
    <SettingsCard
      icon={
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8h.01M12 11v5" strokeLinecap="round" />
        </svg>
      }
      title="À propos"
    >
      <div className="flex flex-col gap-1.5 font-mono text-[0.76rem] leading-relaxed text-[#666]">
        <p>
          Arsenal Tools v3.0 — front Next.js (export statique), backend Worker + D1.
        </p>
        <p>
          Mode : <b style={{ color: apiAvailable ? "#56b8a8" : "#f4a261" }}>
            {apiAvailable ? "backend connecté (données partagées)" : "local (cache navigateur)"}
          </b>
        </p>
        <p>Cache catalogue : {typeof localStorage !== "undefined" && localStorage.getItem("arsenal_catalog_cache_v3") ? "actif" : "vierge"}</p>
      </div>
    </SettingsCard>
  );
}

/* ---------------- Briques partagées ---------------- */

function SettingsCard({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[#333] bg-[#141414] p-5">
      <h3 className="mb-1 flex items-center gap-2.5 text-[1rem] font-semibold">
        <span className="text-[#f0808a]">{icon}</span>
        {title}
      </h3>
      {subtitle && <p className="mb-4 text-[0.78rem] leading-relaxed text-[#666]">{subtitle}</p>}
      <div className="flex flex-col gap-3.5">{children}</div>
    </div>
  );
}

function SettingsField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[0.76rem] font-semibold text-[#a0a0a0]">{label}</span>
      {children}
    </label>
  );
}

function readGithub(): GithubConfig | null {
  try {
    const raw = localStorage.getItem(GITHUB_KEY);
    return raw ? (JSON.parse(raw) as GithubConfig) : null;
  } catch {
    return null;
  }
}
