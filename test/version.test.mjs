// The version constant must not lie about which build this is.
//
// `SHARED_PACKAGE_VERSION` exists for one reason: a brand app can print it,
// so we can answer "which build is verifiedmargins.com actually serving?"
// without guessing. That makes a STALE value worse than no value at all — it
// is a confident wrong answer, and the whole point of the constant is that
// you can trust it.
//
// It drifted anyway. Three separate sessions bumped package.json (0.9.12,
// 0.9.13, 0.9.14) and none touched src/index.ts, so for three releases the
// constant claimed 0.9.11. Nothing failed, because nothing looked. This file
// looks.
//
// It also checks the changelog above the constant, because that block is the
// only record of what each version changed — a bump with no line in it means
// the next person cannot tell what a brand on that version has.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
// The comments are stripped from dist/, so the changelog is read from source.
const source = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
const { SHARED_PACKAGE_VERSION } = await import("../dist/index.js");

test("SHARED_PACKAGE_VERSION matches package.json", () => {
  assert.equal(
    SHARED_PACKAGE_VERSION,
    pkg.version,
    "src/index.ts's SHARED_PACKAGE_VERSION has drifted from package.json's version. " +
      "Bump BOTH — the constant is what tells us at runtime which build a brand is on, " +
      "so a stale one misreports every brand that prints it.",
  );
});

test("the version being shipped has a changelog line", () => {
  assert.match(
    source,
    new RegExp(`^// v${pkg.version.replace(/\./g, "\\.")}:`, "m"),
    `src/index.ts has no "// v${pkg.version}:" changelog line. Every bump gets one — ` +
      "it is the only place that records what a brand pinned to that version actually has.",
  );
});
