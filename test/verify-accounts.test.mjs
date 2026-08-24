// The verification surface, rendered.
//
// Two things are being pinned here, and both are promises rather than
// implementation details:
//
//   1. THE PRIVACY MESSAGE APPEARS UNDER THE BUTTONS AND INSIDE EVERY MODAL.
//      Asserted against the exported NO_IDENTIFYING_INFO constant, so
//      deleting it from one of the two places fails — which is the whole
//      point of it being one constant.
//   2. THE PLACEHOLDERS ARE HONEST PLACEHOLDERS. Upload and Manual say they
//      are not available, their controls are disabled, and neither makes a
//      network call. A placeholder a seller can mistake for a working
//      feature is worse than no placeholder.
//
// Rendered with renderToStaticMarkup rather than a DOM library: effects do
// not run, which is exactly the property we want — anything that reaches the
// network on render would have to do it during render, and `fetch` is
// booby-trapped below to catch that.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const { BrandProvider } = await import("../dist/brand-context.js");
const { configureShared } = await import("../dist/config.js");
const {
  CALENDLY_URL,
  NO_IDENTIFYING_INFO,
  VERIFY_TARGETS,
  VerifyAccountModal,
  VerifyAccountsSection,
} = await import("../dist/components/verification/VerifyAccounts.js");

const BRAND = {
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
};

configureShared({ apiUrl: "https://api.getdragonbot.com", brand: BRAND });

/** Render, with fetch booby-trapped: any network call during render fails
 *  the test rather than silently hitting the real backend. */
function render(node) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = (...args) => {
    calls.push(args);
    throw new Error(`unexpected fetch during render: ${String(args[0])}`);
  };
  try {
    return { html: renderToStaticMarkup(h(BrandProvider, { brand: BRAND }, node)), calls };
  } finally {
    globalThis.fetch = original;
  }
}

const noop = () => {};
const modal = (target, method) =>
  h(VerifyAccountModal, {
    target,
    profileId: "prof_1",
    onClose: noop,
    onLinked: noop,
    initialMethod: method,
  });

const TARGETS = ["seller", "ads"];
const METHODS = ["connect", "upload", "call"];

// ─── the promise ─────────────────────────────────────────────────────

test("the no-identifying-information message renders under the buttons", () => {
  const { html } = render(
    h(VerifyAccountsSection, { profileId: "prof_1", onLinked: noop }),
  );
  assert.ok(html.includes("Verify your numbers"));
  assert.ok(html.includes(VERIFY_TARGETS.seller.buttonLabel));
  assert.ok(html.includes(VERIFY_TARGETS.ads.buttonLabel));
  assert.ok(
    html.includes(escapeForHtml(NO_IDENTIFYING_INFO)),
    "the privacy promise must sit under the buttons — it is what a seller reads before clicking",
  );
});

test("the message repeats inside every modal, on every method", () => {
  for (const target of TARGETS) {
    for (const method of METHODS) {
      const { html } = render(modal(target, method));
      assert.ok(
        html.includes(escapeForHtml(NO_IDENTIFYING_INFO)),
        `${target}/${method} modal dropped the privacy promise — someone who clicked past it ` +
          "once is about to hand over Amazon access, which is when they want to read it again",
      );
    }
  }
});

test("both modals offer all three methods and name the connect option for their provider", () => {
  const seller = render(modal("seller", "connect")).html;
  assert.ok(seller.includes("Connect to Amazon Seller Central"));
  const ads = render(modal("ads", "connect")).html;
  assert.ok(ads.includes("Connect to Amazon Ads"));

  for (const target of TARGETS) {
    const { html } = render(modal(target, "connect"));
    assert.ok(html.includes("Connect your Amazon account"));
    assert.ok(html.includes("Upload a screenshot"));
    assert.ok(html.includes("Manual verification"));
  }
});

test("the ads button promises a badge, not a number it cannot deliver", () => {
  // Linking an ads connection contributes ZERO metric rows — the snapshot
  // builder skips non-SP-API providers. If this copy ever promises TACOS or
  // ad spend on the page, it is promising a number that never appears.
  const { html } = render(modal("ads", "connect"));
  assert.ok(html.includes("Proves you&#x27;re a real advertiser"));
  assert.ok(/does not add ad\s+spend or TACOS/.test(html.replace(/\s+/g, " ")));
});

// ─── the placeholders ────────────────────────────────────────────────

test("the screenshot panel is a disabled, self-declared placeholder with no network call", () => {
  for (const target of TARGETS) {
    const { html, calls } = render(modal(target, "upload"));
    assert.equal(calls.length, 0, "the placeholder must not call anything");
    assert.ok(html.includes("Not available yet"), `${target}: the panel has to SAY it isn't live`);
    assert.ok(html.includes('data-placeholder="upload"'));
    // Both controls inert. A live-looking file picker on a page that has no
    // upload endpoint is the failure mode this asserts against.
    assert.match(html, /<input[^>]*type="file"[^>]*disabled/);
    assert.match(html, /<button[^>]*disabled[^>]*>Send for review[^<]*<\/button>/);
  }
});

test("the manual panel links to Calendly in a new tab, and tracks nothing", () => {
  for (const target of TARGETS) {
    const { html, calls } = render(modal(target, "call"));
    assert.equal(calls.length, 0, "booking is a link, not an API call — nothing is recorded yet");
    assert.ok(html.includes('data-placeholder="call"'));
    assert.equal(CALENDLY_URL, "https://calendly.com/ggballas");
    assert.match(
      html,
      new RegExp(`<a href="${CALENDLY_URL.replace(/[/.]/g, "\\$&")}"[^>]*target="_blank"[^>]*>`),
      `${target}: the Calendly link must open in a new tab`,
    );
    // rel is not decoration: target="_blank" without it hands the opened tab
    // a window.opener it can navigate.
    assert.match(html, /rel="noopener noreferrer"/);
    assert.ok(html.includes("Booking is the live part"));
  }
});

test("no panel except Connect offers a control that looks like it works", () => {
  for (const target of TARGETS) {
    for (const method of ["upload", "call"]) {
      const { html } = render(modal(target, method));
      const enabledButtons = [...html.matchAll(/<button(?![^>]*disabled)[^>]*>([^<]*)<\/button>/g)]
        .map((m) => m[1].trim())
        // The modal's own Close control is not a verification action.
        .filter((label) => label !== "Close");
      assert.deepEqual(
        enabledButtons,
        [],
        `${target}/${method} has an enabled button; there is nothing behind these panels`,
      );
    }
  }
});

/** React escapes text on the way out; compare like for like. */
function escapeForHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}
