// Thin wrapper around Cloudflare's implicit-render Turnstile widget.
//
// Reads the site key from getSharedConfig().turnstileSiteKey — the
// consumer sets it via configureShared({ turnstileSiteKey }) at boot.
// When unset (local dev, preview builds), we render nothing and
// immediately call onToken with the literal string "skipped" — the
// backend's Turnstile verify also short-circuits when its secret key
// is unset, so the two ends stay in agreement.
//
// Docs: https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/

import { useEffect, useRef } from "react";
import { getSharedConfig } from "../config";

const SCRIPT_ID = "cf-turnstile-script";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          size?: "normal" | "compact";
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

let scriptLoadPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("turnstile load failed")), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.addEventListener("load", () => resolve(), { once: true });
    s.addEventListener("error", () => reject(new Error("turnstile load failed")), { once: true });
    document.head.appendChild(s);
  });
  return scriptLoadPromise;
}

/**
 * @param onToken called when Cloudflare issues a token. Pass this
 *   through to the sign-up POST as `turnstile_token`. Called with
 *   `"skipped"` when turnstileSiteKey isn't configured.
 * @param onExpired optional — called when a previously-issued token
 *   expires (~5 min). The caller should clear the stored token and
 *   wait for a fresh one before submitting.
 */
export function Turnstile({
  onToken,
  onExpired,
}: {
  onToken: (token: string) => void;
  onExpired?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const siteKey = getSharedConfig().turnstileSiteKey ?? "";

  useEffect(() => {
    if (!siteKey) {
      // Widget disabled on this build. Match the backend's skip
      // behavior so the caller doesn't hang waiting for a token.
      onToken("skipped");
      return;
    }

    let cancelled = false;
    loadTurnstileScript()
      .then(() => {
        if (cancelled) return;
        if (!containerRef.current || !window.turnstile) return;
        const id = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token) => onToken(token),
          "expired-callback": () => onExpired?.(),
          "error-callback": () => {
            // Cloudflare-side error — don't block the user.
          },
          theme: "auto",
        });
        widgetIdRef.current = id;
      })
      .catch(() => {
        // Script load blocked (ad blocker, offline) — treat same as
        // "no widget configured" so the user can still sign up.
        if (!cancelled) onToken("skipped");
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile?.remove) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // Unmount races the async render — safe to ignore.
        }
      }
    };
  }, [siteKey, onToken, onExpired]);

  if (!siteKey) return null;
  return <div ref={containerRef} className="my-2" />;
}
