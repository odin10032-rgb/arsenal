"use client";

/**
 * /compte/panier — panier utilisable par TOUS (visiteur sans compte, simple
 * utilisateur, membre). Aucune garde de connexion : le visiteur est identifié
 * par son `visitorToken` (localStorage) et le serveur est seul maître des prix.
 *
 * Contenu : image, titre, prix, quantité ±, retirer, total affiché.
 *
 * ⚠️ « Finaliser » ne crée AUCUN nouveau paiement : le tunnel Chariow et l'achat
 * en A existent déjà et ne sont pas dupliqués. Le bouton ouvre donc, pour chaque
 * article, la page produit où le canal d'achat réel est proposé (ActionBlock
 * pour Chariow, BuyWithA pour les membres). C'est une aide à la reprise, pas un
 * second système de caisse.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/hooks/use-user";
import {
  fetchCart,
  readCartCache,
  removeItem,
  resolveCart,
  setItemQuantity,
  type Cart,
  type CartItem,
} from "@/lib/cart";
import { fmt } from "@/lib/format";
import { isMember } from "@/lib/user-auth";

export default function CartPage() {
  const { user, loading } = useUser();
  const [cart, setCart] = useState<Cart | null>(() => readCartCache());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /** Id d'article en cours de mutation (boutons ± et retirer désactivés pour lui) */
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      // resolveCart rattache le panier visiteur au compte si une session existe.
      setCart(await resolveCart());
      setError("");
    } catch {
      // Repli : on retente une lecture simple ; à défaut, le cache local reste affiché.
      try {
        setCart(await fetchCart());
        setError("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Panier indisponible.");
      }
    }
  }, []);

  useEffect(() => {
    if (loading) return;
    // Chargement en tâche de fond (aucun setState synchrone dans l'effet lui-même).
    void (async () => {
      await load();
    })();
  }, [loading, user?.id, load]);

  const changeQuantity = useCallback(
    async (item: CartItem, quantity: number) => {
      if (pendingId) return;
      setPendingId(item.id);
      setBusy(true);
      setError("");
      try {
        setCart(await setItemQuantity(item.id, quantity));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Modification impossible.");
      } finally {
        setPendingId(null);
        setBusy(false);
      }
    },
    [pendingId],
  );

  const drop = useCallback(
    async (item: CartItem) => {
      if (pendingId) return;
      setPendingId(item.id);
      setBusy(true);
      setError("");
      try {
        setCart(await removeItem(item.id));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Suppression impossible.");
      } finally {
        setPendingId(null);
        setBusy(false);
      }
    },
    [pendingId],
  );

  const member = isMember(user);
  const items = cart?.items ?? [];
  // Total en A : affiché UNIQUEMENT pour un membre (les autres n'ont pas de monnaie A).
  const totalA = member
    ? items.reduce((sum, it) => sum + (it.priceA ?? 0) * it.quantity, 0)
    : 0;

  return (
    <div className="container-arsenal py-10 sm:py-14">
      <div className="mx-auto w-full max-w-[560px]">
        <h1 className="font-display text-[1.35rem] font-bold">Mon panier</h1>
        <p className="mt-1 text-[0.84rem] text-tx2">
          Vos articles en attente. Vous pouvez explorer et remplir votre panier sans compte.
        </p>

        {error && (
          <p role="alert" className="mt-4 rounded-[10px] border border-[rgba(230,57,70,0.4)] bg-[rgba(230,57,70,0.1)] px-3.5 py-2.5 text-[0.82rem] text-dangertx">
            {error}
          </p>
        )}

        {items.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-line bg-s1 p-6 text-center sm:p-8">
            <p className="text-[0.9rem] text-tx2">Votre panier est vide.</p>
            <Link href="/" className="btn-arsenal btn-primary btn-sm mt-4">
              Parcourir le catalogue
            </Link>
          </div>
        ) : (
          <>
            <ul className="mt-6 flex flex-col gap-3">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex gap-3 rounded-2xl border border-line bg-s1 p-3"
                >
                  <img
                    src={item.imageUrl}
                    alt=""
                    className="h-16 w-16 flex-shrink-0 rounded-lg border border-line object-cover"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/produit/?id=${encodeURIComponent(item.productId)}`}
                        className="min-w-0 text-[0.9rem] font-semibold leading-snug hover:underline"
                      >
                        {item.title}
                      </Link>
                      <button
                        type="button"
                        onClick={() => void drop(item)}
                        disabled={busy && pendingId === item.id}
                        aria-label={`Retirer ${item.title}`}
                        className="flex-shrink-0 rounded-md border border-line px-2 py-0.5 text-[0.72rem] text-tx2 transition-colors hover:border-[rgba(230,57,70,0.45)] hover:text-dangertx disabled:opacity-50"
                      >
                        Retirer
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      {/* Quantité */}
                      <div className="inline-flex items-center rounded-lg border border-line">
                        <button
                          type="button"
                          onClick={() => void changeQuantity(item, item.quantity - 1)}
                          disabled={busy && pendingId === item.id}
                          aria-label="Diminuer la quantité"
                          className="px-2.5 py-1 text-[0.95rem] text-tx2 transition-colors hover:text-tx1 disabled:opacity-50"
                        >
                          −
                        </button>
                        <span className="min-w-[2ch] text-center font-mono text-[0.82rem] tabular-nums">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => void changeQuantity(item, item.quantity + 1)}
                          disabled={(busy && pendingId === item.id) || item.quantity >= 99}
                          aria-label="Augmenter la quantité"
                          className="px-2.5 py-1 text-[0.95rem] text-tx2 transition-colors hover:text-tx1 disabled:opacity-50"
                        >
                          +
                        </button>
                      </div>

                      {/* Prix : public (FCFA) toujours ; sous-total A seulement pour un membre */}
                      <div className="text-right">
                        <p className="font-mono text-[0.82rem] font-semibold text-pricetx">
                          {item.price}
                        </p>
                        {member && typeof item.subtotalA === "number" && (
                          <p className="font-mono text-[0.72rem] text-tx2">
                            <span className="tabular-nums">{fmt(item.subtotalA)}</span>
                            <span className="text-gold"> A</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {/* Total en A (membres uniquement) */}
            {member && totalA > 0 && (
              <div className="mt-5 flex items-center justify-between rounded-xl border border-line bg-s1 px-4 py-3">
                <span className="text-[0.84rem] text-tx2">Total estimé</span>
                <span className="font-mono text-[1.05rem] font-bold tabular-nums">
                  {fmt(totalA)}
                  <span className="ml-1.5 text-[0.9rem] text-gold">A</span>
                </span>
              </div>
            )}

            {/* Non-membre : invitation contextuelle, jamais bloquante */}
            {user && !member && (
              <p className="mt-4 text-[0.8rem] leading-relaxed text-tx2">
                L&apos;achat en A est réservé aux membres.{" "}
                <Link href="/affiliation" className="text-teal hover:underline">
                  Découvrez le programme pour gagner des A.
                </Link>
              </p>
            )}
            {!user && !loading && (
              <p className="mt-4 text-[0.8rem] leading-relaxed text-tx2">
                Votre panier est conservé sur cet appareil.{" "}
                <Link href="/connexion" className="text-teal hover:underline">
                  Créez un compte
                </Link>{" "}
                pour le retrouver partout.
              </p>
            )}

            {/* Finaliser : ouvre le canal d'achat RÉEL de chaque article (aucun paiement ici) */}
            <div className="mt-6 flex flex-col gap-2.5 border-t border-dashed border-line pt-6">
              <Link
                href={`/produit/?id=${encodeURIComponent(items[0].productId)}`}
                className="btn-arsenal btn-primary w-full"
              >
                Finaliser
              </Link>
              <p className="text-center text-[0.76rem] leading-relaxed text-tx3">
                « Finaliser » ouvre la fiche de votre premier article, où le canal d&apos;achat
                habituel (tunnel Chariow ou paiement en A pour les membres) prend le relais. Aucun
                paiement n&apos;est traité dans le panier.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
