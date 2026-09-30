import type { Hono } from "hono";
import type { AuthContext } from "../src/lib/server/user-auth";

/** Bindings du Worker arsenal-api (secrets via `wrangler secret put`, vars via wrangler-api.jsonc). */
export interface Env {
  DB: D1Database;
  ADMIN_PASSWORD?: string;
  GITHUB_TOKEN?: string;
  GITHUB_REPO_OWNER?: string;
  GITHUB_REPO_NAME?: string;
  GITHUB_BRANCH?: string;
  /** Origines front autorisées (CORS), séparées par des virgules. */
  FRONT_ORIGINS?: string;
}

export type App = Hono<{ Bindings: Env }>;

/** Phase 1 : Variables Hono pour l'auth utilisateur (posées par requireAuth dans me.ts). */
export type AuthedEnv = { Bindings: Env; Variables: { authUser: AuthContext } };

/** Routes nécessitant c.get("authUser") — voir worker/routes/me.ts. */
export type AuthedApp = Hono<AuthedEnv>;
