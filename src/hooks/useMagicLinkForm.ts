// Form logic for the "email me a sign-in link" request. Used by the
// shared ForgotPassword + MagicLogin pages and by brand sign-in pages
// that add the magic-link affordance — brand repos own copy + layout,
// this owns state + submit behavior. Same split as useSignUpForm.
//
// Consumer pattern:
//
//   const form = useMagicLinkForm();
//   return (
//     <form onSubmit={form.onSubmit}>
//       <Input value={form.email} onChange={(e) => form.setEmail(e.target.value)} />
//       <Turnstile onToken={form.onTurnstileToken} onExpired={form.onTurnstileExpired} />
//       {form.sent && <p>Check your inbox — your sign-in link is on its way.</p>}
//       <Button disabled={form.pending || form.cooldownSeconds > 0}>
//         {form.cooldownSeconds > 0 ? `Try again in ${form.cooldownSeconds}s` : "Email me a sign-in link"}
//       </Button>
//     </form>
//   );
//
// Turnstile rides along because /v1/auth/magic-link is gated like
// /sign-up (it triggers outbound mail unauthenticated). On builds
// without a site key the widget immediately reports "skipped" and the
// backend's verify short-circuits to match.

import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { requestMagicLink } from "../auth";

export interface UseMagicLinkFormReturn {
  email: string;
  setEmail: (v: string) => void;
  /** Cloudflare Turnstile token. null until the widget issues one
   *  or reports "skipped" for a config-less build. */
  turnstileToken: string | null;
  /** Wire to the shared <Turnstile onToken={...} />. */
  onTurnstileToken: (tok: string) => void;
  /** Wire to the shared <Turnstile onExpired={...} />. */
  onTurnstileExpired: () => void;
  /** Human-readable error to display; null when the form is clean. */
  error: string | null;
  /** True while the request POST is in flight. */
  pending: boolean;
  /** True once the backend accepted the request — render the
   *  "check your inbox" success copy off this. */
  sent: boolean;
  /** Seconds left on the backend's 60s per-user cooldown (from a
   *  429's retry_in_seconds), ticking down to 0. Disable the submit
   *  button while > 0. */
  cooldownSeconds: number;
  onSubmit: (e: FormEvent) => Promise<void>;
}

export function useMagicLinkForm(): UseMagicLinkFormReturn {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const onTurnstileToken = useCallback((tok: string) => setTurnstileToken(tok), []);
  const onTurnstileExpired = useCallback(() => setTurnstileToken(null), []);

  // Tick the cooldown down once per second while it's running.
  const cooldownActive = cooldownSeconds > 0;
  useEffect(() => {
    if (!cooldownActive) return;
    const id = setInterval(
      () => setCooldownSeconds((s) => (s > 1 ? s - 1 : 0)),
      1000,
    );
    return () => clearInterval(id);
  }, [cooldownActive]);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (cooldownSeconds > 0) return;
    if (!turnstileToken) {
      setError("Please complete the challenge above before continuing.");
      return;
    }
    setError(null);
    setPending(true);
    const res = await requestMagicLink(email.trim(), turnstileToken);
    setPending(false);
    if ("error" in res) {
      if (res.retryInSeconds && res.retryInSeconds > 0) {
        setCooldownSeconds(res.retryInSeconds);
      }
      setError(res.error);
      return;
    }
    setSent(true);
  }

  return {
    email, setEmail,
    turnstileToken,
    onTurnstileToken,
    onTurnstileExpired,
    error,
    pending,
    sent,
    cooldownSeconds,
    onSubmit,
  };
}
