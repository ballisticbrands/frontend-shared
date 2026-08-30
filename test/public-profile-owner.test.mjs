// The owner/non-owner split on the public profile page.
//
// THE ASSERTION THAT MATTERS is the first one: a stranger's render of a
// published profile is UNCHANGED by the existence of the in-place editor.
// It is asserted the strongest way available — character-for-character
// equality between what a stranger gets and what the owner gets from
// `<main` onward — rather than by spot-checking a few fields, because the
// failure mode being guarded against is "someone moved the owner chrome
// inside <main> and nobody noticed for a month".
//
// That equality is not a coincidence to be re-derived; it is why the owner
// bar is a SIBLING of <main> in PublicProfile.tsx. If this test starts
// failing, the fix is to move the chrome back out, not to loosen the
// comparison.
//
// The rest pins the promises the editor makes:
//   * an unpublished profile says so, to its owner, and to nobody else
//   * edit mode exposes exactly the six fields the payload already carries
//     — nothing that would have needed the public endpoint widened
//   * a stranger's markup contains no input, no textarea and no button
//
// Rendered with renderToStaticMarkup, so effects never run: nothing here
// touches the network, and `fetch` is booby-trapped to prove it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const { configureShared } = await import("../dist/config.js");
const { PublicProfileBody, editFormFrom } = await import("../dist/pages/PublicProfile.js");
const { SOCIAL_FIELDS, VISIBILITY_FIELDS } = await import("../dist/lib/profiles.js");

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

/** A published profile with everything switched on — the widest render, so
 *  the equality assertion below covers every conditional section rather
 *  than an empty page's worth of them. */
const PROFILE = {
  username: "ggballas",
  display_name: "Paramint",
  bio: "Six years selling on Amazon.",
  avatar_url: "https://cdn.example.com/a.png",
  website_url: "https://paramint.example",
  socials: { x: "@paramint", reddit: "u/paramint" },
  seller_type: "private_label",
  type: "seller",
  claimed: true,
  noindex: false,
  verification: {
    tier: "verified",
    label: "Verified seller",
    description: "Revenue read directly from Amazon.",
    revenueSource: "spapi",
    marginBasis: "per_sku",
    verified_at: "2026-08-01T00:00:00.000Z",
    note: null,
  },
  window: { months: 12, from: "2025-09", through: "2026-08", includes_partial_month: true },
  visibility: { margin: true, sales: true, skuCount: true, brands: true, category: true },
  metrics: {
    native: [
      { currency: "USD", revenue: 12500, units: 310, orders: 288, fees: -3100, ad_spend: 1450, cogs: 4000, profit: 3950, margin_pct: 31.6, cogs_complete: true },
      { currency: "GBP", revenue: 4100, units: 90, orders: 84, fees: -900, ad_spend: 300, cogs: 1300, profit: 1600, margin_pct: 39.0, cogs_complete: true },
    ],
    display: {
      currency: "USD",
      revenue: 17600,
      fees: -4000,
      ad_spend: 1750,
      cogs: 5300,
      profit: 6550,
      margin_pct: 37.2,
      fx: { as_of: "2026-08-24", source: "ECB", unconvertible: [] },
    },
    series: null,
    businesses: [
      {
        // `page` is the business's own public address. Opaque by
        // construction: the slug is generated and `name` is that slug
        // title-cased — neither is anything the seller typed.
        page: { slug: "amazon-fba-48213", name: "Amazon FBA 48213" },
        platform: "amazon_selling_partner",
        label: "Amazon FBA",
        markets: ["US", "CA"],
        seller_type: "private_label",
        last_30d: { revenue: 12500, profit: 3950, margin_pct: 31.6 },
        revenue: 12500,
        margin_pct: 31.6,
        verification: { tier: "verified_margin", label: "Verified margin" },
      },
    ],
    margin_pct: 37.2,
    margin_basis: "per_sku",
    margin_note: null,
    sku_count: 42,
    brand_count: 3,
    brands_label: "Brands sold",
    category: "Home & Kitchen",
    categories: [{ name: "Home & Kitchen", revenue: 12500 }],
  },
  currency_options: ["USD", "GBP"],
  notes: ["Costs are seller-supplied."],
};

const OWNER = { profileId: "prof_1", published: true };

/** Render, with fetch booby-trapped: any network call during render fails
 *  the test rather than silently hitting the real backend. */
function render(props) {
  const original = globalThis.fetch;
  globalThis.fetch = (...args) => {
    throw new Error(`unexpected fetch during render: ${String(args[0])}`);
  };
  try {
    return renderToStaticMarkup(
      h(PublicProfileBody, { profile: PROFILE, months: 12, currency: "USD", ...props }),
    );
  } finally {
    globalThis.fetch = original;
  }
}

/** Everything from `<main` on — the part the world is entitled to see, and
 *  the part that must not depend on who is looking. */
const publicPart = (html) => html.slice(html.indexOf("<main"));

test("a non-owner's render is UNCHANGED — byte for byte — by the owner's editor", () => {
  const stranger = render({ owner: null });
  const ownerViewing = render({ owner: OWNER });

  assert.equal(
    publicPart(ownerViewing),
    stranger,
    "The public part of the page differs between a stranger and an owner in view " +
      "mode. Owner chrome belongs OUTSIDE <main> (see PublicProfile.tsx) precisely " +
      "so this comparison can be made — do not relax it, move the chrome back.",
  );
  // ...and the stranger's render really is the whole document: no bar was
  // silently emitted with an empty body.
  assert.ok(stranger.startsWith("<main"), "a stranger's render must be nothing but <main>");
});

test("a stranger gets no editing affordance at all", () => {
  const html = render({ owner: null });
  for (const forbidden of ["<input", "<textarea", "Edit profile", "data-owner-bar"]) {
    assert.ok(!html.includes(forbidden), `a stranger's render contained ${forbidden}`);
  }

  // 2026-08-28: this used to forbid `<button` outright, and had been FAILING
  // since v0.9.9 added the Share button — a public control, not an editing
  // one, so the assertion had simply outlived its wording. Narrowed rather
  // than deleted: every button a stranger gets must be one we have named
  // here, so a Save or a Delete appearing on the public render still fails.
  const buttons = [...html.matchAll(/<button[^>]*>/g)].map((m) => m[0]);
  for (const button of buttons) {
    assert.ok(
      button.includes('data-share=""'),
      `a stranger's render contained a button that is not Share: ${button}`,
    );
  }
});

test("the owner bar says whether the page is live, and an unpublished one says so", () => {
  const live = render({ owner: OWNER });
  assert.ok(live.includes("data-owner-bar"));
  assert.ok(live.includes("This is your public page"));
  assert.ok(live.includes("Edit profile"));

  const draft = render({ owner: { ...OWNER, published: false } });
  assert.ok(draft.includes("Only you can see this"));
  assert.ok(!draft.includes("This is your public page"));

  // The draft notice is owner-only chrome; it must never reach a stranger,
  // who is not even told the handle exists (the backend 404s an unpublished
  // profile identically to one nobody ever took).
  assert.ok(!render({ owner: null }).includes("Only you can see this"));
});

test("the owner bar carries the host's link back to full settings", () => {
  const html = render({
    owner: { ...OWNER, actions: h("a", { href: "/settings" }, "Profile settings →") },
  });
  assert.ok(html.includes('<a href="/settings">Profile settings →</a>'));
  // In the bar, outside <main> — the public part stays identical.
  assert.ok(!publicPart(html).includes("/settings"));
});

test("edit mode exposes exactly the fields the payload already carries", () => {
  const html = render({ owner: OWNER, form: editFormFrom(PROFILE) });

  // The six editable fields, by the ids the labels point at.
  for (const id of ["vm-display-name", "vm-bio", "vm-seller-type", "vm-website"]) {
    assert.ok(html.includes(`id="${id}"`), `edit mode is missing ${id}`);
  }
  for (const s of SOCIAL_FIELDS) {
    assert.ok(html.includes(`id="vm-social-${s.key}"`), `edit mode is missing ${s.key}`);
  }
  for (const f of VISIBILITY_FIELDS) {
    assert.ok(html.includes(f.label), `edit mode is missing the ${f.key} toggle`);
  }

  // Seeded from the payload, not blank — a form that silently starts empty
  // would clear the profile on the first Save.
  assert.ok(html.includes('value="Paramint"'));
  assert.ok(html.includes("Six years selling on Amazon."));
  assert.ok(html.includes('value="@paramint"'));

  // Save/Cancel replace Edit; the page is never in both states at once.
  assert.ok(html.includes(">Save</button>"));
  assert.ok(html.includes(">Cancel</button>"));
  assert.ok(!html.includes("Edit profile"));
});

test("edit mode offers NOTHING the payload does not already carry", () => {
  // The editor's whole safety argument is that it needed no new data. If a
  // field ever appears here that the public payload has no key for, someone
  // has widened an endpoint to feed it — which is the thing the brief and
  // the backend's privacy test both forbid.
  const html = render({ owner: OWNER, form: editFormFrom(PROFILE) });
  const ids = [...html.matchAll(/id="(vm-[a-z-]+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(ids, [
    "vm-bio",
    "vm-display-name",
    "vm-seller-type",
    ...SOCIAL_FIELDS.map((s) => `vm-social-${s.key}`),
    "vm-website",
  ].sort());
  // Username, picture, connections and publishing stay in ProfileSettings.
  for (const absent of ["vm-username", "vm-avatar", "vm-publish"]) {
    assert.ok(!html.includes(absent), `${absent} does not belong on the profile page`);
  }
});

test("editFormFrom round-trips the payload's own values", () => {
  assert.deepEqual(editFormFrom(PROFILE), {
    displayName: "Paramint",
    bio: "Six years selling on Amazon.",
    sellerType: "private_label",
    websiteUrl: "https://paramint.example",
    socials: { x: "@paramint", reddit: "u/paramint" },
    visibility: { margin: true, sales: true, skuCount: true, brands: true, category: true },
  });

  // Nulls become empty strings, not the string "null" — the save path turns
  // them back into nulls, so a field left blank clears rather than storing
  // four characters of nonsense.
  const bare = editFormFrom({ ...PROFILE, display_name: null, bio: null, website_url: null, seller_type: null });
  assert.equal(bare.displayName, "");
  assert.equal(bare.bio, "");
  assert.equal(bare.websiteUrl, "");
  assert.equal(bare.sellerType, "");
});

// ─── the business card links to that business's page ─────────────────
//
// FEATURE_VM_2026-08-28_business-detail-page shipped /business/:slug with
// nothing pointing at it; the card is the pointer. What is pinned here is
// not that a link exists — it is what the link is CALLED, and that linking a
// card still leaks no store name.
//
// The card showed a blurred "Stealth Brand" placeholder until 2026-08-30; it
// now shows `page.name` ("Amazon FBA 48213") plainly. The blur was protecting
// the seller's REAL storefront name, and that is still protected — by the
// payload never carrying it, which is what the leak test below pins.

test("a business card is a link to its own page", () => {
  const html = render({ owner: null });
  assert.ok(
    html.includes('href="/business/amazon-fba-48213"'),
    "the business card does not link to /business/<slug>",
  );
});

test("the card shows the business's real name, unblurred", () => {
  const html = render({ owner: null });
  // The destination page's own <h1> says "Amazon FBA 48213". The card says
  // the same, so a reader and a screen-reader user are told the same thing
  // about where the link goes — no aria-label needed, because the link text
  // IS the name now.
  assert.ok(html.includes("Amazon FBA 48213"), "the card does not show the business name");
  assert.ok(!html.includes("Stealth Brand"), "the blurred placeholder is still being rendered");
  assert.ok(!html.includes('data-blurred=""'), "the name is still blurred");
  assert.ok(
    !html.includes('aria-label="Business name hidden"'),
    "the placeholder's label outlived the placeholder",
  );
});

test("linking a card leaks no business name — the payload still carries none", () => {
  // The only strings that could name this seller's store are in the fixture
  // as the profile's own display name and website, both public and both
  // already on the page. The BUSINESS half must contribute nothing: no
  // title attribute, and nothing but the derived name in the aria-label.
  const html = render({ owner: null });
  assert.ok(!html.includes("title="), "a title attribute appeared on the card — nothing needs one");
  const labels = [...html.matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1]);
  for (const label of labels) {
    assert.ok(
      !/paramint/i.test(label),
      `an aria-label carried the seller's own name: "${label}"`,
    );
  }
});

test("a business with no page renders unlinked, and keeps the old label", () => {
  // `page: null` is the backend saying the page genuinely 404s — Amazon Ads
  // businesses carry slugs for column uniformity, not because a page exists.
  // A card linking to a guaranteed 404 is worse than one that does not link.
  const profile = {
    ...PROFILE,
    metrics: {
      ...PROFILE.metrics,
      businesses: [{ ...PROFILE.metrics.businesses[0], page: null, platform: "amazon_ads" }],
    },
  };
  const html = render({ owner: null, profile });
  assert.ok(!html.includes("/business/"), "an unaddressable business was given a link anyway");
  // With no page there is no derived name to show, so the card falls back to
  // the platform label — never to a blank, and never to a link.
  assert.ok(html.includes("Amazon FBA"), "an unlinked card must still name what it is");
});

test("a manually-entered Amazon business still gets the Amazon mark", () => {
  // `platform` is connection.provider — HOW THE DATA ARRIVED. A business typed
  // in by hand carries "manual" while its label says "Amazon FBA", and
  // matching on provider alone drew it as an anonymous square here while its
  // own business page showed the Amazon mark. Two surfaces disagreeing about
  // one business is worse than either answer on its own.
  const profile = {
    ...PROFILE,
    metrics: {
      ...PROFILE.metrics,
      businesses: [
        { ...PROFILE.metrics.businesses[0], platform: "manual", label: "Amazon FBA" },
      ],
    },
  };
  const html = render({ owner: null, profile });
  assert.ok(
    html.includes('data-platform="amazon"'),
    "a manual Amazon business fell back to the anonymous mark",
  );
});

test("a genuinely non-Amazon business keeps the neutral mark", () => {
  // The label decides only when the provider cannot, and only for Amazon —
  // it must not turn every manual row into an Amazon one.
  const profile = {
    ...PROFILE,
    metrics: {
      ...PROFILE.metrics,
      businesses: [
        { ...PROFILE.metrics.businesses[0], platform: "manual", label: "Shopify" },
      ],
    },
  };
  const html = render({ owner: null, profile });
  assert.ok(
    !html.includes('data-platform="amazon"'),
    "a Shopify business was drawn as Amazon",
  );
});
