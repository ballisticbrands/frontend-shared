import * as React from "react";

// Status + label chip.
//
// The status tones (success / warn / danger) are RESERVED for state and
// must never be reused to tell two data series apart — that's the
// dataviz rule about status palettes. They also always ship with a word,
// never color alone, which is why this renders children rather than a
// bare dot.

type Tone = "neutral" | "accent" | "success" | "warn" | "danger";

const TONE: Record<Tone, string> = {
  neutral: "bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)]",
  accent: "bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/25",
  success: "bg-[var(--success)]/10 text-[var(--success)] border-[var(--success)]/25",
  warn: "bg-[var(--eta-bg,rgba(180,83,9,0.08))] text-[var(--eta-fg,#8a5a00)] border-[var(--eta-border,rgba(180,83,9,0.3))]",
  danger: "bg-[var(--danger)]/10 text-[var(--danger)] border-[var(--danger)]/25",
};

export function Badge({
  tone = "neutral",
  className = "",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      {...props}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-tight ${TONE[tone]} ${className}`}
    />
  );
}
