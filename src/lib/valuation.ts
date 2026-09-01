// What a business is worth, and WHY.
//
// 🚨 ONE IMPLEMENTATION, TWO CALLERS. The wizard runs this on every keystroke
// for the live number; the backend runs it to store the figure. A second copy
// would drift, and the day the preview and the saved value disagree is the day
// the product's central number stops being believable. It is a pure function
// with no I/O for exactly that reason.
//
// Valued on NET PROFIT, not SDE. Brokers quote SDE, which adds back owner
// salary and one-offs — figures Amazon does not give us and the seller does
// not supply. So this reads LOW against a broker listing by roughly whatever
// the owner pays themselves, and the UI has to say so. A number that is
// quietly on a different basis is worse than one that is openly conservative.

export interface ValuationInputs {
  /** Trailing-twelve-month NET profit, in the display currency. */
  netProfitTtm: number | null;
  /** Wizard answers, by question name. */
  answers: Record<string, unknown>;
  /** Derived facts we did not have to ask for. */
  derived?: {
    ratingWeighted?: number | null;
    reviewTotal?: number | null;
    /** ISO date of the earliest listing we can see. */
    sellingSince?: string | null;
    /** FBA / FBM / both. */
    channels?: string | null;
    marketplaces?: string[];
  };
  /** Defaults to now; injectable so tests do not drift with the calendar. */
  today?: Date;
}

export interface Adjustment {
  label: string;
  /** Added to the base multiple. Signed, and shown to the seller — a number
   *  that moves without saying why is a slot machine. */
  delta: number;
}

export interface Valuation {
  /** Null when there is no profit to multiply. Not zero: a business we cannot
   *  value is not a business worth nothing. */
  value: number | null;
  multiple: number | null;
  netProfitTtm: number | null;
  adjustments: Adjustment[];
  /** Which questions would move it most, for the wizard's nudge. */
  missingSignals: string[];
  version: number;
}

export const VALUATION_VERSION = 1;

/** Annual net-profit multiple before adjustments. Deliberately conservative:
 *  the honest failure here is telling someone their business is worth less
 *  than it is, not more. */
const BASE_MULTIPLE = 2.6;
const MIN_MULTIPLE = 1.2;
const MAX_MULTIPLE = 5.0;

function yearsSince(iso: string | null | undefined, today: Date): number | null {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  return (today.getTime() - then.getTime()) / (365.25 * 24 * 3600 * 1000);
}

export function valueBusiness(input: ValuationInputs): Valuation {
  const today = input.today ?? new Date();
  const a = input.answers ?? {};
  const d = input.derived ?? {};
  const adj: Adjustment[] = [];
  const missing: string[] = [];

  // ── Age. The strongest single predictor of survival, and free: Keepa's
  //    first sighting is a floor even when the seller tells us nothing.
  const age = yearsSince(d.sellingSince, today);
  if (age === null) missing.push("sellingSince");
  else if (age >= 5) adj.push({ label: "Trading 5+ years", delta: 0.5 });
  else if (age >= 3) adj.push({ label: "Trading 3+ years", delta: 0.3 });
  else if (age < 1.5) adj.push({ label: "Under 18 months of history", delta: -0.4 });

  // ── Owner time. A buyer is buying their time back, so this moves it more
  //    than almost anything else a seller can tell us.
  const hours = a.hoursPerWeek;
  if (hours === "under5") adj.push({ label: "Under 5 hours a week", delta: 0.4 });
  else if (hours === "5to10") adj.push({ label: "5–10 hours a week", delta: 0.2 });
  else if (hours === "over20") adj.push({ label: "Over 20 hours a week", delta: -0.4 });
  else if (hours === undefined) missing.push("hoursPerWeek");

  // ── Supplier concentration. The most common reason a sale falls through.
  if (a.supplierCount === "1") adj.push({ label: "Single supplier", delta: -0.5 });
  else if (a.supplierCount === "4plus") adj.push({ label: "Four or more suppliers", delta: 0.2 });
  else if (a.supplierCount === undefined) missing.push("supplierCount");

  if (a.supplierTerms === "exclusive") adj.push({ label: "Exclusive or custom tooling", delta: 0.4 });
  else if (a.supplierTerms === "contract") adj.push({ label: "Contracted supply", delta: 0.2 });
  else if (a.supplierTerms === "reseller") adj.push({ label: "Resold stock, not exclusive", delta: -0.5 });

  // ── The moat.
  if (a.brandRegistry === "yes") adj.push({ label: "Brand Registry", delta: 0.3 });
  else if (a.brandRegistry === "no") adj.push({ label: "No Brand Registry", delta: -0.3 });
  else missing.push("brandRegistry");

  if (a.trademark === "registered") adj.push({ label: "Registered trademark", delta: 0.2 });
  else if (a.trademark === "licensed") adj.push({ label: "Licensed brand, not owned", delta: -0.4 });

  // ── Reviews, weighted by revenue upstream. Free from Keepa.
  const rating = d.ratingWeighted;
  if (typeof rating === "number") {
    if (rating >= 4.6) adj.push({ label: `${rating.toFixed(1)}★ average`, delta: 0.3 });
    else if (rating < 4.0) adj.push({ label: `${rating.toFixed(1)}★ average`, delta: -0.4 });
  } else missing.push("ratingWeighted");

  if (typeof d.reviewTotal === "number" && d.reviewTotal >= 1000) {
    adj.push({ label: "1,000+ reviews", delta: 0.2 });
  }

  // ── Diversification we did not have to ask for.
  if ((d.marketplaces?.length ?? 0) >= 3) {
    adj.push({ label: "Three or more marketplaces", delta: 0.2 });
  }
  if (d.channels === "both") adj.push({ label: "FBA and FBM", delta: 0.1 });

  // ── Risk. An open issue is the one thing that can dominate everything
  //    above it, so it is weighted to.
  if (a.issues === "open") adj.push({ label: "Unresolved account or IP issue", delta: -0.8 });
  else if (a.issues === "resolved") adj.push({ label: "Past issue, resolved", delta: -0.1 });
  else if (a.issues === undefined) missing.push("issues");

  // ── Team. Staff raise the price a buyer pays for turnkey-ness slightly,
  //    but they are also a cost and a dependency; near-neutral on purpose.
  if (a.team === "none") adj.push({ label: "Owner-operated", delta: 0.1 });
  else if (a.team === "employees") adj.push({ label: "Employees to transfer", delta: -0.1 });

  if (a.skuStrategy === "expanding") adj.push({ label: "Catalogue expanding", delta: 0.2 });
  else if (a.skuStrategy === "consolidating") adj.push({ label: "Catalogue consolidating", delta: -0.1 });

  const raw = BASE_MULTIPLE + adj.reduce((n, x) => n + x.delta, 0);
  const multiple = Math.min(MAX_MULTIPLE, Math.max(MIN_MULTIPLE, Number(raw.toFixed(2))));

  /* No profit, no valuation — and NOT a zero. A business whose costs we
     cannot see is unvalued, which is a different statement from worthless. */
  const profit = input.netProfitTtm;
  const value =
    typeof profit === "number" && profit > 0 ? Math.round(profit * multiple) : null;

  return {
    value,
    multiple: typeof profit === "number" && profit > 0 ? multiple : null,
    netProfitTtm: profit ?? null,
    adjustments: adj,
    missingSignals: missing,
    version: VALUATION_VERSION,
  };
}
