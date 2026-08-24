// Amazon OAuth connect — the popup dance, shared.
//
// Copied from dragonbot-frontend/src/lib/connections.ts +
// src/components/dashboard/ConnectionButtons.tsx, which is the only
// implementation that has ever worked end to end. It lives here now because
// VerifiedMargins needs the same flow under a different promise ("verify your
// numbers", not "connect an integration") and a second copy of an OAuth
// handshake is not a thing to own twice.
//
// The shape, in order:
//
//   1. POST /v1/connect/<provider>/start with `return_to` → the backend mints
//      a signed state JWT carrying the seller's userId AND that return_to,
//      and answers with Amazon's consent URL.
//   2. window.open(consent URL) in a popup.
//   3. Amazon redirects to the backend's /callback, which exchanges the code,
//      creates the Connection row, and renders a page that postMessages the
//      result to `window.opener` and closes itself.
//   4. The opener hears it and acts.
//
// 🚨 `return_to` comes from the resolved brand (`brand.appOrigin`), never a
// literal. The backend whitelists it against its own brand registry
// (`brandForFrontendUrl`), so a value that is not exactly a registered
// frontend URL is silently replaced with the Origin's brand — the guard that
// stops this parameter being an open redirect. A brand whose appOrigin here
// drifts from the backend's `frontendBaseUrl` doesn't error; it just bounces
// the seller somewhere else. Keep the two in step.
//
// 🚨 The popup can be ABANDONED. If the seller closes it at Amazon's consent
// screen, no postMessage ever fires — nothing is cancelled, nothing errors,
// and a UI that only listens for messages sits on "Waiting for Amazon…"
// forever. `pollUntilClosed` is not a nicety.

import { ApiError, apiFetch } from "../api";
import { getSharedConfig } from "../config";

export type ConnectProvider = "amazon-selling-partner" | "amazon-ads";

/** What the backend's callback page posts to the opener. */
export interface OAuthResultMessage {
  type: string;
  provider: ConnectProvider;
  status: "connected" | "error";
  connection_id?: string;
  detail?: string;
}

export interface StartConnectionResult {
  authorization_url?: string;
  /** Written for a seller — the backend's `error` is rendered verbatim. */
  error?: string;
}

/** Origin the OAuth callback page is served from. Any postMessage from
 *  anywhere else is not ours and must be ignored. */
export function apiOrigin(): string {
  return new URL(getSharedConfig().apiUrl).origin;
}

const LABELS: Record<ConnectProvider, string> = {
  "amazon-selling-partner": "Amazon Seller Central",
  "amazon-ads": "Amazon Ads",
};

export function providerLabel(provider: ConnectProvider): string {
  return LABELS[provider];
}

/** Ask the backend for a consent URL for THIS brand. */
export async function startConnection(provider: ConnectProvider): Promise<StartConnectionResult> {
  const returnTo = getSharedConfig().brand.appOrigin;
  try {
    const resp = await apiFetch<{ authorization_url: string }>(
      `/v1/connect/${provider}/start`,
      { method: "POST", body: JSON.stringify({ return_to: returnTo }) },
    );
    if (!resp.authorization_url) {
      return { error: `We couldn't start the ${LABELS[provider]} connection. Please try again.` };
    }
    return { authorization_url: resp.authorization_url };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    return { error: `We couldn't reach ${LABELS[provider]}. Please try again.` };
  }
}

/** Open the consent URL. Returns null when the browser blocked the popup —
 *  the caller has to say so, because otherwise nothing at all happens. */
export function openOAuthPopup(authorizationUrl: string, name: string): Window | null {
  return window.open(
    authorizationUrl,
    name,
    "popup=1,width=520,height=720,resizable=1,scrollbars=1",
  );
}

/**
 * Read an incoming message, or null if it isn't the result we're waiting for.
 * Checks origin, message type and provider — in that order, because the
 * origin check is the security one and the rest are routing.
 */
export function readOAuthResult(
  event: MessageEvent,
  expect: { provider: ConnectProvider; messageType: string },
): OAuthResultMessage | null {
  if (event.origin !== apiOrigin()) return null;
  const data = event.data as OAuthResultMessage | undefined;
  if (!data || data.type !== expect.messageType) return null;
  if (data.provider !== expect.provider) return null;
  return data;
}

/**
 * Call `onClosed` once the popup goes away. The abandoned-popup case: the
 * seller shuts the window at Amazon's consent screen and no message is ever
 * sent, so this is the only signal that the attempt is over.
 *
 * Returns a cancel function — call it when a result DOES arrive, or the
 * interval outlives the component.
 */
export function pollUntilClosed(popup: Window, onClosed: () => void): () => void {
  const interval = window.setInterval(() => {
    if (popup.closed) {
      window.clearInterval(interval);
      onClosed();
    }
  }, 1000);
  return () => window.clearInterval(interval);
}
