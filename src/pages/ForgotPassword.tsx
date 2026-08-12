// Public /forgot-password page. Since v0.6.0 this requests a magic
// sign-in link instead of the never-built password-reset flow: for
// passwordless (email-only signup) accounts a magic link IS password
// recovery, and for password accounts it still gets the user back in.
// Identical across brands (backend contract same; the tab title reads
// brand.displayName via useBrand()).

import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useBrand } from "../brand-context";
import { Button } from "../components/Button";
import { Input, Label } from "../components/Input";
import { Turnstile } from "../components/Turnstile";
import { useMagicLinkForm } from "../hooks/useMagicLinkForm";

export function ForgotPasswordPage() {
  const brand = useBrand();
  const form = useMagicLinkForm();

  useEffect(() => {
    document.title = `Sign in without a password — ${brand.displayName}`;
  }, [brand.displayName]);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Forgot your password?</h1>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        No problem — we&apos;ll email you a one-time link that signs you
        in. No password needed.
      </p>
      <form className="mt-6 space-y-4" onSubmit={form.onSubmit}>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
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
        {form.sent && (
          <p className="text-sm text-[var(--success)]">
            If an account exists for that email, a sign-in link is on its
            way. It expires in 15 minutes — check your inbox.
          </p>
        )}
        <Button
          type="submit"
          disabled={form.pending || form.cooldownSeconds > 0}
          className="w-full"
        >
          {form.cooldownSeconds > 0
            ? `Try again in ${form.cooldownSeconds}s`
            : form.pending
              ? "Sending…"
              : "Email me a sign-in link"}
        </Button>
      </form>
      <p className="mt-6 text-sm text-[var(--muted-foreground)]">
        <Link to="/sign-in" className="font-medium text-[var(--foreground)] hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
