import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./env";
import { healthRoutes } from "./routes/health";
import { productRoutes } from "./routes/products";
import { trackRoutes } from "./routes/track";
import { analyticsRoutes } from "./routes/analytics";
import { authRoutes } from "./routes/auth";
import { userAuthRoutes } from "./routes/user-auth";
import { meRoutes } from "./routes/me";
import { adminRoutes } from "./routes/admin";
import { mediaRoutes } from "./routes/media";
import { affiliateRoutes } from "./routes/affiliate";
import { affiliateTrackRoutes } from "./routes/affiliate-track";
import { chariowWebhookRoutes } from "./routes/chariow-webhook";
import { adminAffiliationRoutes } from "./routes/admin-affiliation";
import { purchaseRoutes } from "./routes/purchases";
import { adminPurchaseRoutes } from "./routes/admin-purchases";
import { adminChariowRoutes } from "./routes/admin-chariow";
import { adminCampaignRoutes } from "./routes/admin-campaigns";
import { adminFileRoutes } from "./routes/product-files";
import { downloadRoutes } from "./routes/downloads";
import { licenseVerifyRoutes, licenseUserRoutes, licenseAdminRoutes } from "./routes/licenses";
import { adminUserRoutes } from "./routes/admin-users";
import { legalRoutes } from "./routes/legal";
import { siteConfigRoutes } from "./routes/site-config";
import { PURCHASE_MAX_PER_MIN_DEFAULT, readPurchaseMaxPerMin } from "../src/lib/server/purchases";
import { rateLimit } from "./middleware/rate-limit";

const DEFAULT_FRONT_ORIGINS = [
  "https://arsenal-tools.pages.dev",
  "https://arsenal-v3-preview.pages.dev",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
];

const app = new Hono<{ Bindings: Env }>();

/** CORS en allowlist (fin de la réflexion d'origine) — configurable via FRONT_ORIGINS. */
app.use("*", async (c, next) => {
  const configured = (c.env?.FRONT_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allowed = configured.length ? configured : DEFAULT_FRONT_ORIGINS;
  return cors({
    origin: (origin) => (origin && allowed.includes(origin) ? origin : undefined),
    allowHeaders: [
      "Content-Type",
      "X-Admin-Auth",
      "Authorization",
      "X-GitHub-Token",
      "X-GitHub-Repo",
      "X-GitHub-Branch",
    ],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    maxAge: 86400,
  })(c, next);
});

/** Garde-fous anti-abus (fenêtre glissante en mémoire). */
app.use("/api/auth/login", rateLimit({ limit: 10, windowMs: 60_000, label: "login" }));
app.use("/api/auth/register", rateLimit({ limit: 3, windowMs: 60_000, label: "register" }));
app.use("/api/auth/session", rateLimit({ limit: 10, windowMs: 60_000, label: "user-session" }));
app.use("/api/track", rateLimit({ limit: 120, windowMs: 60_000, label: "track" }));
// Phase 2 — affiliation : clic public 60/min/IP, candidature 5/min/IP (contrat).
app.use(
  "/api/track/affiliate-click",
  rateLimit({ limit: 60, windowMs: 60_000, label: "affiliate-click" })
);
app.use("/api/affiliate/apply", rateLimit({ limit: 5, windowMs: 60_000, label: "affiliate-apply" }));

// Phase 2.6 — achats en A. Le plafond d'achat (5/min/IP par défaut) est RÉGLABLE
// via `settings.purchase_max_per_min` : il est donc relu du réglage à chaque
// requête. La liste des achats (GET) n'est pas concernée. Le retry est borné
// séparément (3/min/IP, contrat) — et par la garde de 5 tentatives serveur.
app.use("/api/purchases", async (c, next) => {
  if (c.req.method !== "POST" || c.req.path !== "/api/purchases") return next();
  let limit = PURCHASE_MAX_PER_MIN_DEFAULT;
  try {
    limit = await readPurchaseMaxPerMin(c.env.DB);
  } catch {
    /* réglage illisible → défaut du contrat */
  }
  return rateLimit({ limit, windowMs: 60_000, label: "purchase" })(c, next);
});
app.use(
  "/api/purchases/:id/retry",
  rateLimit({ limit: 3, windowMs: 60_000, label: "purchase-retry" })
);

// Onglet admin « Chariow » : lectures de la boutique Chariow (30/min/IP, la clé
// API Chariow autorisant 100 req/min côté prestataire) et liaison d'un produit
// (10/min/IP — mutation + appel réseau de vérification).
app.use(
  "/api/admin/chariow/*",
  rateLimit({ limit: 30, windowMs: 60_000, label: "admin-chariow" })
);
app.use(
  "/api/admin/products/:id/chariow-link",
  rateLimit({ limit: 10, windowMs: 60_000, label: "admin-chariow-link" })
);
/** Fichier livrable + licences (phase 2.6, vente en A autonome). */
app.use(
  "/api/admin/products/:id/file",
  rateLimit({ limit: 10, windowMs: 60_000, label: "admin-product-file" })
);
app.use("/api/licenses/verify", rateLimit({ limit: 30, windowMs: 60_000, label: "license-verify" }));

app.route("/", healthRoutes);
app.route("/", productRoutes);
app.route("/", trackRoutes);
app.route("/", analyticsRoutes);
app.route("/", authRoutes);
app.route("/", userAuthRoutes);
app.route("/", meRoutes);
app.route("/", adminRoutes);
app.route("/", mediaRoutes);
app.route("/", affiliateRoutes);
app.route("/", affiliateTrackRoutes);
app.route("/", chariowWebhookRoutes);
app.route("/", adminAffiliationRoutes);
app.route("/", purchaseRoutes);
app.route("/", adminPurchaseRoutes);
app.route("/", adminChariowRoutes);
app.route("/", adminCampaignRoutes);
app.route("/", adminFileRoutes);
app.route("/", downloadRoutes);
app.route("/", licenseVerifyRoutes);
app.route("/", licenseUserRoutes);
app.route("/", licenseAdminRoutes);
/** Onglet admin « Utilisateurs » (profil + historique d'activité par compte). */
app.route("/", adminUserRoutes);
/** Pages légales (contenu éditable depuis les Paramètres admin, public en lecture). */
app.route("/", legalRoutes);
/** Affichage public (statistiques d'accueil pilotées depuis Paramètres → Affichage). */
app.route("/", siteConfigRoutes);

app.notFound((c) => c.json({ ok: false, error: "Route introuvable." }, 404));

app.onError((err, c) => {
  console.error("Worker error:", err);
  return c.json({ ok: false, error: "Erreur serveur inattendue." }, 500);
});

export default app;
