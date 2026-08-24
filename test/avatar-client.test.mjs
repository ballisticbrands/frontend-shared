// The profile-picture client, against a stubbed fetch.
//
// One thing here is easy to break and expensive to notice: the upload
// sends the image file ITSELF as the request body. apiFetch stamps
// `Content-Type: application/json` on any body it isn't told about, so
// if the caller ever stops passing the file's own type, every upload
// arrives at the backend claiming to be JSON — and the endpoint, which
// deliberately ignores the header and reads the magic bytes, would still
// accept it while the global express.json parser ate the body first.
// These tests pin the wire shape so that cannot drift silently.
//
// The size constant is pinned against the backend's on purpose: it is
// duplicated across the repo boundary and nothing else would catch a
// drift until a seller saw "too big" for a file the server would have
// taken (or the reverse).

import { test } from "node:test";
import assert from "node:assert/strict";

const { configureShared } = await import("../dist/config.js");
const { SESSION_KEY } = await import("../dist/api.js");
const {
  AVATAR_ACCEPT,
  AVATAR_MAX_BYTES,
  removeProfileAvatar,
  uploadProfileAvatar,
} = await import("../dist/lib/profiles.js");

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

globalThis.localStorage ??= {
  getItem: () => "sc_live_test",
  setItem: () => {},
  removeItem: () => {},
};
void SESSION_KEY;

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

test("the upload posts the raw file with the file's own content type", async () => {
  const file = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" });
  const stub = stubFetch({
    avatar_url: "https://storage.googleapis.com/vm-avatars/avatars/prof_1/abc.png",
    profile: { id: "prof_1" },
  });
  try {
    const res = await uploadProfileAvatar("prof_1", file);
    assert.equal(
      res.avatar_url,
      "https://storage.googleapis.com/vm-avatars/avatars/prof_1/abc.png",
    );
    assert.equal(stub.calls.length, 1);
    const [call] = stub.calls;
    assert.equal(call.url, "https://api.getdragonbot.com/v1/profiles/prof_1/avatar");
    assert.equal(call.init.method, "POST");
    assert.equal(call.init.headers.get("Content-Type"), "image/png");
    assert.equal(call.init.body, file, "the Blob goes on the wire, not a JSON envelope");
  } finally {
    stub.restore();
  }
});

test("a file with no type still declares something, never application/json", async () => {
  // A Blob picked on some platforms arrives with type "". Falling
  // through to apiFetch's JSON default would be the worst answer.
  const file = new Blob([new Uint8Array([0xff, 0xd8, 0xff])]);
  const stub = stubFetch({ avatar_url: "https://storage.googleapis.com/b/x.jpg", profile: {} });
  try {
    await uploadProfileAvatar("prof_1", file);
    assert.equal(stub.calls[0].init.headers.get("Content-Type"), "application/octet-stream");
  } finally {
    stub.restore();
  }
});

test("the profile id is encoded into the path", async () => {
  const stub = stubFetch({ avatar_url: "https://storage.googleapis.com/b/x.png", profile: {} });
  try {
    await uploadProfileAvatar("prof/../other", new Blob([], { type: "image/png" }));
    assert.equal(
      stub.calls[0].url,
      "https://api.getdragonbot.com/v1/profiles/prof%2F..%2Fother/avatar",
    );
  } finally {
    stub.restore();
  }
});

test("the backend's own refusal reaches the caller verbatim", async () => {
  const stub = stubFetch(
    { error: "That file isn't a PNG, JPEG or WebP image.", error_code: "avatar_unsupported_type" },
    { status: 415 },
  );
  try {
    await assert.rejects(
      () => uploadProfileAvatar("prof_1", new Blob([], { type: "image/png" })),
      (err) => {
        assert.equal(err.status, 415);
        assert.equal(err.message, "That file isn't a PNG, JPEG or WebP image.");
        return true;
      },
    );
  } finally {
    stub.restore();
  }
});

test("Remove clears the field on the server, not just in the form", async () => {
  const stub = stubFetch({ id: "prof_1", avatar_url: null });
  try {
    await removeProfileAvatar("prof_1");
    assert.equal(stub.calls[0].url, "https://api.getdragonbot.com/v1/profiles/prof_1");
    assert.equal(stub.calls[0].init.method, "PATCH");
    assert.deepEqual(JSON.parse(stub.calls[0].init.body), { avatar_url: null });
  } finally {
    stub.restore();
  }
});

test("the client-side limits mirror the backend's", () => {
  assert.equal(AVATAR_MAX_BYTES, 1024 * 1024, "backend AVATAR_MAX_BYTES in avatars.ts");
  assert.equal(AVATAR_ACCEPT, "image/png,image/jpeg,image/webp");
});
