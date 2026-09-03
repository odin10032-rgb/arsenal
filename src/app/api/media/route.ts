export const runtime = 'edge';
import { NextRequest, NextResponse } from "next/server";
import { getMedia, addMedia, writeUpload, MediaItem } from "@/lib/server/store";
import { isAdmin, unauthorized } from "@/lib/server/auth";
import { uploadToGitHub } from "../../../lib/server/github";

export async function POST(request: NextRequest) {
  if (!(await isAdmin(request))) return unauthorized();

  // Log diagnostic configuration GitHub
  console.log("GitHub Config Status:", {
    token: !!process.env.GITHUB_TOKEN,
    owner: !!process.env.GITHUB_REPO_OWNER,
    repo: !!process.env.GITHUB_REPO_NAME,
    branch: !!process.env.GITHUB_BRANCH
  });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ ok: false, error: "Aucun fichier." }, { status: 400 });
  }

  // Récupération des configs depuis les headers si non présentes dans process.env
  const githubToken = process.env.GITHUB_TOKEN || request.headers.get("X-GitHub-Token");
  const githubOwner = process.env.GITHUB_REPO_OWNER || request.headers.get("X-GitHub-Repo")?.split("/")[0];
  const githubRepo = process.env.GITHUB_REPO_NAME || request.headers.get("X-GitHub-Repo")?.split("/")[1];
  const githubBranch = process.env.GITHUB_BRANCH || request.headers.get("X-GitHub-Branch") || "main";

  const buffer = Buffer.from(await file.arrayBuffer());
  // Nettoyage strict du nom de fichier
  const originalName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
  const filename = `${Date.now()}-${originalName}`;
  
  // Sécurité : empêche toute tentative de path traversal
  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return NextResponse.json({ ok: false, error: "Nom de fichier invalide." }, { status: 400 });
  }

  try {
    let url: string;

    // Tentative d'upload vers GitHub
    if (githubToken && githubOwner && githubRepo) {
      url = await uploadToGitHub(filename, buffer, {
        token: githubToken,
        owner: githubOwner,
        repo: githubRepo,
        branch: githubBranch
      });
    } else {
      // Fallback local
      await writeUpload(filename, buffer);
      url = `/api/media/${filename}`;
    }

    const item: MediaItem = {
      name: filename,
      url,
      kind: "image",
      size: buffer.length,
      uploadedAt: Date.now(),
    };
    await addMedia(item);

    return NextResponse.json({ ok: true, item });
  } catch (e: any) {
    console.error("Upload error details:", { message: e.message, stack: e.stack });
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
