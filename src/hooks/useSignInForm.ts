// Auth form logic for the sign-in page. Same pattern as
// useSignUpForm — brand repos own copy + layout, this owns state +
// submit behavior. No Turnstile (sign-in isn't gated by it).

import type { FormEvent } from "react";
import { useState } from "react";
import { signIn } from "../auth";

export interface UseSignInFormReturn {
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  error: string | null;
  pending: boolean;
  onSubmit: (e: FormEvent) => Promise<void>;
}

export function useSignInForm(opts: { onSuccess: () => void }): UseSignInFormReturn {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setPending(true);
    const res = await signIn(email, password);
    setPending(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    opts.onSuccess();
  }

  return {
    email, setEmail,
    password, setPassword,
    error,
    pending,
    onSubmit,
  };
}
