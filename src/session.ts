// Client-side session helper. Stores the auth token in localStorage
// and exposes a React hook for components to consume the current user.
//
// The backend's /v1/auth/me endpoint is the source of truth for who's
// signed in; we just cache the token and the resulting user object.

import { useEffect, useState } from "react";
import { ApiError, SESSION_KEY, apiFetch } from "./api";

export type SessionUser = {
  id: string;
  email: string;
  name?: string;
  plan?: "trial" | "full_suite";
  trial_ends_at?: string | null;
  // ISO-8601 timestamp when the user verified their email, or null
  // when they haven't yet. Drives the nag banner in AppLayout + the
  // time_to_verify_seconds param on the GA4 event.
  emailVerifiedAt?: string | null;
  createdAt?: string;
};

export function getSessionToken(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function setSessionToken(token: string): void {
  try {
    localStorage.setItem(SESSION_KEY, token);
  } catch {
    // localStorage disabled — session won't persist across reloads.
  }
}

export function clearSessionToken(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignored
  }
}

export async function fetchCurrentUser(): Promise<SessionUser | null> {
  if (!getSessionToken()) return null;
  try {
    return await apiFetch<SessionUser>("/v1/auth/me");
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      clearSessionToken();
      return null;
    }
    // Backend unreachable during local dev — treat as signed out, don't crash.
    return null;
  }
}

type SessionState =
  | { status: "loading"; user: null }
  | { status: "anonymous"; user: null }
  | { status: "authenticated"; user: SessionUser };

/**
 * useSession — loads the current user on mount.
 * Returns `loading` until the /me call resolves, then `authenticated`
 * or `anonymous`.
 */
export function useSession(): SessionState & { refresh: () => void } {
  const [state, setState] = useState<SessionState>({ status: "loading", user: null });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const user = await fetchCurrentUser();
      if (cancelled) return;
      setState(user ? { status: "authenticated", user } : { status: "anonymous", user: null });
    })();
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return { ...state, refresh: () => setNonce((n) => n + 1) };
}
