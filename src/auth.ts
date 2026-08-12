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
