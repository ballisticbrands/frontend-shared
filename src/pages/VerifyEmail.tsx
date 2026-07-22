// /verify?token=… landing page. Reads the token from the URL, POSTs
// it to the backend, and either succeeds (fires the GA4
// `email_verified` event and redirects to the dashboard) or renders
// an error keyed off the backend's error_code.
//
// Public route — no auth required. The token itself IS the credential.

import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { verifyEmail, type VerifyEmailSuccess, type VerifyEmailFailure } from "../auth";
import { useBrand } from "../brand-context";

type UiState =
  | { kind: "loading" }
  | { kind: "success"; result: VerifyEmailSuccess }
  | { kind: "error"; result: VerifyEmailFailure };

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const brand = useBrand();
  const [state, setState] = useState<UiState>({ kind: "loading" });

  useEffect(() => {
    document.title = `Verify your email — ${brand.displayName}`;
  }, [brand.displayName]);

  useEffect(() => {
    const token = params.get("token") ?? "";
    if (!token) {
      setState({
        kind: "error",
        result: { error: "This verification link is missing its token.", errorCode: "invalid_token" },
      });
      return;
    }
    let cancelled = false;
    (async () => {
      const result = await verifyEmail(token);
      if (cancelled) return;
      if ("ok" in result) {
        // Fire GA4 email_verified. time_to_verify_seconds is computed
        // here so we don't need another round-trip; keeps the signup
        // funnel measurable.
        try {
          const seconds = Math.round(
            (new Date(result.verifiedAt).getTime() -
              new Date(result.userCreatedAt).getTime()) /
              1000,
          );
          if (typeof window.gtag === "function") {
            window.gtag("event", "email_verified", {
              user_id: result.userId,
              time_to_verify_seconds: seconds,
              method: "email_link",
            });
          }
        } catch {
          // GA4 firing is best-effort; never let it block the redirect.
        }
        setState({ kind: "success", result });
        // Small delay so the user sees the confirmation before we
        // bounce them into the dashboard.
        setTimeout(() => navigate("/dashboard", { replace: true }), 1500);
      } else {
        setState({ kind: "error", result });
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
          <h1 className="text-xl font-semibold">Verifying your email…</h1>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            One moment while we confirm your link.
          </p>
        </>
      )}
      {state.kind === "success" && (
        <>
          <h1 className="text-xl font-semibold">Email verified.</h1>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            Taking you to your dashboard…
          </p>
        </>
      )}
      {state.kind === "error" && (
        <>
          <h1 className="text-xl font-semibold">
            {state.result.errorCode === "expired_token"
              ? "This link has expired."
              : "This link isn't valid."}
          </h1>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            {state.result.errorCode === "expired_token"
              ? "Sign in and use the banner to request a new verification email."
              : state.result.error}
          </p>
          <div className="mt-6 flex gap-3">
            <Link
              to="/sign-in"
              className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--muted)]"
            >
              Sign in
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
