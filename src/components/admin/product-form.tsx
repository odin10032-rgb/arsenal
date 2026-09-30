"use client";

/**
 * Formulaire produit (création / édition) — panneau latéral
 * Champs conditionnels : PWA (mobile), commande (terminal), aperçu vidéo live,
 * image par URL ou dropzone (upload API + repli compression locale),
 * livraison en A (fichier téléchargeable ou clé de licence).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  MAX_PRODUCT_FILE_BYTES,
  PRODUCT_FILE_EXTENSIONS,
  deleteProductFile,
  productFileErrorMessage,
  uploadImage,
  uploadProductFile,
} from "@/lib/admin";
import { apiFetch } from "@/lib/api";
import { fmtBytes } from "@/lib/format";
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
  // Affiliation (Phase 2)
  const [affiliateEnabled, setAffiliateEnabled] = useState(product?.affiliateEnabled ?? false);
  const [commissionType, setCommissionType] = useState<"percent" | "fixed">(
    product?.commissionType === "fixed" ? "fixed" : "percent",
  );
  const [commissionValue, setCommissionValue] = useState(
    product?.commissionValue != null ? String(product.commissionValue) : "",
  );
  const [rewardA, setRewardA] = useState(product?.rewardA != null ? String(product.rewardA) : "");
  // Vente en A (Phase 2.6)
  const [purchasable, setPurchasable] = useState(product?.purchasable ?? false);
  const [priceA, setPriceA] = useState(product?.priceA != null ? String(product.priceA) : "");
  const [chariowProductId, setChariowProductId] = useState(product?.chariowProductId ?? "");
  const [fulfillmentMethod, setFulfillmentMethod] = useState<
    "manual" | "chariow_free_checkout" | "chariow_discount_checkout"
  >(
    product?.fulfillmentMethod === "chariow_free_checkout"
      ? "chariow_free_checkout"
      : product?.fulfillmentMethod === "chariow_discount_checkout"
        ? "chariow_discount_checkout"
        : "manual",
  );
  const [chariowDiscountCode, setChariowDiscountCode] = useState(
    product?.chariowDiscountCode ?? "",
  );
  // Livraison (Phase 2.7) — 'none' = méthode Chariow/manuelle existante
  const [deliveryKind, setDeliveryKind] = useState<"none" | "file" | "license">(
    product?.deliveryKind === "file" ? "file" : product?.deliveryKind === "license" ? "license" : "none",
  );
  const [storedFile, setStoredFile] = useState<{ name: string; size: number } | null>(
    product?.productFileName
      ? { name: product.productFileName, size: product.productFileSize ?? 0 }
      : null,
  );
  const [uploadingFile, setUploadingFile] = useState(false);
  const [removingFile, setRemovingFile] = useState(false);
  const [fileDragOver, setFileDragOver] = useState(false);
  const productFileRef = useRef<HTMLInputElement>(null);

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

  /**
   * Upload du fichier livré — réservé à l'édition (le produit doit exister).
   * Le serveur reste l'arbitre : contrôles locaux (taille, extension) puis erreurs du
   * contrat (413 / 400 / 503) rendues en message explicite.
   */
  const onDropProductFile = async (file: File | undefined | null) => {
    if (!file || !product) return;
    if (file.size > MAX_PRODUCT_FILE_BYTES)
      return toast("Fichier trop volumineux (25 Mo maximum).", "error");
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!(PRODUCT_FILE_EXTENSIONS as readonly string[]).includes(ext))
      return toast(
        `Format refusé — acceptés : ${PRODUCT_FILE_EXTENSIONS.join(", ").toUpperCase()}.`,
        "error",
      );
    if (uploadingFile || removingFile) return;
    setUploadingFile(true);
    try {
      const info = await uploadProductFile(product.id, file);
      setStoredFile({ name: info.name || file.name, size: info.size || file.size });
      toast(
        product.deliveryKind === "file"
          ? "Nouveau fichier téléversé."
          : "Fichier téléversé — enregistrez le produit pour activer la livraison.",
        "success",
      );
    } catch (err) {
      toast(productFileErrorMessage(err), "error");
    } finally {
      setUploadingFile(false);
    }
  };

  /** Retrait du fichier livré (immédiat côté serveur — le mode de livraison, lui, se règle avec « Enregistrer ») */
  const removeProductFile = async () => {
    if (!product || uploadingFile || removingFile) return;
    setRemovingFile(true);
    try {
      await deleteProductFile(product.id);
      setStoredFile(null);
      toast("Fichier retiré du serveur.", "success");
    } catch (err) {
      toast(productFileErrorMessage(err), "error");
    } finally {
      setRemovingFile(false);
    }
  };

  const save = async () => {
    if (busy) return;
    const errors: string[] = [];
    if (title.trim().length < 2) errors.push("titre (2 caractères min.)");
    if (!short.trim()) errors.push("description courte");
    if (!safeUrl(actionUrl)) errors.push(actionType === "chariow" ? "URL du tunnel Chariow" : "URL d'action");
    if (!safeUrl(imageUrl)) errors.push("image de couverture");
    // Vente en A : prix > 0 requis, et identifiants Chariow pour le fulfillment automatique
    const priceANum = Math.trunc(Number(priceA));
    if (purchasable && (!Number.isFinite(priceANum) || priceANum <= 0)) errors.push("prix en A (> 0)");
    if (purchasable && fulfillmentMethod !== "manual" && !chariowProductId.trim())
      errors.push("id produit Chariow");
    if (purchasable && fulfillmentMethod === "chariow_discount_checkout" && !chariowDiscountCode.trim())
      errors.push("code promo Chariow");
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
      affiliateEnabled,
      commissionType: affiliateEnabled ? commissionType : null,
      commissionValue:
        affiliateEnabled && commissionValue.trim() !== "" && Number.isFinite(Number(commissionValue))
          ? Number(commissionValue)
          : null,
      rewardA: affiliateEnabled && rewardA.trim() !== "" ? Math.trunc(Number(rewardA)) || 0 : 0,
      // Vente en A (Phase 2.6) — le serveur valide (prix > 0 si achetable, etc.)
      purchasable,
      priceA: purchasable ? Math.trunc(Number(priceA)) || 0 : 0,
      chariowProductId: chariowProductId.trim() || null,
      chariowDiscountCode: chariowDiscountCode.trim().toUpperCase() || null,
      fulfillmentMethod,
      // Livraison (Phase 2.7) — null = méthode existante (Chariow / manuelle)
      deliveryKind: deliveryKind === "none" ? null : deliveryKind,
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

          {/* Affiliation (Phase 2) — commission et récompense A du produit */}
          <div className="rounded-xl border border-[#333] bg-[rgba(255,255,255,0.02)] p-4">
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="text-[0.84rem] font-semibold">Produit éligible à l'affiliation</span>
              <input
                type="checkbox"
                checked={affiliateEnabled}
                onChange={(e) => setAffiliateEnabled(e.target.checked)}
                className="h-5 w-5 accent-[#e63946]"
              />
            </label>
            <p className="mt-1 text-[0.72rem] text-[#666]">
              Les affiliés actifs pourront créer un lien de suivi vers ce produit.
            </p>

            {affiliateEnabled && (
              <div className="mt-4 flex flex-col gap-3 border-t border-dashed border-[#333] pt-4">
                <div className="flex gap-3">
                  <label className="flex-1">
                    <span className="mb-1.5 block text-[0.8rem] text-[#a0a0a0]">Type de commission</span>
                    <select
                      className="input-arsenal cursor-pointer"
                      value={commissionType}
                      onChange={(e) => setCommissionType(e.target.value as "percent" | "fixed")}
                    >
                      <option value="percent">Pourcentage du prix</option>
                      <option value="fixed">Montant fixe</option>
                    </select>
                  </label>
                  <label className="flex-1">
                    <span className="mb-1.5 block text-[0.8rem] text-[#a0a0a0]">
                      {commissionType === "percent" ? "Commission (%)" : "Commission (FCFA)"}
                    </span>
                    <input
                      className="input-arsenal font-mono"
                      inputMode="decimal"
                      value={commissionValue}
                      onChange={(e) => setCommissionValue(e.target.value)}
                      placeholder={commissionType === "percent" ? "30" : "5000"}
                    />
                  </label>
                </div>
                <label>
                  <span className="mb-1.5 block text-[0.8rem] text-[#a0a0a0]">
                    Récompense en A par vente <span className="text-[#666]">(optionnel)</span>
                  </span>
                  <input
                    className="input-arsenal font-mono"
                    inputMode="numeric"
                    value={rewardA}
                    onChange={(e) => setRewardA(e.target.value)}
                    placeholder="50"
                  />
                </label>
                <p className="text-[0.72rem] text-[#666]">
                  Laissez vide pour utiliser les valeurs par défaut d'Arsenal (définies dans les réglages).
                </p>
              </div>
            )}
          </div>

          {/* Vente en A (Phase 2.6) — prix en A, produit Chariow, méthode de fulfillment */}
          <div className="rounded-xl border border-[#333] bg-[rgba(255,255,255,0.02)] p-4">
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="text-[0.84rem] font-semibold">Achetable avec des A</span>
              <input
                type="checkbox"
                checked={purchasable}
                onChange={(e) => setPurchasable(e.target.checked)}
                className="h-5 w-5 accent-[#e63946]"
              />
            </label>
            <p className="mt-1 text-[0.72rem] text-[#666]">
              Le produit apparaît sur la page produit avec « Obtenir pour X A » et rejoint
              « Mes produits » du client après livraison.
            </p>

            {purchasable && (
              <div className="mt-4 flex flex-col gap-3 border-t border-dashed border-[#333] pt-4">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <label className="flex-1">
                    <span className="mb-1.5 block text-[0.8rem] text-[#a0a0a0]">Prix en A *</span>
                    <input
                      className="input-arsenal font-mono"
                      inputMode="numeric"
                      value={priceA}
                      onChange={(e) => setPriceA(e.target.value)}
                      placeholder="500"
                    />
                  </label>
                  <label className="flex-1">
                    <span className="mb-1.5 block text-[0.8rem] text-[#a0a0a0]">
                      Méthode de fulfillment
                    </span>
                    <select
                      className="input-arsenal cursor-pointer"
                      value={fulfillmentMethod}
                      onChange={(e) =>
                        setFulfillmentMethod(
                          e.target.value === "chariow_free_checkout"
                            ? "chariow_free_checkout"
                            : e.target.value === "chariow_discount_checkout"
                              ? "chariow_discount_checkout"
                              : "manual",
                        )
                      }
                    >
                      <option value="manual">Manuelle (vous livrez)</option>
                      <option value="chariow_discount_checkout">
                        Chariow — code promo (recommandé)
                      </option>
                      <option value="chariow_free_checkout">
                        Chariow — checkout produit gratuit
                      </option>
                    </select>
                  </label>
                </div>

                <label>
                  <span className="mb-1.5 block text-[0.8rem] text-[#a0a0a0]">
                    Id produit Chariow{" "}
                    <span className="text-[#666]">
                      {fulfillmentMethod === "manual" ? "(facultatif)" : "(requis)"}
                    </span>
                  </span>
                  <input
                    className="input-arsenal font-mono text-[0.8rem]"
                    value={chariowProductId}
                    onChange={(e) => setChariowProductId(e.target.value)}
                    placeholder={
                      fulfillmentMethod === "chariow_discount_checkout"
                        ? "id du produit Chariow d'origine (payant)"
                        : fulfillmentMethod === "chariow_free_checkout"
                          ? "id du produit Chariow dupliqué « Gratuit »"
                          : "id d'un produit Chariow (facultatif)"
                    }
                  />
                </label>

                {fulfillmentMethod === "chariow_discount_checkout" && (
                  <label>
                    <span className="mb-1.5 block text-[0.8rem] text-[#a0a0a0]">
                      Code promo Chariow <span className="text-[#e63946]">*</span>
                    </span>
                    <input
                      className="input-arsenal font-mono text-[0.8rem] uppercase"
                      value={chariowDiscountCode}
                      onChange={(e) => setChariowDiscountCode(e.target.value.slice(0, 60))}
                      placeholder="ARSENAL-A-2026"
                      autoComplete="off"
                    />
                    <span className="mt-1 block text-[0.68rem] leading-relaxed text-[#666]">
                      60 caractères maximum, majuscules/chiffres/tirets. Ce code n&apos;est jamais
                      exposé par le catalogue public.
                    </span>
                  </label>
                )}

                {fulfillmentMethod === "manual" ? (
                  <p className="text-[0.72rem] leading-relaxed text-[#666]">
                    Livraison manuelle : la commande arrive dans l&apos;onglet Commandes —
                    vous la marquez livrée (référence + note) après avoir transmis l&apos;accès.
                    Aucun prérequis Chariow n&apos;est nécessaire.
                  </p>
                ) : fulfillmentMethod === "chariow_discount_checkout" ? (
                  <div className="rounded-[10px] border border-[rgba(42,157,143,0.4)] bg-[rgba(42,157,143,0.07)] px-3.5 py-3">
                    <p className="text-[0.78rem] font-semibold text-[#56b8a8]">
                      Méthode recommandée — produit d&apos;origine + code promo
                    </p>
                    <div className="mt-1.5 flex flex-col gap-1.5 text-[0.72rem] leading-relaxed text-[#a0a0a0]">
                      <p>
                        • Le produit Chariow reste <b className="text-[#f0f0f0]">payant au prix plein</b>{" "}
                        pour les clients normaux : aucun produit dupliqué, aucun re-téléversement de
                        fichier. Les achats réglés en A passent par ce code promo.
                      </p>
                      <p>
                        • Créez le coupon dans Chariow → <b className="text-[#a0a0a0]">Marketing →
                        Réductions</b> (l&apos;API Chariow ne permet pas de le créer), ciblé sur ce
                        produit, actif, puis renseignez son code ci-dessus.
                      </p>
                      <p>
                        • Il doit valoir <b className="text-[#f0f0f0]">100 %</b> (type « percentage »)
                        ou un <b className="text-[#f0f0f0]">montant égal au prix</b> (type « fixed »),
                        sinon Chariow renvoie une commande à payer (« step payment ») et la livraison
                        échoue avec ce motif — les A restant remboursables depuis l&apos;onglet
                        Commandes.
                      </p>
                      <p>
                        • La valeur d&apos;un coupon à 100 % doit être confirmée par un test réel
                        côté Chariow (aucune source officielle ne garantit ce plafond) — à vérifier
                        avant d&apos;activer la vente en A.
                      </p>
                      <p>
                        • La clé API Chariow (onglet Paramètres) est obligatoire ; sans elle, la
                        commande échoue avec ce motif, sans tentative réseau.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[10px] border border-[rgba(244,162,97,0.4)] bg-[rgba(244,162,97,0.07)] px-3.5 py-3">
                    <p className="text-[0.78rem] font-semibold text-[#f4c886]">
                      Contraintes réelles du checkout Chariow
                    </p>
                    <div className="mt-1.5 flex flex-col gap-1.5 text-[0.72rem] leading-relaxed text-[#a0a0a0]">
                      <p>
                        • Le produit Chariow doit être en modèle de tarification « Gratuit » :
                        l&apos;API checkout n&apos;accepte aucun montant, le prix vient du produit.
                      </p>
                      <p>
                        • Un produit gratuit l&apos;est pour quiconque possède l&apos;URL ; la seule
                        atténuation documentée est de le masquer de la boutique. Recommandation :
                        un produit Chariow dédié « Arsenal (A) », masqué, distinct du produit payant.
                      </p>
                      <p>
                        • Cette méthode impose de <b className="text-[#f0f0f0]">téléverser à nouveau
                        le fichier</b> sur le produit dupliqué — préférez la méthode « code promo »
                        pour livrer depuis le produit d&apos;origine.
                      </p>
                      <p>
                        • Types Service / Coaching et prix libre : refusés par l&apos;API (422) —
                        utilisez la méthode manuelle pour ceux-là.
                      </p>
                      <p>
                        • La clé API Chariow (onglet Paramètres) est obligatoire ; sans elle, la
                        commande part en échec avec ce motif, sans tentative réseau.
                      </p>
                      <p>
                        • Aucun mode sandbox n&apos;est documenté : les tests réels passent par la
                        clé live. En cas d&apos;échec, les A restent traçables (relance ou
                        remboursement depuis l&apos;onglet Commandes).
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Livraison (Phase 2.7) — fichier téléchargeable ou clé de licence, appliqués aux achats en A */}
            <div className="mt-4 flex flex-col gap-3 border-t border-dashed border-[#333] pt-4">
              <div>
                <p className="text-[0.84rem] font-semibold">Livraison</p>
                <p className="mt-0.5 text-[0.72rem] leading-relaxed text-[#666]">
                  {purchasable
                    ? "Ce que le client reçoit après un achat en A."
                    : "Appliqué aux achats en A — cochez « Achetable avec des A » ci-dessus pour l'utiliser."}
                </p>
              </div>

              <label>
                <span className="mb-1.5 block text-[0.8rem] text-[#a0a0a0]">Mode de livraison</span>
                <select
                  className="input-arsenal cursor-pointer"
                  value={deliveryKind}
                  onChange={(e) =>
                    setDeliveryKind(
                      e.target.value === "file" ? "file" : e.target.value === "license" ? "license" : "none",
                    )
                  }
                >
                  <option value="none">Via Chariow (aucun fichier ni clé)</option>
                  <option value="file">Fichier téléchargeable</option>
                  <option value="license">Clé de licence</option>
                </select>
              </label>

              {deliveryKind === "file" && !product && (
                <p className="rounded-[10px] border border-dashed border-[#333] px-3.5 py-3 text-[0.76rem] leading-relaxed text-[#666]">
                  Enregistrez d&apos;abord le produit pour téléverser son fichier.
                </p>
              )}

              {deliveryKind === "file" && product && (
                <div className="flex flex-col gap-2.5">
                  {storedFile && (
                    <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-[#333] bg-[rgba(255,255,255,0.02)] px-3.5 py-3">
                      <svg
                        viewBox="0 0 24 24"
                        width="20"
                        height="20"
                        fill="none"
                        stroke="#4fb3a1"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <path d="M14 2v6h6" />
                      </svg>
                      <div className="min-w-0 flex-1">
                        <p className="break-all font-mono text-[0.76rem] text-[#f0f0f0]">
                          {storedFile.name}
                        </p>
                        <p className="mt-0.5 font-mono text-[0.66rem] text-[#666]">
                          {storedFile.size > 0 ? fmtBytes(storedFile.size) : "taille inconnue"} · fichier
                          livré actuel
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void removeProductFile()}
                        disabled={uploadingFile || removingFile}
                        className="btn-arsenal btn-danger"
                      >
                        {removingFile && <span className="spin" />}
                        Retirer
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => productFileRef.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setFileDragOver(true);
                    }}
                    onDragLeave={() => setFileDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setFileDragOver(false);
                      void onDropProductFile(e.dataTransfer.files?.[0]);
                    }}
                    disabled={uploadingFile || removingFile}
                    className={`flex min-h-[96px] flex-col items-center justify-center gap-1.5 rounded-[10px] border-[1.6px] border-dashed p-4 text-center transition-colors ${
                      fileDragOver
                        ? "border-[#2a9d8f] bg-[rgba(42,157,143,0.1)] text-[#4fb3a1]"
                        : "border-[rgba(230,57,70,0.4)] bg-[rgba(230,57,70,0.045)] text-[#666] hover:border-[rgba(230,57,70,0.7)]"
                    }`}
                  >
                    {uploadingFile ? (
                      <>
                        <span className="spin" />
                        <span className="font-mono text-[0.7rem]">Téléversement en cours…</span>
                      </>
                    ) : (
                      <>
                        <svg
                          viewBox="0 0 24 24"
                          width="20"
                          height="20"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M12 16V4m0 0 4 4m-4-4-4 4M4 20h16" />
                        </svg>
                        <span className="text-[0.84rem] font-semibold text-[#a0a0a0]">
                          {storedFile
                            ? "Glissez-déposez un nouveau fichier pour remplacer"
                            : "Glissez-déposez le fichier livré ici"}
                        </span>
                        <span className="font-mono text-[0.66rem]">
                          PDF · EPUB · MOBI · ZIP · MP4 · APK — 25 Mo max
                        </span>
                      </>
                    )}
                  </button>
                  <input
                    ref={productFileRef}
                    type="file"
                    accept=".pdf,.epub,.mobi,.zip,.mp4,.apk,application/pdf,application/epub+zip,application/x-mobipocket-ebook,application/zip,application/vnd.android.package-archive,video/mp4"
                    className="hidden"
                    onChange={(e) => void onDropProductFile(e.target.files?.[0])}
                  />
                  <p className="text-[0.68rem] leading-relaxed text-[#666]">
                    Le fichier est stocké dès le téléversement, mais le client ne pourra le
                    télécharger qu&apos;une fois la livraison terminée. Cliquez sur « Enregistrer »
                    pour appliquer ce mode de livraison au produit.
                  </p>
                </div>
              )}

              {deliveryKind === "license" && (
                <p className="rounded-[10px] border border-[rgba(42,157,143,0.35)] bg-[rgba(42,157,143,0.06)] px-3.5 py-3 text-[0.76rem] leading-relaxed text-[#a0a0a0]">
                  Une clé de licence sera générée automatiquement à chaque achat et vérifiable par
                  votre application (activation par appareil, révocation possible depuis l&apos;onglet
                  Licences).
                </p>
              )}

              {deliveryKind === "none" && (
                <p className="text-[0.72rem] leading-relaxed text-[#666]">
                  Aucun fichier ni clé : la livraison suit la méthode Chariow / manuelle choisie
                  ci-dessus.
                </p>
              )}
            </div>
          </div>
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
