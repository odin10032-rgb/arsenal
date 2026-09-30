/**
 * Arsenal — Client pour upload GitHub
 * Utilise l'API Contents pour pousser des fichiers.
 */

export async function uploadToGitHub(
  filename: string,
  buffer: Buffer,
  config: {
    token: string;
    owner: string;
    repo: string;
    branch: string;
    /**
     * Sous-dossier du dépôt (défaut `uploads/`, comportement des médias).
     * Les fichiers livrables des produits utilisent `products/` (Phase 2.6).
     */
    folder?: string;
  }
): Promise<string> {
  const { token, owner, repo, branch } = config;
  // Dossier normalisé : jamais de chemin absolu ni de remontée (`..`).
  const folder = (config.folder || "uploads").replace(/^\/+|\/+$/g, "").replace(/\.\./g, "");
  const path = `${folder}/${filename}`;
  const targetUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

  const content = buffer.toString("base64");

  const response = await fetch(targetUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "Arsenal-App"
    },
    body: JSON.stringify({
      message: `Upload ${path}`,
      content,
      branch,
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || "Erreur upload GitHub");
  }

  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
}
