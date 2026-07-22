// Auth form logic for the sign-up page, extracted so brand repos
// keep their own copy + marketing text while the submit / state /
// Turnstile-glue behavior stays in one place.
//
// Consumer pattern:
//
//   const form = useSignUpForm({
//     onSuccess: () => navigate("/dashboard", { replace: true }),
//   });
//   return (
//     <form onSubmit={form.onSubmit}>
//       <Input value={form.name} onChange={(e) => form.setName(e.target.value)} />
//       ...
//       <Turnstile onToken={form.onTurnstileToken} onExpired={form.onTurnstileExpired} />
//       <Button disabled={form.pending || !form.turnstileToken}>...</Button>
//     </form>
//   );

import type { FormEvent } from "react";
import { useCallback, useState } from "react";
import { signUp } from "../auth";

export interface UseSignUpFormReturn {
  name: string;
  setName: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  /** Cloudflare Turnstile token. null until the widget issues one
   *  or reports "skipped" for a config-less build. */
  turnstileToken: string | null;
  /** Wire to the shared <Turnstile onToken={...} />. */
  onTurnstileToken: (tok: string) => void;
  /** Wire to the shared <Turnstile onExpired={...} />. Clears the
   *  cached token so the user has to solve again before submit. */
  onTurnstileExpired: () => void;
  /** Human-readable error to display; null when the form is clean. */
  error: string | null;
  /** True while the sign-up POST is in flight. Disable the submit
   *  button off this. */
  pending: boolean;
  onSubmit: (e: FormEvent) => Promise<void>;
}

export function useSignUpForm(opts: { onSuccess: () => void }): UseSignUpFormReturn {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const onTurnstileToken = useCallback((tok: string) => setTurnstileToken(tok), []);
  const onTurnstileExpired = useCallback(() => setTurnstileToken(null), []);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!turnstileToken) {
      setError("Please complete the challenge above before continuing.");
      return;
    }
    setError(null);
    setPending(true);
    const res = await signUp(email, password, name, turnstileToken);
    setPending(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    opts.onSuccess();
  }

  return {
    name, setName,
    email, setEmail,
    password, setPassword,
    turnstileToken,
    onTurnstileToken,
    onTurnstileExpired,
    error,
    pending,
    onSubmit,
  };
}
