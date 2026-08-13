// Client for /v1/usage/* — what the seller's AI has actually done with
// their keys (sellerconnect/src/routes/usage.ts).
//
// Two jobs:
//   1. "Connect your AI" confirmation. Pasting a connector config into a
//      desktop client normally gives zero feedback. Polling
//      `fetchUsageSummary` until `last_call_at` moves turns that into a
//      real "we received your first call" moment.
//   2. Proof of life on the dashboard — a feed of the questions the
//      agent has been asking.

import { apiFetch } from "../api";

export interface UsageActivityRow {
  id: string;
  tool: string;
  /** One whitelisted arg value, e.g. the report name. null when the
   *  call carried nothing worth showing in a one-line row. */
  detail: string | null;
  success: boolean;
  latency_ms: number | null;
  error_code: string | null;
  /** Populated only on failures. */
  error_message: string | null;
  created_at: string;
  key: { id: string; name: string; prefix: string };
}

export interface UsageSummary {
  days: number;
  total_calls_ever: number;
  calls: number;
  failures: number;
  success_rate: number | null;
  avg_latency_ms: number | null;
  first_call_at: string | null;
  last_call_at: string | null;
  last_tool: string | null;
  series: Array<{ date: string; calls: number }>;
  by_tool: Array<{ tool: string; calls: number; failures: number }>;
  keys: Array<{
    id: string;
    name: string;
    prefix: string;
    last_used_at: string | null;
    calls: number;
  }>;
}

export function fetchUsageActivity(opts: { limit?: number } = {}): Promise<UsageActivityRow[]> {
  const q = opts.limit ? `?limit=${opts.limit}` : "";
  return apiFetch<UsageActivityRow[]>(`/v1/usage/activity${q}`);
}

export function fetchUsageSummary(opts: { days?: number } = {}): Promise<UsageSummary> {
  const q = opts.days ? `?days=${opts.days}` : "";
  return apiFetch<UsageSummary>(`/v1/usage/summary${q}`);
}

/** Tool name → what to show a seller. The MCP tool names are an API
 *  surface, not English; the activity feed reads as gibberish without
 *  this. Unknown tools fall back to the raw name so a newly-shipped
 *  tool degrades to something honest rather than disappearing. */
const TOOL_LABELS: Record<string, string> = {
  list_connected_accounts: "Checked your connected accounts",
  get_account_status: "Checked sync health",
  list_reports: "Looked up what data is available",
  get_report_data: "Read your Amazon data",
  get_product_intel: "Researched a product",
  get_price_history: "Checked price history",
  get_sales_estimate: "Estimated sales",
  get_seller_info: "Looked up a seller",
  find_products: "Searched the catalog",
  find_price_drops: "Scanned for price drops",
  get_best_sellers: "Pulled best sellers",
  get_keyword_volume: "Checked keyword volume",
  get_keywords_for_asin: "Pulled keywords for an ASIN",
  get_keyword_history: "Checked keyword history",
  get_keyword_share_of_voice: "Measured share of voice",
  list_recipes: "Looked up an analysis recipe",
  get_recipe: "Followed an analysis recipe",
};

export function describeTool(tool: string): string {
  return TOOL_LABELS[tool] ?? tool;
}
