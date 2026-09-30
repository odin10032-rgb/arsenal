"use client";

/**
 * Onglet Chariow — piloter la boutique depuis Arsenal.
 *
 * Périmètre RÉEL (audit docs/chantier/06-audit-chariow-fulfillment.md) : l'API
 * Chariow est en LECTURE SEULE sur les produits (19 chemins, `/products` en GET
 * uniquement). Cet onglet se limite donc à ce qui est possible :
 * • état de la connexion (GET /api/admin/chariow/status) : boutique + clé API + secret du webhook ;
 * • liste des produits de la boutique (GET /api/admin/chariow/products) avec, pour
 *   chacun, son état de liaison à un produit Arsenal ;
 * • bouton « Lier » → confirmation, appel de POST /api/admin/products/:id/chariow-link
 *   (vérification réelle côté Chariow) puis affichage du diagnostic et des avertissements.
 *
 * La création du produit Chariow, du code promo et le téléversement du fichier
 * restent MANUELS dans l'interface Chariow : aucun endpoint ne les expose.
 */

import { useCallback, useEffect, useState } from "react";
import {
  fetchChariowProducts,
  fetchChariowStatus,
  linkChariowProduct,
  type ChariowLinkDiagnostic,
  type ChariowProduct,
  type ChariowStatus,
} from "@/lib/admin";
import { ApiError } from "@/lib/api";
import type { Product } from "@/lib/products";
import { toast } from "@/lib/toast";

/** Libellés des types Chariow (énumération officielle de l'OpenAPI). */
const TYPE_LABELS: Record<string, string> = {
  downloadable: "Fichier téléchargeable",
  course: "Formation",
  license: "Licence",
  service: "Service",
  bundle: "Pack",
  coaching: "Coaching",
};

/** Types refusés par l'API checkout (422) — relèvent de la livraison manuelle. */
const CHECKOUT_UNSUPPORTED_TYPES = ["service", "coaching"];

function priceLabel(product: ChariowProduct): string {
  if (product.isFree === true) return "Gratuit";
  if (product.price?.formatted) return product.price.formatted;
  if (product.price?.value != null) {
    return `${product.price.value}${product.price.currency ? ` ${product.price.currency}` : ""}`;
  }
  return "—";
}

export function ChariowTab({
  apiAvailable,
  products,
}: {
  apiAvailable: boolean;
  products: Product[];
}) {
  const [status, setStatus] = useState<ChariowStatus | null>(null);
  const [statusError, setStatusError] = useState("");
  const [rows, setRows] = useState<ChariowProduct[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [linking, setLinking] = useState<ChariowProduct | null>(null);

  const load = useCallback(async () => {
    if (!apiAvailable) {
      setLoading(false);
      setError("Liste de la boutique disponible uniquement avec le backend connecté.");
      setStatusError("");
      return;
    }
    setLoading(true);
    // Les deux lectures sont indépendantes : un échec de l'une n'efface pas l'autre.
    const [statusResult, productsResult] = await Promise.allSettled([
      fetchChariowStatus(),
      fetchChariowProducts(),
    ]);

    if (statusResult.status === "fulfilled") {
      setStatus(statusResult.value);
      setStatusError("");
    } else {
      setStatus(null);
      setStatusError(
        statusResult.reason instanceof Error ? statusResult.reason.message : "État Chariow illisible.",
      );
    }

    if (productsResult.status === "fulfilled") {
      setRows(productsResult.value.products);
      setHasMore(productsResult.value.hasMore);
      setError("");
    } else {
      setRows([]);
      setHasMore(false);
      setError(
        productsResult.reason instanceof Error
          ? productsResult.reason.message
          : "Chargement de la boutique impossible.",
      );
    }
    setLoading(false);
  }, [apiAvailable]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Titre du produit Arsenal lié (le backend ne renvoie que l'id). */
  const arsenalTitle = (id: string): string => {
    const found = products.find((p) => p.id === id);
    return found ? found.title : id;
  };

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="font-display text-[1.2rem] font-bold">Chariow</h2>
        <span className="rounded-full border border-[#333] bg-[#141414] px-2.5 py-1 font-mono text-[0.64rem] text-[#666]">
          boutique &amp; liaison des produits
        </span>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="btn-arsenal btn-ghost btn-sm ml-auto"
        >
          {loading && <span className="spin" />}
          Actualiser
        </button>
      </div>

      {/* État de la connexion */}
      <div className="mb-5 rounded-2xl border border-[#333] bg-[#141414] p-5">
        <h3 className="mb-1 text-[0.95rem] font-semibold">Connexion Chariow</h3>
        {statusError ? (
          <p className="text-[0.8rem] leading-relaxed text-[#f4a261]">{statusError}</p>
        ) : !status ? (
          <p className="font-mono text-[0.78rem] text-[#666]">
            {loading ? "Vérification…" : "État non communiqué par le backend."}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill
                tone={status.configured ? "ok" : "warn"}
                label={status.configured ? "Intégration opérationnelle" : "Intégration incomplète"}
              />
              <StatusPill
                tone={status.apiKeyConfigured ? "ok" : "warn"}
                label={status.apiKeyConfigured ? "Clé API configurée" : "Aucune clé API"}
              />
              <StatusPill
                tone={status.webhookSecretConfigured ? "ok" : "warn"}
                label={
                  status.webhookSecretConfigured
                    ? "Webhook configuré"
                    : "Aucun secret de webhook"
                }
              />
            </div>
            <div className="mt-3 flex flex-col gap-1.5 text-[0.78rem] leading-relaxed text-[#a0a0a0]">
              <p>
                Boutique :{" "}
                {status.store ? (
                  <b className="text-[#f0f0f0]">{status.store.name || "sans nom"}</b>
                ) : (
                  <span className="text-[#666]">non identifiée</span>
                )}
                {status.store?.domain && (
                  <span className="font-mono text-[0.72rem] text-[#666]"> — {status.store.domain}</span>
                )}
              </p>
              {status.error && <p className="text-[#f4a261]">{status.error}</p>}
              <p className="text-[0.72rem] text-[#666]">
                La clé API se règle dans l&apos;onglet Paramètres ; la valeur n&apos;est jamais renvoyée
                par l&apos;API. Le secret du webhook sert à vérifier les Pulses de vente.
              </p>
            </div>
          </>
        )}
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-[rgba(244,162,97,0.4)] bg-[rgba(244,162,97,0.07)] px-4 py-3 text-[0.85rem] text-[#f4a261]">
          {error}
        </p>
      )}

      {/* Produits de la boutique */}
      <div className="overflow-x-auto rounded-2xl border border-[#333] bg-[#141414]">
        <table className="w-full border-collapse text-[0.8rem]">
          <thead>
            <tr>
              {["Produit Chariow", "Type", "Prix", "Statut", "Liaison Arsenal", "Action"].map((h) => (
                <th
                  key={h}
                  className="whitespace-nowrap border-b border-[#444] px-3 py-2.5 text-left font-mono text-[0.62rem] uppercase tracking-[0.1em] text-[#666]"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const linkedId = p.linkedArsenalProductId;
              return (
                <tr key={p.id} className="border-b border-[#222] last:border-0 hover:bg-[rgba(255,255,255,0.025)]">
                  <td className="px-3 py-2.5">
                    <span className="block font-medium text-[#f0f0f0]">{p.name}</span>
                    <span className="block font-mono text-[0.68rem] text-[#666]">{p.id}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[#a0a0a0]">
                    {p.type ? TYPE_LABELS[p.type] || p.type : "—"}
                    {p.type && CHECKOUT_UNSUPPORTED_TYPES.includes(p.type) && (
                      <span className="mt-1 block font-mono text-[0.64rem] text-[#f4a261]">
                        checkout API refusé (422)
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono tabular-nums text-[#f0f0f0]">
                    {priceLabel(p)}
                    {p.isFree === true && (
                      <span className="mt-1 block font-mono text-[0.64rem] text-[#56b8a8]">
                        modèle Gratuit
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[0.68rem] text-[#a0a0a0]">
                    {p.status || "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    {linkedId ? (
                      <>
                        <span className="rounded-md border border-[rgba(42,157,143,0.4)] bg-[rgba(42,157,143,0.08)] px-2 py-0.5 font-mono text-[0.64rem] uppercase tracking-[0.08em] text-[#56b8a8]">
                          Lié
                        </span>
                        <span className="mt-1 block text-[0.72rem] text-[#a0a0a0]">
                          {arsenalTitle(linkedId)}
                        </span>
                      </>
                    ) : (
                      <span className="rounded-md border border-[#333] bg-[#1a1a1a] px-2 py-0.5 font-mono text-[0.64rem] uppercase tracking-[0.08em] text-[#666]">
                        Non lié
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => setLinking(p)}
                      className="btn-arsenal btn-primary btn-sm"
                    >
                      {linkedId ? "Relier" : "Lier"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && rows.length === 0 && !error && (
          <p className="px-4 py-6 text-center font-mono text-[0.78rem] text-[#666]">
            Aucun produit Chariow à afficher.
          </p>
        )}
        {loading && rows.length === 0 && !error && (
          <p className="px-4 py-6 text-center font-mono text-[0.78rem] text-[#666]">Chargement…</p>
        )}
        {hasMore && (
          <p className="border-t border-[#222] px-4 py-2.5 font-mono text-[0.7rem] text-[#666]">
            Affichage limité aux 100 premiers produits (plafond `per_page` de l&apos;API Chariow).
          </p>
        )}
      </div>

      {/* Rappel factuel : ce que l'API Chariow ne permet pas d'automatiser */}
      <div className="mt-5 rounded-2xl border border-[#333] bg-[#141414] p-5">
        <h3 className="mb-1 text-[0.95rem] font-semibold">
          Ce qui reste manuel dans Chariow (API en lecture seule)
        </h3>
        <div className="flex flex-col gap-1.5 text-[0.78rem] leading-relaxed text-[#666]">
          <p>
            • Créer le produit et téléverser le fichier de livraison : l&apos;API Chariow ne propose
            aucun endpoint de création ni de modification de produit (19 chemins, `/products` en GET
            uniquement). Arsenal peut seulement lister, vérifier et lier un produit existant.
          </p>
          <p>
            • Créer le code promo : Chariow → <b className="text-[#a0a0a0]">Marketing → Réductions</b>.
            Un coupon à 100 % (ou d&apos;un montant égal au prix) rend la commande gratuite pour les
            achats réglés en A ; le code se renseigne ensuite dans le formulaire du produit
            (section « Vente en A », méthode « code promo »).
          </p>
          <p>
            • Prix plein pour le public : le produit d&apos;origine reste payant dans la boutique —
            seuls les achats en A passent par le code promo, qui n&apos;est jamais exposé par le
            catalogue public d&apos;Arsenal.
          </p>
          <p>
            • Publier le produit : le checkout API exige un produit publié (404 sinon). La création
            d&apos;un code promo n&apos;est pas automatisable (aucun `POST /v1/discounts`).
          </p>
        </div>
      </div>

      {linking && (
        <LinkDialog
          chariowProduct={linking}
          products={products}
          onClose={() => setLinking(null)}
          onLinked={() => void load()}
        />
      )}
    </section>
  );
}

/* ------------------------------ Liaison d'un produit ------------------------------ */

function LinkDialog({
  chariowProduct,
  products,
  onClose,
  onLinked,
}: {
  chariowProduct: ChariowProduct;
  products: Product[];
  onClose: () => void;
  onLinked: () => void;
}) {
  const [arsenalProductId, setArsenalProductId] = useState(
    chariowProduct.linkedArsenalProductId ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [diagnostic, setDiagnostic] = useState<ChariowLinkDiagnostic | null>(null);

  const confirm = async () => {
    if (busy || !arsenalProductId) return;
    setBusy(true);
    try {
      const result = await linkChariowProduct(arsenalProductId, chariowProduct.id);
      setDiagnostic(result);
      toast("Produit Chariow lié.", "success");
      onLinked();
    } catch (err) {
      // 400 (produit inexistant) et 502 (vérification impossible) portent le
      // diagnostic dans le corps de l'erreur : on l'affiche tel quel.
      const data =
        err instanceof ApiError ? (err.data as unknown as Partial<ChariowLinkDiagnostic>) : null;
      setDiagnostic({
        ok: false,
        product: data?.product ?? null,
        checks: data?.checks ?? { exists: false, isFree: null, isPublished: null },
        warnings: data?.warnings?.length
          ? data.warnings
          : [err instanceof Error ? err.message : "Liaison impossible."],
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-[rgba(5,5,5,0.8)] p-5"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Lier un produit Chariow"
    >
      <div
        className="max-h-[90vh] w-full max-w-[520px] overflow-y-auto rounded-2xl border border-[#444] bg-[#141414] p-6 text-left shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-[1.1rem] font-bold">Lier un produit Chariow</h3>
        <p className="mt-2 text-[0.82rem] leading-relaxed text-[#a0a0a0]">
          Produit Chariow <b className="text-[#f0f0f0]">{chariowProduct.name}</b>
          <span className="font-mono text-[0.72rem] text-[#666]"> ({chariowProduct.id})</span>
          {chariowProduct.isFree === true ? " — modèle Gratuit" : ""}.
          Le lien est enregistré après vérification réelle auprès de Chariow ; il n&apos;est
          refusé que si le produit n&apos;existe pas.
        </p>

        <div className="mt-4 flex flex-col gap-3.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-[0.78rem] font-semibold text-[#a0a0a0]">
              Produit Arsenal à lier *
            </span>
            <select
              className="input-arsenal cursor-pointer"
              value={arsenalProductId}
              onChange={(e) => setArsenalProductId(e.target.value)}
              disabled={busy}
            >
              <option value="">— Choisir un produit Arsenal —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                  {p.chariowProductId ? " (déjà lié)" : ""}
                </option>
              ))}
            </select>
            {products.length === 0 && (
              <span className="text-[0.72rem] text-[#f4a261]">
                Aucun produit Arsenal disponible : créez-le d&apos;abord dans l&apos;onglet Produits.
              </span>
            )}
          </label>
        </div>

        {diagnostic && <DiagnosticPanel diagnostic={diagnostic} />}

        <div className="mt-6 flex gap-3">
          <button type="button" onClick={onClose} className="btn-arsenal btn-ghost flex-1">
            Fermer
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={busy || !arsenalProductId}
            className="btn-arsenal btn-primary flex-1"
          >
            {busy && <span className="spin" />}
            Confirmer le lien
          </button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- Diagnostic --------------------------------- */

function DiagnosticPanel({ diagnostic }: { diagnostic: ChariowLinkDiagnostic }) {
  return (
    <div
      className="mt-4 rounded-[10px] border px-3.5 py-3"
      style={
        diagnostic.ok
          ? {
              borderColor: "rgba(42,157,143,0.4)",
              background: "rgba(42,157,143,0.08)",
            }
          : {
              borderColor: "rgba(230,57,70,0.45)",
              background: "rgba(230,57,70,0.08)",
            }
      }
    >
      <p
        className="text-[0.8rem] font-semibold"
        style={{ color: diagnostic.ok ? "#56b8a8" : "#fda4af" }}
      >
        {diagnostic.ok ? "Lien enregistré" : "Lien refusé"}
      </p>

      {diagnostic.product && (
        <div className="mt-1.5 flex flex-col gap-1 text-[0.74rem] leading-relaxed text-[#a0a0a0]">
          <p>
            Produit Chariow : <b className="text-[#f0f0f0]">{diagnostic.product.name}</b>
            {diagnostic.product.type ? ` — ${TYPE_LABELS[diagnostic.product.type] || diagnostic.product.type}` : ""}
            {diagnostic.product.price?.formatted ? ` — ${diagnostic.product.price.formatted}` : ""}
          </p>
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-2 font-mono text-[0.68rem]">
        <CheckPill
          ok={diagnostic.checks.exists}
          label={
            diagnostic.checks.exists
              ? "Produit trouvé côté Chariow"
              : "Produit introuvable côté Chariow"
          }
        />
        <CheckPill
          ok={diagnostic.checks.isFree === true}
          neutral={diagnostic.checks.isFree === null}
          label={
            diagnostic.checks.isFree === null
              ? "Tarif non communiqué"
              : diagnostic.checks.isFree
                ? "Modèle Gratuit"
                : "Produit payant"
          }
        />
        <CheckPill
          ok={diagnostic.checks.isPublished === true}
          neutral={diagnostic.checks.isPublished === null}
          label={
            diagnostic.checks.isPublished === null
              ? "Publication indéterminée"
              : diagnostic.checks.isPublished
                ? "Publié"
                : "Non publié"
          }
        />
      </div>

      {diagnostic.warnings.length > 0 && (
        <div className="mt-2.5 flex flex-col gap-1.5 text-[0.74rem] leading-relaxed text-[#f4c886]">
          {diagnostic.warnings.map((warning, index) => (
            <p key={index}>• {warning}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function CheckPill({ ok, neutral, label }: { ok: boolean; neutral?: boolean; label: string }) {
  const style = neutral
    ? { color: "#a0a0a0", borderColor: "#333", background: "#141414" }
    : ok
      ? { color: "#56b8a8", borderColor: "rgba(42,157,143,0.4)", background: "rgba(42,157,143,0.08)" }
      : { color: "#f4a261", borderColor: "rgba(244,162,97,0.4)", background: "rgba(244,162,97,0.07)" };
  return (
    <span className="rounded-full border px-2.5 py-1" style={style}>
      {label}
    </span>
  );
}

function StatusPill({ tone, label }: { tone: "ok" | "warn"; label: string }) {
  const style =
    tone === "ok"
      ? { color: "#56b8a8", borderColor: "rgba(42,157,143,0.4)", background: "rgba(42,157,143,0.08)" }
      : { color: "#f4a261", borderColor: "rgba(244,162,97,0.4)", background: "rgba(244,162,97,0.07)" };
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[0.66rem]" style={style}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: "currentColor" }} />
      {label}
    </span>
  );
}
