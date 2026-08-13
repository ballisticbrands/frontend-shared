import * as React from "react";

// Surface primitives. Previously duplicated in every brand app's
// components/ui/Card.tsx; shared now because the dashboard pages that
// live here need them and a shared component cannot import from its
// consumer.
//
// `tone="raised"` is the default flat card. `tone="flush"` drops the
// border for sections that sit directly on the page background — used
// for the KPI row, where six bordered boxes in a row read as a cage.

type Tone = "raised" | "flush";

const TONE: Record<Tone, string> = {
  raised: "rounded-xl border border-[var(--border)] bg-[var(--card)]",
  flush: "rounded-xl",
};

export function Card({
  tone = "raised",
  className = "",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { tone?: Tone }) {
  return <div {...props} className={`${TONE[tone]} ${className}`} />;
}

export function CardHeader({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`px-5 pt-5 pb-3 ${className}`} />;
}

export function CardTitle({ className = "", ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 {...props} className={`text-sm font-semibold tracking-tight ${className}`} />
  );
}

export function CardDescription({
  className = "",
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p {...props} className={`text-[13px] leading-relaxed text-[var(--muted-foreground)] ${className}`} />
  );
}

export function CardBody({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`px-5 pb-5 ${className}`} />;
}
