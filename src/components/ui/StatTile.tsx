import { linePath, plotGeometry, useMeasuredWidth } from "./chart-utils";

// A headline number, its period-over-period change, and a sparkline.
//
// TWO THINGS THIS GETS RIGHT that a naive stat tile does not:
//
//   1. `higherIsBetter`. Ad spend up 40% is not green. TACOS up is not
//      green. The direction of the arrow and the colour of the chip are
//      separate decisions and the caller owns the second one.
//   2. A null value renders as an em dash with the reason available on
//      hover, never as 0. The backend deliberately returns null for
//      metrics it cannot compute (no COGS on file → no profit); showing
//      "$0.00 profit" to a seller who made money would be a lie the UI
//      invented.
//
// The delta chip pairs its colour with an arrow glyph and a signed
// number, so state is never carried by colour alone.

export interface StatTileProps {
  label: string;
  /** Pre-formatted. The tile does no number formatting of its own — the
   *  caller knows the currency and the metric's units. */
  value: string;
  /** Signed ratio, e.g. 0.12 for +12%. null hides the chip entirely
   *  (no baseline to compare against is not the same as "no change"). */
  delta?: number | null;
  /** Whether an increase is good news for THIS metric. */
  higherIsBetter?: boolean;
  /** Sparkline values, oldest first. */
  spark?: Array<number | null>;
  /** Explains a "—" value, or adds context. Shown as a title tooltip. */
  hint?: string;
  /**
   * A qualifier on the FIGURE ITSELF, beside the label — "unverified" on a
   * margin we did not check.
   *
   * 🚨 It is not a second `hint`. A hint explains why a number is missing or
   * how to read it; a tag says the number is there and we are not vouching
   * for it. That distinction is the product, so it gets its own affordance
   * rather than being buried in prose the reader may not open.
   *
   * `title` is the hover explainer — BRANDING.md §5: a badge that cannot be
   * interrogated is decoration.
   */
  tag?: { label: string; title?: string };
  /** Marks the tile the page leads with — bigger figure, no border. */
  emphasis?: boolean;
  onClick?: () => void;
  selected?: boolean;
}

function formatDelta(d: number): string {
  const pct = d * 100;
  const digits = Math.abs(pct) >= 10 ? 0 : 1;
  return `${d > 0 ? "+" : ""}${pct.toFixed(digits)}%`;
}

export function StatTile({
  label,
  value,
  delta = null,
  higherIsBetter = true,
  spark,
  hint,
  tag,
  emphasis = false,
  onClick,
  selected = false,
}: StatTileProps) {
  const hasDelta = delta !== null && delta !== undefined && Number.isFinite(delta) && delta !== 0;
  const isGood = hasDelta ? (delta! > 0) === higherIsBetter : null;
  const arrow = hasDelta ? (delta! > 0 ? "↑" : "↓") : "";

  const interactive = typeof onClick === "function";
  const Wrapper = interactive ? "button" : "div";

  return (
    <Wrapper
      {...(interactive ? { type: "button" as const, onClick } : {})}
      className={[
        "flex w-full flex-col gap-1 rounded-xl border px-4 py-3 text-left transition-colors",
        selected
          ? "border-[var(--accent)] bg-[var(--accent)]/[0.04]"
          : "border-[var(--border)] bg-[var(--card)]",
        interactive && !selected ? "hover:border-[var(--muted-foreground)]/40" : "",
      ].join(" ")}
      aria-pressed={interactive ? selected : undefined}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
          {label}
        </span>
        {tag && (
          /* `data-stat-tag` rather than a colour class: the host owns the
             palette, and a tile that is merely QUALIFIED must not shout like
             an error. */
          <span data-stat-tag="" title={tag.title}>
            {tag.label}
          </span>
        )}
      </span>

      <span className="flex items-baseline gap-2">
        <span
          className={`font-semibold tabular-nums tracking-tight ${emphasis ? "text-3xl" : "text-xl"}`}
          title={hint}
        >
          {value}
        </span>
        {hasDelta && (
          <span
            className={`inline-flex items-center gap-0.5 text-xs font-medium tabular-nums ${
              isGood ? "text-[var(--success)]" : "text-[var(--danger)]"
            }`}
            title={`${formatDelta(delta!)} vs the previous period`}
          >
            <span aria-hidden="true">{arrow}</span>
            {formatDelta(delta!)}
          </span>
        )}
      </span>

      {spark && spark.some((v) => v !== null) && <Sparkline values={spark} />}
      {!spark && hint && (
        <span className="text-[11px] leading-tight text-[var(--muted-foreground)]">{hint}</span>
      )}
    </Wrapper>
  );
}

/** A bare trend shape — no axes, no ticks, no tooltip. It exists to show
 *  the shape of the period, and the chart below the KPI row carries the
 *  readable version. */
export function Sparkline({ values, height = 28 }: { values: Array<number | null>; height?: number }) {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const present = values.filter((v): v is number => v !== null && Number.isFinite(v));
  const max = present.length ? Math.max(...present) : 0;
  const g = plotGeometry({
    width: width || 100,
    height,
    count: values.length,
    max,
    padding: { top: 3, right: 1, bottom: 3, left: 1 },
  });

  return (
    <div ref={ref} className="mt-1 w-full">
      {width > 0 && present.length > 1 && (
        <svg width={width} height={height} aria-hidden="true" className="block">
          <path
            d={linePath(values, g)}
            fill="none"
            stroke="var(--chart-accent, var(--accent))"
            strokeOpacity={0.75}
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      )}
    </div>
  );
}
