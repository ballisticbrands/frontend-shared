// Nag banner shown at the top of every authenticated page while the
// current user's emailVerifiedAt is null. Clicking "Resend the email"
// hits /v1/auth/resend-verification and flips into a 30-second
// "Sent — check your inbox" state before reverting.
//
// The banner disappears the moment the parent session refreshes and
// sees emailVerifiedAt is non-null.

import { useEffect, useState } from "react";
import { resendVerification } from "../auth";

type BannerState =
  | { mode: "idle" }
  | { mode: "sending" }
  | { mode: "sent" }
  | { mode: "cooldown"; retryInSeconds: number }
  | { mode: "error"; message: string };

export function VerifyEmailBanner({ email }: { email: string }) {
  const [state, setState] = useState<BannerState>({ mode: "idle" });

  // Auto-revert "sent" back to "idle" after 30s so the user sees the
  // resend link again if the email got lost in transit.
  useEffect(() => {
    if (state.mode !== "sent") return;
    const t = setTimeout(() => setState({ mode: "idle" }), 30_000);
    return () => clearTimeout(t);
  }, [state.mode]);

  // Live countdown when we're in cooldown.
  useEffect(() => {
    if (state.mode !== "cooldown") return;
    if (state.retryInSeconds <= 0) {
      setState({ mode: "idle" });
      return;
    }
    const t = setTimeout(
      () => setState({ mode: "cooldown", retryInSeconds: state.retryInSeconds - 1 }),
      1000,
    );
    return () => clearTimeout(t);
  }, [state]);

  async function onResendClick() {
    setState({ mode: "sending" });
    const r = await resendVerification();
    if ("ok" in r) {
      setState({ mode: "sent" });
    } else if (r.retryInSeconds && r.retryInSeconds > 0) {
      setState({ mode: "cooldown", retryInSeconds: r.retryInSeconds });
    } else {
      setState({ mode: "error", message: r.error });
    }
  }

  return (
    <div className="bg-amber-50 border-b border-amber-200 text-amber-900">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-2 text-sm">
        <span>
          <strong>Please verify your email.</strong> We sent a link to{" "}
          <span className="font-medium">{email}</span>. Didn't get it?{" "}
          {renderAction(state, onResendClick)}
        </span>
      </div>
    </div>
  );
}

function renderAction(state: BannerState, onClick: () => void) {
  switch (state.mode) {
    case "sending":
      return <span className="italic">Sending…</span>;
    case "sent":
      return <span className="font-medium">Sent — check your inbox.</span>;
    case "cooldown":
      return (
        <span className="italic">
          Try again in {state.retryInSeconds}s.
        </span>
      );
    case "error":
      return (
        <button
          type="button"
          onClick={onClick}
          className="font-medium underline underline-offset-2 hover:no-underline"
        >
          {state.message} Retry?
        </button>
      );
    case "idle":
    default:
      return (
        <button
          type="button"
          onClick={onClick}
          className="font-medium underline underline-offset-2 hover:no-underline"
        >
          Resend the email.
        </button>
      );
  }
}
