// "Sign in with Google" button — GIS (Google Identity Services)
// ID-token flow, rendered by Google's own script for consent-screen
// branding compliance.
//
// Reads the client ID from getSharedConfig().googleClientId — the
// consumer sets it via configureShared({ googleClientId }) at boot.
// When unset (local dev, preview builds, a brand that hasn't turned
// Google on), the component renders nothing — matching the backend's
// 501 short-circuit when GOOGLE_CLIENT_ID is unset.
//
// On success GIS hands us a Google-signed ID token; we exchange it at
// POST /v1/auth/google via signInWithGoogle(), which stores the
// session token exactly like the password flows. The page only
// supplies navigation (onSuccess) and error display (onError).
//
// Script-injection pattern mirrors Turnstile.tsx.
//
// Docs: https://developers.google.com/identity/gsi/web/reference/js-reference

import { useEffect, useRef, useState } from "react";
import { getSharedConfig } from "../config";
import { signInWithGoogle } from "../auth";

const SCRIPT_ID = "google-gsi-script";
const SCRIPT_SRC = "https://accounts.google.com/gsi/client";

interface GsiButtonConfiguration {
  type?: "standard" | "icon";
  theme?: "outline" | "filled_blue" | "filled_black";
  size?: "large" | "medium" | "small";
  text?: "signin_with" | "signup_with" | "continue_with" | "signin";
  shape?: "rectangular" | "pill" | "circle" | "square";
  logo_alignment?: "left" | "center";
  width?: number;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            // FedCM is the default in current Chrome; explicit so a
            // library default change doesn't silently alter behavior.
            use_fedcm_for_prompt?: boolean;
          }) => void;
          renderButton: (el: HTMLElement, options: GsiButtonConfiguration) => void;
        };
      };
    };
  }
}

let scriptLoadPromise: Promise<void> | null = null;

function loadGsiScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.accounts?.id) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("gsi load failed")), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.addEventListener("load", () => resolve(), { once: true });
    s.addEventListener("error", () => reject(new Error("gsi load failed")), { once: true });
    document.head.appendChild(s);
  });
  return scriptLoadPromise;
}

// GIS renders a fixed-width iframe; it accepts 200–400px. Match the
// container (the auth card's form column) and clamp into that range.
function buttonWidth(container: HTMLElement): number {
  const w = Math.round(container.getBoundingClientRect().width);
  return Math.max(200, Math.min(400, w || 400));
}

/**
 * @param text GIS button label variant — use "signup_with" on the
 *   sign-up page, default "signin_with" elsewhere.
 * @param onSuccess called after the credential exchange stored a
 *   session token — navigate to the app here.
 * @param onError called with a user-displayable message when the
 *   exchange fails. Script-load failures (ad blockers) leave the
 *   button unrendered rather than erroring.
 */
export function GoogleSignInButton({
  text = "signin_with",
  onSuccess,
  onError,
}: {
  text?: "signin_with" | "signup_with" | "continue_with";
  onSuccess: () => void;
  onError?: (message: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [exchanging, setExchanging] = useState(false);
  const clientId = getSharedConfig().googleClientId ?? "";

  // The GIS callback fires outside React's lifecycle; refs keep the
  // latest handlers without re-running the render effect.
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  onSuccessRef.current = onSuccess;
  onErrorRef.current = onError;

  useEffect(() => {
    if (!clientId) return;

    let cancelled = false;
    loadGsiScript()
      .then(() => {
        if (cancelled) return;
        const gsi = window.google?.accounts?.id;
        if (!containerRef.current || !gsi) return;
        gsi.initialize({
          client_id: clientId,
          use_fedcm_for_prompt: true,
          callback: async ({ credential }) => {
            setExchanging(true);
            const result = await signInWithGoogle(credential);
            setExchanging(false);
            if (result.error) onErrorRef.current?.(result.error);
            else onSuccessRef.current();
          },
        });
        gsi.renderButton(containerRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text,
          shape: "rectangular",
          logo_alignment: "center",
          width: buttonWidth(containerRef.current),
        });
      })
      .catch(() => {
        // Script blocked (ad blocker, offline) — quietly degrade to
        // the email/password form; nothing renders.
      });

    return () => {
      cancelled = true;
      // No GIS un-render API — unmounting the container div is the
      // cleanup. A remount re-initializes with fresh options.
    };
  }, [clientId, text]);

  if (!clientId) return null;
  return (
    <div
      ref={containerRef}
      className={`flex justify-center transition-opacity ${exchanging ? "pointer-events-none opacity-60" : ""}`}
    />
  );
}
