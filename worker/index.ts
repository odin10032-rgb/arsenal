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

app.route("/", healthRoutes);
app.route("/", productRoutes);
app.route("/", trackRoutes);
app.route("/", analyticsRoutes);
app.route("/", authRoutes);
app.route("/", userAuthRoutes);
app.route("/", meRoutes);
app.route("/", adminRoutes);
app.route("/", mediaRoutes);

app.notFound((c) => c.json({ ok: false, error: "Route introuvable." }, 404));

app.onError((err, c) => {
  console.error("Worker error:", err);
  return c.json({ ok: false, error: "Erreur serveur inattendue." }, 500);
});

export default app;
