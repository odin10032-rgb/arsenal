"use client";

/**
 * Arsenal Tools — hook session utilisateur (pattern use-catalog : cache puis revalidation)
 * 1. Peinture instantanée depuis le cache localStorage « arsenal_user_cache »
 * 2. Revalidation silencieuse GET /api/me
 * 3. Sync via « arsenal-user-changed » (login/logout/refresh) + événement storage (multi-onglets)
 */

import { useCallback, useEffect, useState } from "react";
import {
  SESSION_TOKEN_KEY,
  USER_CACHE_KEY,
  USER_CHANGED_EVENT,
  fetchMe,
  getToken,
  readUserCache,
  register as registerApi,
  userLogin as loginApi,
  logout as logoutApi,
  type User,
} from "@/lib/user-auth";

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  /** Revalidation réseau (GET /api/me) */
  const refresh = useCallback(async () => {
    try {
      setUser(await fetchMe(true));
    } catch {
      /* état courant conservé */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 1-2. Peinture depuis le cache puis revalidation silencieuse
    if (getToken()) {
      const cached = readUserCache();
      if (cached) {
        setUser(cached);
        setLoading(false);
      }
      void refresh();
    } else {
      setUser(null);
      setLoading(false);
    }

    // 3. login / logout / refresh → relecture du cache local (source unique)
    const syncFromCache = () => {
      setUser(getToken() ? readUserCache() : null);
      setLoading(false);
    };
    window.addEventListener(USER_CHANGED_EVENT, syncFromCache);

    // 4. Multi-onglets : token ou cache modifié ailleurs
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === SESSION_TOKEN_KEY || e.key === USER_CACHE_KEY) {
        syncFromCache();
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener(USER_CHANGED_EVENT, syncFromCache);
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh]);

  const login = useCallback(async (identifiant: string, password: string) => {
    const u = await loginApi(identifiant, password);
    setUser(u);
    setLoading(false);
    return u;
  }, []);

  const register = useCallback(async (pseudo: string, email: string, password: string) => {
    const u = await registerApi(pseudo, email, password);
    setUser(u);
    setLoading(false);
    return u;
  }, []);

  const logout = useCallback(async () => {
    await logoutApi();
    setUser(null);
    setLoading(false);
  }, []);

  return { user, loading, refresh, login, register, logout };
}
