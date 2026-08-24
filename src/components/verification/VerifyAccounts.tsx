// "Verify your numbers" — the two buttons that make VerifiedMargins usable.
//
// Filed as skills/feature-dev/open/FEATURE_VM_2026-08-24_amazon-account-verification-flow
// in the sellerconnect repo. The gap it closes: a seller who arrives at
// VerifiedMargins having never used DragonBot had an empty connected-accounts
// list and NO WAY ANYWHERE IN THE PRODUCT to fill it. The core loop —
// connect, get verified numbers, publish — was unreachable from the UI.
//
// WHY "VERIFY" AND NOT "CONNECT AN INTEGRATION". DragonBot connects Amazon to
// do work for the seller. This connects Amazon to prove a number. Identical
// OAuth, completely different promise, and the words have to be the promise
// the seller is actually buying.
//
// THREE METHODS, AND ONLY ONE OF THEM IS REAL:
//
//   A. Connect via Amazon OAuth — real, works, links the connection to the
//      profile and asks for a snapshot.
//   B. Upload a screenshot — PLACEHOLDER. No endpoint, no storage, no review
//      queue. It ships as a disabled panel that SAYS it is not available.
//   C. Book a manual verification call — PLACEHOLDER apart from the Calendly
//      link, which is real. No booking state is tracked.
//
// B and C exist so the choice is real in the UI and the copy can be tested on
// sellers who will not OAuth into a stranger's site. Both are labelled as not
// available IN THE UI, not merely in a comment: a disabled control with no
// explanation reads as a bug, and a placeholder a seller can mistake for a
// working feature is worse than no placeholder at all. Do not "fix" the
// disabled submit — there is nothing behind it.
//
// WHAT NOT TO INVENT WHEN B AND C BECOME REAL: not a fourth tier in
// `Profile.verification`. Tiers are derived from what actually fed the numbers
// (src/services/profiles/verification.ts in the backend), and a
// screenshot-verified profile is a `manual` connection with typed-in revenue —
// which the model already calls `self_reported`. What they need is a record
// (who asked, which method, what evidence, who reviewed, what was decided),
// i.e. a `ProfileVerificationRequest` table plus an ops surface. The shells
// below are laid out around a flow that can grow one.

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../../api";
import { useBrand } from "../../brand-context";
import { trackAccountConnected } from "../../attribution";
import {
  openOAuthPopup,
  pollUntilClosed,
  readOAuthResult,
  startConnection,
  type ConnectProvider,
} from "../../lib/connections";
import { linkConnection, requestProfileSnapshot } from "../../lib/profiles";

/**
 * THE PROMISE. One string, rendered under the buttons AND inside every modal.
 *
 * 🚨 It is a specification, not copy. The backend has a regression test over
 * the public payload asserting that a fully-populated profile with every
 * visibility toggle on serialises no connection id, no Amazon account or store
 * name, no brand names, no ASIN/SKU/product title and no storefront URL —
 * `src/routes/public-profile-privacy.http.test.ts` in the sellerconnect repo.
 * If you widen this sentence, widen that test first. If you cannot, narrow the
 * sentence.
 *
 * TWO THINGS IT DELIBERATELY DOES NOT SAY:
 *   * Nothing about "what you sell". CATEGORY NAMES DO PUBLISH when the seller
 *     switches `category` on. "Home & Kitchen" identifies nobody — but the
 *     wording stays at store / brands / products so it stays true.
 *   * Nothing site-wide about store names. A seeded, UNCLAIMED profile
 *     publishes a business name by design. This message belongs to the
 *     verification flow: what connecting YOUR account exposes.
 *
 * It repeats inside the modal on purpose. Someone who clicked past it once is
 * about to hand over Amazon access, which is exactly when they want to read it
 * again.
 */
export const NO_IDENTIFYING_INFO =
  "We never publish anything that identifies your store, your brands or your products — " +
  "no store name, no ASINs, no product titles, no screenshots. Verification reads your " +
  "revenue and costs only, and your profile shows only the figures you switch on.";

/** The manual-verification booking link. Real; the only live part of method C. */
export const CALENDLY_URL = "https://calendly.com/ggballas";

export type VerifyTarget = "seller" | "ads";
export type VerifyMethod = "connect" | "upload" | "call";

interface TargetSpec {
  provider: ConnectProvider;
  buttonLabel: string;
  modalTitle: string;
  /** What connecting this account actually proves. */
  connectBlurb: string;
  connectLabel: string;
  popupSuffix: string;
  /** What to screenshot, for the placeholder panel. */
  screenshotHint: string;
}

export const VERIFY_TARGETS: Record<VerifyTarget, TargetSpec> = {
  seller: {
    provider: "amazon-selling-partner",
    buttonLabel: "Verify Amazon seller account",
    modalTitle: "Verify Amazon seller account",
    connectBlurb:
      "Reads your sales, fees and ad spend straight from Seller Central. This is what puts a " +
      "verified revenue — and, if you have uploaded per-SKU costs, a verified margin — on your profile.",
    connectLabel: "Connect to Amazon Seller Central",
    popupSuffix: "spapi-verify",
    screenshotHint:
      "Seller Central → Reports → Business Reports → Sales and Traffic, showing the last 12 months " +
      "with the date range visible. You may blur your store name; leave the totals readable.",
  },
  ads: {
    provider: "amazon-ads",
    buttonLabel: "Verify Amazon ads account",
    modalTitle: "Verify Amazon ads account",
    // §5 of the brief, and it is the honest version. Linking an ads connection
    // contributes ZERO metric rows: the snapshot builder skips non-SP-API
    // providers (`skipped_unsupported`) because ad spend already arrives inside
    // profit_by_date. So this proves the seller is a real advertiser and adds a
    // badge — it does not put TACOS or ad spend on the page. Saying otherwise
    // would promise a number that never appears.
    connectBlurb:
      "Proves you're a real advertiser and puts the badge on your profile. It does not add ad " +
      "spend or TACOS to the page — your ad spend already reaches your profile through your " +
      "seller account, so connecting Ads adds the proof, not a new number.",
    connectLabel: "Connect to Amazon Ads",
    popupSuffix: "ads-verify",
    screenshotHint:
      "Amazon Ads console → Sponsored Products → Campaign manager, showing spend and sales for " +
      "the last 12 months with the date range visible.",
  },
};

const METHODS: Array<{ method: VerifyMethod; label: string; note: string }> = [
  { method: "connect", label: "Connect your Amazon account", note: "instant, most trusted" },
  { method: "upload", label: "Upload a screenshot", note: "reviewed by us" },
  { method: "call", label: "Manual verification", note: "15 minutes on a call" },
];

/** The promise, in the one place it is written. Rendered twice; defined once,
 *  so deleting it from either place is a visible deletion. */
export function PrivacyPromise() {
  return (
    <p data-privacy-promise>
      <small>{NO_IDENTIFYING_INFO}</small>
    </p>
  );
}

// ─── the section ─────────────────────────────────────────────────────

export interface VerifyAccountsSectionProps {
  profileId: string;
  /** Called after a connection is linked, so the page can reload its lists. */
  onLinked: () => void | Promise<void>;
}

export function VerifyAccountsSection({ profileId, onLinked }: VerifyAccountsSectionProps) {
  const [open, setOpen] = useState<VerifyTarget | null>(null);
  const close = useCallback(() => setOpen(null), []);

  return (
    <section data-verify-accounts>
      <h2>Verify your numbers</h2>
      <p>
        Connect the account your figures come from. It is the difference between a page of
        claims and a verified profile — and it is the only thing here that touches Amazon.
      </p>
      <p>
        <button type="button" onClick={() => setOpen("seller")}>
          {VERIFY_TARGETS.seller.buttonLabel}
        </button>{" "}
        <button type="button" onClick={() => setOpen("ads")}>
          {VERIFY_TARGETS.ads.buttonLabel}
        </button>
      </p>
      <PrivacyPromise />
      {open ? (
        <VerifyAccountModal
          target={open}
          profileId={profileId}
          onClose={close}
          onLinked={onLinked}
        />
      ) : null}
    </section>
  );
}

// ─── the modal ───────────────────────────────────────────────────────

export interface VerifyAccountModalProps {
  target: VerifyTarget;
  profileId: string;
  onClose: () => void;
  onLinked: () => void | Promise<void>;
  /** Which method to open on. Exists so tests can render each panel
   *  directly; the seller always starts on "connect". */
  initialMethod?: VerifyMethod;
}

export function VerifyAccountModal({
  target,
  profileId,
  onClose,
  onLinked,
  initialMethod = "connect",
}: VerifyAccountModalProps) {
  const spec = VERIFY_TARGETS[target];
  const [method, setMethod] = useState<VerifyMethod>(initialMethod);
  const ref = useRef<HTMLDialogElement>(null);

  // A real <dialog> rather than a hand-rolled overlay: it brings the backdrop,
  // the focus trap and Esc-to-close with it, which is three things not to get
  // wrong on a surface that asks for Seller Central access. `close` is a native
  // event (Esc and the button both fire it), so it is listened for natively
  // rather than through React's synthetic system.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!el.open) el.showModal();
    const handle = () => onClose();
    el.addEventListener("close", handle);
    return () => el.removeEventListener("close", handle);
  }, [onClose]);

  const titleId = `verify-${target}-title`;

  return (
    <dialog ref={ref} aria-labelledby={titleId} data-verify-modal={target}>
      <h2 id={titleId}>{spec.modalTitle}</h2>
      <p>
        <button type="button" onClick={() => ref.current?.close()}>
          Close
        </button>
      </p>

      <fieldset>
        <legend>How would you like to verify?</legend>
        {METHODS.map((m) => (
          <p key={m.method}>
            <label>
              <input
                type="radio"
                name={`verify-method-${target}`}
                value={m.method}
                checked={method === m.method}
                onChange={() => setMethod(m.method)}
              />{" "}
              {m.label} — {m.note}
            </label>
          </p>
        ))}
      </fieldset>

      {method === "connect" ? (
        <ConnectPanel spec={spec} profileId={profileId} onLinked={onLinked} />
      ) : method === "upload" ? (
        <UploadPanel spec={spec} />
      ) : (
        <CallPanel />
      )}

      <PrivacyPromise />
    </dialog>
  );
}

// ─── method A: connect (REAL) ────────────────────────────────────────

type ConnectPhase = "idle" | "waiting" | "linking" | "linked";

/** What we tell a seller whose account connected but whose link failed. The
 *  connection EXISTS — saying "connection failed" would be a lie that makes
 *  them try again and create a second one. */
const CONNECTED_NOT_LINKED =
  "Your Amazon account is connected. We couldn't attach it to this profile automatically — " +
  "switch it on under Connected accounts below.";

function ConnectPanel({
  spec,
  profileId,
  onLinked,
}: {
  spec: TargetSpec;
  profileId: string;
  onLinked: () => void | Promise<void>;
}) {
  const brand = useBrand();
  const [phase, setPhase] = useState<ConnectPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const cancelPoll = useRef<(() => void) | null>(null);

  const stopPolling = () => {
    cancelPoll.current?.();
    cancelPoll.current = null;
  };

  /**
   * Amazon said yes. Link the new connection to THIS profile rather than
   * making the seller find it in a list and tick a box.
   *
   * 🚨 This is a shortcut through the same door, not a second door. It posts
   * to POST /v1/profiles/:id/connections, so `requireCanLinkConnection`
   * decides — the actor must own the connection AND be an owner/admin of the
   * profile. Both hold here (they are signed in, editing their own profile,
   * and just authorized the connection themselves), which is precisely why
   * the extra click was ceremony. Never link around that endpoint.
   */
  const finish = useCallback(
    async (connectionId?: string) => {
      setPhase("linking");
      setError(null);
      setNote(null);

      if (!connectionId) {
        // Connected, but the callback didn't name the row. Nothing to link.
        setNote(CONNECTED_NOT_LINKED);
        setPhase("linked");
        void onLinked();
        return;
      }

      try {
        await linkConnection(profileId, connectionId);
      } catch (err) {
        const code =
          err instanceof ApiError
            ? (err.body as { error_code?: string } | undefined)?.error_code
            : undefined;
        // Already feeding this profile is success, not failure — a seller who
        // re-authorized an account they had already opted in lands here.
        if (code !== "already_linked") {
          setNote(`${CONNECTED_NOT_LINKED} (${err instanceof Error ? err.message : String(err)})`);
          setPhase("linked");
          void onLinked();
          return;
        }
      }

      // Best-effort: ask for the numbers now instead of at 08:30 UTC. A
      // failure here costs the seller a wait, not their connection, so it must
      // not be reported as a connect failure.
      try {
        await requestProfileSnapshot(profileId);
      } catch {
        /* the nightly run covers it */
      }

      trackAccountConnected(spec.provider === "amazon-ads" ? "amazon_ads" : "amazon_seller", {
        connectionId,
      });
      setPhase("linked");
      void onLinked();
    },
    [profileId, onLinked, spec.provider],
  );

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const result = readOAuthResult(event, {
        provider: spec.provider,
        messageType: brand.oauthMessageType,
      });
      if (!result) return;
      stopPolling();
      if (result.status !== "connected") {
        setPhase("idle");
        setError(result.detail || "Amazon didn't complete the connection.");
        return;
      }
      void finish(result.connection_id);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [spec.provider, brand.oauthMessageType, finish]);

  // The interval outlives the modal if the seller closes it mid-flow.
  useEffect(() => stopPolling, []);

  async function begin() {
    setError(null);
    setNote(null);
    setPhase("waiting");
    const res = await startConnection(spec.provider);
    if (res.error || !res.authorization_url) {
      setPhase("idle");
      setError(res.error ?? "We couldn't start the connection. Please try again.");
      return;
    }
    const popup = openOAuthPopup(res.authorization_url, `${brand.id}-${spec.popupSuffix}`);
    if (!popup) {
      setPhase("idle");
      setError("Your browser blocked the Amazon window. Allow popups for this site and try again.");
      return;
    }
    // Abandoned-popup fallback: closing Amazon's consent screen sends no
    // message at all, so without this the panel waits forever.
    cancelPoll.current = pollUntilClosed(popup, () => {
      cancelPoll.current = null;
      setPhase((p) => (p === "waiting" ? "idle" : p));
    });
  }

  if (phase === "linked") {
    return (
      <div data-connect-panel="done">
        <p role="status" data-status>
          Connected. We're pulling your numbers from Amazon now — for a brand-new account that
          can take a few hours. Nothing appears publicly until you publish your profile.
        </p>
        {note ? <p role="alert">{note}</p> : null}
      </div>
    );
  }

  return (
    <div data-connect-panel="idle">
      <p>{spec.connectBlurb}</p>
      <p>
        <button type="button" onClick={begin} disabled={phase !== "idle"}>
          {phase === "idle"
            ? spec.connectLabel
            : phase === "waiting"
              ? "Waiting for Amazon…"
              : "Linking your account…"}
        </button>
      </p>
      <p>
        <small>
          Amazon asks you to authorize us in its own window. You can withdraw it from Seller
          Central, or from Connected accounts here, at any time.
        </small>
      </p>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}

// ─── method B: screenshot (PLACEHOLDER) ──────────────────────────────

/**
 * PLACEHOLDER — FEATURE_VM_2026-08-24_amazon-account-verification-flow §2B.
 *
 * There is NO upload endpoint, NO storage and NO review queue behind this. The
 * file input and the submit button are disabled and the panel says so in as
 * many words, because a placeholder a seller can mistake for a working feature
 * is worse than no placeholder. The panel exists so the choice is real in the
 * UI and the copy can be tested.
 *
 * It makes no network call. Do not add one without the review pipeline: an
 * upload nobody reads is a promise nobody keeps.
 */
function UploadPanel({ spec }: { spec: TargetSpec }) {
  return (
    <div data-placeholder="upload">
      <p role="status">
        <strong>Not available yet.</strong> Screenshot review isn't switched on — we're still
        building the queue that reads them. Connect your account, or book a call, and we'll
        open this to you when it's live.
      </p>
      <p>When it is, this is what we'll ask for:</p>
      <p>{spec.screenshotHint}</p>
      <p>
        <label htmlFor="verify-screenshot">Screenshot</label>
        <input id="verify-screenshot" type="file" accept="image/png,image/jpeg" disabled />
      </p>
      <p>
        <button type="button" disabled>
          Send for review — coming soon
        </button>
      </p>
    </div>
  );
}

// ─── method C: manual call (PLACEHOLDER apart from the link) ─────────

/**
 * PLACEHOLDER — FEATURE_VM_2026-08-24_amazon-account-verification-flow §2C.
 *
 * The Calendly link is real and opens in a new tab. Everything else is not:
 * no booking is recorded, nothing is attached to the profile, and no
 * verification state changes because a call happened. That bookkeeping is a
 * follow-up (`ProfileVerificationRequest` + an ops surface), and until it
 * exists the panel tells the seller to name their profile on the call rather
 * than implying we already know who they are.
 *
 * Makes no network call.
 */
function CallPanel() {
  return (
    <div data-placeholder="call">
      <p>
        Fifteen minutes on a screen-share: you open Seller Central and show us the figures
        live. Nothing is recorded, and we keep no screenshots — we note the numbers you agree
        to publish and mark your profile verified by hand.
      </p>
      <p role="status">
        <strong>Booking is the live part.</strong> Nothing is tracked against your profile yet,
        so tell us your VerifiedMargins username on the call.
      </p>
      <p>
        <a href={CALENDLY_URL} target="_blank" rel="noopener noreferrer">
          Book a verification call
        </a>
      </p>
    </div>
  );
}
