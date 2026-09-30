import type { Hono } from "hono";

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
