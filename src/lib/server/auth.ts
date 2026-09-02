/**
 * Arsenal — Authentification admin
 * Token = sha256(mot de passe). Envoyé par le client dans l'en-tête X-Admin-Auth.
 */
import { createHash } from "crypto";
import { getConfig } from "./store";

export const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

export function sha256hex(input: string): string {
  return createHash("sha256").update(input, "utf-8").digest("hex");
}

export async function getAdminToken(): Promise<string> {
  const config = await getConfig();
  if (!DEFAULT_ADMIN_PASSWORD) {
    throw new Error("ADMIN_PASSWORD must be set in environment variables");
  }
  return config.adminToken || sha256hex(DEFAULT_ADMIN_PASSWORD);
}

/** Vérifie l'en-tête X-Admin-Auth de la requête. */
export async function isAdmin(request: Request): Promise<boolean> {
  const token = (request.headers.get("x-admin-auth") || "").trim();
  if (!/^[a-f0-9]{64}$/i.test(token)) return false;
  const expected = await getAdminToken();
  return token === expected;
}

export function unauthorized(): Response {
  return Response.json(
    { ok: false, error: "Non autorisé — clé administrateur invalide ou expirée." },
    { status: 401 }
  );
}
