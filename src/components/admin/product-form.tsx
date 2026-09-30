"use client";

/**
 * Formulaire produit (création / édition) — panneau latéral
 * Champs conditionnels : PWA (mobile), commande (terminal), aperçu vidéo live,
 * image par URL ou dropzone (upload API + repli compression locale).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { uploadImage } from "@/lib/admin";
import { apiFetch } from "@/lib/api";
import { ACTION_TYPES, BADGES, BADGE_LABELS, Badge, CATEGORIES, Category, ActionType, Product, safeUrl } from "@/lib/products";
import { parseVideoUrl } from "@/lib/video";
import { toast } from "@/lib/toast";

interface Props {
  product: Product | null; // null = création
  onClose: () => void;
  onSaved: () => void;
}

export function ProductForm({ product, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(product?.title ?? "");
  const [short, setShort] = useState(product?.shortDescription ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [category, setCategory] = useState<Category>(product?.category ?? "saas");
  const [actionType, setActionType] = useState<ActionType>(product?.actionType ?? "chariow");
  const [badges, setBadges] = useState<Badge[]>(product?.badges ?? []);
  const [price, setPrice] = useState(product?.price ?? "");
  const [actionUrl, setActionUrl] = useState(product?.actionUrl ?? "");
  const [pwaUrl, setPwaUrl] = useState(product?.pwaUrl ?? "");
  const [command, setCommand] = useState(product?.command ?? "");
  const [videoUrl, setVideoUrl] = useState(product?.videoUrl ?? "");
  const [imageUrl, setImageUrl] = useState(product?.imageUrl ?? "");

  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Aperçu vidéo live (débounce 300 ms)
  const videoPreview = useMemo(() => parseVideoUrl(videoUrl), [videoUrl]);
  useEffect(() => {
    // le useMemo suffit ; ce useEffect matérialise le débounce du champ
    const t = setTimeout(() => void videoPreview, 300);
    return () => clearTimeout(t);
  }, [videoUrl]);

  const toggleBadge = (b: Badge) =>
    setBadges((bs) => (bs.includes(b) ? bs.filter((x) => x !== b) : [...bs, b]));

  const onDropFile = async (file: File | undefined | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast("Le fichier doit être une image.", "error");
    if (file.size > 5 * 1024 * 1024) return toast("Image trop lourde (5 Mo maximum).", "error");
    setUploading(true);
    try {
      const url = await uploadImage(file);
      setImageUrl(url);
      toast("Image téléversée.", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Téléversement impossible.", "error");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (busy) return;
    const errors: string[] = [];
    if (title.trim().length < 2) errors.push("titre (2 caractères min.)");
    if (!short.trim()) errors.push("description courte");
    if (!safeUrl(actionUrl)) errors.push(actionType === "chariow" ? "URL du tunnel Chariow" : "URL d'action");
    if (!safeUrl(imageUrl)) errors.push("image de couverture");
    if (errors.length) {
      toast("Champs manquants ou invalides : " + errors.join(", "), "error");
      return;
    }
    setBusy(true);
    const data: Partial<Product> = {
      title: title.trim(),
      shortDescription: short.trim(),
      description: description.trim(),
      category,
      actionType,
      badges,
      price: price.trim(),
      actionUrl: safeUrl(actionUrl),
      pwaUrl: actionType === "mobile" ? safeUrl(pwaUrl) || null : null,
      command: actionType === "terminal" ? command.trim() || null : null,
      videoUrl: safeUrl(videoUrl) || null,
      imageUrl: safeUrl(imageUrl),
    };
    try {
      if (product) {
        const { productUpdate } = await import("@/lib/admin");
        await productUpdate(product.id, data);
        toast("Produit mis à jour.", "success");
      } else {
        await apiFetch("/api/products", { method: "POST", body: data, auth: true, timeoutMs: 8000 });
        toast("Produit publié.", "success");
      }
      onSaved();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Enregistrement impossible.", "error");
    } finally {
      setBusy(false);
    }
  };

  const fieldHint =
    actionType === "chariow"
      ? "Lien du tunnel de vente ou de la page d'abonnement (Chariow)."
      : actionType === "terminal"
        ? "URL du dépôt GitHub (la commande peut être définie ci-dessous)."
        : "Lien direct vers le fichier APK.";

  return (
    <div className="fixed inset-0 z-[150] bg-[rgba(5,5,5,0.7)]" onClick={onClose}>
      <aside
        className="absolute inset-y-0 right-0 flex w-full flex-col border-l border-[#444] bg-[#101010] md:w-[520px]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={product ? "Modifier le produit" : "Nouveau produit"}
      >
        {/* Entête */}
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-[#333] bg-[rgba(255,255,255,0.02)] px-5 py-4">
          <h3 className="font-display text-[1.05rem] font-bold">
            {product ? "Modifier le produit" : "Nouveau produit"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto grid h-9 w-9 place-items-center rounded-full border border-[#333] bg-[#141414] text-[#a0a0a0] hover:border-[#444] hover:text-[#f0f0f0]"
            aria-label="Fermer"
          >
            <svg viewBox="0 0 24 24" width="15" height="15">
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Corps défilant */}
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
          <Field label="Titre" required hint="90 caractères maximum">
            <input
              className="input-arsenal"
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 90))}
              placeholder="Ex : NeuroForm AI"
            />
          </Field>

          <Field label="Description courte" required hint="Affichée sur la carte du catalogue">
            <input
              className="input-arsenal"
              value={short}
              onChange={(e) => setShort(e.target.value.slice(0, 140))}
              placeholder="1 phrase percutante"
            />
            <p className="mt-1 text-right font-mono text-[0.66rem] text-[#666]">{short.length}/140</p>
          </Field>

          <Field label="Description complète" hint="Affichée sur la page produit">
            <textarea
              className="input-arsenal min-h-[110px] resize-y leading-relaxed"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description détaillée, fonctionnalités, à qui ça s'adresse…"
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Catégorie" required>
              <select className="input-arsenal cursor-pointer" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
                {(Object.keys(CATEGORIES) as Category[]).map((c) => (
                  <option key={c} value={c}>
                    {CATEGORIES[c]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Type de produit (action)" required hint="Détermine la mécanique d'accès.">
              <select className="input-arsenal cursor-pointer" value={actionType} onChange={(e) => setActionType(e.target.value as ActionType)}>
                {(Object.keys(ACTION_TYPES) as ActionType[]).map((t) => (
                  <option key={t} value={t}>
                    {ACTION_TYPES[t]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Badges">
            <div className="flex flex-wrap gap-2">
              {BADGES.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => toggleBadge(b)}
                  aria-pressed={badges.includes(b)}
                  className="inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[0.8rem] font-semibold transition-colors"
                  style={
                    badges.includes(b)
                      ? {
                          color: b === "gratuit" ? "#2a9d8f" : b === "premium" ? "#9b5de5" : b === "beta" ? "#f4a261" : "#00b4d8",
                          borderColor: "currentColor",
                          background: "rgba(255,255,255,0.05)",
                        }
                      : { color: "#a0a0a0", borderColor: "#333", background: "rgba(255,255,255,0.035)" }
                  }
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: badges.includes(b) ? "currentColor" : "#666" }}
                  />
                  {BADGE_LABELS[b]}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Prix affiché" hint="Texte libre — ex : « 19,90 € », « 5000 FCFA », « Gratuit »">
            <input
              className="input-arsenal"
              value={price}
              onChange={(e) => setPrice(e.target.value.slice(0, 24))}
              placeholder="Ex : 19,90 € ou « Gratuit »"
            />
          </Field>

          <Field label="URL de l'action" required hint={fieldHint}>
            <input
              className="input-arsenal font-mono text-[0.8rem]"
              value={actionUrl}
              onChange={(e) => setActionUrl(e.target.value)}
              placeholder="https://checkout.chariow.com/… ou https://github.com/…"
            />
          </Field>

          {actionType === "mobile" && (
            <Field label="URL PWA" hint="Version web installable (optionnel si l'APK suffit).">
              <input
                className="input-arsenal font-mono text-[0.8rem]"
                value={pwaUrl}
                onChange={(e) => setPwaUrl(e.target.value)}
                placeholder="https://app.exemple.dev"
              />
            </Field>
          )}

          {actionType === "terminal" && (
            <Field label="Commande d'installation" hint="Laisser vide pour auto-générer « git clone … && npm install »">
              <input
                className="input-arsenal font-mono text-[0.8rem]"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="npx ma-cli init"
              />
            </Field>
          )}

          <Field label="URL iFrame vidéo" hint="Auto-détection : TikTok / Shorts → 9:16 · YouTube → 16:9">
            <input
              className="input-arsenal font-mono text-[0.8rem]"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="YouTube, YouTube Shorts, TikTok…"
            />
            <p className="mt-1.5 font-mono text-[0.68rem] text-[#666]">
              {videoPreview ? (
                <>
                  Aperçu : <b className="text-[#4fb3a1]">{videoPreview.label}</b> —{" "}
                  {videoPreview.vertical ? "9:16" : "16:9"}
                </>
              ) : (
                videoUrl ? "URL non reconnue — aucun aperçu." : "Aucune vidéo détectée"
              )}
            </p>
          </Field>

          <Field label="Image de couverture" required>
            <div className="flex flex-col gap-2.5">
              <input
                className="input-arsenal font-mono text-[0.8rem]"
                value={imageUrl.startsWith("data:") ? "(image téléversée)" : imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="Collez une URL d'image externe…"
                readOnly={imageUrl.startsWith("data:")}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  void onDropFile(e.dataTransfer.files?.[0]);
                }}
                disabled={uploading}
                className={`flex min-h-[110px] flex-col items-center justify-center gap-1.5 rounded-[10px] border-[1.6px] border-dashed p-4 text-center transition-colors ${
                  dragOver ? "border-[#2a9d8f] bg-[rgba(42,157,143,0.1)] text-[#4fb3a1]" : "border-[rgba(230,57,70,0.4)] bg-[rgba(230,57,70,0.045)] text-[#666] hover:border-[rgba(230,57,70,0.7)]"
                }`}
              >
                {uploading ? (
                  <>
                    <span className="spin" />
                    <span className="font-mono text-[0.7rem]">Téléversement en cours…</span>
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 16V4m0 0 4 4m-4-4-4 4M4 20h16" />
                    </svg>
                    <span className="text-[0.84rem] font-semibold text-[#a0a0a0]">
                      Glissez-déposez une image ici
                    </span>
                    <span className="font-mono text-[0.66rem]">JPG · PNG · WebP · GIF — 5 Mo max</span>
                  </>
                )}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                className="hidden"
                onChange={(e) => void onDropFile(e.target.files?.[0])}
              />
              {safeUrl(imageUrl) && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={imageUrl}
                  alt="Aperçu de la couverture"
                  className="aspect-video w-full rounded-[10px] border border-[#333] object-cover"
                />
              )}
            </div>
          </Field>
        </div>

        {/* Pied */}
        <div className="flex flex-shrink-0 gap-3 border-t border-[#333] bg-[rgba(8,8,8,0.7)] px-5 py-4">
          <button type="button" onClick={onClose} className="btn-arsenal btn-ghost flex-1">
            Annuler
          </button>
          <button type="button" onClick={save} disabled={busy} className="btn-arsenal btn-primary flex-1">
            {busy && <span className="spin" />}
            {product ? "Enregistrer les modifications" : "Publier le produit"}
          </button>
        </div>
      </aside>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1 text-[0.78rem] font-semibold text-[#a0a0a0]">
        {label}
        {required && <span className="text-[#e63946]">*</span>}
      </span>
      {children}
      {hint && <span className="text-[0.68rem] leading-relaxed text-[#666]">{hint}</span>}
    </label>
  );
}
