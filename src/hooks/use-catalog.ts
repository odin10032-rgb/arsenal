"use client";

/**
 * Arsenal Tools — hook catalogue partagé (stale-while-revalidate)
 * 1. Peinture instantanée depuis le cache localStorage
 * 2. Rafraîchissement silencieux depuis l'API si la `version` a changé
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, detectApi } from "@/lib/api";
import {
  Product,
  readCatalogCache,
  readLocalProducts,
  writeCatalogCache,
} from "@/lib/products";

interface CatalogResponse {
  ok: boolean;
  version: string;
  count: number;
  products: Product[];
}

export function useCatalog() {
  const [products, setProducts] = useState<Product[]>([]);
  const [apiAvailable, setApiAvailable] = useState(false);
  /** true dès que le cache local est peint (fin du squelette) */
  const [initialLoaded, setInitialLoaded] = useState(false);
  /** "api" si les données viennent du backend, "demo" si fallback de démonstration */
  const [source, setSource] = useState<"api" | "demo">("demo");
  const versionRef = useRef<string>("");

  const refresh = useCallback(async (silent = true) => {
    const data = await apiFetch<CatalogResponse>("/api/products", { timeoutMs: 4000 });
    if (data.version === versionRef.current) return;
    versionRef.current = data.version;
    setProducts(data.products || []);
    writeCatalogCache(data.products || [], data.version);
    if (!silent) return;
  }, []);

  const reload = useCallback(async () => {
    // Rechargement explicite (après un CRUD admin) — sans garde de version
    try {
      const data = await apiFetch<CatalogResponse>("/api/products", { timeoutMs: 4000 });
      versionRef.current = data.version;
      setProducts(data.products || []);
      writeCatalogCache(data.products || [], data.version);
    } catch {
      /* on garde l'état courant */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    // 1. Peinture synchrone depuis le cache
    const cached = readCatalogCache();
    if (cached) {
      versionRef.current = cached.version;
      setProducts(cached.products);
      setInitialLoaded(true);
    } else {
      const local = readLocalProducts();
      if (local && local.length > 0) {
        setProducts(local);
      }
      setInitialLoaded(true);
    }

    // 2. Détection API puis rafraîchissement silencieux
    (async () => {
      const available = await detectApi();
      if (cancelled) return;
      setApiAvailable(available);
      if (available) {
        try {
          await refresh(true);
          if (!cancelled) setSource("api");
        } catch {
          /* cache conservé */
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refresh]);

  return { products, setProducts, apiAvailable, initialLoaded, source, reload };
}
