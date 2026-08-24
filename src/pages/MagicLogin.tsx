// /magic?token=… landing page. Reads the one-time sign-in token from
// the URL, POSTs it to /v1/auth/magic-login, and either signs the
// user in (session stored, redirect to /dashboard) or renders a
// distinct error state — expired vs invalid vs already-used — each
// offering the request-another form so a dead link is never a dead
// end. Modeled on VerifyEmail.tsx.
//
// Public route — no auth required. The token itself IS the credential.
// Whether a sign_up conversion fires here is the backend's call:
// redeemMagicLink relays the `created` flag, which is true only for the
// redemption that completed a passwordless-brand signup (v0.9.0).

import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { redeemMagicLink, type MagicLinkErrorCode } from "../auth";
import { useBrand } from "../brand-context";
import { Button } from "../components/Button";
import { Input, Label } from "../components/Input";
import { Turnstile } from "../components/Turnstile";
import { useMagicLinkForm } from "../hooks/useMagicLinkForm";

type UiState =
  | { kind: "loading" }
  | { kind: "success" }
  | { kind: "error"; error: string; errorCode?: MagicLinkErrorCode };

const HEADLINES: Record<MagicLinkErrorCode | "fallback", string> = {
  expired_token: "This sign-in link has expired.",
  used_token: "This link has already been used.",
  invalid_token: "This sign-in link isn't valid.",
  fallback: "We couldn't sign you in with this link.",
};

const EXPLANATIONS: Record<MagicLinkErrorCode | "fallback", string> = {
  expired_token: "Sign-in links only last 15 minutes. Request a fresh one below.",
  used_token:
    "Each link works exactly once. If that wasn't you, request a fresh link below — only your inbox receives it.",
  invalid_token: "The link may have been truncated by your email app. Request a fresh one below.",
  fallback: "Request a fresh link below and try again.",
};

export interface MagicLoginPageProps {
  /** Where the "back to sign in" footer link points. Default "/sign-in". */
  signInPath?: string;
  /**
   * Copy above that link. The default asks "Know your password?", which
   * is nonsense on a brand that has none — VerifiedMargins passes its
   * own, and the brief for that brand is explicit that a password must
   * not be mentioned anywhere in the product.
   */
  signInPrompt?: string;
  /** The link's own label. Default "Sign in". */
  signInLabel?: string;
}

export function MagicLoginPage({
  signInPath = "/sign-in",
  signInPrompt = "Know your password?",
  signInLabel = "Sign in",
}: MagicLoginPageProps = {}) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const brand = useBrand();
  const [state, setState] = useState<UiState>({ kind: "loading" });

  useEffect(() => {
    document.title = `Sign in — ${brand.displayName}`;
  }, [brand.displayName]);

  useEffect(() => {
    const token = params.get("token") ?? "";
    if (!token) {
      setState({
        kind: "error",
        error: "This sign-in link is missing its token.",
        errorCode: "invalid_token",
      });
      return;
    }
    let cancelled = false;
    (async () => {
      const result = await redeemMagicLink(token);
      if (cancelled) return;
      if ("ok" in result) {
        setState({ kind: "success" });
        // Small delay so the user sees the confirmation before we
        // bounce them into the dashboard.
        setTimeout(() => navigate("/dashboard", { replace: true }), 1000);
      } else {
        setState({ kind: "error", error: result.error, errorCode: result.errorCode });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      {state.kind === "loading" && (
        <>
          <h1 className="text-xl font-semibold">Signing you in…</h1>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            One moment while we confirm your link.
          </p>
        </>
      )}
      {state.kind === "success" && (
        <>
          <h1 className="text-xl font-semibold">You&apos;re signed in.</h1>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            Taking you to your dashboard…
          </p>
        </>
      )}
      {state.kind === "error" && (
        <>
          <h1 className="text-xl font-semibold">
            {HEADLINES[state.errorCode ?? "fallback"]}
          </h1>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            {EXPLANATIONS[state.errorCode ?? "fallback"]}
          </p>
          <RequestAnotherLinkForm />
          <p className="mt-6 text-sm text-[var(--muted-foreground)]">
            {signInPrompt}{" "}
            <Link to={signInPath} className="font-medium text-[var(--foreground)] hover:underline">
              {signInLabel}
            </Link>
          </p>
        </>
      )}
    </div>
  );
}

// The recovery form every error state offers: type your email, get a
// fresh link. Same backend contract as the sign-in page's affordance.
function RequestAnotherLinkForm() {
  const form = useMagicLinkForm();

  if (form.sent) {
    return (
      <p className="mt-6 text-sm text-[var(--success)]">
        If an account exists for that email, a fresh sign-in link is on
        its way. It expires in 15 minutes.
      </p>
    );
  }

  return (
    <form className="mt-6 w-full space-y-4 text-left" onSubmit={form.onSubmit}>
      <div className="space-y-1.5">
        <Label htmlFor="magic-email">Email</Label>
        <Input
          id="magic-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={form.email}
          onChange={(e) => form.setEmail(e.target.value)}
        />
      </div>
      <Turnstile onToken={form.onTurnstileToken} onExpired={form.onTurnstileExpired} />
      {form.error && <p className="text-sm text-[var(--danger)]">{form.error}</p>}
      <Button
        type="submit"
        disabled={form.pending || form.cooldownSeconds > 0}
        className="w-full"
      >
        {form.cooldownSeconds > 0
          ? `Try again in ${form.cooldownSeconds}s`
          : form.pending
            ? "Sending…"
            : "Email me a new sign-in link"}
      </Button>
    </form>
  );
}
