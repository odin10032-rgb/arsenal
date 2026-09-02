/* ============================================================================
   BÊTA ARSENAL — app.js (v2.0)
   SPA monopage : catalogue public + modales produits à mécaniques par type
   + dashboard admin /#admin (CRUD, upload GitHub, médiathèque, analytics).
   100 % vanilla — aucune dépendance.
   ========================================================================== */
"use strict";

/* ============================== CONFIG ============================== */
const CONFIG = {
  APP_NAME: "Bêta Arsenal",
  VERSION: "2.0.0",
  /* Mot de passe admin par défaut (mode local). 
     Note : en production, le token est géré par l'API. */
  DEFAULT_ADMIN_PASSWORD: null,
  API_TIMEOUT: 2500,
  MAX_UPLOAD: 5 * 1024 * 1024,
  LS: {
    CATALOG: "ba_catalog_cache_v2",
    PRODUCTS: "ba_products_v2",
    ANALYTICS: "ba_analytics_v2",
    UPLOADS: "ba_uploads_v2",
    GITHUB: "ba_github_config",
    ADMIN_HASH: "ba_admin_hash",
  },
  SS: { TOKEN: "ba_admin_token" },
};

const CATEGORIES = {
  saas: "SaaS",
  desktop: "Desktop App",
  mobile: "Mobile App/PWA",
  ebook: "E-book",
  prompts: "Prompts & Automations",
};
const ACTION_TYPES = {
  chariow: "Abonnement / Tunnel (Chariow)",
  terminal: "Terminal / Commande (Desktop & CLI)",
  mobile: "App mobile (APK + PWA)",
};
const BADGES = ["gratuit", "premium", "beta", "nouveau"];
const BADGE_LABELS = { gratuit: "Gratuit", premium: "Premium", beta: "Bêta", nouveau: "Nouveau" };

/* ============================== ICÔNES ============================== */
const svgWrap = (inner, vb = "0 0 24 24") =>
  `<svg viewBox="${vb}" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const I = {
  zap: svgWrap('<path d="M13 2 4.5 14H11l-1 8 8.5-12H12l1-8z" fill="currentColor" stroke="none"/>'),
  search: svgWrap('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  lock: svgWrap('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  close: svgWrap('<path d="M6 6l12 12M18 6 6 18"/>'),
  copy: svgWrap('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>'),
  check: svgWrap('<path d="m5 13 4 4L19 7"/>'),
  download: svgWrap('<path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M4 19h16"/>'),
  play: svgWrap('<path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/>'),
  eye: svgWrap('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  cursor: svgWrap('<path d="m5 3 14 8-6.5 1.5L10 19z" fill="currentColor" stroke="none"/>'),
  package: svgWrap('<path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="M3 7l9 5 9-5M12 12v10"/>'),
  chart: svgWrap('<path d="M4 20V10m6 10V4m6 16v-7m4 7V8"/>'),
  settings: svgWrap('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  logout: svgWrap('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>'),
  edit: svgWrap('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  trash: svgWrap('<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>'),
  upload: svgWrap('<path d="M12 16V4m0 0 4 4m-4-4-4 4"/><path d="M4 20h16"/>'),
  image: svgWrap('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4 18 5-5 3 3 3-3 5 5"/>'),
  video: svgWrap('<rect x="3" y="5" width="13" height="14" rx="2"/><path d="m16 10 5-3v10l-5-3z"/>'),
  link: svgWrap('<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5"/>'),
  external: svgWrap('<path d="M14 3h7v7"/><path d="M21 3 11 13"/><path d="M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6"/>'),
  fire: svgWrap('<path d="M12 22c4 0 7-2.6 7-6.5 0-4-3-6-4-9.5-2.5 1.5-3 4-3 4s-.5-2-2-3.5c-.5 2-1 3-2.5 4.5S5 12.5 5 15.5C5 19.4 8 22 12 22z" fill="currentColor" stroke="none"/>'),
  calendar: svgWrap('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4m8-4v4M3 11h18"/>'),
  sparkles: svgWrap('<path d="M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.9 2.3 2.1.7-2.1.7-.9 2.3-.9-2.3-2.1-.7 2.1-.7z"/>'),
  refresh: svgWrap('<path d="M3 12a9 9 0 1 0 2.6-6.3L3 8"/><path d="M3 3v5h5"/>'),
  info: svgWrap('<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M12 11v5"/>'),
  warn: svgWrap('<path d="M12 3 2 20h20z"/><path d="M12 10v4m0 3h.01"/>'),
  github: svgWrap('<path d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.6 2.4 1.1 3 .9.1-.7.4-1.1.6-1.4-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.7 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.4 4.7-4.6 5 .4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5A10 10 0 0 0 12 2z"/>'),
  phone: svgWrap('<rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M11 18.5h2"/>'),
  monitor: svgWrap('<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/>'),
  book: svgWrap('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-2.5"/>'),
  bot: svgWrap('<rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 7V4m-5 8h.01M17 12h.01M9 16h6"/>'),
  heart: svgWrap('<path d="M12 21s-8-4.8-10.5-9C-0.2 8 2 4.5 5.5 4.5c2.2 0 3.7 1.2 4.5 2.3.8-1.1 2.3-2.3 4.5-2.3 3.5 0 5.7 3.5 4 7.5C20 16.2 12 21 12 21z"/>'),
};

/* ============================== UTILITAIRES ============================== */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
function fmt(n) {
  return new Intl.NumberFormat("fr-FR").format(Number(n) || 0);
}
function dayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}
function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  const d = Math.floor(s / 86400);
  if (d < 30) return `il y a ${d} j`;
  return new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}
function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "p-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

/* Hachage : sha256 si contexte sécurisé, sinon repli déterministe (démo). */
async function hashToken(input) {
  try {
    if (crypto.subtle) {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
    }
  } catch (e) { /* repli */ }
  let h1 = 0x811c9dc5, h2 = 0x1000193;
  const s = String(input) + "beta-arsenal-x64";
  let out = "";
  for (let i = 0; i < s.length; i++) {
    h1 = (h1 ^ s.charCodeAt(i)) * 16777619 >>> 0;
    h2 = (h2 + s.charCodeAt(i) * (i + 7)) >>> 0;
    if (i % 8 === 7) out += (h1 ^ h2).toString(16).padStart(8, "0");
  }
  while (out.length < 64) out += (h1 ^ h2 ^ out.length).toString(16).padStart(8, "0");
  return out.slice(0, 64);
}

/* Toasts */
function toast(msg, type = "info", ms = 3600) {
  const root = $("#toast-root");
  if (!root) return;
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.setAttribute("role", "status");
  const icon = type === "success" ? I.check : type === "error" ? I.warn : I.info;
  el.innerHTML = `${icon}<span>${esc(msg)}</span>`;
  root.appendChild(el);
  setTimeout(() => {
    el.classList.add("out");
    setTimeout(() => el.remove(), 320);
  }, ms);
}

/* Copie en 1 clic avec feedback visuel « Copié ! » */
async function copyText(text, btn) {
  let ok = false;
  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch (e) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0;top:-999px";
      document.body.appendChild(ta);
      ta.select();
      ok = document.execCommand("copy");
      ta.remove();
    } catch (e2) { ok = false; }
  }
  if (btn) {
    if (ok) {
      const original = btn.innerHTML;
      btn.innerHTML = `${I.check}<span>Copié !</span>`;
      btn.classList.add("copied");
      setTimeout(() => {
        btn.innerHTML = original;
        btn.classList.remove("copied");
      }, 2200);
    }
  }
  if (!ok) toast("Copie impossible — sélectionnez le texte manuellement.", "error");
  return ok;
}

/* localStorage / sessionStorage sûrs */
const store = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) {
      toast("Stockage local saturé — exportez puis réinitialisez les données.", "error", 5000);
      return false;
    }
  },
  del(key) { try { localStorage.removeItem(key); } catch (e) { /* noop */ } },
};
const session = {
  get(key) { try { return sessionStorage.getItem(key); } catch (e) { return null; } },
  set(key, v) { try { sessionStorage.setItem(key, v); } catch (e) { /* noop */ } },
  del(key) { try { sessionStorage.removeItem(key); } catch (e) { /* noop */ } },
};

/* Valide une URL (http/https/data:image) — bloque javascript: etc. */
function safeUrl(raw) {
  const s = String(raw || "").trim();
  if (/^(https?:\/\/|data:image\/)/i.test(s)) return s;
  if (/^\/[^/]/.test(s)) return s; /* URL relative (média auto-hébergé) */
  return "";
}

/* ============================== DONNÉES DE DÉPART ============================== */
const IMG = (n) => `https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/${n}`;
const DAY_MS = 86_400_000;
const ago = (d) => Date.now() - d * DAY_MS;

/* Même catalogue que le seed serveur — utilisé en mode local (déploiement
   statique sans backend) et comme première peinture avant l'API. */
const SEED_PRODUCTS = [
  {
    id: "neuroform-ai", title: "NeuroForm AI",
    shortDescription: "Le générateur de formulaires intelligents qui crée, teste et optimise vos formulaires en 30 secondes.",
    description: "NeuroForm IA génère des formulaires complets à partir d'une simple description textuelle, puis les optimise en continu grâce au machine learning. Les taux de conversion sont mesurés en temps réel et l'IA propose des variantes à tester (A/B testing automatique).\n\nFonctionnalités clés : génération par prompt, logique conditionnelle, analyse heatmap des champs, intégration Notion / Airtable / HubSpot et export webhook. Idéal pour les SaaS, les agences et les créateurs d'audience qui veulent des formulaires qui convertissent vraiment.",
    category: "saas", actionType: "chariow", badges: ["premium", "nouveau"],
    price: "14,90 €/mois", actionUrl: "https://checkout.chariow.com/neuroform-pro",
    videoUrl: "https://www.youtube.com/watch?v=1FUcniACzmc", imageUrl: IMG("54ae361e5a6f.webp"),
    clicks: 0, createdAt: ago(6), updatedAt: ago(2),
  },
  {
    id: "pixelpeek", title: "PixelPeek API",
    shortDescription: "API de captures d'écran pixel-perfect de n'importe quelle page web, en 200 ms.",
    description: "PixelPeek transforme n'importe quelle URL en capture d'écran haute définition via une simple requête REST. Rendu Chrome headless, émulation mobile, injection de cookies, blocage des pop-ups et attente de sélecteur avant capture.\n\nLe plan gratuit offre 500 captures/mois sans carte bancaire. Utilisé par des équipes produit pour la veille concurrentielle, la modération de contenus et la documentation automatisée. Documentation claire, SDK JavaScript et Python inclus.",
    category: "saas", actionType: "chariow", badges: ["gratuit", "beta"],
    price: "Gratuit", actionUrl: "https://checkout.chariow.com/pixelpeek-free",
    videoUrl: "https://www.youtube.com/watch?v=Tn6-PIqc4UM", imageUrl: IMG("e5d6942c6b49.png"),
    clicks: 0, createdAt: ago(34), updatedAt: ago(12),
  },
  {
    id: "clipforge", title: "ClipForge",
    shortDescription: "Gestionnaire de presse-papiers pour développeurs : historique infini, snippets et recherche instantanée.",
    description: "ClipForge garde en mémoire chaque élément copié (texte, code, couleurs, images) avec un historique illimité et une recherche instantanée par mot-clé ou par application source. Les snippets récurrents deviennent des modèles réutilisables avec placeholders.\n\nApplication desktop native multi-plateforme (Windows, macOS, Linux), démarrage au lancement, mode « incognito » automatique pour les mots de passe. Léger : moins de 40 Mo en RAM. Installation en une seule ligne de commande.",
    category: "desktop", actionType: "terminal", badges: ["nouveau", "gratuit"],
    price: "Gratuit", actionUrl: "https://github.com/beta-arsenal/clipforge",
    command: "curl -fsSL https://clipforge.sh/install | bash", videoUrl: null,
    imageUrl: IMG("49eb45023c1e.jpg"), clicks: 0, createdAt: ago(9), updatedAt: ago(3),
  },
  {
    id: "termvault", title: "TermVault",
    shortDescription: "Coffre-fort de mots de passe en ligne de commande, chiffré localement, compatible teams.",
    description: "TermVault ramène la sécurité au terminal : vos secrets sont chiffrés localement (AES-256-GCM, clé maîtresse dérivée via Argon2) puis synchronisés de bout en bout. Aucun serveur tiers n'accède à vos données en clair.\n\nCommandes courtes (tv get, tv put, tv rotate), génération de mots de passe, injection directe dans les variables d'environnement de vos shells et CI. Le mode team permet de partager des secrets par projet avec audit des accès. Licence à vie, mises à jour incluses 1 an.",
    category: "desktop", actionType: "terminal", badges: ["premium"],
    price: "9,90 € — licence", actionUrl: "https://github.com/beta-arsenal/termvault",
    command: "npx termvault init --secure", videoUrl: null,
    imageUrl: IMG("164df61d5fa8.jpg"), clicks: 0, createdAt: ago(48), updatedAt: ago(20),
  },
  {
    id: "reposentinel", title: "RepoSentinel",
    shortDescription: "Scanner CLI qui audite vos dépôts GitHub : secrets exposés, dépendances vulnérables, mauvaises pratiques.",
    description: "RepoSentinel analyse vos dépôts en local avant chaque push et bloque les fuites de secrets (clés API, tokens, certificats) grâce à plus de 140 motifs de détection. Il vérifie aussi les dépendances vulnérables (CVE) et signale les fichiers trop permissifs.\n\nConfiguration zéro : détecte automatiquement les stacks (Node, Python, Go, PHP). Sortie lisible avec suggestions de correction, mode CI/CD inclus. Aucune donnée n'est envoyée en ligne — tout reste sur votre machine.",
    category: "desktop", actionType: "terminal", badges: ["beta"],
    price: "Gratuit", actionUrl: "https://github.com/beta-arsenal/reposentinel",
    command: null, videoUrl: null, imageUrl: IMG("ae049cb21c9e.jpg"),
    clicks: 0, createdAt: ago(21), updatedAt: ago(7),
  },
  {
    id: "hydrotrack", title: "HydroTrack",
    shortDescription: "Suivi d'hydratation gamifié : rappels intelligents, badges et widgets d'écran d'accueil.",
    description: "HydroTrack vous aide à boire régulièrement sans y penser : objectifs personnalisés selon votre poids et votre activité, rappels adaptatifs (pas pendant vos réunions !), badges de série et animations célébrant chaque palier.\n\nPWA ultra-légère (< 200 Ko) installable depuis n'importe quel navigateur, ou APK natif pour Android avec synchronisation offline. Le widget d'écran d'accueil affiche votre progression du jour d'un coup d'œil. 100 % gratuit, sans publicité et sans compte requis.",
    category: "mobile", actionType: "mobile", badges: ["gratuit", "nouveau"],
    price: "Gratuit", actionUrl: "https://cdn.betaarsenal.dev/hydrotrack/hydrotrack-v2.3.1.apk",
    apkUrl: "https://cdn.betaarsenal.dev/hydrotrack/hydrotrack-v2.3.1.apk",
    pwaUrl: "https://hydrotrack.betaarsenal.dev", command: null,
    videoUrl: "https://www.tiktok.com/@drjadeofficial/video/7550286763244211478",
    imageUrl: IMG("e22dd04629fc.png"), clicks: 0, createdAt: ago(4), updatedAt: ago(1),
  },
  {
    id: "fokusflow", title: "FokusFlow",
    shortDescription: "Minuteur Pomodoro avec son ambiant génératif et statistiques de concentration profonde.",
    description: "FokusFlow va plus loin que le simple Pomodoro : il génère des paysages sonores adaptatifs (pluie, café, brown noise) dont l'intensité suit vos cycles de concentration, et mesure votre « temps de focus profond » réel grâce à l'analyse des interruptions.\n\nStatistiques hebdomadaires, synchronisation multi-appareils, mode strict qui bloque les distractions pendant les sessions de travail. La version Premium débloque les scènes sonores infinies, le suivi de projets et l'export CSV. Disponible en PWA installable et en APK Android.",
    category: "mobile", actionType: "mobile", badges: ["premium", "nouveau"],
    price: "4,99 €", actionUrl: "https://cdn.betaarsenal.dev/fokusflow/fokusflow-v1.8.0.apk",
    apkUrl: "https://cdn.betaarsenal.dev/fokusflow/fokusflow-v1.8.0.apk",
    pwaUrl: "https://fokusflow.betaarsenal.dev", command: null,
    videoUrl: "https://www.youtube.com/shorts/2g6cb23U9J8",
    imageUrl: IMG("7afbefd162ec.png"), clicks: 0, createdAt: ago(12), updatedAt: ago(2),
  },
  {
    id: "dev-independant", title: "Le Dev Indépendant",
    shortDescription: "E-book de 230 pages : lancez une activité de développeur solo rentable en 90 jours.",
    description: "La méthode complète pour passer de salarié à développeur indépendant sans y perdre : positionnement, tarification au valeur, prospection par contenu, gestion administrative (statuts, URSSAF, TVA) et automatisation de la production.\n\n230 pages illustrées, 14 modèles prêts à l'emploi (propositions commerciales, contrats, e-mails de relance), 6 études de cas de devs français et un plan d'action jour par jour sur 90 jours. Formats PDF, ePub et Notion offerts. Mise à jour gratuite à vie.",
    category: "ebook", actionType: "chariow", badges: ["premium"],
    price: "19,90 €", actionUrl: "https://checkout.chariow.com/dev-independant",
    command: null, videoUrl: "https://www.youtube.com/watch?v=CRsOXaofPmk",
    imageUrl: IMG("69cbc29afeb8.jpg"), clicks: 0, createdAt: ago(62), updatedAt: ago(15),
  },
  {
    id: "prompt-alchemy", title: "Prompt Alchemy",
    shortDescription: "Mini-guide gratuit : les 12 principes pour écrire des prompts qui produisent des résultats exploitables.",
    description: "Un e-book court et dense (42 pages) qui décortique l'anatomie d'un prompt efficace : rôle, contexte, contraintes, format de sortie et exemples few-shot. Chaque principe est illustré d'un avant/après mesurable sur GPT-4, Claude et Gemini.\n\nInclut la checklist « Prompt-Ready » imprimable et le framework C.A.S.T. (Contexte, Action, Structure, Ton) utilisé par les équipes qui industrialisent leurs prompts. Gratuit, en français, sans inscription.",
    category: "ebook", actionType: "chariow", badges: ["gratuit", "nouveau"],
    price: "Gratuit", actionUrl: "https://checkout.chariow.com/prompt-alchemy-free",
    command: null, videoUrl: null, imageUrl: IMG("80d107990458.jpg"),
    clicks: 0, createdAt: ago(16), updatedAt: ago(5),
  },
  {
    id: "megapack-prompts", title: "MegaPack 500 Prompts",
    shortDescription: "500 prompts testés et catégorisés pour marketing, code, design et productivité — prêts à copier.",
    description: "Le MegaPack réunit 500 prompts professionnels testés sur des projets réels, classés en 8 catégories (SEO, copywriting, développement, design, analyse de données, e-mailing, support client, automatisation). Chaque fiche indique le modèle recommandé, les variables à personnaliser et le résultat attendu.\n\nLivré en Notion + fichier JSON importable dans vos outils favoris (ChatGPT projets, Claude, Raycast). Mises à jour mensuelles avec les nouveaux prompts de la communauté. Licence d'équipe incluse jusqu'à 5 utilisateurs.",
    category: "prompts", actionType: "chariow", badges: ["premium"],
    price: "12,90 €", actionUrl: "https://checkout.chariow.com/megapack-500",
    command: null, videoUrl: null, imageUrl: IMG("8c880c42cd05.png"),
    clicks: 0, createdAt: ago(40), updatedAt: ago(9),
  },
  {
    id: "flowbridge-n8n", title: "FlowBridge — Pack n8n",
    shortDescription: "40 workflows n8n prêts à l'emploi : CRM, facturation, veille, publication sociale et support.",
    description: "FlowBridge est une collection open-source de 40 workflows n8n documentés et versionnés, prêts à importer en un clic. Chaque workflow est accompagné d'un guide d'installation, des variables d'environnement attendues et d'une vidéo de démonstration.\n\nCatégories couvertes : synchronisation CRM, relances de facturation, veille concurrentielle automatisée, publication multi-réseaux, triage du support avec réponses assistées par IA. Le dépôt est mis à jour chaque semaine par la communauté. Clonez, configurez, automatisez.",
    category: "prompts", actionType: "terminal", badges: ["beta", "gratuit"],
    price: "Gratuit", actionUrl: "https://github.com/beta-arsenal/flowbridge-templates",
    command: null, videoUrl: null, imageUrl: IMG("c454051a78ff.jpg"),
    clicks: 0, createdAt: ago(8), updatedAt: ago(1),
  },
  {
    id: "zenpost", title: "ZenPost",
    shortDescription: "Planificateur social qui écrit, programme et recycle vos contenus sur 6 réseaux.",
    description: "ZenPost centralise votre production de contenu : rédaction assistée par IA calée sur votre voix de marque, calendrier visuel, publication programmée sur X, LinkedIn, Instagram, TikTok, Bluesky et Threads, et recyclage intelligent de vos meilleurs posts.\n\nLa file d'attente « Evergreen » republie automatiquement vos contenus performants avec des variations générées. Statistiques unifiées par réseau et meilleur moment de publication calculé sur votre audience. Essai 14 jours sans carte bancaire.",
    category: "saas", actionType: "chariow", badges: ["beta"],
    price: "7,90 €/mois", actionUrl: "https://checkout.chariow.com/zenpost-trial",
    command: null, videoUrl: null, imageUrl: IMG("ed37f985b3b9.jpg"),
    clicks: 0, createdAt: ago(27), updatedAt: ago(10),
  },
];

const SEED_BASE_CLICKS = {
  "neuroform-ai": 87, pixelpeek: 152, clipforge: 64, termvault: 41, reposentinel: 29,
  hydrotrack: 203, fokusflow: 118, "dev-independant": 96, "prompt-alchemy": 77,
  "megapack-prompts": 134, "flowbridge-n8n": 58, zenpost: 45,
};
function seedAnalyticsLocal() {
  const clicksByProduct = { ...SEED_BASE_CLICKS };
  const visitsByDay = {};
  [182, 214, 196, 243, 268, 312, 287].forEach((v, i) => {
    visitsByDay[dayKey(new Date(Date.now() - i * DAY_MS))] = v;
  });
  return {
    visits: 1247,
    actionsTotal: Object.values(SEED_BASE_CLICKS).reduce((a, b) => a + b, 0),
    clicksByProduct, visitsByDay, recentVisits: [Date.now()], updatedAt: Date.now(),
  };
}

/* ============================== ÉTAT GLOBAL ============================== */
const state = {
  view: "public",
  products: [],
  catalogVersion: null,
  filters: { q: "", category: "all", badges: [], sort: "popular" },
  api: { available: false, checked: false },
  admin: {
    authed: false, token: null, tab: "products",
    editingId: null, formOpen: false,
    listQ: "", mediaFilter: "all", mediaQ: "",
    analyticsTimer: null, analyticsBusy: false,
  },
};

/* ============================== COUCHE API (hybride) ============================== */
async function apiFetch(path, { method = "GET", body, formData, headers = {}, timeout = CONFIG.API_TIMEOUT, auth = false } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout * (method !== "GET" ? 4 : 1));
  try {
    const h = { ...headers };
    if (auth) {
      const token = state.admin.token || session.get(CONFIG.SS.TOKEN);
      if (token) h["X-Admin-Auth"] = token;
    }
    const opts = { method, headers: h, signal: ctrl.signal };
    if (formData) opts.body = formData;
    else if (body !== undefined) {
      h["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(path, opts);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(json.error || `Erreur ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return json;
  } finally {
    clearTimeout(t);
  }
}

async function detectApi() {
  state.api.checked = true;
  try {
    await apiFetch("/api/health", { timeout: 2200 });
    state.api.available = true;
  } catch (e) {
    state.api.available = false;
  }
  return state.api.available;
}

/* ---------- Catalogue : cache localStorage → première peinture instantanée,
   puis rafraîchissement arrière-plan depuis l'API (stale-while-revalidate). ---------- */
function loadCatalogSync() {
  const cache = store.get(CONFIG.LS.CATALOG, null);
  if (cache && Array.isArray(cache.products)) {
    state.products = cache.products;
    state.catalogVersion = cache.version || null;
    return true;
  }
  const local = store.get(CONFIG.LS.PRODUCTS, null);
  if (local && Array.isArray(local) && local.length) {
    state.products = local;
  } else {
    state.products = SEED_PRODUCTS.map((p) => ({ ...p }));
    store.set(CONFIG.LS.PRODUCTS, state.products);
  }
  return false;
}

function cacheCatalog(products, version) {
  store.set(CONFIG.LS.CATALOG, { version, products, ts: Date.now() });
}

async function refreshCatalog({ silent = true } = {}) {
  if (!state.api.available) {
    state.products = localProducts();
    renderGrid();
    renderHeroStats();
    return;
  }
  try {
    const data = await apiFetch("/api/products", { timeout: 4000 });
    if (data && Array.isArray(data.products)) {
      if (data.version !== state.catalogVersion || !silent) {
        state.products = data.products;
        state.catalogVersion = data.version;
        cacheCatalog(data.products, data.version);
        renderGrid();
        renderHeroStats();
        if (state.view === "admin" && state.admin.tab === "products") renderAdminProducts();
        if (state.view === "admin" && state.admin.tab === "media") renderMediaLibrary();
      }
    }
  } catch (e) { /* mode dégradé : on garde le cache */ }
}

/* ---------- Persistance locale (mode statique sans backend) ---------- */
function localProducts() {
  const local = store.get(CONFIG.LS.PRODUCTS, null);
  if (local && Array.isArray(local) && local.length) return local;
  const seeded = SEED_PRODUCTS.map((p) => ({ ...p }));
  store.set(CONFIG.LS.PRODUCTS, seeded);
  return seeded;
}
function saveLocalProducts(list) {
  store.set(CONFIG.LS.PRODUCTS, list);
  state.products = list;
  cacheCatalog(list, "local-" + Date.now());
}
function localAnalytics() {
  return store.get(CONFIG.LS.ANALYTICS, null) || seedAnalyticsLocal();
}
function saveLocalAnalytics(a) { store.set(CONFIG.LS.ANALYTICS, a); }
function localUploads() { return store.get(CONFIG.LS.UPLOADS, []); }
function addLocalUpload(u) {
  const list = localUploads();
  list.unshift(u);
  store.set(CONFIG.LS.UPLOADS, list.slice(0, 60));
}

/* ---------- Suivi (visites & clics) — API si dispo, sinon local ---------- */
function trackVisit() {
  const local = localAnalytics();
  local.visits += 1;
  const key = dayKey();
  local.visitsByDay[key] = (local.visitsByDay[key] || 0) + 1;
  local.recentVisits = [...local.recentVisits.filter((t) => Date.now() - t < 60_000), Date.now()].slice(-500);
  saveLocalAnalytics(local);
  if (state.api.available) {
    apiFetch("/api/track", { method: "POST", body: { type: "visit" }, timeout: 1500 }).catch(() => {});
  }
}
function trackClick(productId, action = "open") {
  /* Mise à jour locale immédiate (réactivité du tri populaire) */
  const local = localAnalytics();
  local.actionsTotal += 1;
  local.clicksByProduct[productId] = (local.clicksByProduct[productId] || 0) + 1;
  saveLocalAnalytics(local);
  const p = state.products.find((x) => x.id === productId);
  if (p) p.clicks = (p.clicks || 0) + 1;
  if (state.api.available) {
    apiFetch("/api/track", { method: "POST", body: { type: "click", productId, action }, timeout: 1500 }).catch(() => {});
  }
  if (state.view === "admin" && state.admin.tab === "analytics") refreshAnalytics(true);
}

/* ---------- CRUD produits ---------- */
async function productCreate(data) {
  if (state.api.available) {
    await apiFetch("/api/products", { method: "POST", body: data, auth: true, timeout: 8000 });
    await refreshCatalog({ silent: false });
  } else {
    const now = Date.now();
    const p = { ...data, id: uuid(), clicks: 0, createdAt: now, updatedAt: now };
    const list = [p, ...localProducts()];
    saveLocalProducts(list);
    renderGrid(); renderHeroStats();
  }
}
async function productUpdate(id, data) {
  if (state.api.available) {
    await apiFetch(`/api/products/${encodeURIComponent(id)}`, { method: "PUT", body: data, auth: true, timeout: 8000 });
    await refreshCatalog({ silent: false });
  } else {
    const list = localProducts().map((p) => (p.id === id ? { ...p, ...data, updatedAt: Date.now() } : p));
    saveLocalProducts(list);
    renderGrid(); renderHeroStats();
  }
}
async function productDelete(id) {
  if (state.api.available) {
    await apiFetch(`/api/products/${encodeURIComponent(id)}`, { method: "DELETE", auth: true, timeout: 8000 });
    await refreshCatalog({ silent: false });
  } else {
    const list = localProducts().filter((p) => p.id !== id);
    saveLocalProducts(list);
    renderGrid(); renderHeroStats();
  }
}

/* ---------- Authentification admin ---------- */
async function adminLogin(password) {
  if (state.api.available) {
    const res = await apiFetch("/api/auth/login", { method: "POST", body: { password }, timeout: 6000 });
    return res.token;
  }
  /* Mode local : comparaison du hash (mot de passe par défaut ou personnalisé) */
  const custom = store.get(CONFIG.LS.ADMIN_HASH, null);
  const expected = custom || (await hashToken(CONFIG.DEFAULT_ADMIN_PASSWORD));
  const token = await hashToken(password);
  if (token !== expected) throw new Error("Mot de passe incorrect.");
  return token;
}
async function changeAdminPassword(next) {
  if (state.api.available) {
    const res = await apiFetch("/api/admin/password", { method: "POST", body: { next }, auth: true, timeout: 6000 });
    session.set(CONFIG.SS.TOKEN, res.token);
    state.admin.token = res.token;
    return true;
  }
  const hash = await hashToken(next);
  store.set(CONFIG.LS.ADMIN_HASH, hash);
  session.set(CONFIG.SS.TOKEN, hash);
  state.admin.token = hash;
  return true;
}

/* ============================== PARSEUR VIDÉO ==============================
   Auto-détection du format :
   - TikTok ou YouTube Shorts (/shorts/)  → conteneur vertical 9:16 centré
   - YouTube classique                     → conteneur horizontal 16:9
   ========================================================================== */
function parseVideoUrl(raw) {
  const url = safeUrl(raw);
  if (!url) return null;

  /* TikTok : tiktok.com/@user/video/1234… ou vm.tiktok.com/ABCD */
  let m = url.match(/tiktok\.com\/(?:@[\w.-]+\/)?video\/(\d{6,})/i) || url.match(/vm\.tiktok\.com\/([A-Za-z0-9]+)/i);
  if (m) {
    return {
      platform: "tiktok", id: m[1], vertical: true, label: "TikTok",
      embedUrl: url.includes("vm.tiktok.com") ? url : `https://www.tiktok.com/embed/v2/${m[1]}`,
      sourceUrl: url,
    };
  }

  /* YouTube Shorts : youtube.com/shorts/ID */
  m = url.match(/youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/i);
  if (m) {
    return {
      platform: "shorts", id: m[1], vertical: true, label: "YouTube Shorts",
      embedUrl: `https://www.youtube-nocookie.com/embed/${m[1]}?rel=0&autoplay=0`,
      sourceUrl: url, thumb: `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg`,
    };
  }

  /* YouTube classique : watch?v=, youtu.be/, embed/ */
  m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i);
  if (m) {
    return {
      platform: "youtube", id: m[1], vertical: false, label: "YouTube",
      embedUrl: `https://www.youtube-nocookie.com/embed/${m[1]}?rel=0&autoplay=0`,
      sourceUrl: url, thumb: `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg`,
    };
  }

  /* Autre URL intégrable (iframe générique) */
  if (/\/embed|player\./i.test(url)) {
    return { platform: "iframe", id: "", vertical: false, label: "Vidéo", embedUrl: url, sourceUrl: url };
  }
  return null;
}

/* Commande de repli : git clone <lien> && cd <repo> && npm install */
function fallbackCommand(actionUrl) {
  const url = safeUrl(actionUrl);
  if (!url) return "git clone <url_du_produit> && cd repo && npm install";
  let name = "repo";
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length) name = parts[parts.length - 1].replace(/\.git$/, "") || "repo";
  } catch (e) { /* garde « repo » */ }
  return `git clone ${url} && cd ${name} && npm install`;
}

/* ============================== ROUTEUR (#admin) ============================== */
function handleRoute() {
  const hash = location.hash || "";
  const isAdmin = /admin/i.test(hash);
  state.view = isAdmin ? "admin" : "public";
  const pub = $("#view-public");
  const adm = $("#view-admin");
  if (isAdmin) {
    pub.hidden = true;
    adm.hidden = false;
    if (!state.admin.token) state.admin.token = session.get(CONFIG.SS.TOKEN);
    renderAdmin();
  } else {
    pub.hidden = false;
    adm.hidden = true;
    stopAnalyticsTimer();
  }
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}
window.addEventListener("hashchange", handleRoute);

/* ============================== VUE PUBLIQUE ============================== */
function renderHeroStats() {
  const total = state.products.length;
  const free = state.products.filter((p) => (p.badges || []).includes("gratuit")).length;
  const local = localAnalytics();
  const clicks = (state.api.available ? null : local.actionsTotal);
  $("#stat-total").textContent = fmt(total);
  $("#stat-free").textContent = fmt(free);
  $("#stat-clicks").textContent = fmt(clicks != null ? clicks : state.products.reduce((s, p) => s + (p.clicks || 0), 0));
}

function getFiltered() {
  const { q, category, badges, sort } = state.filters;
  const needle = q.trim().toLowerCase();
  let list = state.products.filter((p) => {
    if (category !== "all" && p.category !== category) return false;
    for (const b of badges) if (!(p.badges || []).includes(b)) return false;
    if (needle) {
      const hay = [p.title, p.shortDescription, p.description, CATEGORIES[p.category] || "", ACTION_TYPES[p.actionType] || "", (p.badges || []).join(" ")]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
  if (sort === "recent") list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  else list.sort((a, b) => (b.clicks || 0) - (a.clicks || 0) || (b.createdAt || 0) - (a.createdAt || 0));
  return list;
}

function badgeHtml(b, cls = "b") {
  return `<span class="${cls} b-${esc(b)}">${esc(BADGE_LABELS[b] || b)}</span>`;
}

function renderGrid() {
  const grid = $("#product-grid");
  const skeleton = $("#grid-skeleton");
  const empty = $("#empty-state");
  const list = getFiltered();

  skeleton.hidden = true;
  skeleton.style.display = "none";

  const count = $("#results-count");
  const resetBtn = $("#reset-filters");
  const filtersActive =
    state.filters.q !== "" || state.filters.category !== "all" || state.filters.badges.length > 0;
  resetBtn.hidden = !filtersActive;

  if (!list.length) {
    grid.innerHTML = "";
    empty.hidden = false;
    count.innerHTML = "Aucun résultat";
    return;
  }
  empty.hidden = true;

  const frag = document.createDocumentFragment();
  list.forEach((p, i) => {
    const card = document.createElement("article");
    card.className = "product-card" + (parseVideoUrl(p.videoUrl) ? " has-video" : "");
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Voir les détails de ${p.title}`);
    card.dataset.id = p.id;
    card.style.animationDelay = `${Math.min(i * 55, 660)}ms`;
    const badges = (p.badges || []).slice(0, 2).map((b) => badgeHtml(b)).join("");
    card.innerHTML = `
      <div class="pc-media">
        <img src="${esc(p.imageUrl)}" alt="Couverture de ${esc(p.title)}" loading="lazy" decoding="async"
             onerror="this.onerror=null;this.src='data:image/svg+xml;charset=utf-8,${encodeURIComponent(
               "<svg xmlns='http://www.w3.org/2000/svg' width='640' height='400'><rect width='640' height='400' fill='%230d1220'/><path d='M36 8 18 36h11l-3 20 20-30H34l2-18z' fill='%238b5cf6' opacity='.6' transform='translate(240 150) scale(4)'/></svg>"
             )}" />
        <div class="pc-badges">${badges}</div>
        <span class="pc-cat">${esc(CATEGORIES[p.category] || p.category)}</span>
        <span class="pc-play">${I.play}</span>
      </div>
      <div class="pc-body">
        <h3 class="pc-title">
          <span>${esc(p.title)}</span>
          <span class="pc-heat" title="Nombre de clics">${I.fire}${fmt(p.clicks || 0)}</span>
        </h3>
        <p class="pc-desc">${esc(p.shortDescription || "")}</p>
        <div class="pc-footer">
          <span class="pc-price">${esc(p.price || "")}</span>
          <span class="pc-cta">Détails ${I.external}</span>
        </div>
      </div>`;
    frag.appendChild(card);
  });
  grid.innerHTML = "";
  grid.appendChild(frag);

  count.innerHTML = `<b>${fmt(list.length)}</b> outil${list.length > 1 ? "s" : ""} affiché${list.length > 1 ? "s" : ""} sur ${fmt(state.products.length)}`;
}

function bindPublicControls() {
  const input = $("#search-input");
  const clear = $("#search-clear");
  const onSearch = debounce(() => {
    state.filters.q = input.value;
    clear.hidden = !input.value;
    renderGrid();
  }, 140);
  input.addEventListener("input", onSearch);
  clear.addEventListener("click", () => {
    input.value = "";
    state.filters.q = "";
    clear.hidden = true;
    renderGrid();
    input.focus();
  });
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      input.focus();
      input.select();
    }
  });

  $$(".pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      $$(".pill").forEach((p) => {
        p.classList.toggle("active", p === pill);
        p.setAttribute("aria-pressed", p === pill ? "true" : "false");
      });
      state.filters.category = pill.dataset.category;
      renderGrid();
    });
  });

  $$(".chip[data-badge]").forEach((chip) => {
    chip.addEventListener("click", () => {
      const b = chip.dataset.badge;
      const active = state.filters.badges.includes(b);
      state.filters.badges = active
        ? state.filters.badges.filter((x) => x !== b)
        : [...state.filters.badges, b];
      chip.setAttribute("aria-pressed", state.filters.badges.includes(b) ? "true" : "false");
      renderGrid();
    });
  });

  $("#sort-select").addEventListener("change", (e) => {
    state.filters.sort = e.target.value;
    renderGrid();
  });

  const doReset = () => {
    state.filters = { q: "", category: "all", badges: [], sort: state.filters.sort };
    input.value = "";
    clear.hidden = true;
    $$(".pill").forEach((p) => {
      const on = p.dataset.category === "all";
      p.classList.toggle("active", on);
      p.setAttribute("aria-pressed", on ? "true" : "false");
    });
    $$(".chip[data-badge]").forEach((c) => c.setAttribute("aria-pressed", "false"));
    renderGrid();
  };
  $("#reset-filters").addEventListener("click", doReset);
  $("#empty-state").addEventListener("click", (e) => {
    if (e.target.closest('[data-action="reset-filters"]')) doReset();
  });

  $("#product-grid").addEventListener("click", (e) => {
    const card = e.target.closest(".product-card");
    if (card) openProductModal(card.dataset.id);
  });
  $("#product-grid").addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      const card = e.target.closest(".product-card");
      if (card) {
        e.preventDefault();
        openProductModal(card.dataset.id);
      }
    }
  });
}

/* ============================== SYSTÈME DE MODALES ============================== */
let activeModal = null;
function openModal(html, { panelClass = "" } = {}) {
  closeModal();
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `<div class="modal-panel ${panelClass}" role="dialog" aria-modal="true">
    <button class="modal-close" type="button" aria-label="Fermer la fenêtre">${I.close}</button>
    <div class="modal-body">${html}</div>
  </div>`;
  $("#modal-root").appendChild(overlay);
  document.body.style.overflow = "hidden";
  activeModal = overlay;

  const closeIt = () => closeModal();
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) closeIt();
  });
  overlay.querySelector(".modal-close").addEventListener("click", closeIt);
  const onKey = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      closeIt();
    }
  };
  document.addEventListener("keydown", onKey, { once: false });
  overlay._keyHandler = onKey;
  const firstFocus = overlay.querySelector("input, textarea, select, button:not(.modal-close)");
  if (firstFocus) setTimeout(() => firstFocus.focus(), 60);
  return overlay;
}
function closeModal() {
  if (!activeModal) return;
  const overlay = activeModal;
  if (overlay._keyHandler) document.removeEventListener("keydown", overlay._keyHandler);
  overlay.classList.add("closing");
  overlay.style.transition = "opacity 0.22s";
  overlay.style.opacity = "0";
  setTimeout(() => overlay.remove(), 230);
  activeModal = null;
  document.body.style.overflow = "";
}

/* ============================== MODALE PRODUIT (mécaniques par type) ============================== */
function openProductModal(id) {
  const p = state.products.find((x) => x.id === id);
  if (!p) return;
  trackClick(p.id, "open");

  const badges = (p.badges || []).map((b) => badgeHtml(b)).join("");
  const v = parseVideoUrl(p.videoUrl);
  const isFree = (p.badges || []).includes("gratuit") || /gratuit/i.test(p.price || "");

  /* --- Bloc vidéo (auto-détection 16:9 / 9:16) --- */
  let videoHtml = "";
  if (v) {
    const frame = v.vertical
      ? `<div class="media-9-16-wrap"><div class="media-9-16"><iframe src="${esc(v.embedUrl)}" title="Vidéo démo — ${esc(p.title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe></div></div>`
      : `<div class="media-frame media-16-9"><iframe src="${esc(v.embedUrl)}" title="Vidéo démo — ${esc(p.title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
    videoHtml = `
      <section class="pm-section">
        <h4 class="pm-section-title">${I.video} Média · démo</h4>
        ${frame}
        <span class="media-tag">${I.info} Format détecté : <b>${esc(v.label)}</b> — intégration ${v.vertical ? "verticale 9:16" : "horizontale 16:9"}</span>
      </section>`;
  }

  /* --- Bloc action selon le type de produit --- */
  let actionHtml = "";
  if (p.actionType === "terminal") {
    const cmd = (p.command && p.command.trim()) || fallbackCommand(p.actionUrl);
    actionHtml = `
      <section class="pm-section">
        <h4 class="pm-section-title">${I.monitor} Installation · Terminal</h4>
        <div class="terminal">
          <div class="terminal-bar">
            <div class="terminal-dots"><i></i><i></i><i></i></div>
            <span class="terminal-title">terminal — bash · ${esc(p.title.toLowerCase().replace(/\s+/g, "-"))}</span>
          </div>
          <div class="terminal-body">
            <div class="terminal-cmd"><span class="prompt">$&nbsp;</span><span class="cmd">${esc(cmd)}</span><span class="terminal-cursor"></span></div>
          </div>
          <div class="terminal-foot">
            <span class="terminal-note">${p.command ? "commande custom" : "commande auto-générée"}</span>
            <button class="copy-btn" type="button" data-copy="${esc(cmd)}">${I.copy}<span>Copier la commande</span></button>
          </div>
        </div>
        ${safeUrl(p.actionUrl) ? `<a class="btn btn-cyan btn-block" style="margin-top:0.7rem" href="${esc(safeUrl(p.actionUrl))}" target="_blank" rel="noopener noreferrer" data-track="${esc(p.id)}" data-track-action="repo">${I.github} Ouvrir le dépôt source</a>` : ""}
      </section>`;
  } else if (p.actionType === "mobile") {
    const apkUrl = safeUrl(p.apkUrl || p.actionUrl);
    const pwaUrl = safeUrl(p.pwaUrl);
    actionHtml = `
      <section class="pm-section">
        <h4 class="pm-section-title">${I.phone} Installation · Mobile</h4>
        <div class="action-stack">
          ${apkUrl ? `<a class="btn btn-primary" href="${esc(apkUrl)}" download data-track="${esc(p.id)}" data-track-action="apk">${I.download} Télécharger l'APK</a>` : ""}
          <button class="btn btn-cyan" type="button" data-pwa="${esc(pwaUrl)}" data-pwa-fallback="${pwaUrl ? "0" : "1"}" data-track="${esc(p.id)}" data-track-action="pwa">
            ${I.phone} Installer la PWA
          </button>
        </div>
        <p class="field-hint" style="margin-top:0.6rem">APK natif Android ou PWA installable depuis votre navigateur — aucune donnée collectée.</p>
      </section>`;
  } else {
    /* SaaS / E-book → tunnel Chariow */
    const label = isFree ? "Accéder gratuitement" : `Obtenir l'accès${p.price ? " — " + esc(p.price) : ""}`;
    actionHtml = `
      <section class="pm-section">
        <h4 class="pm-section-title">${I.sparkles} Accès · ${esc(CATEGORIES[p.category] || "")}</h4>
        <div class="action-stack">
          <a class="btn btn-primary" href="${esc(safeUrl(p.actionUrl) || "#")}" target="_blank" rel="noopener noreferrer" data-track="${esc(p.id)}" data-track-action="chariow">
            ${I.external} ${label}
          </a>
        </div>
        <p class="field-hint" style="margin-top:0.6rem">${isFree ? "Accès direct, sans carte bancaire." : "Paiement sécurisé via Chariow — accès immédiat après validation."}</p>
      </section>`;
  }

  const html = `
    <div class="pm-head">
      <div class="pm-cover"><img src="${esc(p.imageUrl)}" alt="Couverture de ${esc(p.title)}" loading="lazy" decoding="async" /></div>
      <div class="pm-titles">
        <div class="pm-badges">${badges}<span class="b" style="color:var(--cyan-soft);border-color:rgba(34,211,238,.45);background:rgba(34,211,238,.1)">${esc(CATEGORIES[p.category] || p.category)}</span></div>
        <h2 class="pm-title">${esc(p.title)}</h2>
        <div class="pm-meta">
          <span class="heat">${I.fire} ${fmt(p.clicks || 0)} clics</span>
          <span>${I.calendar} ${p.createdAt ? timeAgo(p.createdAt) : ""}</span>
          ${p.price ? `<span>${I.sparkles} ${esc(p.price)}</span>` : ""}
        </div>
      </div>
    </div>
    ${videoHtml}
    <section class="pm-section">
      <h4 class="pm-section-title">${I.book} Description</h4>
      <p class="pm-description">${esc(p.description || p.shortDescription || "")}</p>
    </section>
    ${actionHtml}`;

  openModal(html, { panelClass: "product-modal" });

  /* Suivi des clics d'action + copie + PWA */
  const root = activeModal;
  root.addEventListener("click", async (e) => {
    const copyBtn = e.target.closest(".copy-btn");
    if (copyBtn) {
      copyText(copyBtn.dataset.copy, copyBtn);
      return;
    }
    const pwaBtn = e.target.closest("[data-pwa]");
    if (pwaBtn) {
      const url = pwaBtn.dataset.pwa;
      if (url) window.open(url, "_blank", "noopener");
      else pwaInstallHint();
      return;
    }
    const trackEl = e.target.closest("[data-track]");
    if (trackEl) trackClick(trackEl.dataset.track, trackEl.dataset.trackAction || "action");
  });
}

/* Aide à l'installation PWA (quand aucune URL PWA n'est définie) */
function pwaInstallHint() {
  openModal(`
    <div class="confirm-modal">
      <div class="modal-body">
        <h3>${I.phone} Installer la PWA</h3>
        <p>Ajoutez l'application à votre écran d'accueil en quelques secondes :</p>
        <div style="text-align:left;font-size:0.84rem;color:var(--text-2);line-height:1.9">
          <p><strong style="color:var(--cyan-soft)">Chrome / Edge (Android)</strong> — menu ⋮ puis « Installer l'application ».</p>
          <p><strong style="color:var(--cyan-soft)">Safari (iOS)</strong> — bouton Partager ⊕ puis « Sur l'écran d'accueil ».</p>
          <p><strong style="color:var(--cyan-soft)">Chrome / Safari (desktop)</strong> — icône ⊕ dans la barre d'adresse.</p>
        </div>
        <div class="confirm-actions" style="margin-top:1.2rem">
          <button class="btn btn-primary" type="button" data-close-modal>${I.check} Compris</button>
        </div>
      </div>
    </div>`, { panelClass: "confirm-wrap" });
  activeModal.addEventListener("click", (e) => {
    if (e.target.closest("[data-close-modal]")) closeModal();
  });
}

/* ============================== VUE ADMIN ============================== */
function renderAdmin() {
  const root = $("#view-admin");
  if (!state.admin.token) {
    renderAdminLogin(root);
    return;
  }
  state.admin.authed = true;
  renderAdminDashboard(root);
}

/* ---------- Porte de connexion ---------- */
function renderAdminLogin(root) {
  root.innerHTML = `
    <div class="admin-login-wrap">
      <form class="admin-login glass" id="admin-login-form" novalidate>
        <svg class="brand-logo" viewBox="0 0 64 64" aria-hidden="true">
          <defs><linearGradient id="lg2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b5cf6"/><stop offset="1" stop-color="#22d3ee"/></linearGradient></defs>
          <path d="M36 8 18 36h11l-3 20 20-30H34l2-18z" fill="url(#lg2)"/>
        </svg>
        <h2 class="al-title">Zone administrateur</h2>
        <p class="al-sub">Bêta Arsenal — Dashboard &amp; médiathèque.<br>Accès protégé par clé (transmise via <code style="font-family:var(--font-mono);font-size:0.72em">X-Admin-Auth</code>).</p>
        <div class="al-error" id="al-error" role="alert"></div>
        <div class="field" style="text-align:left">
          <label class="field-label" for="al-password">${I.lock} Mot de passe administrateur</label>
          <div style="position:relative">
            <input class="input" id="al-password" type="password" placeholder="••••••••••••" autocomplete="current-password" required />
            <button type="button" id="al-toggle" class="icon-btn" style="position:absolute;right:6px;top:50%;transform:translateY(-50%);width:30px;height:30px" aria-label="Afficher/masquer le mot de passe">${I.eye}</button>
          </div>
        </div>
        <button class="btn btn-primary btn-block" type="submit" id="al-submit">${I.zap} Déverrouiller le dashboard</button>
        <p class="al-hint">
          Mot de passe par défaut : <code>${esc(CONFIG.DEFAULT_ADMIN_PASSWORD)}</code><br>
          Modifiable dans <em>Paramètres → Sécurité</em> une fois connecté.
        </p>
        <a class="btn btn-ghost btn-sm btn-block" href="#">← Retour au catalogue</a>
      </form>
    </div>`;

  const form = $("#admin-login-form");
  const err = $("#al-error");
  $("#al-toggle").addEventListener("click", () => {
    const inp = $("#al-password");
    inp.type = inp.type === "password" ? "text" : "password";
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const password = $("#al-password").value;
    const submit = $("#al-submit");
    if (!password) {
      err.textContent = "Saisissez le mot de passe administrateur.";
      err.classList.add("show");
      return;
    }
    submit.disabled = true;
    submit.innerHTML = `<span class="spin"></span> Vérification…`;
    err.classList.remove("show");
    try {
      const token = await adminLogin(password);
      session.set(CONFIG.SS.TOKEN, token);
      state.admin.token = token;
      toast("Bienvenue dans le dashboard, commandant.", "success");
      renderAdmin();
    } catch (ex) {
      err.textContent = ex.message || "Accès refusé.";
      err.classList.remove("show");
      void err.offsetWidth; /* redémarre l'animation shake */
      err.classList.add("show");
    } finally {
      submit.disabled = false;
      submit.innerHTML = `${I.zap} Déverrouiller le dashboard`;
    }
  });
}

function adminLogout() {
  session.del(CONFIG.SS.TOKEN);
  state.admin.token = null;
  state.admin.authed = false;
  stopAnalyticsTimer();
  toast("Session administrateur fermée.", "info");
  renderAdmin();
}

/* ---------- Shell du dashboard ---------- */
const ADMIN_TABS = [
  { id: "products", label: "Produits", icon: "package" },
  { id: "media", label: "Médiathèque", icon: "image" },
  { id: "analytics", label: "Analytique", icon: "chart" },
  { id: "settings", label: "Paramètres", icon: "settings" },
];

function renderAdminDashboard(root) {
  root.innerHTML = `
    <header class="admin-header">
      <div class="container admin-header-inner">
        <a class="brand" href="#" aria-label="Retour au site">
          <svg class="brand-logo" viewBox="0 0 64 64" width="28" height="28" aria-hidden="true">
            <defs><linearGradient id="lg3" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b5cf6"/><stop offset="1" stop-color="#22d3ee"/></linearGradient></defs>
            <path d="M36 8 18 36h11l-3 20 20-30H34l2-18z" fill="url(#lg3)"/>
          </svg>
          <span class="brand-name">BÊTA<span class="brand-accent">ARSENAL</span></span>
        </a>
        <span class="admin-title-chip">Dashboard Admin</span>
        <span class="mode-pill ${state.api.available ? "api" : "local"}" id="admin-mode-pill" title="${state.api.available ? "Backend connecté — données partagées entre tous les visiteurs" : "Mode local — données persistées dans ce navigateur"}">
          ${state.api.available ? I.check + " Backend connecté" : I.warn + " Mode local"}
        </span>
        <div class="admin-header-actions">
          <a class="btn btn-ghost btn-sm" href="#" title="Voir le site public">${I.eye} Voir le site</a>
          <button class="btn btn-danger btn-sm" type="button" id="admin-logout">${I.logout} Déconnexion</button>
        </div>
      </div>
    </header>
    <nav class="admin-tabs" role="tablist" aria-label="Sections du dashboard">
      ${ADMIN_TABS.map((t) => `<button class="admin-tab" role="tab" data-tab="${t.id}" aria-selected="${state.admin.tab === t.id}">${I[t.icon]} ${t.label}</button>`).join("")}
    </nav>
    <div class="admin-body"><div class="container" id="admin-content"></div></div>`;

  $("#admin-logout").addEventListener("click", adminLogout);
  $$(".admin-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === state.admin.tab);
    tab.addEventListener("click", () => {
      state.admin.tab = tab.dataset.tab;
      $$(".admin-tab").forEach((t) => {
        t.classList.toggle("active", t === tab);
        t.setAttribute("aria-selected", t === tab ? "true" : "false");
      });
      renderAdminTab();
    });
  });
  renderAdminTab();
}

function renderAdminTab() {
  stopAnalyticsTimer();
  const c = $("#admin-content");
  switch (state.admin.tab) {
    case "media": renderMediaLibrary(c); break;
    case "analytics": renderAnalyticsTab(c); break;
    case "settings": renderSettingsTab(c); break;
    default: renderAdminProducts(c); break;
  }
}

/* ---------- Onglet PRODUITS ---------- */
function renderAdminProducts(c = $("#admin-content")) {
  c.innerHTML = `
    <div class="admin-toolbar">
      <h2>Gestionnaire de produits</h2>
      <span class="mode-pill ${state.api.available ? "api" : "local"}">${state.api.available ? "sync API" : "localStorage"}</span>
      <div class="spacer"></div>
      <div class="admin-search">${I.search}<input id="admin-list-search" type="search" placeholder="Filtrer les produits…" value="${esc(state.admin.listQ)}" /></div>
      <button class="btn btn-primary" id="btn-new-product" type="button">${I.edit} Ajouter un produit</button>
    </div>
    <div class="product-rows" id="admin-product-rows"></div>`;

  const rows = $("#admin-product-rows");
  const drawRows = () => {
    const q = state.admin.listQ.trim().toLowerCase();
    const list = state.products
      .filter((p) => !q || p.title.toLowerCase().includes(q) || (CATEGORIES[p.category] || "").toLowerCase().includes(q))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    if (!list.length) {
      rows.innerHTML = `<div class="empty-state" style="display:flex"><h3>Aucun produit</h3><p>Créez votre premier produit pour l'ajouter au catalogue public.</p></div>`;
      return;
    }
    rows.innerHTML = list
      .map(
        (p) => `
      <div class="p-row" data-id="${esc(p.id)}">
        <img class="p-row-thumb" src="${esc(p.imageUrl)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'" />
        <div class="p-row-main">
          <div class="p-row-title">${esc(p.title)}</div>
          <div class="p-row-sub">
            <span>${esc(CATEGORIES[p.category] || p.category)}</span>
            ${(p.badges || []).map((b) => badgeHtml(b)).join("")}
            ${parseVideoUrl(p.videoUrl) ? `<span class="b b-nouveau">vidéo</span>` : ""}
          </div>
        </div>
        <div class="p-row-stats"><b>${fmt(p.clicks || 0)}</b>clics</div>
        <div class="p-row-actions">
          <button class="icon-btn" type="button" data-edit="${esc(p.id)}" title="Modifier" aria-label="Modifier ${esc(p.title)}">${I.edit}</button>
          <button class="icon-btn danger" type="button" data-delete="${esc(p.id)}" title="Supprimer" aria-label="Supprimer ${esc(p.title)}">${I.trash}</button>
        </div>
      </div>`
      )
      .join("");
  };
  drawRows();

  $("#admin-list-search").addEventListener("input", debounce((e) => {
    state.admin.listQ = e.target.value;
    drawRows();
  }, 120));
  $("#btn-new-product").addEventListener("click", () => openProductForm(null));

  rows.addEventListener("click", (e) => {
    const editBtn = e.target.closest("[data-edit]");
    if (editBtn) {
      const p = state.products.find((x) => x.id === editBtn.dataset.edit);
      if (p) openProductForm(p);
      return;
    }
    const delBtn = e.target.closest("[data-delete]");
    if (delBtn) confirmDelete(delBtn.dataset.delete);
  });
}

function confirmDelete(id) {
  const p = state.products.find((x) => x.id === id);
  if (!p) return;
  openModal(`
    <div class="confirm-modal">
      <div class="modal-body">
        <h3>${I.trash} Supprimer ce produit ?</h3>
        <p><strong style="color:var(--text)">${esc(p.title)}</strong> disparaîtra du catalogue public. Cette action est irréversible.</p>
        <div class="confirm-actions">
          <button class="btn btn-ghost" type="button" data-cancel>${I.close} Annuler</button>
          <button class="btn btn-danger" type="button" data-confirm="${esc(p.id)}">${I.trash} Supprimer définitivement</button>
        </div>
      </div>
    </div>`, { panelClass: "confirm-wrap" });
  activeModal.addEventListener("click", async (e) => {
    if (e.target.closest("[data-cancel]")) closeModal();
    const confirmBtn = e.target.closest("[data-confirm]");
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = `<span class="spin"></span> Suppression…`;
      try {
        await productDelete(confirmBtn.dataset.confirm);
        closeModal();
        toast(`« ${p.title} » supprimé du catalogue.`, "success");
      } catch (ex) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `${I.trash} Supprimer définitivement`;
        toast(ex.message || "Suppression impossible.", "error");
      }
    }
  });
}

/* ---------- Formulaire produit (no-code CRUD + upload hybride) ---------- */
function openProductForm(product) {
  const isEdit = !!product;
  state.admin.editingId = isEdit ? product.id : null;
  const v = (s) => esc(s || "");

  const overlay = document.createElement("div");
  overlay.className = "form-panel-overlay";
  const panel = document.createElement("div");
  panel.className = "form-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", isEdit ? "Modifier le produit" : "Nouveau produit");

  const catOpts = Object.entries(CATEGORIES).map(([k, l]) => `<option value="${k}" ${product && product.category === k ? "selected" : ""}>${l}</option>`).join("");
  const atOpts = Object.entries(ACTION_TYPES).map(([k, l]) => `<option value="${k}" ${product && product.actionType === k ? "selected" : ""}>${l}</option>`).join("");
  const badgesChecks = BADGES.map((b) => `
    <label class="check-pill ${product && (product.badges || []).includes(b) ? "on" : ""}" data-badge-pill="${b}">
      <input type="checkbox" value="${b}" ${product && (product.badges || []).includes(b) ? "checked" : ""} />
      <span class="dot"></span>${BADGE_LABELS[b]}
    </label>`).join("");

  panel.innerHTML = `
    <div class="form-panel-head">
      <h3>${isEdit ? I.edit + " Modifier — " + esc(product.title) : I.package + " Nouveau produit"}</h3>
      <button class="icon-btn" type="button" id="fp-close" aria-label="Fermer">${I.close}</button>
    </div>
    <div class="form-panel-scroll">
      <form class="form-grid" id="product-form" novalidate>
        <div class="field">
          <label class="field-label" for="f-title">${I.zap} Titre <span class="req">*</span></label>
          <input class="input" id="f-title" value="${v(product && product.title)}" placeholder="Ex : NeuroForm AI" required maxlength="90" />
        </div>
        <div class="field">
          <label class="field-label" for="f-short">${I.sparkles} Description courte <span class="req">*</span></label>
          <input class="input" id="f-short" value="${v(product && product.shortDescription)}" placeholder="1 phrase percutante affichée sur la carte" maxlength="140" required />
          <p class="field-hint">Affichée sur les cartes du catalogue. <span id="f-short-count"></span></p>
        </div>
        <div class="field">
          <label class="field-label" for="f-desc">${I.book} Description complète</label>
          <textarea class="textarea" id="f-desc" placeholder="Description détaillée affichée dans la modale produit…">${v(product && product.description)}</textarea>
        </div>
        <div class="settings-row two">
          <div class="field">
            <label class="field-label" for="f-category">${I.package} Catégorie <span class="req">*</span></label>
            <select class="select" id="f-category">${catOpts}</select>
            <p class="field-hint">Filtre affiché côté client.</p>
          </div>
          <div class="field">
            <label class="field-label" for="f-actiontype">${I.cursor} Type de produit (action) <span class="req">*</span></label>
            <select class="select" id="f-actiontype">${atOpts}</select>
            <p class="field-hint">Détermine la mécanique : Chariow, terminal ou APK/PWA.</p>
          </div>
        </div>
        <div class="field">
          <label class="field-label">${I.sparkles} Badges</label>
          <div class="checks" id="f-badges">${badgesChecks}</div>
        </div>
        <div class="field">
          <label class="field-label" for="f-price">${I.heart} Prix affiché</label>
          <input class="input" id="f-price" value="${v(product && product.price)}" placeholder="Ex : 19,90 € ou « Gratuit »" maxlength="24" />
        </div>
        <div class="field" id="f-actionurl-field">
          <label class="field-label" for="f-actionurl">${I.link} URL de l'action (Chariow / GitHub) <span class="req">*</span></label>
          <input class="input mono" id="f-actionurl" value="${v(product && product.actionUrl)}" placeholder="https://checkout.chariow.com/… ou https://github.com/…" inputmode="url" />
          <p class="field-hint" id="f-actionurl-hint"></p>
        </div>
        <div class="field hidden-at-first" id="f-pwaurl-field" style="display:none">
          <label class="field-label" for="f-pwaurl">${I.phone} URL de la PWA</label>
          <input class="input mono" id="f-pwaurl" value="${v(product && product.pwaUrl)}" placeholder="https://mon-app.example.com" inputmode="url" />
        </div>
        <div class="field hidden-at-first" id="f-command-field" style="display:none">
          <label class="field-label" for="f-command">${I.monitor} Commande Terminal custom</label>
          <textarea class="textarea mono" id="f-command" placeholder="Laissez vide pour la commande auto-générée : git clone <lien> && cd repo && npm install" style="min-height:64px">${v(product && product.command)}</textarea>
          <p class="field-hint">Si vide : <code>git clone &lt;URL&gt; &amp;&amp; cd repo &amp;&amp; npm install</code></p>
        </div>
        <div class="field">
          <label class="field-label" for="f-video">${I.video} URL iFrame vidéo</label>
          <input class="input mono" id="f-video" value="${v(product && product.videoUrl)}" placeholder="YouTube, YouTube Shorts, TikTok…" inputmode="url" />
          <p class="field-hint">Auto-détection : TikTok / Shorts → vertical 9:16 · YouTube classique → 16:9. Aperçu :</p>
          <div id="f-video-preview" style="margin-top:0.45rem"></div>
        </div>
        <div class="field">
          <label class="field-label">${I.image} Image de couverture <span class="req">*</span></label>
          <div class="img-preview" id="img-preview">
            <img id="img-preview-img" src="${v(product && product.imageUrl)}" alt="Aperçu de la couverture" />
            <span class="img-preview-tag" id="img-preview-tag">${v(product && product.imageUrl)}</span>
          </div>
          <input class="input mono" id="f-image" value="${v(product && product.imageUrl)}" placeholder="Collez une URL d'image externe…" inputmode="url" />
          <div class="dropzone" id="dropzone" tabindex="0" role="button" aria-label="Glisser-déposer une image">
            ${I.upload}
            <span class="dz-title">Glissez-déposez une image ici</span>
            <span class="dz-sub">JPG · PNG · WebP · GIF — 5 Mo max</span>
            <span class="dz-status">Hébergement en cours…</span>
          </div>
          <p class="upload-note">${I.info} L'image déposée est envoyée au backend pour auto-hébergement (GitHub si configuré dans Paramètres). L'URL finale est injectée automatiquement dans le champ ci-dessus.</p>
        </div>
      </form>
    </div>
    <div class="form-panel-foot">
      <button class="btn btn-ghost" type="button" id="fp-cancel">${I.close} Annuler</button>
      <button class="btn btn-primary" type="button" id="fp-save">${I.check} ${isEdit ? "Enregistrer les modifications" : "Publier le produit"}</button>
    </div>`;

  document.body.appendChild(overlay);
  document.body.appendChild(panel);
  document.body.style.overflow = "hidden";

  /* --- état interne du formulaire --- */
  const setImage = (url) => {
    $("#f-image", panel).value = url;
    syncImagePreview();
  };
  const syncImagePreview = () => {
    const url = safeUrl($("#f-image", panel).value);
    const box = $("#img-preview", panel);
    if (url) {
      box.classList.add("show");
      $("#img-preview-img", panel).src = url;
      $("#img-preview-tag", panel).textContent = url;
    } else {
      box.classList.remove("show");
    }
  };
  const syncActionHint = () => {
    const type = $("#f-actiontype", panel).value;
    const hint = $("#f-actionurl-hint", panel);
    $("#f-pwaurl-field", panel).style.display = type === "mobile" ? "" : "none";
    $("#f-command-field", panel).style.display = type === "terminal" ? "" : "none";
    if (type === "chariow") hint.textContent = "Lien du tunnel de vente ou de la page d'abonnement (Chariow).";
    else if (type === "terminal") hint.textContent = "Lien du dépôt GitHub — sert à générer la commande de clone.";
    else hint.textContent = "Lien direct de téléchargement de l'APK.";
    syncVideoPreview();
  };
  const syncVideoPreview = () => {
    const box = $("#f-video-preview", panel);
    const v = parseVideoUrl($("#f-video", panel).value);
    if (!v) {
      box.innerHTML = `<span class="media-tag">${I.info} Aucune vidéo détectée</span>`;
      return;
    }
    box.innerHTML = `<span class="media-tag">${I.check} <b>${esc(v.label)}</b> détecté — intégration ${v.vertical ? "verticale 9:16" : "horizontale 16:9"}</span>`;
  };
  const syncShortCount = () => {
    const input = $("#f-short", panel);
    $("#f-short-count", panel).textContent = `${input.value.length}/140`;
  };

  syncImagePreview();
  syncActionHint();
  syncShortCount();

  /* --- interactions --- */
  $("#f-image", panel).addEventListener("input", debounce(syncImagePreview, 250));
  $("#f-video", panel).addEventListener("input", debounce(syncVideoPreview, 300));
  $("#f-actiontype", panel).addEventListener("change", syncActionHint);
  $("#f-short", panel).addEventListener("input", syncShortCount);
  $("#f-badges", panel).addEventListener("change", (e) => {
    const pill = e.target.closest(".check-pill");
    if (pill) pill.classList.toggle("on", e.target.checked);
  });

  const closePanel = () => {
    overlay.remove();
    panel.remove();
    document.body.style.overflow = "";
  };
  $("#fp-close", panel).addEventListener("click", closePanel);
  $("#fp-cancel", panel).addEventListener("click", closePanel);
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) closePanel();
  });
  document.addEventListener("keydown", function onEsc(e) {
    if (e.key === "Escape") {
      closePanel();
      document.removeEventListener("keydown", onEsc);
    }
  });

  /* --- Drop & drop + clic parcourir --- */
  const dz = $("#dropzone", panel);
  const handleFile = async (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast("Ce fichier n'est pas une image.", "error"); return; }
    if (file.size > CONFIG.MAX_UPLOAD) { toast("Image trop volumineuse (5 Mo maximum).", "error"); return; }
    dz.classList.add("uploading");
    /* aperçu immédiat */
    const reader = new FileReader();
    reader.onload = () => {
      $("#img-preview", panel).classList.add("show");
      $("#img-preview-img", panel).src = reader.result;
      $("#img-preview-tag", panel).textContent = `${file.name} — envoi en cours…`;
    };
    reader.readAsDataURL(file);
    try {
      const url = await uploadImage(file);
      setImage(url);
      toast(url.startsWith("data:") ? "Image stockée localement (GitHub non configuré)." : "Image hébergée — URL injectée dans le champ.", "success");
    } catch (ex) {
      toast(ex.message || "Échec de l'upload.", "error", 5000);
    } finally {
      dz.classList.remove("uploading");
      syncImagePreview();
    }
  };
  dz.addEventListener("click", () => {
    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = "image/jpeg,image/png,image/webp,image/gif,image/avif";
    picker.onchange = () => handleFile(picker.files[0]);
    picker.click();
  });
  ["dragenter", "dragover"].forEach((ev) =>
    dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("dragover"); })
  );
  ["dragleave", "drop"].forEach((ev) =>
    dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("dragover"); })
  );
  dz.addEventListener("drop", (e) => handleFile(e.dataTransfer.files[0]));

  /* --- Enregistrement --- */
  $("#fp-save", panel).addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const data = {
      title: $("#f-title", panel).value.trim(),
      shortDescription: $("#f-short", panel).value.trim(),
      description: $("#f-desc", panel).value.trim(),
      category: $("#f-category", panel).value,
      actionType: $("#f-actiontype", panel).value,
      badges: $$("#f-badges input:checked", panel).map((i) => i.value),
      price: $("#f-price", panel).value.trim(),
      actionUrl: safeUrl($("#f-actionurl", panel).value.trim()),
      pwaUrl: safeUrl($("#f-pwaurl", panel).value.trim()) || null,
      command: $("#f-command", panel).value.trim() || null,
      videoUrl: safeUrl($("#f-video", panel).value.trim()) || null,
      imageUrl: safeUrl($("#f-image", panel).value.trim()),
    };

    /* validation */
    const errors = [];
    if (data.title.length < 2) errors.push("le titre");
    if (!data.shortDescription) errors.push("la description courte");
    if (!data.actionUrl && data.actionType !== "chariow") errors.push("l'URL d'action");
    if (!data.actionUrl && data.actionType === "chariow") errors.push("l'URL du tunnel Chariow");
    if (!data.imageUrl) errors.push("l'image de couverture");
    if (errors.length) {
      toast(`Champs manquants : ${errors.join(", ")}.`, "error");
      return;
    }

    btn.disabled = true;
    btn.innerHTML = `<span class="spin"></span> Enregistrement…`;
    try {
      if (isEdit) {
        await productUpdate(state.admin.editingId, data);
        toast(`« ${data.title} » mis à jour.`, "success");
      } else {
        await productCreate(data);
        toast(`« ${data.title} » publié dans le catalogue.`, "success");
      }
      closePanel();
    } catch (ex) {
      btn.disabled = false;
      btn.innerHTML = `${I.check} ${isEdit ? "Enregistrer les modifications" : "Publier le produit"}`;
      toast(ex.message || "Enregistrement impossible.", "error", 5000);
    }
  });
}

/* ---------- Upload hybride : backend → GitHub, sinon GitHub direct, sinon local ---------- */
async function uploadImage(file) {
  const gh = store.get(CONFIG.LS.GITHUB, null) || {};
  const ghHeaders = {};
  if (gh.token && gh.repo) {
    ghHeaders["X-GitHub-Token"] = gh.token;
    ghHeaders["X-GitHub-Repo"] = gh.repo;
    if (gh.branch) ghHeaders["X-GitHub-Branch"] = gh.branch;
    if (gh.folder) ghHeaders["X-GitHub-Path"] = gh.folder;
  }

  /* 1) Backend disponible → POST /api/upload (multipart) */
  if (state.api.available) {
    try {
      const fd = new FormData();
      fd.append("file", file, file.name);
      /* Modification : appel vers /api/media au lieu de /api/upload */
      const res = await apiFetch("/api/media", { method: "POST", formData: fd, headers: ghHeaders, auth: true, timeout: 9000 });
      if (res && res.ok && res.item) {
        addLocalUpload({ name: res.item.name, url: res.item.url, kind: "image", size: file.size, uploadedAt: Date.now() });
        return res.item.url;
      }
    } catch (e) {
      if (e.status === 401) throw e;
      /* on tente les replis ci-dessous */
    }
  }

  /* 2) GitHub direct depuis le client (déploiement statique) */
  if (gh.token && gh.repo && /^[\w.-]+\/[\w.-]+$/.test(gh.repo)) {
    try {
      const branch = gh.branch || "main";
      const folder = (gh.folder || "beta-arsenal").replace(/^\/+|\/+$/g, "");
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const filename = `ba-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const content = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result.split(",")[1]);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const resp = await fetch(`https://api.github.com/repos/${gh.repo}/contents/${folder}/${filename}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${gh.token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({ message: `Bêta Arsenal — upload (${filename})`, content, branch }),
      });
      if (resp.ok) {
        const json = await resp.json();
        const url = json.content?.download_url || `https://raw.githubusercontent.com/${gh.repo}/${branch}/${folder}/${filename}`;
        addLocalUpload({ name: filename, url, kind: "image", size: file.size, uploadedAt: Date.now(), hosted: "github" });
        return url;
      }
      toast(`GitHub a refusé l'upload (${resp.status}) — repli sur stockage local.`, "error", 4500);
    } catch (e) {
      toast("API GitHub injoignable — repli sur stockage local.", "error", 4500);
    }
  }

  /* 3) Repli : compression + data URL locale (démonstration sans compte GitHub) */
  const dataUrl = await compressImage(file, 1100, 0.82);
  addLocalUpload({ name: file.name, url: dataUrl, kind: "image", size: file.size, uploadedAt: Date.now(), hosted: "local-data" });
  return dataUrl;
}

function compressImage(file, maxW, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image illisible."));
    };
    img.src = url;
  });
}

/* ============================== MÉDIATHÈQUE ADMIN ============================== */
async function collectMedia() {
  const items = [];
  const seen = new Set();
  const push = (m) => {
    if (m.url && !seen.has(m.url)) {
      seen.add(m.url);
      items.push(m);
    }
  };

  /* Médias du catalogue (images + vidéos utilisées sur le site) */
  for (const p of state.products) {
    if (p.imageUrl) push({ url: p.imageUrl, kind: "image", source: `Produit — ${p.title}`, tag: "catalogue" });
    if (p.videoUrl) push({ url: p.videoUrl, kind: "video", source: `Produit — ${p.title}`, tag: "catalogue" });
  }
  /* Uploads locaux */
  for (const u of localUploads()) {
    push({ url: u.url, kind: "image", source: u.hosted === "github" ? "Hébergé sur GitHub" : u.hosted === "local-data" ? "Stockage local" : "Auto-hébergé", tag: "upload", meta: u });
  }
  /* Uploads côté serveur */
  if (state.api.available) {
    try {
      const res = await apiFetch("/api/media", { auth: true, timeout: 4000 });
      for (const u of res.uploads || []) {
        push({ url: u.url, kind: "image", source: u.hosted === "github" || !u.url.startsWith("/") ? "Hébergé sur GitHub" : "Auto-hébergé (serveur)", tag: "upload", meta: u });
      }
    } catch (e) { /* silencieux */ }
  }
  return items;
}

function mediaPreviewHtml(item) {
  if (item.kind === "video") {
    const v = parseVideoUrl(item.url);
    if (v && v.thumb) {
      return `<img src="${esc(v.thumb)}" alt="" loading="lazy" />
        <div class="mc-play-overlay" data-play="${esc(item.url)}" role="button" aria-label="Charger le lecteur vidéo">
          <span class="mc-play-btn">${I.play}</span>
        </div>`;
    }
    return `<div class="mc-video-ph">${I.video}<span>${esc(v ? v.label : "vidéo")}</span></div>
      <div class="mc-play-overlay" data-play="${esc(item.url)}" role="button" aria-label="Charger le lecteur vidéo">
        <span class="mc-play-btn">${I.play}</span>
      </div>`;
  }
  return `<img src="${esc(item.url)}" alt="" loading="lazy" />`;
}

function renderMediaLibrary(c = $("#admin-content")) {
  c.innerHTML = `
    <div class="admin-toolbar">
      <h2>Médiathèque</h2>
      <span class="results-count" id="media-count">Collecte des médias…</span>
      <div class="spacer"></div>
      <div class="badge-filters">
        <button class="chip" data-mfilter="all">Tous</button>
        <button class="chip" data-mfilter="image">Images</button>
        <button class="chip" data-mfilter="video">Vidéos</button>
      </div>
      <div class="admin-search">${I.search}<input id="media-search" type="search" placeholder="Filtrer par URL, produit…" value="${esc(state.admin.mediaQ)}" /></div>
    </div>
    <div class="media-grid" id="media-grid"></div>`;

  const grid = $("#media-grid", c);
  const count = $("#media-count", c);

  const draw = async () => {
    const all = await collectMedia();
    const q = state.admin.mediaQ.trim().toLowerCase();
    const list = all.filter((m) => {
      if (state.admin.mediaFilter !== "all" && m.kind !== state.admin.mediaFilter) return false;
      if (q && !(m.url.toLowerCase().includes(q) || (m.source || "").toLowerCase().includes(q))) return false;
      return true;
    });
    count.textContent = `${fmt(list.length)} média${list.length > 1 ? "s" : ""} (${fmt(all.filter((m) => m.kind === "image").length)} images · ${fmt(all.filter((m) => m.kind === "video").length)} vidéos)`;
    if (!list.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;display:flex"><h3>Aucun média</h3><p>Les images et vidéos des produits apparaîtront ici automatiquement.</p></div>`;
      return;
    }
    grid.innerHTML = list
      .map((m) => `
        <div class="media-card">
          <div class="mc-preview" data-url="${esc(m.url)}">${mediaPreviewHtml(m)}</div>
          <div class="mc-body">
            <span class="mc-type ${m.kind}">${m.kind === "video" ? I.video : I.image} ${m.kind === "video" ? "vidéo" : "image"}</span>
            <div class="mc-url">${esc(m.url)}</div>
            <div class="mc-actions">
              <button class="copy-btn" type="button" data-copy="${esc(m.url)}">${I.copy}<span>Copier le lien</span></button>
            </div>
            <span class="mc-source" title="${esc(m.source || "")}">${I.link} ${esc(m.source || "")}</span>
          </div>
        </div>`)
      .join("");
  };
  draw();

  $$(".chip[data-mfilter]", c).forEach((chip) => {
    chip.setAttribute("aria-pressed", chip.dataset.mfilter === state.admin.mediaFilter ? "true" : "false");
    chip.addEventListener("click", () => {
      state.admin.mediaFilter = chip.dataset.mfilter;
      $$(".chip[data-mfilter]", c).forEach((x) => x.setAttribute("aria-pressed", x === chip ? "true" : "false"));
      draw();
    });
  });
  $("#media-search", c).addEventListener("input", debounce((e) => {
    state.admin.mediaQ = e.target.value;
    draw();
  }, 160));

  /* Copie + lecteur vidéo clic-pour-charger */
  grid.addEventListener("click", (e) => {
    const copyBtn = e.target.closest(".copy-btn");
    if (copyBtn) {
      copyText(copyBtn.dataset.copy, copyBtn);
      return;
    }
    const play = e.target.closest("[data-play]");
    if (play) {
      const v = parseVideoUrl(play.dataset.play);
      const box = play.closest(".mc-preview");
      if (v && box) {
        box.innerHTML = v.vertical
          ? `<div class="media-9-16-wrap" style="padding:0"><div class="media-9-16" style="height:100%"><iframe src="${esc(v.embedUrl)}" title="Lecteur vidéo" allow="autoplay; encrypted-media; fullscreen" allowfullscreen loading="lazy"></iframe></div></div>`
          : `<div class="media-frame media-16-9"><iframe src="${esc(v.embedUrl)}" title="Lecteur vidéo" allow="autoplay; encrypted-media; fullscreen" allowfullscreen loading="lazy"></iframe></div>`;
      }
    }
  });
}

/* ============================== ANALYTICS ADMIN ============================== */
function stopAnalyticsTimer() {
  if (state.admin.analyticsTimer) {
    clearInterval(state.admin.analyticsTimer);
    state.admin.analyticsTimer = null;
  }
}

async function getAnalyticsData() {
  if (state.api.available) {
    try {
      return await apiFetch("/api/analytics", { auth: true, timeout: 4000 });
    } catch (e) { /* repli local */ }
  }
  const a = localAnalytics();
  const titles = {}, images = {};
  state.products.forEach((p) => {
    titles[p.id] = p.title;
    images[p.id] = p.imageUrl;
  });
  return {
    visits: a.visits,
    actionsTotal: a.actionsTotal,
    clicksByProduct: a.clicksByProduct,
    visitsByDay: a.visitsByDay,
    productTitles: titles,
    productImages: images,
    productCount: state.products.length,
    onlineNow: a.recentVisits ? a.recentVisits.filter((t) => Date.now() - t < 60_000).length : 1,
    updatedAt: a.updatedAt,
  };
}

function renderAnalyticsTab(c = $("#admin-content")) {
  c.innerHTML = `
    <div class="admin-toolbar">
      <h2>Tableau de bord analytique</h2>
      <span class="live-refresh on" id="live-indicator">${I.refresh} temps réel · 5 s</span>
      <div class="spacer"></div>
      <button class="btn btn-cyan btn-sm" id="analytics-refresh" type="button">${I.refresh} Rafraîchir</button>
    </div>
    <div class="stats-grid" id="stats-grid"></div>
    <div class="chart-card glass" id="visits-chart"></div>
    <div class="chart-card glass" id="top-products"></div>
    <div class="chart-card glass" id="clicks-table-card"></div>`;

  refreshAnalytics(false);
  state.admin.analyticsTimer = setInterval(() => refreshAnalytics(true), 5000);
  $("#analytics-refresh").addEventListener("click", () => refreshAnalytics(false));
}

async function refreshAnalytics(silent) {
  if (state.admin.analyticsBusy || state.admin.tab !== "analytics") return;
  state.admin.analyticsBusy = true;
  try {
    const data = await getAnalyticsData();
    const statsGrid = $("#stats-grid");
    if (!statsGrid) { stopAnalyticsTimer(); return; }

    const top = Object.entries(data.clicksByProduct || {})
      .map(([id, n]) => ({ id, n, title: data.productTitles?.[id] || id, img: data.productImages?.[id] }))
      .sort((a, b) => b.n - a.n);
    const maxClicks = top.length ? top[0].n : 1;

    statsGrid.innerHTML = `
      <div class="stat-card glass"><span class="sc-label">${I.eye} Visites globales</span><span class="sc-value">${fmt(data.visits)}</span><span class="sc-sub">depuis l'ouverture</span></div>
      <div class="stat-card glass"><span class="sc-label">${I.cursor} Clics produits</span><span class="sc-value">${fmt(data.actionsTotal)}</span><span class="sc-sub">actions cumulées</span></div>
      <div class="stat-card glass"><span class="sc-label">${I.package} Produits</span><span class="sc-value">${fmt(data.productCount)}</span><span class="sc-sub">au catalogue</span></div>
      <div class="stat-card glass pulse"><span class="sc-label">${I.zap} En ligne</span><span class="sc-value">${fmt(data.onlineNow)}</span><span class="sc-sub">visiteurs actifs (60 s)</span></div>`;

    /* 7 derniers jours */
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * DAY_MS);
      const key = dayKey(d);
      days.push({ label: d.toLocaleDateString("fr-FR", { weekday: "short" }).slice(0, 3), value: data.visitsByDay?.[key] || 0 });
    }
    const maxDay = Math.max(...days.map((d) => d.value), 1);
    $("#visits-chart").innerHTML = `
      <h3>${I.chart} Visites — 7 derniers jours</h3>
      <div class="bars">
        ${days.map((d) => `
          <div class="bar-col">
            <div class="bar" style="height:${Math.max(4, Math.round((d.value / maxDay) * 100))}%"><span class="bar-val">${fmt(d.value)}</span></div>
            <span class="bar-day">${esc(d.label)}</span>
          </div>`).join("")}
      </div>`;

    /* Top produits */
    $("#top-products").innerHTML = `
      <h3>${I.fire} Top produits par clics</h3>
      <div class="rank-list">
        ${top.slice(0, 6).map((t, i) => `
          <div class="rank-item">
            <span class="rank-pos">${i + 1}</span>
            <div class="rank-main">
              <div class="rank-title">${esc(t.title)}</div>
              <div class="rank-track"><div class="rank-fill" style="width:${Math.max(3, Math.round((t.n / maxClicks) * 100))}%"></div></div>
            </div>
            <span class="rank-count">${fmt(t.n)} clics</span>
          </div>`).join("") || "<p class='field-hint'>Aucun clic enregistré pour le moment.</p>"}
      </div>`;

    /* Table complète */
    $("#clicks-table-card").innerHTML = `
      <h3>${I.chart} Suivi des clics par produit</h3>
      <div style="overflow-x:auto">
        <table class="clicks-table">
          <thead><tr><th>Produit</th><th>Catégorie</th><th>Clics</th><th>Part</th></tr></thead>
          <tbody>
            ${top.map((t) => {
              const p = state.products.find((x) => x.id === t.id);
              const share = data.actionsTotal ? Math.round((t.n / data.actionsTotal) * 100) : 0;
              return `<tr>
                <td><span class="t-title">${t.img ? `<img src="${esc(t.img)}" alt="" loading="lazy" onerror="this.style.display='none'">` : ""}<span>${esc(t.title)}</span></span></td>
                <td>${esc(p ? CATEGORIES[p.category] : "—")}</td>
                <td class="num">${fmt(t.n)}</td>
                <td class="num">${share}%</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
      <p class="field-hint" style="margin-top:0.8rem">Dernière mise à jour ${data.updatedAt ? timeAgo(data.updatedAt) : "—"} · rafraîchissement automatique toutes les 5 secondes. Ces clics alimentent le tri « Plus populaires » du catalogue public.</p>`;
  } catch (e) { /* silencieux en mode silencieux */ }
  finally {
    state.admin.analyticsBusy = false;
  }
}

/* ============================== PARAMÈTRES ============================== */
function renderSettingsTab(c = $("#admin-content")) {
  const gh = store.get(CONFIG.LS.GITHUB, null) || {};
  c.innerHTML = `
    <div class="admin-toolbar"><h2>Paramètres</h2></div>
    <div class="settings-grid">

      <div class="settings-card glass">
        <h3>${I.github} Hébergement des images sur GitHub</h3>
        <p>Configurez un dépôt pour auto-héberger les images déposées dans le gestionnaire de produits. L'upload passe par le backend (ou directement par l'API GitHub en déploiement statique).</p>
        <div class="settings-row two">
          <div class="field">
            <label class="field-label" for="gh-repo">${I.github} Dépôt (owner/repo) *</label>
            <input class="input mono" id="gh-repo" value="${esc(gh.repo || "")}" placeholder="mon-compte/medias-arsenal" />
          </div>
          <div class="field">
            <label class="field-label" for="gh-branch">${I.monitor} Branche</label>
            <input class="input mono" id="gh-branch" value="${esc(gh.branch || "main")}" placeholder="main" />
          </div>
          <div class="field">
            <label class="field-label" for="gh-folder">${I.package} Dossier cible</label>
            <input class="input mono" id="gh-folder" value="${esc(gh.folder || "beta-arsenal")}" placeholder="beta-arsenal" />
          </div>
          <div class="field">
            <label class="field-label" for="gh-token">${I.lock} Token d'accès (PAT)</label>
            <input class="input mono" id="gh-token" type="password" value="${esc(gh.token || "")}" placeholder="ghp_… ou github_pat_…" autocomplete="off" />
            <p class="field-hint">Fine-grained, permission « Contents : Read & Write » sur le dépôt ciblé.</p>
          </div>
        </div>
        <div class="confirm-actions" style="margin-top:1rem">
          <button class="btn btn-cyan" id="gh-save" type="button">${I.check} Enregistrer la configuration</button>
          <button class="btn btn-ghost" id="gh-test" type="button">${I.refresh} Tester la connexion</button>
        </div>
      </div>

      <div class="settings-card glass">
        <h3>${I.lock} Sécurité — mot de passe admin</h3>
        <p>Le mot de passe protège l'accès au dashboard ${esc("/#admin")}. Le token sha256 correspondant est transmis dans l'en-tête <code style="font-family:var(--font-mono);font-size:0.72em">X-Admin-Auth</code> à chaque requête.</p>
        <div class="settings-row two">
          <div class="field">
            <label class="field-label" for="pw-current">${I.eye} Mot de passe actuel</label>
            <input class="input" id="pw-current" type="password" autocomplete="current-password" placeholder="••••••••" />
          </div>
          <div class="field">
            <label class="field-label" for="pw-next">${I.zap} Nouveau mot de passe</label>
            <input class="input" id="pw-next" type="password" autocomplete="new-password" placeholder="8 caractères minimum" />
            <p class="field-hint">La session reste active : le token est mis à jour automatiquement.</p>
          </div>
        </div>
        <div class="confirm-actions" style="margin-top:1rem">
          <button class="btn btn-primary" id="pw-save" type="button">${I.check} Changer le mot de passe</button>
        </div>
      </div>

      <div class="settings-card glass">
        <h3>${I.package} Données &amp; sauvegarde</h3>
        <p>Exportez l'intégralité du catalogue au format JSON pour sauvegarder ou migrer vers un autre hébergement.</p>
        <div class="confirm-actions">
          <button class="btn btn-cyan" id="data-export" type="button">${I.download} Exporter le catalogue (JSON)</button>
          <button class="btn btn-ghost" id="data-import" type="button">${I.upload} Importer un catalogue</button>
          <input type="file" id="data-import-file" accept="application/json" hidden />
        </div>
        <div class="confirm-bar" style="margin-top:1rem">
          <p>${I.warn} Réinitialise le navigateur : catalogue de démonstration restauré, analytics locales remises à zéro.</p>
          <button class="btn btn-danger btn-sm" id="data-reset" type="button">${I.trash} Réinitialiser les données locales</button>
        </div>
      </div>

      <div class="settings-card glass">
        <h3>${I.info} À propos</h3>
        <p>Bêta Arsenal v${esc(CONFIG.VERSION)} — SPA monopage vanilla (index.html · app.js · style.css), backend Next.js optionnel.
        Mode actuel : <strong style="color:var(--cyan-soft)">${state.api.available ? "backend connecté (données partagées)" : "local (localStorage)"}</strong>.
        Cache catalogue : <strong style="color:var(--cyan-soft)">${store.get(CONFIG.LS.CATALOG, null) ? "actif" : "vierge"}</strong>.</p>
      </div>
    </div>`;

  /* GitHub */
  $("#gh-save", c).addEventListener("click", () => {
    const cfg = {
      repo: $("#gh-repo", c).value.trim(),
      branch: $("#gh-branch", c).value.trim() || "main",
      folder: $("#gh-folder", c).value.trim() || "beta-arsenal",
      token: $("#gh-token", c).value.trim(),
    };
    if (cfg.repo && !/^[\w.-]+\/[\w.-]+$/.test(cfg.repo)) {
      toast("Format du dépôt invalide — utilisez « owner/repo ».", "error");
      return;
    }
    store.set(CONFIG.LS.GITHUB, cfg);
    toast("Configuration GitHub enregistrée.", "success");
  });

  $("#gh-test", c).addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const repo = $("#gh-repo", c).value.trim();
    const token = $("#gh-token", c).value.trim() || gh.token;
    if (!repo) { toast("Renseignez le dépôt à tester.", "error"); return; }
    btn.disabled = true;
    btn.innerHTML = `<span class="spin"></span> Test…`;
    try {
      const resp = await fetch(`https://api.github.com/repos/${repo}`, {
        headers: token ? { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } : { Accept: "application/vnd.github+json" },
      });
      if (resp.ok) {
        const json = await resp.json();
        toast(`Connexion OK — dépôt « ${json.full_name} » (visibility : ${json.visibility}).`, "success", 5000);
      } else if (resp.status === 401) {
        toast("Token invalide ou expiré (401).", "error");
      } else if (resp.status === 404) {
        toast("Dépôt introuvable — vérifiez le nom et les permissions du token.", "error");
      } else {
        toast(`GitHub a répondu ${resp.status}.`, "error");
      }
    } catch (ex) {
      toast("API GitHub injoignable depuis ce navigateur.", "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = `${I.refresh} Tester la connexion`;
    }
  });

  /* Mot de passe */
  $("#pw-save", c).addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const current = $("#pw-current", c).value;
    const next = $("#pw-next", c).value;
    if (next.length < 8) { toast("Le nouveau mot de passe doit contenir au moins 8 caractères.", "error"); return; }
    try {
      const token = await adminLogin(current);
      if (token !== (state.admin.token || session.get(CONFIG.SS.TOKEN))) {
        throw new Error("Le mot de passe actuel est incorrect.");
      }
    } catch (ex) {
      toast(ex.message || "Mot de passe actuel incorrect.", "error");
      return;
    }
    btn.disabled = true;
    try {
      await changeAdminPassword(next);
      toast("Mot de passe administrateur mis à jour.", "success");
      $("#pw-current", c).value = "";
      $("#pw-next", c).value = "";
    } catch (ex) {
      toast(ex.message || "Échec du changement de mot de passe.", "error");
    } finally {
      btn.disabled = false;
    }
  });

  /* Données */
  $("#data-export", c).addEventListener("click", () => {
    const payload = {
      app: CONFIG.APP_NAME, version: CONFIG.VERSION, exportedAt: new Date().toISOString(),
      products: state.products,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `beta-arsenal-catalogue-${dayKey()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("Catalogue exporté.", "success");
  });

  $("#data-import", c).addEventListener("click", () => $("#data-import-file", c).click());
  $("#data-import-file", c).addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const list = Array.isArray(json) ? json : json.products;
      if (!Array.isArray(list) || !list.length) throw new Error("JSON sans tableau « products ».");
      const clean = list.filter((p) => p && p.title && p.imageUrl);
      if (!clean.length) throw new Error("Aucun produit valide trouvé.");
      if (state.api.available) {
        for (const p of clean) {
          const body = {
            title: String(p.title), shortDescription: String(p.shortDescription || ""),
            description: String(p.description || ""), category: CATEGORIES[p.category] ? p.category : "saas",
            actionType: ACTION_TYPES[p.actionType] ? p.actionType : "chariow",
            badges: (p.badges || []).filter((b) => BADGES.includes(b)),
            price: String(p.price || ""), actionUrl: safeUrl(p.actionUrl),
            pwaUrl: safeUrl(p.pwaUrl) || null, command: p.command ? String(p.command) : null,
            videoUrl: safeUrl(p.videoUrl) || null, imageUrl: safeUrl(p.imageUrl),
          };
          await apiFetch("/api/products", { method: "POST", body, auth: true, timeout: 9000 });
        }
        await refreshCatalog({ silent: false });
      } else {
        saveLocalProducts(clean.map((p, i) => ({ ...p, id: p.id || uuid(), clicks: p.clicks || 0, createdAt: p.createdAt || Date.now() - i * DAY_MS, updatedAt: Date.now() })));
        renderGrid(); renderHeroStats();
      }
      toast(`${clean.length} produit(s) importé(s).`, "success");
    } catch (ex) {
      toast(ex.message || "Import impossible — JSON invalide.", "error", 5000);
    } finally {
      e.target.value = "";
    }
  });

  $("#data-reset", c).addEventListener("click", () => {
    [CONFIG.LS.CATALOG, CONFIG.LS.PRODUCTS, CONFIG.LS.ANALYTICS, CONFIG.LS.UPLOADS].forEach(store.del);
    state.products = SEED_PRODUCTS.map((p) => ({ ...p }));
    state.catalogVersion = null;
    if (state.api.available) refreshCatalog({ silent: false });
    renderGrid(); renderHeroStats();
    toast("Données locales réinitialisées — catalogue de démonstration restauré.", "success");
  });
}

/* ============================== AMORÇAGE ============================== */
async function boot() {
  /* 1) Peinture instantanée depuis le cache localStorage (100+ users sans
        ralentissement : zéro requête bloquante au premier rendre). */
  const hadCache = loadCatalogSync();
  bindPublicControls();
  handleRoute();
  renderGrid();
  renderHeroStats();
  if (!hadCache) {
    $("#results-count").innerHTML = "Catalogue de démonstration chargé";
  }

  /* 2) Détection du backend, puis rafraîchissement arrière-plan. */
  await detectApi();
  if (state.api.available) {
    await refreshCatalog({ silent: true });
    if (state.view === "admin") renderAdmin();
  }

  /* 3) Comptage de la visite (une fois par session navigateur). */
  if (!session.get("ba_visit_counted")) {
    session.set("ba_visit_counted", "1");
    trackVisit();
  }

  /* 4) Synchronisation multi-onglets (analytics & catalogue locaux). */
  window.addEventListener("storage", (e) => {
    if (e.key === CONFIG.LS.ANALYTICS && state.view === "admin" && state.admin.tab === "analytics") {
      refreshAnalytics(true);
    }
    if (e.key === CONFIG.LS.PRODUCTS && !state.api.available) {
      state.products = localProducts();
      renderGrid(); renderHeroStats();
    }
  });
}

document.addEventListener("DOMContentLoaded", boot);




