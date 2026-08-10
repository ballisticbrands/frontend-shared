// Horizontal "─── or ───" separator between the social-login button
// and the email/password form, so the auth pages of every brand app
// stay visually in sync. Renders nothing extra when social login is
// disabled — pages should gate it the same way they gate the button
// (it's exported separately so pages control the ordering).

export function AuthDivider({ label = "or" }: { label?: string }) {
  return (
    <div className="my-4 flex items-center gap-3" role="separator">
      <div className="h-px flex-1 bg-[var(--border)]" />
      <span className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">{label}</span>
      <div className="h-px flex-1 bg-[var(--border)]" />
    </div>
  );
}
