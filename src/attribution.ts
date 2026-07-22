// First-touch attribution capture + post-signup user identification.
//
// Two responsibilities:
//   1. captureAttribution() — on every page load, snapshot UTMs +
//      click IDs + referrer + landing URL from the visitor's FIRST
//      landing and persist to localStorage. Subsequent visits don't
//      overwrite — first-touch wins.
//   2. identifyUserAcrossPlatforms(userId) — after a successful
//      sign-up or sign-in, tell GA4 + Clarity + Meta about our
//      user_id so future sessions from this user cross-reference
//      back to the account.

import { getSharedConfig } from "./config";

const STORAGE_KEY = "dragonbot_attribution_v1";

// Companion cookie written by the LP (initAttribution). Cookie is
// scoped to the parent domain (e.g. `.getdragonbot.com` /
// `.dragonrefunds.com`) so the LP writes it and the app subdomain
// reads it. document.cookie auto-scopes by current hostname, so no
// explicit domain check needed on the read side.
const COOKIE_NAME = "dragonbot_attribution";

const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

const CLICK_ID_KEYS = ["gclid", "fbclid", "msclkid"] as const;

export interface Attribution {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  gclid?: string;
  fbclid?: string;
  msclkid?: string;
  referrer?: string;
  landing_page?: string;
  captured_at?: string; // ISO 8601 — when we first saw this visitor
}

/**
 * Call once from the app's entry point (main.tsx). Safe to call
 * multiple times — no-op after the first successful capture. First-
 * touch model: if we've already captured on a previous page load,
 * this doesn't overwrite.
 */
export function captureAttribution(): void {
  try {
    if (typeof window === "undefined") return; // SSR guard

    // First-touch semantics — but the correct semantics are "first
    // ATTRIBUTED touch", not "first touch at all." If the stored blob
    // has no UTMs and no click IDs, an earlier visit locked in a
    // blank / direct attribution — we let a later visit with a real
    // signal overwrite it.
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) {
      try {
        const parsed = JSON.parse(existing) as Attribution;
        if (hasAttributionSignal(parsed)) return; // real first-touch — respect it
      } catch {
        // malformed stored blob — treat as fresh capture
      }
    }

    const params = new URLSearchParams(window.location.search);
    const blob: Attribution = { captured_at: new Date().toISOString() };

    let urlHadAttribution = false;
    for (const k of UTM_KEYS) {
      const v = params.get(k);
      if (v) {
        blob[k] = v.slice(0, 256);
        urlHadAttribution = true;
      }
    }
    for (const k of CLICK_ID_KEYS) {
      const v = params.get(k);
      if (v) {
        blob[k] = v.slice(0, 256);
        urlHadAttribution = true;
      }
    }

    // Cookie fallback: the LP writes the visitor's TRUE first touch —
    // campaign, referrer, AND landing_page — to a parent-scoped
    // cookie. Read it so we don't lose the real source when the URL
    // query gets stripped somewhere in the flow.
    const cookieAttr = readCookieAttribution();
    for (const [k, v] of Object.entries(cookieAttr)) {
      const key = k as keyof Attribution;
      // Don't let the cookie clobber a campaign field the URL already set.
      if (urlHadAttribution && blob[key]) continue;
      (blob as Record<string, string>)[k] = v;
    }

    // Landing page + referrer: prefer the LP cookie's values (the real
    // first touch). Fall back to this app's own URL/referrer only when
    // the visitor landed directly on the app with no LP cookie.
    if (!blob.referrer && document.referrer) {
      blob.referrer = document.referrer.slice(0, 2048);
    }
    if (!blob.landing_page) {
      const landing =
        window.location.origin + window.location.pathname + window.location.search;
      blob.landing_page = landing.slice(0, 2048);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(blob));
  } catch {
    // localStorage disabled — silently skip.
  }
}

function hasAttributionSignal(a: Attribution): boolean {
  return !!(
    a.utm_source ||
    a.utm_medium ||
    a.utm_campaign ||
    a.utm_content ||
    a.utm_term ||
    a.gclid ||
    a.fbclid ||
    a.msclkid
  );
}

export function readAttribution(): Attribution | undefined {
  try {
    if (typeof window === "undefined") return undefined;
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Attribution) : undefined;
  } catch {
    return undefined;
  }
}

function readCookieAttribution(): Partial<Attribution> {
  try {
    const match = document.cookie.match(
      new RegExp("(?:^|; )" + COOKIE_NAME + "=([^;]*)"),
    );
    if (!match) return {};
    const params = new URLSearchParams(decodeURIComponent(match[1]!));
    const out: Partial<Attribution> = {};
    for (const k of UTM_KEYS) {
      const v = params.get(k);
      if (v) out[k] = v.slice(0, 256);
    }
    for (const k of CLICK_ID_KEYS) {
      const v = params.get(k);
      if (v) out[k] = v.slice(0, 256);
    }
    const referrer = params.get("referrer");
    if (referrer) out.referrer = referrer.slice(0, 2048);
    const landingPage = params.get("landing_page");
    if (landingPage) out.landing_page = landingPage.slice(0, 2048);
    return out;
  } catch {
    return {};
  }
}

// ─── Post-signup identification broadcast ─────────────────────────

declare global {
  interface Window {
    gtag?: (command: string, ...args: unknown[]) => void;
    clarity?: (command: string, ...args: unknown[]) => void;
    fbq?: (command: string, ...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

function deriveSignupSource(a: Attribution | undefined): string {
  if (!a) return "direct";
  if (a.gclid) return "google_ads";
  if (a.fbclid) return "meta_ads";
  if (a.msclkid) return "microsoft_ads";
  if (a.utm_source) return a.utm_source;
  return "direct";
}

/**
 * Identify a signed-in/up user across our analytics platforms.
 *
 * PII boundary — deliberate and load-bearing:
 *   · Clarity — first-party session tool; email + name go in as
 *               tags + friendly-name.
 *   · GA4     — NEVER receives email/name. Google's ToS prohibits
 *               PII. GA4 gets the user id + non-PII signup_source.
 *   · Meta    — external_id = opaque user id.
 */
export function identifyUserAcrossPlatforms(user: {
  id: string;
  email?: string;
  name?: string;
}): void {
  const { id: userId, email, name } = user;
  if (!userId) return;

  const signupSource = deriveSignupSource(readAttribution());

  try {
    if (typeof window.gtag === "function") {
      const ga4Id = getSharedConfig().brand.ga4MeasurementId;
      window.gtag("config", ga4Id, { user_id: userId });
      window.gtag("set", "user_properties", { signup_source: signupSource });
      window.gtag("event", "sign_up", { method: "email" });
    }
  } catch {
    /* best-effort */
  }

  try {
    // Set filterable tags FIRST so they attach to the session even
    // if identify() below errors.
    if (typeof window.clarity === "function") {
      if (email) window.clarity("set", "email", email);
      if (name) window.clarity("set", "name", name);
      window.clarity("set", "signup_source", signupSource);
    }
  } catch {
    /* best-effort */
  }

  try {
    if (typeof window.clarity === "function") {
      window.clarity("identify", userId);
    }
  } catch {
    /* best-effort */
  }

  try {
    if (typeof window.fbq === "function") {
      window.fbq("trackCustom", "CompleteRegistration", { external_id: userId });
    }
  } catch {
    /* best-effort */
  }
}

/**
 * Set Clarity's identity tags SYNCHRONOUSLY at sign-up / sign-in
 * submit, BEFORE the token exchange — so tags land even if the async
 * /v1/auth/me identify silently fails on a flaky connection.
 */
export function tagClarityIdentity(email?: string, name?: string): void {
  try {
    if (typeof window.clarity !== "function") return;
    if (email) window.clarity("set", "email", email);
    if (name) window.clarity("set", "name", name);
  } catch {
    /* best-effort */
  }
}

// ─── Amazon account-connection events ─────────────────────────────

type ConnectionProvider = "amazon_seller" | "amazon_ads";

/**
 * Fire a "connected an Amazon account" event across analytics
 * platforms and flip a durable user property. Call ONLY on a
 * genuinely NEW connection — never the re-authenticate button.
 */
export function trackAccountConnected(provider: ConnectionProvider): void {
  const isSeller = provider === "amazon_seller";
  const eventName = isSeller ? "connect_amazon_seller" : "connect_amazon_ads";
  const userProp = isSeller ? "spapi_connected" : "ads_connected";

  try {
    if (typeof window.gtag === "function") {
      window.gtag("event", eventName, { provider });
      window.gtag("set", "user_properties", { [userProp]: "true" });
    }
  } catch {
    /* best-effort */
  }

  try {
    if (typeof window.clarity === "function") {
      window.clarity("event", eventName);
      window.clarity("set", userProp, "true");
    }
  } catch {
    /* best-effort */
  }

  try {
    if (typeof window.fbq === "function") {
      window.fbq("trackCustom", isSeller ? "ConnectSeller" : "ConnectAds");
    }
  } catch {
    /* best-effort */
  }
}
