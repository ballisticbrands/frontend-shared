// The valuation. Every assertion here is about a claim we make to a seller
// about what their business is worth, so they are written as claims.

import test from "node:test";
import assert from "node:assert/strict";
import { valueBusiness, VALUATION_VERSION } from "../dist/lib/valuation.js";

const TODAY = new Date("2026-09-02T00:00:00Z");
const base = (over = {}) => valueBusiness({ netProfitTtm: 100_000, answers: {}, today: TODAY, ...over });

test("no profit is UNVALUED, not worthless", () => {
  // A business whose costs we cannot see is a business we cannot value. A
  // zero would tell a seller something false about their own company.
  const v = valueBusiness({ netProfitTtm: null, answers: {}, today: TODAY });
  assert.equal(v.value, null);
  assert.equal(v.multiple, null);
});

test("a bare business still gets a number, from the base multiple", () => {
  const v = base();
  assert.ok(v.value > 0);
  assert.equal(v.value, Math.round(100_000 * v.multiple));
});

test("every adjustment is NAMED, so the number can be argued with", () => {
  const v = base({ answers: { hoursPerWeek: "under5", brandRegistry: "yes" } });
  const labels = v.adjustments.map((a) => a.label);
  assert.ok(labels.some((l) => /5 hours/.test(l)));
  assert.ok(labels.some((l) => /Brand Registry/.test(l)));
  for (const a of v.adjustments) assert.equal(typeof a.delta, "number");
});

test("a single supplier costs more than Brand Registry earns", () => {
  // The most common reason a sale collapses should outweigh a checkbox.
  const risky = base({ answers: { supplierCount: "1", brandRegistry: "yes" } });
  const safe = base({ answers: { supplierCount: "4plus", brandRegistry: "yes" } });
  assert.ok(risky.value < safe.value);
});

test("an OPEN account issue dominates the good news above it", () => {
  const good = { hoursPerWeek: "under5", brandRegistry: "yes", supplierCount: "4plus" };
  const clean = base({ answers: { ...good, issues: "none" } });
  const open = base({ answers: { ...good, issues: "open" } });
  assert.ok(open.value < clean.value * 0.9, "an unresolved issue must visibly hurt");
});

test("age and reviews arrive WITHOUT being asked", () => {
  // Both come from Keepa. A seller who answers nothing still sees their
  // number move, which is the point of deriving what we can.
  const bare = base();
  const known = base({
    derived: { sellingSince: "2019-01-01", ratingWeighted: 4.8, reviewTotal: 7637 },
  });
  assert.ok(known.value > bare.value);
  assert.ok(!known.missingSignals.includes("ratingWeighted"));
  assert.ok(bare.missingSignals.includes("ratingWeighted"));
});

test("missingSignals names what would move it, not merely what is blank", () => {
  const v = base();
  for (const k of ["hoursPerWeek", "supplierCount", "brandRegistry", "issues"]) {
    assert.ok(v.missingSignals.includes(k), `${k} should be flagged as missing`);
  }
});

test("the multiple is clamped at both ends", () => {
  const awful = base({
    answers: { hoursPerWeek: "over20", supplierCount: "1", supplierTerms: "reseller",
               brandRegistry: "no", issues: "open", trademark: "licensed" },
    derived: { ratingWeighted: 3.2, sellingSince: "2026-06-01" },
  });
  const stellar = base({
    answers: { hoursPerWeek: "under5", supplierCount: "4plus", supplierTerms: "exclusive",
               brandRegistry: "yes", trademark: "registered", issues: "none",
               team: "none", skuStrategy: "expanding" },
    derived: { ratingWeighted: 4.9, reviewTotal: 5000, sellingSince: "2016-01-01",
               marketplaces: ["US","CA","MX"], channels: "both" },
  });
  assert.ok(awful.multiple >= 1.2, "a bad business is still worth something");
  assert.ok(stellar.multiple <= 5.0, "no answer set may run away with the number");
  assert.ok(stellar.value > awful.value * 2);
});

test("it is pure — same inputs, same answer", () => {
  const args = { netProfitTtm: 250_000, answers: { hoursPerWeek: "5to10" }, today: TODAY };
  assert.deepEqual(valueBusiness(args), valueBusiness(args));
  assert.equal(valueBusiness(args).version, VALUATION_VERSION);
});
