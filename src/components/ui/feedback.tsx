import * as React from "react";

// Loading, empty and error states.
//
// These are a shared concern because getting them wrong is what made
// the old dashboard feel broken: a page that renders its empty state
// while the fetch is still in flight tells the user they have no data
// when they have plenty. Skeleton ≠ empty ≠ error, and each of the
// three needs a distinct treatment.

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-[var(--muted)] ${className}`}
      aria-hidden="true"
    />
  );
}

/** Placeholder shaped like the KPI row, so the layout doesn't jump when
 *  the real numbers land. */
export function StatRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-[var(--border)] px-4 py-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-2 h-7 w-24" />
          <Skeleton className="mt-2 h-7 w-full" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icon && <div className="mb-1 text-[var(--muted-foreground)]">{icon}</div>}
      <p className="text-sm font-medium">{title}</p>
      {description && (
        <p className="max-w-sm text-[13px] leading-relaxed text-[var(--muted-foreground)]">
          {description}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** A failure the user can act on. Deliberately NOT an empty state: "we
 *  couldn't load this" and "you have none of these" are different facts
 *  and conflating them sends people to support for the wrong reason. */
export function ErrorState({
  title = "We couldn't load this.",
  detail,
  onRetry,
}: {
  title?: string;
  detail?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {detail && (
        <p className="max-w-sm text-[13px] leading-relaxed text-[var(--muted-foreground)]">
          {detail}
        </p>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--muted)]"
        >
          Try again
        </button>
      )}
    </div>
  );
}

/** The plain-language caveats the metrics endpoint returns
 *  (coverage.notes). Rendered as one quiet block under the numbers
 *  rather than as a warning banner — they explain a number, they don't
 *  report a fault. */
export function CoverageNotes({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null;
  return (
    <ul className="space-y-1">
      {notes.map((n) => (
        <li
          key={n}
          className="flex gap-2 text-[12.5px] leading-relaxed text-[var(--muted-foreground)]"
        >
          <span aria-hidden="true" className="select-none">
            ·
          </span>
          <span>{n}</span>
        </li>
      ))}
    </ul>
  );
}
