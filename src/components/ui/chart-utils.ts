// Shared chart plumbing: responsive measurement, nice axis ticks, path
// building. Kept out of the components so the maths is testable and the
// two chart components can't drift apart.

import { useEffect, useRef, useState } from "react";

/** Track an element's rendered width. SVG charts must be drawn at real
 *  pixel width — scaling a viewBox to fit would scale the 2px stroke and
 *  the 8px markers along with it, which is exactly what the mark specs
 *  forbid. */
export function useMeasuredWidth<T extends HTMLElement>(): [
  // MutableRefObject, not RefObject: React's `ref` prop expects a ref
  // whose current can be null (it is, before mount), and RefObject<T|null>
  // isn't assignable to it under React 18's types.
  React.MutableRefObject<T | null>,
  number,
] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      // Round to whole pixels: sub-pixel width changes would re-render
      // the whole path on every scrollbar flicker.
      setWidth(Math.round(w));
    });
    ro.observe(el);
    setWidth(Math.round(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/**
 * Round a raw axis maximum up to a "nice" number so ticks land on
 * 0 / 1,000 / 2,000 rather than 0 / 1,137 / 2,274.
 */
export function niceCeiling(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const magnitude = Math.pow(10, exp);
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

/** Evenly spaced tick values from 0 to a nice ceiling, inclusive. */
export function axisTicks(max: number, count = 4): number[] {
  const top = niceCeiling(max);
  const out: number[] = [];
  for (let i = 0; i <= count; i++) out.push((top / count) * i);
  return out;
}

/** Compact axis labels — 1.2k / 3.4M. Axis ticks have no room for
 *  "$1,204,882" and the tooltip carries the exact figure anyway. */
export function compactTick(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(n));
}

export interface PlotGeometry {
  width: number;
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
  innerWidth: number;
  innerHeight: number;
  /** Data index → x pixel. */
  x: (i: number) => number;
  /** Value → y pixel. */
  y: (v: number) => number;
}

export function plotGeometry(args: {
  width: number;
  height: number;
  count: number;
  max: number;
  padding?: Partial<PlotGeometry["padding"]>;
}): PlotGeometry {
  const padding = {
    top: 12,
    right: 12,
    // Room for one line of date labels.
    bottom: 22,
    // Room for compact y ticks.
    left: 40,
    ...args.padding,
  };
  const innerWidth = Math.max(1, args.width - padding.left - padding.right);
  const innerHeight = Math.max(1, args.height - padding.top - padding.bottom);
  const top = niceCeiling(args.max);
  const denominator = Math.max(1, args.count - 1);
  return {
    width: args.width,
    height: args.height,
    padding,
    innerWidth,
    innerHeight,
    x: (i) => padding.left + (innerWidth * i) / denominator,
    y: (v) => padding.top + innerHeight - (innerHeight * (top === 0 ? 0 : v / top)),
  };
}

/** Straight-segment path through the points. No smoothing: a spline
 *  through daily sales invents values between the days that never
 *  happened, and readers take the curve literally. */
export function linePath(values: Array<number | null>, g: PlotGeometry): string {
  let d = "";
  let penDown = false;
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      // A gap in the data becomes a gap in the line, not a straight
      // bridge across it.
      penDown = false;
      return;
    }
    d += `${penDown ? "L" : "M"}${g.x(i).toFixed(2)},${g.y(v).toFixed(2)}`;
    penDown = true;
  });
  return d;
}

/** The same path closed down to the baseline, for the 10% area wash. */
export function areaPath(values: Array<number | null>, g: PlotGeometry): string {
  const present = values
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => p.v !== null && Number.isFinite(p.v));
  if (present.length === 0) return "";
  const baseline = g.padding.top + g.innerHeight;
  const first = present[0]!;
  const last = present[present.length - 1]!;
  const top = present
    .map((p, n) => `${n === 0 ? "M" : "L"}${g.x(p.i).toFixed(2)},${g.y(p.v).toFixed(2)}`)
    .join("");
  return `${top}L${g.x(last.i).toFixed(2)},${baseline}L${g.x(first.i).toFixed(2)},${baseline}Z`;
}
