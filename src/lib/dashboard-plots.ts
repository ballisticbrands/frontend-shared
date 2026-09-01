// WHAT A DASHBOARD CAN PLOT, decided once.
//
// The founder profile (pages/PublicProfile.tsx) and the business page
// (verifiedmargins-frontend's pages/Business.tsx) show the same tiles over
// the same window and drive the same chart. They differ in LABELS and hints
// — "Profit (30d)" on one, "Profit" on the other — and legitimately so. They
// must not differ in which tiles are controls, because that is a claim about
// the data rather than about the page, and the two answered it differently
// for months: the business page made none of its tiles clickable at all.
//
// 🚨 A TILE IS A CONTROL ONLY WHEN IT HAS A SERIES BEHIND IT. A button that
// changed nothing when pressed would be a control lying about being one, so
// `plots` is the whole answer to "what is clickable" and callers must not
// add to it. SKUs never appears here (the payload carries one count, not a
// series) and neither does PPC.
//
// Margin is DERIVED, not fetched. The backend sends `margin_series` only
// alongside the monthly fallback; every daily payload has it null. Gating on
// it left the Margin tile inert on exactly the profiles that could plot it —
// a ratio of two series already on the page.

export type PlotKey = "profit" | "revenue" | "margin";

/** One row of whatever grain the payload came in. */
export interface PlotRow {
  date: string;
  revenue: number;
  profit: number | null;
}

export interface PlotSource {
  /** Day-grained rows. Preferred whenever non-empty — see `useDaily`. */
  daily?: Array<{ date: string; revenue: number; profit: number | null }> | null;
  /** The monthly fallback, for a backend that has no `daily` yet. */
  series?: Array<{ month: string; revenue: number; profit: number | null }> | null;
  /** Only ever consulted for the monthly fallback. */
  marginSeries?: Array<{ month: string; margin_pct: number | null }> | null;
}

export interface DashboardPlots {
  /** True when the rows are days rather than months. Callers use it to word
   *  the chart caption and pick a date format — the two must agree with the
   *  axis or the page is lying about its own period. */
  useDaily: boolean;
  /** Every key that has a series, in display order. EMPTY means there is
   *  nothing to chart and the caller should render no chart at all. */
  plots: PlotKey[];
  /** The series for one key, oldest first. `[]` for a key not in `plots`. */
  pointsFor(key: PlotKey): Array<{ date: string; value: number | null }>;
  /** Sparkline values for one key, or `undefined` when it has no series —
   *  which is also the signal StatTile uses to draw nothing. */
  sparkFor(key: PlotKey): Array<number | null> | undefined;
}

const LABELS: Record<PlotKey, string> = {
  profit: "Profit",
  revenue: "Revenue",
  margin: "Margin",
};

/** The display name of a plot key — so the chart caption and the tile above
 *  it cannot disagree about what is being shown. */
export function plotLabel(key: PlotKey): string {
  return LABELS[key];
}

export function dashboardPlots({ daily, series, marginSeries }: PlotSource): DashboardPlots {
  const useDaily = Boolean(daily && daily.length > 0);
  const rows: PlotRow[] = useDaily
    ? daily!.map((d) => ({ date: d.date, revenue: d.revenue, profit: d.profit }))
    : (series ?? []).map((p) => ({ date: `${p.month}-01`, revenue: p.revenue, profit: p.profit }));

  /* A monthly payload with no `series` has no rows at all — distinct from a
     payload whose rows happen to be zeroes, which IS plottable. */
  const hasSales = useDaily || Boolean(series);

  /* Margin off the same rows as everything else when they are daily: a ratio
     needs no currency conversion, and deriving it here keeps all three plots
     on one x-axis. `p.revenue` guards the divide — a zero-revenue day has no
     margin, which is not the same as a margin of zero. */
  const marginPoints = useDaily
    ? rows.map((p) => ({
        date: p.date,
        value: p.profit !== null && p.revenue ? (p.profit / p.revenue) * 100 : null,
      }))
    : (marginSeries ?? []).map((p) => ({ date: `${p.month}-01`, value: p.margin_pct }));

  const plots: PlotKey[] = [];
  /* Profit leads: it is what the site RANKS on and what both pages lead
     with, so a reader moving between them does not re-learn which figure the
     page is about. */
  if (hasSales && rows.some((p) => p.profit !== null)) plots.push("profit");
  if (hasSales) plots.push("revenue");
  if (marginPoints.some((p) => p.value !== null)) plots.push("margin");

  const pointsFor = (key: PlotKey): Array<{ date: string; value: number | null }> => {
    if (!plots.includes(key)) return [];
    if (key === "margin") return marginPoints;
    /* An exhaustive pair rather than an `else`, so a new PlotKey fails to
       compile here instead of silently plotting revenue. */
    return rows.map((p) => ({ date: p.date, value: key === "revenue" ? p.revenue : p.profit }));
  };

  return {
    useDaily,
    plots,
    pointsFor,
    sparkFor: (key) =>
      plots.includes(key) ? pointsFor(key).map((p) => p.value) : undefined,
  };
}
