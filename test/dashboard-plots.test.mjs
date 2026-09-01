// WHICH TILES ARE CONTROLS — the contract the founder profile and the
// business page both read.
//
// This exists because the two pages answered it in two places and got two
// different answers: /:username had three clickable tiles driving its chart
// while /business/:slug had none, its chart hardwired to Revenue. One
// function now decides, so the next divergence is a failing test rather than
// a page nobody noticed was inert.
//
// The invariant worth stating: `plots` IS the answer to "what is
// clickable". A caller must not add to it, because a tile that changed
// nothing when pressed is a control lying about being one — and every case
// below is really a test of when that lie would otherwise be told.

import { test } from "node:test";
import assert from "node:assert/strict";

const { dashboardPlots, plotLabel } = await import("../dist/lib/dashboard-plots.js");

const DAILY = [
  { date: "2026-08-29", revenue: 1000, profit: 400 },
  { date: "2026-08-30", revenue: 1200, profit: 500 },
  { date: "2026-08-31", revenue: 900, profit: 300 },
];

test("daily rows with profit plot all three, profit first", () => {
  // Profit leads because it is what the site ranks on and what both pages
  // lead with — a reader moving between them must not re-learn which figure
  // the page is about.
  const d = dashboardPlots({ daily: DAILY });
  assert.deepEqual(d.plots, ["profit", "revenue", "margin"]);
  assert.equal(d.useDaily, true);
});

test("MARGIN IS DERIVED — no margin_series needed, and none is sent", () => {
  // The regression this whole module exists for. The backend sends
  // `margin_series` only with the monthly fallback, so gating on it made the
  // Margin tile inert on every daily payload.
  const d = dashboardPlots({ daily: DAILY, marginSeries: null });
  assert.ok(d.plots.includes("margin"));
  assert.deepEqual(
    d.pointsFor("margin").map((p) => Math.round(p.value)),
    [40, 42, 33],
  );
});

test("no profit on any day → no Profit tile and no Margin tile", () => {
  // Revenue still plots. A profit control here would drive an empty chart,
  // and a margin one would divide by a numerator that does not exist.
  const d = dashboardPlots({ daily: DAILY.map((r) => ({ ...r, profit: null })) });
  assert.deepEqual(d.plots, ["revenue"]);
  assert.equal(d.sparkFor("profit"), undefined, "a tile with no series draws no sparkline");
  assert.deepEqual(d.pointsFor("margin"), []);
});

test("a zero-revenue day has NO margin — it is not a margin of zero", () => {
  const d = dashboardPlots({
    daily: [
      { date: "2026-08-30", revenue: 0, profit: 0 },
      { date: "2026-08-31", revenue: 500, profit: 100 },
    ],
  });
  assert.deepEqual(d.pointsFor("margin").map((p) => p.value), [null, 20]);
});

test("no rows at all → nothing is plottable, so the caller draws no chart", () => {
  const d = dashboardPlots({ daily: null, series: null });
  assert.deepEqual(d.plots, []);
  assert.equal(d.sparkFor("revenue"), undefined);
});

test("an empty daily array falls back to months rather than plotting nothing", () => {
  const d = dashboardPlots({
    daily: [],
    series: [{ month: "2026-07", revenue: 5000, profit: 1500 }],
    marginSeries: [{ month: "2026-07", margin_pct: 30 }],
  });
  assert.equal(d.useDaily, false);
  assert.deepEqual(d.plots, ["profit", "revenue", "margin"]);
  assert.deepEqual(d.pointsFor("revenue"), [{ date: "2026-07-01", value: 5000 }]);
});

test("an all-null margin_series is not a control", () => {
  // Stricter than the old `Boolean(marginSeries)` check, deliberately: a
  // present-but-empty series was still pushing a tile that plotted a flat
  // line of nothing.
  const d = dashboardPlots({
    series: [{ month: "2026-07", revenue: 5000, profit: null }],
    marginSeries: [{ month: "2026-07", margin_pct: null }],
  });
  assert.deepEqual(d.plots, ["revenue"]);
});

test("pointsFor returns [] for a key with no series, never a bogus line", () => {
  const d = dashboardPlots({ daily: DAILY.map((r) => ({ ...r, profit: null })) });
  assert.deepEqual(d.pointsFor("profit"), []);
});

test("the label of a plot is the same string the tile above it shows", () => {
  assert.equal(plotLabel("profit"), "Profit");
  assert.equal(plotLabel("revenue"), "Revenue");
  assert.equal(plotLabel("margin"), "Margin");
});
