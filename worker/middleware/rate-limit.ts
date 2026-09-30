import type { Context, Next } from "hono";
import type { Env } from "../env";

/**
 * Fenêtre glissante en mémoire (par isolate) — simple garde-fou anti-abus,
 * pas un bouclier absolu (les isolates sont éphémères et l'état non partagé).
 * Suffisant en Phase 0 ; remplaçable par DO/WAF plus tard sans changer les routes.
 */
const buckets = new Map<string, number[]>();

export function rateLimit(opts: { limit: number; windowMs: number; label: string }) {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    try {
      const ip = c.req.header("cf-connecting-ip") || "unknown";
      const key = `${opts.label}:${ip}`;
      const now = Date.now();
      const hits = (buckets.get(key) || []).filter((t) => now - t < opts.windowMs);
      if (hits.length >= opts.limit) {
        return c.json({ ok: false, error: "Trop de requêtes. Réessayez dans un instant." }, 429);
      }
      hits.push(now);
      buckets.set(key, hits);
      if (buckets.size > 10_000) {
        for (const [k, v] of buckets) {
          if (v.every((t) => now - t >= opts.windowMs)) buckets.delete(k);
        }
      }
    } catch {
      /* ne jamais bloquer le trafic à cause d'une erreur du limiteur */
    }
    await next();
  };
}
