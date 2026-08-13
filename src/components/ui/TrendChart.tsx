import * as React from "react";
import { useMemo, useState } from "react";
import {
  areaPath,
  axisTicks,
  compactTick,
  linePath,
  plotGeometry,
  useMeasuredWidth,
} from "./chart-utils";

// The dashboard's main chart: ONE metric over time, with the previous
// period behind it as context.
//
// WHY ONE METRIC. The obvious design — sales and ad spend and profit on
// one chart — either needs two y-scales (never do this: a dual-axis
// chart lets you manufacture any crossover you like by rescaling) or
// squashes ad spend into the baseline next to sales. A metric picker
// plus a single series says the same thing without the lie.
//
// Colour is therefore EMPHASIS, not categorical: one accent hue for the
// selected period, de-emphasis gray for the comparison. That's why
// there's no multi-hue palette here to get wrong — and the comparison
// line is dashed as well as gray, so it survives greyscale printing and
// full colour-blindness.
//
// Brands set `--chart-accent` to override the series colour; it falls
// back to the brand accent.

export interface TrendPoint {
  date: string;
  value: number | null;
}

export interface TrendChartProps {
  points: TrendPoint[];
  /** Same-length comparison series (previous period). Drawn dashed and
   *  gray behind the main line. Omit for no comparison. */
  comparison?: TrendPoint[];
  /** Renders a value for the tooltip and the y-axis-adjacent label. */
  format: (v: number | null) => string;
  /** Names the series — the chart has one, so this replaces a legend. */
  label: string;
  comparisonLabel?: string;
  height?: number;
  /** Rendered under the tooltip's value. */
  formatDate?: (iso: string) => string;
}

const DEFAULT_HEIGHT = 240;

function defaultFormatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })
    : iso;
}

export function TrendChart({
  points,
  comparison,
  format,
  label,
  comparisonLabel = "Previous period",
  height = DEFAULT_HEIGHT,
  formatDate = defaultFormatDate,
}: TrendChartProps) {
  const [wrapRef, width] = useMeasuredWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const values = useMemo(() => points.map((p) => p.value), [points]);
  const comparisonValues = useMemo(
    () => (comparison ? comparison.map((p) => p.value) : null),
    [comparison],
  );

  const max = useMemo(() => {
    const all = [...values, ...(comparisonValues ?? [])].filter(
      (v): v is number => v !== null && Number.isFinite(v),
    );
    return all.length ? Math.max(...all) : 0;
  }, [values, comparisonValues]);

  const hasData = values.some((v) => v !== null && Number.isFinite(v));

  const g = useMemo(
    () => plotGeometry({ width: width || 600, height, count: points.length, max }),
    [width, height, points.length, max],
  );
  const ticks = useMemo(() => axisTicks(max), [max]);

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    if (points.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const ratio = (px - g.padding.left) / g.innerWidth;
    const i = Math.round(ratio * Math.max(1, points.length - 1));
    setHover(Math.min(points.length - 1, Math.max(0, i)));
  }

  const hoveredPoint = hover !== null ? points[hover] : undefined;
  const hoveredComparison = hover !== null && comparison ? comparison[hover] : undefined;

  // Tooltip flips to the left of the crosshair near the right edge so it
  // never escapes the card.
  const tooltipX = hover !== null ? g.x(hover) : 0;
  const flip = tooltipX > g.width - 150;

  return (
    <div ref={wrapRef} className="relative w-full">
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${label} over time`}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          className="block"
        >
          {/* Gridlines: hairline, solid, one step off the surface. */}
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={g.padding.left}
                x2={g.width - g.padding.right}
                y1={g.y(t)}
                y2={g.y(t)}
                stroke="var(--border)"
                strokeWidth={1}
              />
              <text
                x={g.padding.left - 8}
                y={g.y(t)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-[var(--muted-foreground)]"
                fontSize={11}
              >
                {compactTick(t)}
              </text>
            </g>
          ))}

          {/* Comparison first, so the current period draws over it. */}
          {comparisonValues && (
            <path
              d={linePath(comparisonValues, g)}
              fill="none"
              stroke="var(--muted-foreground)"
              strokeOpacity={0.45}
              strokeWidth={2}
              strokeDasharray="4 4"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          {hasData && (
            <>
              <path
                d={areaPath(values, g)}
                fill="var(--chart-accent, var(--accent))"
                fillOpacity={0.1}
              />
              <path
                d={linePath(values, g)}
                fill="none"
                stroke="var(--chart-accent, var(--accent))"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </>
          )}

          {/* Crosshair + marker. The marker carries a 2px surface ring so
              it stays legible where it sits on the line. */}
          {hover !== null && hoveredPoint?.value !== null && hoveredPoint !== undefined && (
            <>
              <line
                x1={g.x(hover)}
                x2={g.x(hover)}
                y1={g.padding.top}
                y2={g.padding.top + g.innerHeight}
                stroke="var(--muted-foreground)"
                strokeOpacity={0.35}
                strokeWidth={1}
              />
              <circle
                cx={g.x(hover)}
                cy={g.y(hoveredPoint.value)}
                r={4}
                fill="var(--chart-accent, var(--accent))"
                stroke="var(--card)"
                strokeWidth={2}
              />
            </>
          )}

          {/* First and last date only — a label per day is unreadable. */}
          {points.length > 0 && (
            <>
              <text
                x={g.padding.left}
                y={height - 6}
                fontSize={11}
                className="fill-[var(--muted-foreground)]"
              >
                {formatDate(points[0]!.date)}
              </text>
              <text
                x={g.width - g.padding.right}
                y={height - 6}
                textAnchor="end"
                fontSize={11}
                className="fill-[var(--muted-foreground)]"
              >
                {formatDate(points[points.length - 1]!.date)}
              </text>
            </>
          )}
        </svg>
      )}

      {hover !== null && hoveredPoint && (
        <div
          className="pointer-events-none absolute z-10 min-w-[130px] rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 shadow-lg"
          style={{
            left: flip ? tooltipX - 138 : tooltipX + 8,
            top: 8,
          }}
        >
          <div className="text-[11px] text-[var(--muted-foreground)]">
            {formatDate(hoveredPoint.date)}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ background: "var(--chart-accent, var(--accent))" }}
            />
            <span className="text-sm font-semibold tabular-nums">
              {format(hoveredPoint.value)}
            </span>
          </div>
          {hoveredComparison && (
            <div className="mt-1 flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-2 shrink-0 bg-[var(--muted-foreground)] opacity-50" />
              <span className="text-[11px] tabular-nums text-[var(--muted-foreground)]">
                {format(hoveredComparison.value)} · {comparisonLabel.toLowerCase()}
              </span>
            </div>
          )}
        </div>
      )}

      {!hasData && width > 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-sm text-[var(--muted-foreground)]">No data in this period.</p>
        </div>
      )}
    </div>
  );
}
