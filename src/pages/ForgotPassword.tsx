// Public /forgot-password page. Renders the reset-email request
// form; identical across brands (backend contract same, no brand-
// specific copy beyond the tab title which reads brand.displayName
// via useBrand()).

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { requestPasswordReset } from "../auth";
import { useBrand } from "../brand-context";
import { Button } from "../components/Button";
import { Input, Label } from "../components/Input";

export function ForgotPasswordPage() {
  const brand = useBrand();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    document.title = `Reset password — ${brand.displayName}`;
  }, [brand.displayName]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const res = await requestPasswordReset(email);
    setPending(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setSent(true);
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        We&apos;ll email you a link to set a new password.
      </p>
      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        {sent && (
          <p className="text-sm text-[var(--success)]">
            If an account exists for that email, a reset link is on its way.
          </p>
        )}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Sending…" : "Send reset link"}
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
