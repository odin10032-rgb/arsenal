/**
 * Bêta Arsenal — /api/admin/password
 * POST { current, next } (X-Admin-Auth = token courant)
 * Change le mot de passe administrateur et renvoie le nouveau token.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdmin, unauthorized, sha256hex } from "@/lib/server/auth";
import { saveConfig, getConfig } from "@/lib/server/store";

export async function POST(request: NextRequest) {
  if (!(await isAdmin(request))) return unauthorized();
  let body: { current?: string; next?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON invalide." }, { status: 400 });
  }
  const next = String(body.next || "");
  if (next.length < 8) {
    return NextResponse.json(
      { ok: false, error: "Le nouveau mot de passe doit contenir au moins 8 caractères." },
      { status: 400 }
    );
  }
  const config = await getConfig();
  const newToken = sha256hex(next);
  await saveConfig({ ...config, adminToken: newToken });
  return NextResponse.json({ ok: true, token: newToken });
}
