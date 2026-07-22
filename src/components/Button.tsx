import * as React from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-[var(--accent)] text-[var(--accent-foreground)] hover:opacity-90 disabled:opacity-50",
  secondary:
    "bg-white text-[var(--foreground)] border border-[var(--border)] hover:bg-[var(--muted)] disabled:opacity-50",
  ghost:
    "bg-transparent text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-50",
  danger: "bg-[var(--danger)] text-white hover:opacity-90 disabled:opacity-50",
};
const SIZE: Record<Size, string> = {
  sm: "h-8 px-3 text-sm rounded-md",
  md: "h-10 px-4 text-sm rounded-md",
};

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export function Button({ variant = "primary", size = "md", className = "", ...props }: Props) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 font-medium transition-colors ${VARIANT[variant]} ${SIZE[size]} ${className}`}
    />
  );
}
