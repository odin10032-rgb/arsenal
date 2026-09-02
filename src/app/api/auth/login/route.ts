/**
 * Bêta Arsenal — /api/auth/login
 * POST { password } → { ok, token } — le token est stocké côté client en
 * sessionStorage puis transmis dans l'en-tête X-Admin-Auth.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAdminToken, sha256hex } from "@/lib/server/auth";

export async function POST(request: NextRequest) {
  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON invalide." }, { status: 400 });
  }
  const password = String(body.password || "");
  if (!password) {
    return NextResponse.json({ ok: false, error: "Mot de passe requis." }, { status: 400 });
  }
  const expected = await getAdminToken();
  if (sha256hex(password) !== expected) {
    return NextResponse.json(
      { ok: false, error: "Mot de passe incorrect. Accès refusé." },
      { status: 401 }
    );
  }
  return NextResponse.json({ ok: true, token: sha256hex(password) });
}
