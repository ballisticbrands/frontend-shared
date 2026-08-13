import { useCallback, useEffect, useMemo, useState } from "react";
import { PageContainer, PageHeader } from "../components/layout/AppShell";
import { Card, CardBody, CardHeader, CardTitle } from "../components/ui/Card";
import { StatTile } from "../components/ui/StatTile";
import { TrendChart } from "../components/ui/TrendChart";
import {
  CoverageNotes,
  EmptyState,
  ErrorState,
  Skeleton,
  StatRowSkeleton,
} from "../components/ui/feedback";
import {
  deltaRatio,
  fetchMetricsOverview,
  fetchTopSkus,
  formatDateRange,
  formatMoney,
  formatNumber,
  formatPercent,
  formatRelativeTime,
  METRIC_RANGES,
  NO_VALUE,
  RANGE_LABELS,
  type MetricsOverview,
  type MetricsRange,
  type MetricTotals,
  type TopSkusResult,
} from "../lib/metrics";

// The "Dashboard" nav item: the seller's own numbers.
//
// This page exists because the old dashboard showed a seller none of
// their own data — every figure lived behind an MCP client. The whole
// point is that opening the app tells you how the business did.
//
// THREE RULES THIS PAGE FOLLOWS
//
// 1. A null metric renders as "—" with a reason, never as zero. The
//    backend returns null when a number is genuinely uncomputable (no
//    COGS uploaded → no profit) and `coverage.notes` explains each case
//    in plain language. Inventing a 0 would be inventing a business
//    result.
// 2. One metric per chart. Sales and ad spend on one plot needs two
//    y-scales, and a dual-axis chart can manufacture any crossover you
//    want by rescaling. The KPI row is the comparison; clicking a tile
//    swaps what the chart plots.
// 3. "Up" is not automatically good. Ad spend and TACOS rising are not
//    green — see `higherIsBetter` on each tile.

export interface DashboardMetricsPageProps {
  /** Where "upload your costs" should send someone. Brands mount their
   *  COGS UI at different paths, so the page takes the link instead of
   *  hardcoding one. */
  cogsHref?: string;
  /** Where a user with nothing connected should go. */
  connectHref?: string;
  /** Initial range. Defaults to 28 days. */
  defaultRange?: MetricsRange;
}

/** The KPI row. `key` picks the value out of totals; `plot` picks what
 *  the chart draws when the tile is selected (series keys are a smaller
 *  set than totals — the backend only sends a daily breakdown for the
 *  five that make sense over time). */
type PlotKey = "sales" | "profit" | "ad_spend" | "units" | "orders";

interface TileSpec {
  id: string;
  label: string;
  plot: PlotKey | null;
  value: (t: MetricTotals, currency: string | null) => string;
  raw: (t: MetricTotals) => number | null;
  higherIsBetter: boolean;
  /** Why this might be "—". */
  hint?: (o: MetricsOverview) => string | undefined;
}

const TILES: TileSpec[] = [
  {
    id: "sales",
    label: "Sales",
    plot: "sales",
    value: (t, c) => formatMoney(t.sales, c, { compact: true }),
    raw: (t) => t.sales,
    higherIsBetter: true,
  },
  {
    id: "profit",
    label: "Profit",
    plot: "profit",
    value: (t, c) => formatMoney(t.profit, c, { compact: true }),
    raw: (t) => t.profit,
    higherIsBetter: true,
    hint: (o) => (o.coverage.has_cogs ? undefined : "Needs your product costs."),
  },
  {
    id: "ad_spend",
    label: "Ad spend",
    plot: "ad_spend",
    value: (t, c) => formatMoney(t.ad_spend, c, { compact: true }),
    raw: (t) => t.ad_spend,
    // Spending more is not, by itself, good news.
    higherIsBetter: false,
    hint: (o) => (o.coverage.has_ads ? undefined : "No Amazon Ads account connected."),
  },
  {
    id: "tacos",
    label: "TACOS",
    plot: null,
    value: (t) => formatPercent(t.tacos),
    raw: (t) => t.tacos,
    higherIsBetter: false,
    hint: (o) => (o.coverage.has_ads ? "Ad spend as a share of total sales." : "Needs an Ads account."),
  },
  {
    id: "units",
    label: "Units",
    plot: "units",
    value: (t) => formatNumber(t.units),
    raw: (t) => t.units,
    higherIsBetter: true,
  },
  {
    id: "orders",
    label: "Orders",
    plot: "orders",
    value: (t) => formatNumber(t.orders),
    raw: (t) => t.orders,
    higherIsBetter: true,
  },
  {
    id: "margin",
    label: "Margin",
    plot: null,
    value: (t) => formatPercent(t.profit_margin),
    raw: (t) => t.profit_margin,
    higherIsBetter: true,
    hint: (o) => (o.coverage.has_cogs ? undefined : "Needs your product costs."),
  },
  {
    id: "aov",
    label: "Avg order",
    plot: null,
    value: (t, c) => formatMoney(t.average_order_value, c),
    raw: (t) => t.average_order_value,
    higherIsBetter: true,
  },
];

const PLOT_LABELS: Record<PlotKey, string> = {
  sales: "Sales",
  profit: "Profit",
  ad_spend: "Ad spend",
  units: "Units",
  orders: "Orders",
};

export function DashboardMetricsPage({
  cogsHref,
  connectHref = "/data",
  defaultRange = "28d",
}: DashboardMetricsPageProps) {
  const [range, setRange] = useState<MetricsRange>(defaultRange);
  const [plot, setPlot] = useState<PlotKey>("sales");
  const [data, setData] = useState<MetricsOverview | null>(null);
  const [top, setTop] = useState<TopSkusResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Both in flight together — the SKU table is independent of the
      // overview and waiting for one to start the other doubles the
      // time to first paint.
      const [overview, skus] = await Promise.all([
        fetchMetricsOverview({ range }),
        fetchTopSkus({ range, limit: 8 }).catch(() => null),
      ]);
      setData(overview);
      setTop(skus);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  const currency = data?.currency ?? null;

  // The comparison series is the previous period's daily values lined up
  // index-for-index against the current one. Dates differ, so the x-axis
  // stays the CURRENT period's — the dashed line is "the same day, one
  // period ago", which is what the tooltip says.
  const chartPoints = useMemo(() => {
    if (!data) return [];
    return data.series.map((p) => ({ date: p.date, value: pickSeries(p, plot) }));
  }, [data, plot]);

  const comparisonPoints = useMemo(() => {
    if (!data) return undefined;
    // Index-aligned to `series` by the backend, but keep the current
    // period's dates on the x-axis — the dashed line means "the same
    // position one period back", which is what the tooltip says.
    return data.compare_series.map((p, i) => ({
      date: data.series[i]?.date ?? p.date,
      value: pickSeries(p, plot),
    }));
  }, [data, plot]);

  const plotFormat = useCallback(
    (v: number | null) =>
      plot === "units" || plot === "orders"
        ? formatNumber(v)
        : formatMoney(v, currency),
    [plot, currency],
  );

  if (loading && !data) {
    return (
      <PageContainer>
        <PageHeader title="Dashboard" />
        <StatRowSkeleton />
        <Skeleton className="mt-4 h-64 w-full" />
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <PageHeader title="Dashboard" />
        <Card>
          <ErrorState detail={error} onRetry={() => void load()} />
        </Card>
      </PageContainer>
    );
  }

  if (!data || data.coverage.source === "none") {
    return (
      <PageContainer>
        <PageHeader title="Dashboard" />
        <Card>
          <EmptyState
            title="No Amazon data yet"
            description="Connect a Seller Central or Amazon Ads account and your numbers appear here as soon as the first sync lands — usually within about ten minutes."
            action={
              <a
                href={connectHref}
                className="inline-flex h-9 items-center rounded-md bg-[var(--accent)] px-4 text-sm font-medium text-[var(--accent-foreground)]"
              >
                Connect an account
              </a>
            }
          />
        </Card>
      </PageContainer>
    );
  }

  const notes = [...data.coverage.notes];
  if (!data.coverage.has_cogs && cogsHref) {
    // The generic note comes from the backend; the actionable link is a
    // frontend concern because only the app knows where COGS lives.
    notes.push("Upload your product costs to turn on profit, margin and ROI.");
  }

  return (
    <PageContainer>
      <PageHeader
        title="Dashboard"
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{formatDateRange(data.range.start, data.range.end)}</span>
            {currency && <span aria-hidden="true">·</span>}
            {currency && <span>{currency}</span>}
            <span aria-hidden="true">·</span>
            <span>Synced {formatRelativeTime(data.last_synced_at)}</span>
          </span>
        }
        actions={<RangePicker value={range} onChange={setRange} />}
      />

      {/* KPI row. Tiles that map to a series double as the chart's
          metric picker — the selected one is outlined. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {TILES.map((tile) => {
          const current = tile.raw(data.totals);
          const previous = tile.raw(data.previous);
          return (
            <StatTile
              key={tile.id}
              label={tile.label}
              value={tile.value(data.totals, currency)}
              delta={deltaRatio(current, previous)}
              higherIsBetter={tile.higherIsBetter}
              hint={tile.hint?.(data)}
              selected={tile.plot === plot}
              onClick={tile.plot ? () => setPlot(tile.plot as PlotKey) : undefined}
              spark={
                tile.plot
                  ? data.series.map((p) => pickSeries(p, tile.plot as PlotKey))
                  : undefined
              }
            />
          );
        })}
      </div>

      <Card className="mt-4">
        <CardHeader className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>{PLOT_LABELS[plot]} over time</CardTitle>
            <p className="mt-0.5 text-[12.5px] text-[var(--muted-foreground)]">
              Solid: {formatDateRange(data.range.start, data.range.end)}. Dashed:{" "}
              {formatDateRange(data.compare.start, data.compare.end)}.
            </p>
          </div>
        </CardHeader>
        <CardBody>
          <TrendChart
            points={chartPoints}
            comparison={comparisonPoints}
            format={plotFormat}
            label={PLOT_LABELS[plot]}
            comparisonLabel="Previous period"
          />
        </CardBody>
      </Card>

      {notes.length > 0 && (
        <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--muted)] px-4 py-3">
          <CoverageNotes notes={notes} />
          {cogsHref && !data.coverage.has_cogs && (
            <a
              href={cogsHref}
              className="mt-2 inline-block text-[12.5px] font-medium text-[var(--accent)] underline underline-offset-2"
            >
              Upload product costs
            </a>
          )}
        </div>
      )}

      <TopSkusCard result={top} currency={currency} hasCogs={data.coverage.has_cogs} />
    </PageContainer>
  );
}

function pickSeries(
  point: MetricsOverview["series"][number],
  key: PlotKey,
): number | null {
  switch (key) {
    case "sales":
      return point.sales;
    case "units":
      return point.units;
    case "orders":
      return point.orders;
    case "ad_spend":
      return point.ad_spend;
    case "profit":
      return point.profit;
  }
}

function RangePicker({
  value,
  onChange,
}: {
  value: MetricsRange;
  onChange: (r: MetricsRange) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Date range"
      className="inline-flex overflow-hidden rounded-lg border border-[var(--border)]"
    >
      {METRIC_RANGES.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onChange(r)}
          aria-pressed={r === value}
          title={RANGE_LABELS[r]}
          className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
            r === value
              ? "bg-[var(--foreground)] text-[var(--background)]"
              : "text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
          }`}
        >
          {r.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function TopSkusCard({
  result,
  currency,
  hasCogs,
}: {
  result: TopSkusResult | null;
  currency: string | null;
  hasCogs: boolean;
}) {
  if (!result) return null;

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Top products</CardTitle>
      </CardHeader>
      <CardBody>
        {result.rows.length === 0 ? (
          <EmptyState
            title="No sales in this period"
            description="Widen the date range, or check back once the next sync lands."
          />
        ) : (
          // Wide content scrolls inside its own container so the page
          // body never scrolls sideways.
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
                  <th className="pb-2 pr-3 font-medium">Product</th>
                  <th className="pb-2 pr-3 text-right font-medium">Sales</th>
                  <th className="pb-2 pr-3 text-right font-medium">Units</th>
                  <th className="pb-2 pr-3 text-right font-medium">Ad spend</th>
                  <th className="pb-2 text-right font-medium">Profit</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r) => (
                  <tr key={r.sku} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2.5">
                        {r.product_image_url && (
                          <img
                            src={r.product_image_url}
                            alt=""
                            width={32}
                            height={32}
                            loading="lazy"
                            className="h-8 w-8 shrink-0 rounded border border-[var(--border)] object-contain"
                          />
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium">
                            {r.product_name ?? r.sku}
                          </p>
                          <p className="truncate font-mono text-[11px] text-[var(--muted-foreground)]">
                            {r.sku}
                            {r.asin ? ` · ${r.asin}` : ""}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">
                      {formatMoney(r.sales, r.currency ?? currency)}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">
                      {formatNumber(r.units)}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">
                      {formatMoney(r.ad_spend, r.currency ?? currency)}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      {r.has_cogs ? (
                        formatMoney(r.profit, r.currency ?? currency)
                      ) : (
                        <span
                          className="text-[var(--muted-foreground)]"
                          title="No cost on file for this SKU"
                        >
                          {NO_VALUE}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!hasCogs && result.rows.length > 0 && (
          <p className="mt-3 text-[12.5px] text-[var(--muted-foreground)]">
            Profit is blank because no product costs are on file.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

/** Small named export so a brand can put a live figure in its own
 *  header or nav badge without re-implementing the fetch. */
export function useMetricsOverview(range: MetricsRange) {
  const [data, setData] = useState<MetricsOverview | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetchMetricsOverview({ range })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        /* a nav badge must never break the page */
      });
    return () => {
      cancelled = true;
    };
  }, [range]);
  return data;
}
