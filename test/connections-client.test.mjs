// The OAuth + link client, against a stubbed fetch.
//
// What matters here is WHICH endpoints the verification flow talks to, and
// with what. Three of them are load-bearing:
//
//   * `/v1/connect/<provider>/start` gets `return_to` from the resolved
//     BRAND, never a literal. The backend whitelists it against its own
//     registry; a value that isn't exactly a registered frontend URL is
//     silently swapped for the Origin's brand, so a drifted appOrigin
//     doesn't error — it bounces the seller somewhere else.
//   * auto-linking after a connect posts to `/v1/profiles/:id/connections`,
//     the ONE endpoint that runs `requireCanLinkConnection`. There is no
//     second link path and there must never be one: that helper is what
//     stops a profile admin publishing a co-owner's revenue.
//   * the snapshot request is a 202 nudge, not a wait.

import { test } from "node:test";
import assert from "node:assert/strict";

const { configureShared } = await import("../dist/config.js");
const { SESSION_KEY } = await import("../dist/api.js");
const { startConnection, readOAuthResult, providerLabel } = await import(
  "../dist/lib/connections.js"
);
const { linkConnection, requestProfileSnapshot } = await import("../dist/lib/profiles.js");

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

// apiFetch reads the bearer token from localStorage, which Node has not got.
globalThis.localStorage ??= {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};
void SESSION_KEY;

/** Record calls; answer with `body`. */
function stubFetch(body, { status = 200 } = {}) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: "",
      text: async () => JSON.stringify(body),
    };
  };
  return {
    calls,
    restore() {
      globalThis.fetch = original;
    },
  };
}

test("startConnection posts the BRAND's origin as return_to, per provider", async () => {
  for (const [provider, path] of [
    ["amazon-selling-partner", "/v1/connect/amazon-selling-partner/start"],
    ["amazon-ads", "/v1/connect/amazon-ads/start"],
  ]) {
    const stub = stubFetch({ authorization_url: "https://sellercentral.amazon.com/apps/authorize" });
    try {
      const res = await startConnection(provider);
      assert.equal(res.error, undefined);
      assert.equal(res.authorization_url, "https://sellercentral.amazon.com/apps/authorize");
      assert.equal(stub.calls.length, 1);
      assert.equal(stub.calls[0].url, `https://api.getdragonbot.com${path}`);
      assert.equal(stub.calls[0].init.method, "POST");
      assert.deepEqual(JSON.parse(stub.calls[0].init.body), {
        // Must be the apex. app.verifiedmargins.com was removed outright, and
        // the backend would refuse it and bounce the seller elsewhere.
        return_to: "https://verifiedmargins.com",
      });
    } finally {
      stub.restore();
    }
  }
});

test("startConnection surfaces the backend's own words when it refuses", async () => {
  const stub = stubFetch({ error: "SP-API not configured on this deployment." }, { status: 503 });
  try {
    const res = await startConnection("amazon-selling-partner");
    assert.equal(res.authorization_url, undefined);
    assert.equal(res.error, "SP-API not configured on this deployment.");
  } finally {
    stub.restore();
  }
});

test("auto-link posts to the one endpoint that runs the authz helper", async () => {
  const stub = stubFetch({ id: "conn_1", provider: "amazon_selling_partner" });
  try {
    await linkConnection("prof_1", "conn_1");
    assert.equal(stub.calls[0].url, "https://api.getdragonbot.com/v1/profiles/prof_1/connections");
    assert.equal(stub.calls[0].init.method, "POST");
    assert.deepEqual(JSON.parse(stub.calls[0].init.body), { connection_id: "conn_1" });
  } finally {
    stub.restore();
  }
});

test("the snapshot nudge is a POST to the profile's own snapshot route", async () => {
  const stub = stubFetch({ status: "queued" });
  try {
    const res = await requestProfileSnapshot("prof_1");
    assert.deepEqual(res, { status: "queued" });
    assert.equal(stub.calls[0].url, "https://api.getdragonbot.com/v1/profiles/prof_1/snapshot");
    assert.equal(stub.calls[0].init.method, "POST");
  } finally {
    stub.restore();
  }
});

// ─── the postMessage gate ────────────────────────────────────────────

const event = (over = {}) => ({
  origin: "https://api.getdragonbot.com",
  data: {
    type: "dragonbot-oauth-result",
    provider: "amazon-selling-partner",
    status: "connected",
    connection_id: "conn_1",
  },
  ...over,
});

test("readOAuthResult accepts only our own origin", () => {
  const expect = { provider: "amazon-selling-partner", messageType: BRAND.oauthMessageType };
  assert.ok(readOAuthResult(event(), expect));
  // The popup runs a page WE serve. A message from anywhere else — an ad
  // iframe, another tab, an extension — is not a connection result.
  assert.equal(readOAuthResult(event({ origin: "https://evil.example.com" }), expect), null);
});

test("readOAuthResult ignores the other provider's result", () => {
  // Both modals can be opened in one session; each listener must only act on
  // its own provider or a seller connecting Ads would "complete" the seller
  // panel too.
  assert.equal(
    readOAuthResult(event(), { provider: "amazon-ads", messageType: BRAND.oauthMessageType }),
    null,
  );
});

test("readOAuthResult matches the brand's message type verbatim", () => {
  // 🚨 Every brand, VerifiedMargins included, uses "dragonbot-oauth-result" —
  // the backend sends the tenant's type regardless of brand. A VM-specific
  // string here would match nothing and the popup would close on a completed
  // connection nobody heard about.
  assert.equal(BRAND.oauthMessageType, "dragonbot-oauth-result");
  assert.equal(
    readOAuthResult(event(), {
      provider: "amazon-selling-partner",
      messageType: "verifiedmargins-oauth-result",
    }),
    null,
  );
});

test("provider labels are the seller-facing names, not the wire ids", () => {
  assert.equal(providerLabel("amazon-selling-partner"), "Amazon Seller Central");
  assert.equal(providerLabel("amazon-ads"), "Amazon Ads");
});
