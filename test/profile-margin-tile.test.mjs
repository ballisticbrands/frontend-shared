// The Margin tile on the profile dashboard: its "unverified" tag, and the
// fact that it is a CONTROL.
//
// Two separate promises, easy to break independently:
//
//   1. A margin we did not check says so, on the tile. Only
//      `verified_margin` means we verified the cost side — every other tier
//      carries a percentage the seller supplied. Asserted as
//      "anything not verified_margin is tagged", matching the rule in
//      UNVERIFIED_MARGIN_TAG, so a NEW tier is warned about by default
//      rather than silently vouched for.
//
//   2. The tile PLOTS. Margin used to be gated on `metrics.margin_series`,
//      which the backend sends only for the monthly fallback — so on every
//      daily profile (i.e. all of them) the tile rendered inert: no
//      sparkline, no click, no way to see margin on the chart. It is a
//      ratio of two series already on the page; the absence of a
//      precomputed one is not a reason to drop the control.
//
// The inverse matters as much: a profile with no profit on any day has no
// margin to plot, and a button that changed nothing would be a control
// lying about being one.
//
// renderToStaticMarkup, so no effects and no network.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const { configureShared } = await import("../dist/config.js");
const { PublicProfileBody, UNVERIFIED_MARGIN_TAG } = await import("../dist/pages/PublicProfile.js");

configureShared({
  apiUrl: "https://api.getdragonbot.com",
  brand: {
    id: "verifiedmargins",
    appHost: "verifiedmargins.com",
    appOrigin: "https://verifiedmargins.com",
    headerLabel: "VerifiedMargins",
    displayName: "VerifiedMargins",
    metaDescription: "",
    supportEmail: "hello@verifiedmargins.com",
    ga4MeasurementId: "",
    clarityId: "",
    oauthMessageType: "dragonbot-oauth-result",
  },
});

/** Three daily rows with profit on them — and `margin_series: null`, which
 *  is what the backend actually sends for a daily profile. That null is the
 *  whole point of the plottability test. */
const DAILY = [
  { date: "2026-08-29", revenue: 1000, units: 10, profit: 400 },
  { date: "2026-08-30", revenue: 1200, units: 12, profit: 500 },
  { date: "2026-08-31", revenue: 900, units: 9, profit: 300 },
];

function profile({ tier = "verified_revenue", daily = DAILY, marginPct = 44.5 } = {}) {
  return {
    username: "ggballas",
    display_name: "Gershon Ballas",
    bio: null,
    avatar_url: null,
    website_url: null,
    socials: {},
    seller_type: "private_label",
    type: "seller",
    claimed: true,
    noindex: false,
    verification: { tier, label: "Verified revenue", description: "", marginBasis: "blended_pct" },
    window: { months: 12, from: "2025-09", through: "2026-08", includes_partial_month: true },
    visibility: { margin: true, sales: true, skuCount: true, brands: true, category: true },
    metrics: {
      native: [],
      display: {
        currency: "USD",
        revenue: 3100,
        profit: 1200,
        margin_pct: marginPct,
        fx: { as_of: "2026-08-31", source: "ECB", unconvertible: [] },
      },
      daily,
      series: null,
      margin_series: null,
      businesses: [],
      last_30d: { revenue: 3100, profit: 1200, margin_pct: marginPct },
      margin_pct: marginPct,
      margin_basis: "blended_pct",
      margin_note: null,
      sku_count: 87,
    },
    currency_options: ["USD"],
    notes: [],
  };
}

function render(p) {
  return renderToStaticMarkup(
    h(PublicProfileBody, { profile: p, months: 12, currency: "USD" }),
  );
}

/** The one tile's markup, from its opening tag to its close. Sliced rather
 *  than parsed so the assertions below cannot accidentally match a
 *  neighbouring tile's text. */
function marginTile(html) {
  const tiles = html.split(/(?=<(?:button|div)[^>]*class="flex w-full flex-col)/);
  const tile = tiles.find((t) => t.includes(">Margin<"));
  assert.ok(tile, "no Margin tile in the render");
  return tile;
}

test("a margin we did not verify is tagged, with the explainer on hover", () => {
  const tile = marginTile(render(profile({ tier: "verified_revenue" })));
  assert.match(tile, /data-stat-tag/, "the tag is missing from a verified_revenue margin");
  assert.match(tile, new RegExp(UNVERIFIED_MARGIN_TAG.label));
  assert.match(
    tile,
    /title="User-reported metric, unverified by VerifiedMargins\.com"/,
    "a badge that cannot be interrogated is decoration",
  );
});

test("a margin we DID verify carries no tag", () => {
  const tile = marginTile(render(profile({ tier: "verified_margin" })));
  assert.doesNotMatch(tile, /data-stat-tag/);
});

test("an unrecognised tier is tagged too — the rule is a blacklist of one", () => {
  // A new tier must under-promise by default. Phrased as "not
  // verified_margin" precisely so this passes without being taught the name.
  const tile = marginTile(render(profile({ tier: "some_future_tier" })));
  assert.match(tile, /data-stat-tag/);
});

test("the Margin tile is CLICKABLE — it plots, with no margin_series present", () => {
  // The regression this exists for: gating on `metrics.margin_series` (null
  // on every daily profile) made the tile a dead <div>.
  const tile = marginTile(render(profile()));
  assert.match(tile, /^<button/, "Margin renders as a <div>, so there is nothing to click");
  assert.match(tile, /aria-pressed=/, "a plot control reports its own selected state");
  /* The sparkline's <div> is present but EMPTY here: the path is measured
     from the rendered width, which is 0 under renderToStaticMarkup. Its
     presence is the assertable half — `spark` was passed, so the tile has a
     series behind it. */
  assert.match(tile, /class="mt-1 w-full"/, "no sparkline slot — the tile got no series");
});

test("with no profit on any day there is no margin to plot, and no control", () => {
  const noProfit = DAILY.map((d) => ({ ...d, profit: null }));
  const tile = marginTile(render(profile({ daily: noProfit, marginPct: null })));
  assert.match(tile, /^<div/, "a button here would change nothing when pressed");
});

test("the tag sits inside the control, so clicking it selects the tile", () => {
  // The tag is a <span> within the <button>: a click on the words
  // "unverified" bubbles to the tile rather than being swallowed. If it ever
  // moves out of the button, this fails.
  const tile = marginTile(render(profile()));
  const tagAt = tile.indexOf("data-stat-tag");
  const closeAt = tile.indexOf("</button>");
  assert.ok(tagAt > 0 && closeAt > tagAt, "the tag escaped the clickable region");
});
