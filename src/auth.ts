// Auth API-call functions (no UI). Each returns either the success
// result or an { error } object — UI components handle both.

import { ApiError, apiFetch } from "./api";
import { clearSessionToken, setSessionToken } from "./session";
import { identifyUserAcrossPlatforms, readAttribution, tagClarityIdentity } from "./attribution";

// `created` is set by the backend on endpoints that can mint a NEW
// account (sign-up: always true; /google: true only on the create
// path). Older backends omit it — see the `isNewUser` derivation.
type TokenResponse = { token: string; expires_in?: number; created?: boolean };
type MeResponse = { id: string; email: string; name?: string };

type AuthKind = "sign-in" | "sign-up" | "google";

async function exchange(
  path: string,
  payload: Record<string, unknown>,
  kind: AuthKind,
): Promise<{ error?: string }> {
  try {
    const body = await apiFetch<TokenResponse>(path, {
      method: "POST",
      body: JSON.stringify(payload),
      auth: false,
    });
    const token = body?.token;
    if (!token) return { error: "Something went wrong. Please try again." };
    setSessionToken(token);

    // Did this request CREATE an account? Drives the sign_up conversion
    // event — firing it on sign-ins too is the bug that made GA4
    // `sign_up` uncountable (every returning session re-fired it).
    //   sign-up  → always a new account (the endpoint 409s otherwise)
    //   sign-in  → never
    //   google   → only when the backend says so; an older backend that
    //              doesn't send `created` yields false, which UNDER-counts
    //              Google signups briefly — the safe direction.
    const isNewUser = kind === "sign-up" || (kind === "google" && body.created === true);

    // Fire-and-forget: fetch the user id + broadcast it into GA4 /
    // Clarity / Meta so future sessions from this user cross-reference
    // back to the account. Failures are silent — attribution is best-
    // effort and shouldn't block the sign-in/up flow.
    void (async () => {
      try {
        const me = await apiFetch<MeResponse>("/v1/auth/me");
        if (me?.id) {
          identifyUserAcrossPlatforms(me, {
            fireSignUpEvent: isNewUser,
            method: kind === "google" ? "google" : "email",
          });
        }
      } catch {
        /* ignored — best-effort */
      }
    })();

    return {};
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    if (err instanceof TypeError) return { error: "We couldn't reach our servers. Please try again in a moment." };
    return { error: "Something went wrong. Please try again." };
  }
}

export async function signIn(email: string, password: string): Promise<{ error?: string }> {
  if (!email || !password) return { error: "Email and password are required." };
  // Tag Clarity synchronously up front — don't wait on the async
  // /v1/auth/me identify (which can silently fail on flaky connections).
  tagClarityIdentity(email);
  return exchange("/v1/auth/sign-in", { email, password }, "sign-in");
}

export async function signUp(
  email: string,
  password: string,
  name: string,
  turnstileToken?: string,
): Promise<{ error?: string }> {
  if (!email || !password) return { error: "Email and password are required." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  // Tag Clarity synchronously with the just-typed identity, BEFORE the
  // token exchange — so email/name tags land even if the visitor
  // bounces or the async /v1/auth/me identify never completes.
  tagClarityIdentity(email, name);
  // First-touch attribution: reads the blob localStorage stashed on the
  // visitor's first landing. Backend accepts it under `attribution` in
  // the body; undefined = omit-the-field.
  const attribution = readAttribution();
  // turnstile_token is optional in the request; the backend treats it
  // as optional when its secret key isn't configured, so a preview
  // build without Turnstile still works. The SignUp form supplies the
  // string "skipped" when the widget is disabled — the backend's
  // verifyTurnstile short-circuits on both paths.
  return exchange(
    "/v1/auth/sign-up",
    {
      email,
      password,
      name,
      attribution,
      turnstile_token: turnstileToken,
    },
    "sign-up",
  );
}

/**
 * Exchange a Google ID token (the `credential` GIS hands to
 * <GoogleSignInButton>) for a session. One call serves both sign-up
 * and sign-in — the backend resolves the Google identity to an
 * existing account or creates one. Attribution rides along for the
 * sign-up case; the backend ignores it on plain sign-ins.
 */
export async function signInWithGoogle(credential: string): Promise<{ error?: string }> {
  if (!credential) return { error: "Google sign-in failed. Please try again." };
  return exchange("/v1/auth/google", { credential, attribution: readAttribution() }, "google");
}

export async function requestPasswordReset(email: string): Promise<{ error?: string }> {
  if (!email) return { error: "Email is required." };
  try {
    await apiFetch("/v1/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
      auth: false,
    });
    return {};
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    return { error: "We couldn't send the reset email. Please try again." };
  }
}

// ─── Magic login links (passwordless sign-in) ───────────────────────

export type RequestMagicLinkResult =
  | { ok: true }
  | { error: string; retryInSeconds?: number };

/**
 * Ask the backend to email a one-time sign-in link. Always succeeds
 * with { ok: true } whether or not the email maps to an account
 * (enumeration-safe on the backend) — the UI copy should say "if an
 * account exists…". A 429 carries `retryInSeconds` (60s per-user
 * cooldown); surface it as a countdown, same as resendVerification.
 *
 * `turnstileToken` mirrors sign-up: the endpoint triggers outbound
 * mail unauthenticated, so production gates it behind Turnstile. Pass
 * the widget's token ("skipped" on config-less builds).
 */
export async function requestMagicLink(
  email: string,
  turnstileToken?: string,
): Promise<RequestMagicLinkResult> {
  if (!email) return { error: "Email is required." };
  try {
    await apiFetch("/v1/auth/magic-link", {
      method: "POST",
      body: JSON.stringify({ email, turnstile_token: turnstileToken }),
      auth: false,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) {
      const retry =
        err.body &&
        typeof err.body === "object" &&
        "retry_in_seconds" in err.body &&
        typeof (err.body as { retry_in_seconds: unknown }).retry_in_seconds === "number"
          ? (err.body as { retry_in_seconds: number }).retry_in_seconds
          : undefined;
      return { error: err.message, retryInSeconds: retry };
    }
    return { error: "We couldn't send the email. Please try again in a moment." };
  }
}

export type MagicLinkErrorCode = "invalid_token" | "expired_token" | "used_token";

export type RedeemMagicLinkResult =
  | { ok: true }
  | { error: string; errorCode?: MagicLinkErrorCode };

/**
 * Redeem a magic link's token for a session. On success the session
 * token is stored (same as sign-in) and the user is identified across
 * analytics platforms with `fireSignUpEvent: false` — a magic login
 * is a sign-IN, never a sign_up conversion (see the v0.5.1 gate).
 *
 * Distinct error codes let the /magic page render expired vs invalid
 * vs already-used specifically.
 */
export async function redeemMagicLink(token: string): Promise<RedeemMagicLinkResult> {
  if (!token) {
    return { error: "This sign-in link is missing its token.", errorCode: "invalid_token" };
  }
  try {
    const body = await apiFetch<TokenResponse>("/v1/auth/magic-login", {
      method: "POST",
      body: JSON.stringify({ token }),
      auth: false,
    });
    if (!body?.token) return { error: "Something went wrong. Please try again." };
    setSessionToken(body.token);

    // Fire-and-forget identification, mirroring exchange() — but with
    // fireSignUpEvent pinned to false: the account already existed
    // (the backend only mints links for existing users).
    void (async () => {
      try {
        const me = await apiFetch<MeResponse>("/v1/auth/me");
        if (me?.id) {
          identifyUserAcrossPlatforms(me, { fireSignUpEvent: false, method: "email" });
        }
      } catch {
        /* ignored — best-effort */
      }
    })();

    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) {
      const code =
        err.body &&
        typeof err.body === "object" &&
        "error_code" in err.body &&
        typeof (err.body as { error_code: unknown }).error_code === "string"
          ? ((err.body as { error_code: string }).error_code as MagicLinkErrorCode)
          : undefined;
      return { error: err.message, errorCode: code };
    }
    if (err instanceof TypeError) {
      return { error: "We couldn't reach our servers. Please try again in a moment." };
    }
    return { error: "We couldn't sign you in with this link. Please try again in a moment." };
  }
}

export async function signOut(): Promise<void> {
  try {
    await apiFetch("/v1/auth/sign-out", { method: "POST" });
  } catch {
    // best-effort
  }
  clearSessionToken();
}

// ─── Email verification ────────────────────────────────────────────

export type VerifyEmailSuccess = {
  ok: true;
  userId: string;
  email: string;
  verifiedAt: string; // ISO
  userCreatedAt: string; // ISO
};

export type VerifyEmailFailure = {
  error: string;
  errorCode?: "invalid_token" | "expired_token";
};

export async function verifyEmail(token: string): Promise<VerifyEmailSuccess | VerifyEmailFailure> {
  try {
    const body = await apiFetch<VerifyEmailSuccess>("/v1/auth/verify", {
      method: "POST",
      body: JSON.stringify({ token }),
      auth: false,
    });
    return body;
  } catch (err) {
    if (err instanceof ApiError) {
      const code =
        err.body &&
        typeof err.body === "object" &&
        "error_code" in err.body &&
        typeof (err.body as { error_code: unknown }).error_code === "string"
          ? ((err.body as { error_code: string }).error_code as "invalid_token" | "expired_token")
          : undefined;
      return { error: err.message, errorCode: code };
    }
    return { error: "We couldn't verify this link. Please try again in a moment." };
  }
}

export type ResendVerificationResult =
  | { ok: true; alreadyVerified?: boolean }
  | { error: string; retryInSeconds?: number };

export async function resendVerification(): Promise<ResendVerificationResult> {
  try {
    const body = await apiFetch<{ ok: true; alreadyVerified?: boolean }>(
      "/v1/auth/resend-verification",
      { method: "POST", body: JSON.stringify({}) },
    );
    return body;
  } catch (err) {
    if (err instanceof ApiError) {
      const retry =
        err.body &&
        typeof err.body === "object" &&
        "retry_in_seconds" in err.body &&
        typeof (err.body as { retry_in_seconds: unknown }).retry_in_seconds === "number"
          ? (err.body as { retry_in_seconds: number }).retry_in_seconds
          : undefined;
      return { error: err.message, retryInSeconds: retry };
    }
    return { error: "We couldn't send the email. Please try again in a moment." };
  }
}
