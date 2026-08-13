// Client for the backend's dashboard-metrics endpoints
// (sellerconnect/src/routes/metrics.ts). Shared rather than per-brand
// because it is backend-contract-touching code — the README's rule.
//
// Every money/rate field is `number | null` on purpose. The backend
// returns null when a metric is genuinely uncomputable (no COGS on
// file → no profit; no ad account → no TACOS) rather than substituting
// zero. UI must render those as "—" plus the matching `coverage.notes`
// line, never as 0.

import { apiFetch } from "../api";

export const METRIC_RANGES = ["7d", "28d", "90d", "mtd", "ytd"] as const;
export type MetricsRange = (typeof METRIC_RANGES)[number];

export const RANGE_LABELS: Record<MetricsRange, string> = {
  "7d": "Last 7 days",
  "28d": "Last 28 days",
  "90d": "Last 90 days",
  mtd: "Month to date",
  ytd: "Year to date",
};

export interface MetricTotals {
  sales: number;
  units: number;
  orders: number;
  ad_spend: number | null;
  ad_sales: number | null;
  ad_clicks: number | null;
  ad_impressions: number | null;
  ad_orders: number | null;
  fees: number | null;
  cogs: number | null;
  profit: number | null;
  profit_margin: number | null;
  roi: number | null;
  tacos: number | null;
  acos: number | null;
  roas: number | null;
  sessions: number | null;
  page_views: number | null;
  buybox_percentage: number | null;
  conversion_rate: number | null;
  average_order_value: number | null;
}

export interface MetricsCoverage {
  /** Which tier the numbers came from. `orders_fallback` means no COGS
   *  is uploaded, so profit/margin/ROI are null by design. */
  source: "profit_by_date" | "orders_fallback" | "ads_only" | "none";
  has_cogs: boolean;
  /** 0..1 share of sold SKUs that have a cost on file. */
  cogs_coverage: number | null;
  has_ads: boolean;
  has_settlements: boolean;
  has_traffic: boolean;
  /** Plain-language caveats. Render verbatim — they are already written
   *  for sellers, not for operators. */
  notes: string[];
}

export interface MetricsSeriesPoint {
  date: string;
  sales: number;
  units: number;
  orders: number;
  ad_spend: number | null;
  ad_sales: number | null;
  profit: number | null;
}

export interface MetricsOverview {
  accounts: Array<{ id: string; name: string; provider: string }>;
  currency: string | null;
  currencies: string[];
  range: { key: MetricsRange; start: string; end: string };
  compare: { start: string; end: string };
  totals: MetricTotals;
  previous: MetricTotals;
  /** One point per calendar day in the window — zero-filled by the
   *  backend, so quiet days occupy their real width on a time axis. */
  series: MetricsSeriesPoint[];
  /** The compare window, index-aligned to `series` (same length by
   *  construction). Draw it as the context line behind the current one. */
  compare_series: MetricsSeriesPoint[];
  coverage: MetricsCoverage;
  last_synced_at: string | null;
}

export interface TopSku {
  sku: string;
  asin: string | null;
  product_name: string | null;
  product_image_url: string | null;
  currency: string | null;
  sales: number;
  units: number;
  orders: number;
  cogs: number | null;
  fees: number | null;
  ad_spend: number | null;
  profit: number | null;
  profit_margin: number | null;
  has_cogs: boolean;
}

export type TopSkuSort = "sales" | "units" | "orders" | "profit" | "ad_spend";

export interface TopSkusResult {
  range: { key: MetricsRange; start: string; end: string };
  sort: TopSkuSort;
  rows: TopSku[];
}

function qs(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}

export function fetchMetricsOverview(opts: {
  range: MetricsRange;
  accountId?: string;
}): Promise<MetricsOverview> {
  return apiFetch<MetricsOverview>(
    `/v1/metrics/overview${qs({ range: opts.range, account_id: opts.accountId })}`,
  );
}

export function fetchTopSkus(opts: {
  range: MetricsRange;
  accountId?: string;
  sort?: TopSkuSort;
  limit?: number;
}): Promise<TopSkusResult> {
  return apiFetch<TopSkusResult>(
    `/v1/metrics/top-skus${qs({
      range: opts.range,
      account_id: opts.accountId,
      sort: opts.sort,
      limit: opts.limit,
    })}`,
  );
}

// ─── formatting ───────────────────────────────────────────────────────
//
// Kept here, next to the types, so every brand's dashboard renders a
// null the same way and nobody re-invents "$NaN".

/** The em dash every unavailable metric renders as. */
export const NO_VALUE = "—";

export function formatMoney(
  value: number | null | undefined,
  currency: string | null,
  opts: { compact?: boolean } = {},
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_VALUE;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      notation: opts.compact && Math.abs(value) >= 10_000 ? "compact" : "standard",
      maximumFractionDigits: opts.compact && Math.abs(value) >= 10_000 ? 1 : 2,
    }).format(value);
  } catch {
    // Unknown ISO code (Amazon has surfaced a few) — fall back rather
    // than throwing inside a render.
    return `${currency ?? ""} ${value.toFixed(2)}`.trim();
  }
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_VALUE;
  return new Intl.NumberFormat().format(value);
}

export function formatPercent(
  value: number | null | undefined,
  opts: { digits?: number; alreadyPercent?: boolean } = {},
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_VALUE;
  const pct = opts.alreadyPercent ? value : value * 100;
  return `${pct.toFixed(opts.digits ?? 1)}%`;
}

/** Period-over-period change as a signed ratio. null whenever the
 *  comparison is meaningless — a missing metric, or a zero baseline
 *  (which would be an infinite "increase"). */
export function deltaRatio(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

/** Relative time, for "synced 4 minutes ago" / "last call 2 hours ago". */
export function formatRelativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return NO_VALUE;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return NO_VALUE;
  const secs = Math.round((now - then) / 1000);
  if (secs < 45) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}

/** "Aug 6 – Aug 12" for a range header. */
export function formatDateRange(start: string, end: string): string {
  const fmt = (d: string) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  return `${fmt(start)} – ${fmt(end)}`;
}
