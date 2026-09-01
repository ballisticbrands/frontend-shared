// The public profile page — FUNCTIONAL, DELIBERATELY UNSTYLED.
//
// It renders exactly what the API returns and decides nothing. A field
// that is absent from the payload was withheld by the backend (hidden
// by its owner, or suppressed because the profile is unclaimed), and
// this component must never reconstruct it from something else it was
// given. Two places deciding "may we show this?" is one too many.
//
// What it DOES take care of, because they are honesty-of-presentation
// rather than policy:
//   * the verification badge states what is verified AND what is not
//   * the FX line names the rate's source and as-of date
//   * a currency with no rate is shown natively, never converted
//   * `noindex` is surfaced so the host app can emit the meta tag
//
// ─── The owner's own page (v0.9.3) ───────────────────────────────────
//
// Pass `owner` and the same page becomes editable IN PLACE — the x.com
// model: your profile is not a preview of a form somewhere else, it is
// the thing itself. Three rules make that safe, and all three are
// load-bearing:
//
//   1. THE PUBLIC RENDER IS UNTOUCHED. Owner chrome renders BEFORE
//      `<main>`, never inside it. Everything from `<main` onward is a
//      pure function of the payload and `actions` — identical for a
//      stranger, for an owner in view mode, and for a crawler.
//      Pinned by test/public-profile-owner.test.mjs.
//   2. THE OWNER'S SOURCE IS `preview`, NOT THE PUBLIC ENDPOINT.
//      `GET /v1/profiles/:id/preview` runs the SAME builder as
//      `GET /v1/public/profiles/:username` (asserted byte-for-byte in
//      the backend's public-profile-privacy.http.test.ts), so what an
//      owner sees is definitionally what the world sees — and it also
//      renders an UNPUBLISHED profile, which is how an owner reaches
//      their own draft without `/:username` becoming an existence
//      oracle for anyone else.
//   3. THE EDITOR ADDS NO DATA. Every field it edits — display name,
//      bio, seller type, website, socials, visibility — is already in
//      the payload, passed through the builder unfiltered. Nothing here
//      needed the public endpoint widened, and nothing here may ever
//      ask for that.

import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { VerificationBadge } from "../components/VerificationBadge";
import { ApiError } from "../api";
import { StatTile } from "../components/ui/StatTile";
import { TrendChart } from "../components/ui/TrendChart";
import {
  type WindowKey,
  WINDOW_OPTIONS,
  SELLER_TYPES,
  SOCIAL_FIELDS,
  VISIBILITY_FIELDS,
  fetchProfilePreview,
  fetchPublicProfile,
  updateProfile,
  type PublicProfile,
  type SellerType,
  type Socials,
  type Visibility,
} from "../lib/profiles";

/**
 * Who is looking, answered rather than asked.
 *
 * ⚠️ Same rationale as `actions` below: ownership is SESSION knowledge and
 * this component is deliberately session-free. The host resolves it (from
 * its own `GET /v1/profiles`, which returns only the caller's profiles) and
 * passes the answer plus the profile id. This component never maps a
 * username to an id, because that mapping is exactly the existence oracle
 * the backend refuses to be.
 */
export interface ProfileOwnerProps {
  /** The profile row's id. Every owner-scoped call keys off this — never
   *  off the username in the address bar. */
  profileId: string;
  /** From the host's own `/v1/profiles` row. The public payload has no
   *  `published` field and must not grow one: a published profile is the
   *  only kind the public endpoint will serve, so the flag would be a
   *  constant there and an oracle anywhere else. */
  published: boolean;
  /** Extra links for the owner bar — the host's slot for "Profile
   *  settings →" (username, connections and publishing all still live
   *  there). Rendered only for an owner, and only outside `<main>`. */
  actions?: ReactNode;
}

export interface PublicProfilePageProps {
  username: string;
  /**
   * Rendered beside the profile header — the host app's slot for whatever
   * belongs there (share, report), for owners and strangers alike.
   *
   * ⚠️ A slot rather than a `canEdit` flag on purpose: whether you own a
   * profile is SESSION knowledge, and this component is deliberately
   * session-free — it renders public data for anyone, including a crawler
   * with no cookies. Handing it the session so it can decide would make the
   * public page depend on auth state and give it two rendering modes to keep
   * honest. The host already knows who is signed in; it passes the answer,
   * not the question.
   *
   * Its position inside `<main>` is deliberately NOT conditional on `owner`
   * — see rule 1 in the header comment.
   */
  actions?: ReactNode;
  /** Set when the viewer owns this profile: renders the owner bar and the
   *  in-place editor, and sources the payload from `preview`. */
  owner?: ProfileOwnerProps | null;
  /** Called when the username was released and the caller should
   *  redirect (301) to the current one. */
  onMoved?: (to: string) => void;
  defaultMonths?: number;
  /** Which windows this reader may actually open. Session knowledge, so the
   *  host resolves it — see WindowPicker. Omitted means every window is open,
   *  which is right for a host that has no gate. */
  unlockedWindows?: readonly WindowKey[];
  /** A locked window was picked. The host's slot for whatever the gate is —
   *  on VerifiedMargins, the "add your business" dialog. */
  onLockedWindow?: (key: WindowKey) => void;
  defaultCurrency?: string;
  /** Rendered directly above the name and picture, on the same line as the
   *  actions column. The host supplies the markup because breadcrumbs are
   *  made of ROUTES, which is host knowledge; this page only decides where
   *  they sit — which has to be here, because the header's alignment is
   *  what puts the first action button on the breadcrumb's line. */
  breadcrumb?: ReactNode;
  /** Fired with each payload this page loads. For host chrome that has to
   *  say something about a profile it did not fetch — a breadcrumb that
   *  wants the display name, a currency control that wants to know which
   *  codes convert. Read-only: the page remains the owner of the data. */
  onLoaded?: (profile: PublicProfile) => void;
}

function pct(n: number | null): string {
  return n === null ? "—" : `${n.toFixed(1)}%`;
}

/** Money, rounded hard: `$2.1M`, `$840K`, `$980`.
 *
 *  Deliberately NOT `$2,140,000.00`. These figures are a 12-month roll-up of
 *  daily rows in several currencies, converted at a dated rate — the cents are
 *  arithmetic, not accuracy, and printing them claims a precision the pipeline
 *  does not have. Rounding is the honest render (BRANDING.md §4.2). */
function money(n: number | null, currency: string): string {
  if (n === null) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: Math.abs(n) >= 1000 ? 1 : 0,
    }).format(n);
  } catch {
    // Unknown/invalid currency code — never throw on a public page.
    return `${Math.round(n).toLocaleString()} ${currency}`;
  }
}

/** Up to two initials for the monogram avatar. */
function initials(name: string): string {
  const parts = name.replace(/^[@/]/, "").split(/[\s_-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2);
  return (parts[0]![0]! + parts[1]![0]!).slice(0, 2);
}




/** Platform labels + handle→URL, so a typed handle becomes a real link. */
const SOCIAL_LABEL: Record<string, string> = {
  x: "X",
  reddit: "Reddit",
  linkedin: "LinkedIn",
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
};

function socialUrl(key: string, value: string): string {
  if (value.startsWith("http")) return value;
  const handle = value.replace(/^@/, "").replace(/^u\//, "");
  const base: Record<string, string> = {
    x: "https://x.com/",
    reddit: "https://reddit.com/user/",
    linkedin: "https://linkedin.com/in/",
    instagram: "https://instagram.com/",
    tiktok: "https://tiktok.com/@",
    facebook: "https://facebook.com/",
  };
  return base[key] ? `${base[key]}${handle}` : value;
}



/** Marks for the action row. Inline and monochrome: a hosted brand icon is a
 *  third-party request on a page we prerender and people share, and colour
 *  logos on a palette whose whole argument is restraint would each shout
 *  louder than the verification badge. */
const SOCIAL_ICON: Record<string, JSX.Element> = {
  x: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
      <path d="M17.5 3h3.2l-7 8 8.2 10h-6.4l-5-6.1-5.7 6.1H1.6l7.5-8.6L1.2 3h6.6l4.5 5.6zm-1.1 16.1h1.8L7.7 4.8H5.8z" />
    </svg>
  ),
  reddit: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
      <path d="M22 11.8a2.2 2.2 0 0 0-3.7-1.6 10.8 10.8 0 0 0-5.5-1.7l.9-4.2 2.9.6a1.6 1.6 0 1 0 .2-1l-3.5-.7a.5.5 0 0 0-.6.4l-1.1 5a10.8 10.8 0 0 0-5.6 1.7 2.2 2.2 0 1 0-2.4 3.6 4 4 0 0 0 0 .6c0 3.1 3.6 5.6 8.1 5.6s8.1-2.5 8.1-5.6a4 4 0 0 0 0-.6 2.2 2.2 0 0 0 1.2-2.1zM7.5 13.3a1.6 1.6 0 1 1 1.6 1.6 1.6 1.6 0 0 1-1.6-1.6zm8.9 4.2a5.9 5.9 0 0 1-3.9 1.2 5.9 5.9 0 0 1-3.9-1.2.5.5 0 0 1 .7-.7 5 5 0 0 0 3.2.9 5 5 0 0 0 3.2-.9.5.5 0 0 1 .7.7zm-.5-2.6a1.6 1.6 0 1 1 1.6-1.6 1.6 1.6 0 0 1-1.6 1.6z" />
    </svg>
  ),
  linkedin: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
      <path d="M4.98 3.5A2.5 2.5 0 1 1 2.5 6 2.5 2.5 0 0 1 4.98 3.5zM3 8.98h4v12H3zm6.5 0h3.8v1.64h.05a4.2 4.2 0 0 1 3.78-2.08c4 0 4.77 2.63 4.77 6.05v6.4h-4v-5.68c0-1.35 0-3.1-1.9-3.1s-2.18 1.48-2.18 3v5.78h-4z" />
    </svg>
  ),
  instagram: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
      <circle cx="12" cy="12" r="3.8" />
      <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
    </svg>
  ),
  tiktok: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
      <path d="M16.5 2h-3v13.2a2.6 2.6 0 1 1-2.2-2.6V9.5a5.8 5.8 0 1 0 5.2 5.8V8.9a6.7 6.7 0 0 0 3.9 1.2V7.1a3.9 3.9 0 0 1-3.9-3.9z" />
    </svg>
  ),
  facebook: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
      <path d="M13.5 21v-8h2.7l.4-3.1h-3.1V7.9c0-.9.25-1.5 1.55-1.5h1.65V3.6a22 22 0 0 0-2.4-.12c-2.38 0-4 1.45-4 4.11V9.9H7.6V13h2.7v8z" />
    </svg>
  ),
  website: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.2 2.3 3.4 5.3 3.4 8.5S14.2 18.2 12 20.5c-2.2-2.3-3.4-5.3-3.4-8.5S9.8 5.8 12 3.5z" />
    </svg>
  ),
};

/** The "this leaves the site" mark. Trustmrr puts one on every outbound
 *  profile link, and it is worth copying: on a page whose whole job is to be
 *  credible, a visitor should know before they click whether they are staying
 *  with us or being handed to X. */
function ExternalIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor"
      strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 4.5h5.5V10M19 5l-8 8" />
      <path d="M18 14.5v4A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6h4" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="18" cy="5.5" r="2.6" />
      <circle cx="6" cy="12" r="2.6" />
      <circle cx="18" cy="18.5" r="2.6" />
      <path d="M8.3 10.8l7.4-4M8.3 13.2l7.4 4" />
    </svg>
  );
}

/** Copy-the-link, with the clipboard API's failure handled rather than
 *  assumed: it rejects on http origins and in some embedded webviews, and a
 *  Share button that silently does nothing is worse than one that offers the
 *  URL to copy by hand.
 *
 *  Exported since 0.9.21 so the per-BUSINESS page can share itself with the
 *  same control rather than growing a second copy that drifts. `fallbackPath`
 *  replaces the old `username` prop: this never resolves to a profile URL any
 *  more, it is simply what to offer when there is no `window` to read a real
 *  one from (the static prerender). */
export function ShareButton({ fallbackPath }: { fallbackPath: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const url = typeof window !== "undefined" ? window.location.href : fallbackPath;
  return (
    <button
      type="button"
      data-share=""
      onClick={() => {
        navigator.clipboard
          ?.writeText(url)
          .then(() => setState("copied"))
          .catch(() => setState("failed"));
        window.setTimeout(() => setState("idle"), 2_500);
      }}
      title={state === "failed" ? url : undefined}
    >
      <ShareIcon />
      <span>{state === "copied" ? "Link copied" : state === "failed" ? "Copy failed" : "Share"}</span>
    </button>
  );
}

/**
 * Platform mark — the real Amazon logo, served from our OWN origin.
 *
 * It was a hand-drawn SVG smile, on the reasoning that a hosted logo is a
 * third-party request on a page we prerender and share. The reasoning was
 * right and the conclusion was wrong: the fix is to host the file ourselves,
 * not to redraw the mark. The drawn version read as a smear at card size and
 * looked like a defect rather than a brand.
 *
 * `AMAZON_MARK_SRC` is a SAME-ORIGIN path, so there is still no third-party
 * request, nothing to block, and no mixed content. The host app ships the
 * file (verifiedmargins-frontend/public/amazon-mark.png); a brand that does
 * not want it can pass its own path.
 *
 * `aria-hidden` with no alt text: the business's name is right beside this
 * and already says "Amazon FBA". A screen reader announcing "Amazon" here
 * would read the platform twice.
 */
export const AMAZON_MARK_SRC = "/amazon-mark.png";

/**
 * The mark for a business card.
 *
 * 🚨 `platform` is `connection.provider` — HOW THE DATA ARRIVED, not what the
 * business sells on. A manually-entered Amazon FBA business carries
 * `provider: "manual"` with `label: "Amazon FBA"`, and matching on provider
 * alone drew it as an anonymous ■ while its own business page showed the
 * Amazon mark. Two surfaces disagreeing about the same business is worse than
 * either answer.
 *
 * So the LABEL decides when the provider cannot: the label is the platform
 * ("Amazon FBA"), which is the question being asked. Provider still wins when
 * it is conclusive, so a real SP-API connection is unaffected.
 */
function PlatformMark({ platform, label }: { platform: string; label?: string }) {
  const isAmazon =
    platform === "amazon_selling_partner" ||
    platform === "amazon_ads" ||
    /^amazon\b/i.test(label ?? "");
  if (isAmazon) {
    return (
      <span data-business-mark="" data-platform="amazon">
        <img src={AMAZON_MARK_SRC} alt="" aria-hidden="true" width={28} height={28} />
      </span>
    );
  }
  return (
    <span data-business-mark="" data-platform={platform} aria-hidden="true">
      {"\u25A0"}
    </span>
  );
}

const SELLER_TYPE_LABEL: Record<string, string> = {
  private_label: "Private label",
  wholesaler: "Wholesale",
  dropshipper: "Dropshipping",
};

/** One business card.
 *
 *  🚨 THE NAME IS `page.name` — "Amazon FBA 08873" — AND NOTHING ELSE.
 *
 *  It rendered a blurred "Stealth Brand" placeholder until 2026-08-30, from
 *  when a business had no page and no name of its own: the blur stood in for
 *  a brand the seller had not agreed to publish, and the layout was the one
 *  they would eventually get. That reasoning is spent. `page.name` is derived
 *  from the opaque slug, is public by construction, and is exactly what the
 *  destination page puts in its own <h1> — so blurring it taught a reader we
 *  were withholding something when we were not.
 *
 *  What has NOT changed is the thing the blur was protecting: the seller's
 *  real storefront name. `Connection.name` and `Connection.uniqueDisplayId`
 *  ("Paramint Designs (US | CA | MX)") have never been on this payload and
 *  must never be. The privacy test in the backend
 *  (public-profile-privacy.http.test.ts) is what keeps that true.
 *
 *  ─── The card is a LINK to that business's page (v0.9.15) ──────────────
 *
 *  `business.page` is `{ slug, name }` when the business has a public page,
 *  and null when it does not (an ads business, which has no address at all).
 *  A card with no page falls back to the platform label and is not a link —
 *  never a link to a guaranteed 404.
 *
 *  A plain <a>, not a router Link: this page has no react-router dependency
 *  and is rendered outside a Router by its tests, and a full navigation is
 *  what serves the per-business prerender with its own title and OG card. */
function BusinessCard({
  business,
  currency,
}: {
  business: PublicProfile["metrics"]["businesses"][number];
  currency: string;
}) {
  const sub = [business.label, business.seller_type ? SELLER_TYPE_LABEL[business.seller_type] : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <article data-business="">
      <PlatformMark platform={business.platform} label={business.label} />
      <div data-business-body="">
        <div data-business-head="">
          {/* THE NAME, PLAIN. It used to render a blurred "Stealth Brand"
              placeholder, from when a business had no page and no name of its
              own — the blur stood in for a brand the seller had not agreed to
              publish. That reasoning is spent: `page.name` is "Amazon FBA
              08873", derived from the opaque slug, and it is what the
              business's own page puts in its <h1>. Blurring a name that is
              public by construction taught a reader we were hiding something
              when we were not.
              🚨 Still never `Connection.name` or `uniqueDisplayId` — the real
              storefront name has never been on this payload and must not be. */}
          {business.page ? (
            <a data-business-link="" href={`/business/${business.page.slug}`}>
              <span data-business-name="">{business.page.name}</span>
            </a>
          ) : (
            <span data-business-name="">{business.label}</span>
          )}
          <VerificationBadge verification={business.verification} />
        </div>
        <p data-business-sub="">
          {sub}
          {business.markets.length > 0 ? (
            <span data-business-markets=""> · {business.markets.join(" · ")}</span>
          ) : null}
        </p>
        <dl data-business-stats="">
          <div>
            <dt>Revenue (30d)</dt>
            <dd data-metric="">{money(business.last_30d.revenue, currency)}</dd>
          </div>
          <div>
            <dt>Margin %</dt>
            <dd data-metric="">{pct(business.last_30d.margin_pct)}</dd>
          </div>
          <div>
            <dt>Profit (30d)</dt>
            <dd data-metric="">{money(business.last_30d.profit, currency)}</dd>
          </div>
        </dl>
      </div>
    </article>
  );
}

/** "Businesses by <name>" — the trustmrr founder-page shape: a titled
 *  section of cards, one per linked business. Per connection, so a synced
 *  Amazon account and a typed-in one carry their own badges side by side. */
function Businesses({
  rows,
  currency,
  ownerName,
}: {
  rows: PublicProfile["metrics"]["businesses"];
  currency: string;
  ownerName: string;
}) {
  if (!rows || rows.length === 0) return null;
  return (
    <section data-profile-businesses="">
      <h2>Businesses by {ownerName}</h2>
      {rows.map((b) => (
        <BusinessCard
          // The slug is the only genuinely unique key here: a seller with two
          // Amazon accounts in the same marketplaces collided on the old one.
          key={b.page?.slug ?? `${b.platform}-${b.markets.join(",")}`}
          business={b}
          currency={currency}
        />
      ))}
    </section>
  );
}


// ─── the metrics dashboard ───────────────────────────────────────────
//
// Tiles + one chart, the same shape as the DragonBot dashboard
// (DashboardMetrics.tsx) and built from the same two primitives, so there is
// no second charting implementation to keep in step.
//
// TWO THINGS THIS PAGE DOES DIFFERENTLY, both because it is PUBLIC:
//
//   1. It plots what the seller published and nothing else. A tile appears
//      only if its visibility toggle is on; `margin` and `sales` are separate
//      toggles, so a margin-only profile still gets a chart — from
//      `margin_series`, which carries ratios and no absolutes.
//   2. NO COMPARISON SERIES. The dashboard shows the previous period dashed
//      behind the current one; here that would publish a second window the
//      seller never chose to publish. One window, the one they picked.
//
// Colour: the chart inherits the app's `--chart-accent`, which the brand
// deliberately points at ink rather than the verified green. Green on this
// product is a claim about provenance, not decoration — a revenue line is not
// a verification, and spending the badge colour on it would blunt the badge
// (verifiedmargins-frontend/BRANDING.md §3.1).

/** The three series a tile can select. SKUs is a tile but not a plot —
 *  the payload carries a single count, not a series. */
type PlotKey = "revenue" | "profit" | "margin";

function ProfileDashboard({
  metrics,
  windowMonths,
  windowLabel,
  picker,
}: {
  metrics: PublicProfile["metrics"];
  windowMonths: number;
  /** The reader's chosen window, spelled out. The heading, the tiles and the
   *  chart all describe THIS span — they used to say "Last 30 days" while the
   *  chart said twelve months. */
  windowLabel?: string;
  picker?: React.ReactNode;
}) {
  const daily = metrics.daily;
  const series = metrics.series;
  const marginSeries = metrics.margin_series;
  const currency = metrics.display?.currency ?? "USD";

  /* The chart plots DAYS, converted, to agree with the "Last 30 days" heading
     and the tiles under it. Falls back to the monthly series for a backend
     that has no `daily` yet — with the caveat that the fallback carries the
     unconverted per-currency rows this replaced. */
  const useDaily = Boolean(daily && daily.length > 0);
  const plotted: Array<{ date: string; revenue: number; units: number; profit: number | null }> =
    useDaily
      ? daily!.map((d) => ({ date: d.date, revenue: d.revenue, units: d.units, profit: d.profit }))
      : (series ?? []).map((p) => ({
          date: `${p.month}-01`,
          revenue: p.revenue,
          units: p.units,
          profit: p.profit,
        }));
  const hasSales = useDaily ? true : Boolean(series);

  // What the seller actually published decides what can be plotted.
  const plots: Array<{ key: PlotKey; label: string; format: (v: number | null) => string }> = [];
  /* PROFIT, REVENUE, MARGIN — and SKUs beside them, which is not one of
     these because it has no series (see the tile block below).
     Profit leads: it is what the site ranks on and what the business page
     leads with, and a reader moving between the two must not have to re-learn
     which figure the page is about. `Units` was dropped in the same pass —
     four tiles is the whole set, and unit count was the least load-bearing
     of the five. */
  const hasProfit = plotted.some((p) => p.profit !== null);
  if (hasSales && hasProfit) {
    plots.push({ key: "profit", label: "Profit", format: (v) => money(v, currency) });
  }
  if (hasSales) {
    plots.push({ key: "revenue", label: "Revenue", format: (v) => money(v, currency) });
  }
  if (marginSeries) {
    plots.push({ key: "margin", label: "Margin", format: pct });
  }
  /* Opens on the leading tile that is ACTUALLY plottable. Reaching for
     "profit" unconditionally left `plot` pointing at a tile that was not
     rendered on a profile with no costs, so nothing looked selected. */
  const [plot, setPlot] = useState<PlotKey | null>(null);
  const active = plots.find((p) => p.key === plot) ?? plots[0];
  if (!active) return null;

  /* Margin comes off the same rows as everything else when they are daily —
     a ratio needs no conversion, and deriving it here keeps all four plots on
     one x-axis. Only the monthly fallback reaches for margin_series. */
  const marginPoints = useDaily
    ? plotted.map((p) => ({
        date: p.date,
        value: p.profit !== null && p.revenue ? (p.profit / p.revenue) * 100 : null,
      }))
    : (marginSeries ?? []).map((p) => ({ date: `${p.month}-01`, value: p.margin_pct }));

  /* Only the two money series. `margin` never reaches here — both call sites
     branch on it first, because a ratio comes off `marginPoints` rather than
     off a row. Written as an exhaustive pair rather than an `else` so a new
     PlotKey fails to compile instead of silently plotting revenue. */
  const valueOf = (p: (typeof plotted)[number], key: "revenue" | "profit") =>
    key === "revenue" ? p.revenue : p.profit;

  /* Hoisted to a const so the narrowing below survives into the closure —
     TypeScript will not carry `active.key !== "margin"` through a property
     access into a callback, which is the compile error this exists to fix. */
  const activeKey = active.key;
  const points =
    activeKey === "margin"
      ? marginPoints
      : plotted.map((p) => ({ date: p.date, value: valueOf(p, activeKey) }));

  const spark = (key: PlotKey): Array<number | null> | undefined => {
    if (key === "margin") return marginPoints.map((p) => p.value);
    if (!hasSales) return undefined;
    return plotted.map((p) => valueOf(p, key));
  };

  return (
    <section data-profile-dashboard="">
      {/* 🚨 THE HEADING, THE TILES AND THE CHART MUST AGREE. All three are now
          the trailing 30 days. The chart used to be twelve months of
          unconverted per-currency rows under a "Last 30 days" heading —
          two separate ways of lying about its own axis, and it was labelled
          rather than fixed. Publishing day-level revenue is a deliberate
          trade (see dailySeries in the backend's public-profile.ts): days
          expose launch timing, promo cadence and stockouts. */}
      <h2>{windowLabel ?? "Last 30 days"}</h2>
      {picker}

      {/* FOUR TILES, ALWAYS THE SAME FOUR — the set the business page shows,
          so a reader moving between the two pages does not have to re-learn
          what a tile means.
          🚨 A tile is rendered whether or not its figure exists; a missing one
          shows "—". Dropping the Profit tile on a profile with no costs (which
          is what happened before) made the row silently change shape from
          profile to profile, and left Margin rendering a dash beside a Profit
          that had vanished — two different answers to the same question.
          A tile is CLICKABLE only when it has a series behind it. SKUs never
          does (the payload carries one count, not a series), and neither does
          a figure the seller did not publish. A control that changed no chart
          would be a control lying about being one. */}
      <div data-tiles="">
        {(
          [
            { key: "profit", label: "Profit", value: money(metrics.last_30d?.profit ?? null, currency) },
            { key: "revenue", label: "Revenue", value: money(metrics.last_30d?.revenue ?? null, currency) },
            { key: "margin", label: "Margin", value: pct(metrics.last_30d?.margin_pct ?? null) },
            /* PPC — advertising spend, in money, beside the margin it eats
               into. 🚨 THE ONE TILE THAT DISAPPEARS rather than showing a
               dash: `ad_spend` is null for "not reported", so a "—" would
               imply we looked and found nothing while "$0" would assert that
               a seller who advertises does not. Dropped from the row instead,
               by the filter below. */
            {
              key: "ppc",
              label: "PPC",
              value: money(metrics.last_30d?.ad_spend ?? null, currency),
              hideWhenEmpty: metrics.last_30d?.ad_spend == null,
            },
            {
              key: "skus",
              label: "SKUs",
              value:
                metrics.sku_count === null || metrics.sku_count === undefined
                  ? "—"
                  : metrics.sku_count.toLocaleString(),
            },
          ] as const
        )
          .filter((t) => !("hideWhenEmpty" in t && t.hideWhenEmpty))
          .map((t) => {
            const plottable = plots.find((p) => p.key === t.key);
          return (
            <StatTile
              key={t.key}
              label={t.label}
              value={t.value}
              /* No delta chip: a period-over-period change needs a previous
                 period, and publishing one the seller did not choose to
                 publish is the same mistake as a comparison line. */
              delta={null}
              spark={plottable ? spark(plottable.key) : undefined}
              selected={plottable ? plottable.key === active.key : false}
              onClick={plottable ? () => setPlot(plottable.key) : undefined}
            />
          );
        })}
      </div>

      <p data-chart-label="">
        <small>
          {active.label}{" "}
          {useDaily
            ? `by day, ${(windowLabel ?? "last 30 days").toLowerCase()}`
            : `by month, last ${windowMonths} months`}
        </small>
      </p>
      <div data-chart="">
        <TrendChart
          points={points}
          format={active.format}
          label={active.label}
          formatDate={(iso) =>
            new Date(iso).toLocaleDateString(
              undefined,
              useDaily
                ? { month: "short", day: "numeric", timeZone: "UTC" }
                : { month: "short", year: "2-digit", timeZone: "UTC" },
            )
          }
        />
      </div>
    </section>
  );
}

// ─── the in-place edit form ──────────────────────────────────────────

/** Exactly the fields the public page SHOWS and an owner may change.
 *
 *  Not here on purpose: the username (renaming is capped and tombstoned —
 *  `PUT /v1/profiles/:id/username`), the picture (this page renders none),
 *  connections, and publishing. Those stay in ProfileSettingsPage, which
 *  the owner bar links to. An edit surface that silently owns half a rename
 *  is worse than one that owns none of it. */
export interface ProfileEditForm {
  displayName: string;
  bio: string;
  sellerType: SellerType | "";
  websiteUrl: string;
  socials: Socials;
  visibility: Visibility;
}

/** Seeded from the payload, losslessly: the builder passes all six of these
 *  through unfiltered (the backend's public-profile.ts), so the form starts
 *  as the truth rather than as an approximation of it. */
export function editFormFrom(profile: PublicProfile): ProfileEditForm {
  return {
    displayName: profile.display_name ?? "",
    bio: profile.bio ?? "",
    sellerType: (profile.seller_type ?? "") as SellerType | "",
    websiteUrl: profile.website_url ?? "",
    socials: { ...profile.socials } as Socials,
    visibility: { ...profile.visibility },
  };
}

// ─── the rendered page ───────────────────────────────────────────────

export interface PublicProfileBodyProps {
  profile: PublicProfile;
  /** Rendered in the dashboard header. Session-dependent, so the container
   *  builds it and this component only places it. */
  picker?: React.ReactNode;
  actions?: ReactNode;
  /** See PublicProfilePageProps.breadcrumb — placed by the header, supplied
   *  by the host. */
  breadcrumb?: ReactNode;
  owner?: ProfileOwnerProps | null;
  /** Non-null ⇒ edit mode. The container owns the state; this component
   *  owns none, which is what lets a test render it to a string. */
  form?: ProfileEditForm | null;
  onForm?: (next: ProfileEditForm) => void;
  onEdit?: () => void;
  onCancel?: () => void;
  onSave?: () => void;
  saving?: boolean;
  /** A save confirmation, or the server's own error text, shown in the bar
   *  beside the button that caused it. */
  status?: string | null;
  /* The window/currency SELECTORS are gone (the "Show" block came off the
     page), so the body no longer takes them. The page still fetches with a
     window and a currency — those live in PublicProfilePage's own state. */
}

/**
 * The page itself, given everything — no state, no fetching.
 *
 * Exported for the test that pins the owner/non-owner split: it can render
 * this to a string, where it could never render the container, whose payload
 * only ever arrives in an effect. Deliberately NOT re-exported from index.ts
 * — this is a seam, not API.
 */
export function PublicProfileBody({
  profile,
  picker,
  actions,
  breadcrumb,
  owner,
  form,
  onForm,
  onEdit,
  onCancel,
  onSave,
  saving,
  status,
}: PublicProfileBodyProps) {
  const m = profile.metrics;
  /* What this person actually has, counted PER TIER rather than lumped into
     one "verified" total.
     🚨 "3 businesses with verified revenue" was wrong the moment a profile
     could hold both tiers: it counted every verified business and then named
     ONE of the two things they could be verified for, so a portfolio of two
     per-SKU businesses and one modelled one read as three modelled ones. The
     header now states each tier with its own badge, which is also what makes
     the count checkable against the cards below it.
     Weakest first, matching the ladder on /how-verification-works and the
     order the leaderboard ranks tiers in. */
  const tierCounts = ([
    { tier: "verified_revenue", label: "Verified revenue" },
    { tier: "verified_margin", label: "Verified margins" },
  ] as const)
    .map((t) => ({
      ...t,
      count: (m.businesses ?? []).filter((b) => b.verification.tier === t.tier).length,
    }))
    .filter((t) => t.count > 0);
  const editing = form != null;
  const patch = <K extends keyof ProfileEditForm>(key: K, value: ProfileEditForm[K]) => {
    if (form && onForm) onForm({ ...form, [key]: value });
  };

  return (
    <>
      {/* 🚨 OUTSIDE <main>, always. This block is the ONLY difference between
          what an owner sees in view mode and what the world sees, and keeping
          it a sibling is what makes that statement checkable with a string
          comparison instead of a promise. Do not move it inside. */}
      {owner ? (
        <div data-owner-bar="">
          <p>
            {owner.published
              ? "This is your public page — everyone sees exactly this."
              : "Only you can see this. Your profile is not published yet."}
          </p>
          {editing ? (
            <p>
              <button type="button" onClick={onSave} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </button>{" "}
              <button type="button" onClick={onCancel} disabled={saving}>
                Cancel
              </button>{" "}
              {status ? <span role="status">{status}</span> : null}
            </p>
          ) : (
            <p>
              <button type="button" onClick={onEdit}>
                Edit profile
              </button>{" "}
              {status ? <span role="status">{status}</span> : null} {owner.actions}
            </p>
          )}
        </div>
      ) : null}

      <main data-noindex={profile.noindex ? "true" : undefined}>
        {/* The heading tracks the field as you type — that is what makes this
            feel like editing the page rather than filling in a form about it. */}
        {/* Avatar + name + handle as one block. The avatar is a MONOGRAM when
            there is no picture, never a silhouette: most profiles here are
            anonymous, and a wall of grey person-icons reads as an abandoned
            product rather than a deliberate one (BRANDING.md §6). */}
        <header data-profile-head="">
          {/* Left column: the breadcrumb, then who this is. Splitting the
              header this way is what lets the actions column top-align with
              the breadcrumb rather than with the avatar — the first action
              lands on the crumb line, and the name sits directly under it. */}
          <span data-profile-main="">
            {breadcrumb ? <span data-profile-crumbs="">{breadcrumb}</span> : null}
            <span data-profile-who="">
          <span data-avatar="" aria-hidden="true">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="" />
            ) : (
              initials(profile.display_name ?? profile.username)
            )}
          </span>
          <span data-profile-identity="">
            <h1>
              {editing
                ? form.displayName || profile.username
                : profile.display_name ?? profile.username}
              {/* Handle sits BESIDE the name, not under it: it is the thing
                  people paste into a URL, and stacking it reads as a subtitle
                  rather than as an address. */}
              <span data-handle="">@{profile.username}</span>
            </h1>
            {/* One line per tier, each carrying the real badge rather than a
                word describing it: "3 businesses" says nothing a reader can
                trust, and WHICH verification they have is the entire product.
                The badge here is the same component the cards below use, so a
                reader meets one visual vocabulary on the page and the header
                cannot drift from what the cards say. */}
            {tierCounts.length > 0 ? (
              <p data-verified-count="">
                {tierCounts.map((t, i) => (
                  <Fragment key={t.tier}>
                    {i > 0 ? <span data-verified-sep="" aria-hidden="true">·</span> : null}
                    <span data-verified-group="">
                      {t.count} {t.count === 1 ? "business" : "businesses"} with{" "}
                      <VerificationBadge verification={{ tier: t.tier, label: t.label }} />
                    </span>
                  </Fragment>
                ))}
              </p>
            ) : null}
          </span>
            </span>
          </span>

          {/* A STACK, not a row of icons. "Visit 𝕏 profile" tells a reader
              where a click goes; a bare glyph makes them hover to find out,
              and this is the part of the page where someone decides whether
              to trust the person. Each outbound link carries the
              leaves-the-site mark for the same reason. */}
          <span data-profile-actions-row="">
            <ShareButton fallbackPath={`/${profile.username}`} />
            {profile.website_url ? (
              <a href={profile.website_url} rel="nofollow noopener" data-social-link="">
                <span data-social-label="">Visit {SOCIAL_ICON.website} website</span>
                <ExternalIcon />
              </a>
            ) : null}
            {Object.entries(profile.socials).map(([key, value]) => (
              <a
                key={key}
                href={socialUrl(key, value)}
                target="_blank"
                rel="noopener noreferrer nofollow"
                data-social-link=""
              >
                <span data-social-label="">
                  Visit {SOCIAL_ICON[key] ?? <b>{SOCIAL_LABEL[key] ?? key}</b>} profile
                </span>
                <ExternalIcon />
              </a>
            ))}
          </span>
        </header>
        {actions ? <p data-profile-actions>{actions}</p> : null}

        {editing ? (
          <div data-profile-edit="">
            <p>
              <label htmlFor="vm-display-name">Display name</label>
              <br />
              <input
                id="vm-display-name"
                value={form.displayName}
                onChange={(e) => patch("displayName", e.target.value)}
              />
            </p>
            <p>
              <label htmlFor="vm-bio">Bio</label>
              <br />
              <textarea
                id="vm-bio"
                rows={4}
                maxLength={500}
                value={form.bio}
                onChange={(e) => patch("bio", e.target.value)}
              />
              <br />
              <small>{form.bio.length}/500</small>
            </p>
            <p>
              <label htmlFor="vm-seller-type">What kind of seller are you?</label>
              <br />
              <select
                id="vm-seller-type"
                value={form.sellerType}
                onChange={(e) => patch("sellerType", e.target.value as SellerType | "")}
              >
                <option value="">Not saying</option>
                {SELLER_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </p>
          </div>
        ) : (
          /* Bio only. The seller-type tag ("private label") was here and is
             deliberately gone: it is a self-declared label sitting inches
             from figures we verified, and it needs a home that does not
             borrow their credibility. Same for the verification explainer
             that used to follow — per-business badges replaced the
             profile-wide one, so the paragraph explaining a single tier had
             nothing left to explain. */
          <>{profile.bio ? <p>{profile.bio}</p> : null}</>
        )}

        {/* 🚨 THERE IS NO STANDALONE MARGIN SECTION, deliberately (removed
            2026-08-30). It rendered a 12-MONTH margin as the page's headline
            while the tiles immediately below it showed a 30-day one — two
            different margins, one of them large and unlabelled, on a page
            whose product is that its numbers are not misread. The tile is the
            margin now, on the same window as everything beside it, and the
            cost basis it was explaining is what the verification badge in the
            header already says. */}
        {/* The "margin is hidden because your costs don't cover the window"
            note is for the OWNER, not for visitors: a visitor cannot act on
            it and it reads as an apology on someone else's page, while the
            owner needs to know why their headline number is missing. Absence
            of a figure is not a claim, so nothing dishonest is lost by
            hiding it from the public view. */}
        {owner && m.margin_note ? <p data-owner-note="">{m.margin_note}</p> : null}

        {/* `daily` counts too. This guard predated it and listed only the
            MONTHLY series, so a day-grained window — which nulls both of
            those by design — took the entire dashboard with it: no tiles, no
            chart, no picker to get back out with. */}
        {m.series || m.margin_series || m.daily ? (
          <ProfileDashboard
            metrics={m}
            windowMonths={profile.window.months}
            windowLabel={
              WINDOW_OPTIONS.find((o) => o.value === profile.window.key)?.label ?? "Last 30 days"
            }
            picker={picker}
          />
        ) : null}

        {/* What they run, under the numbers: the figures above are the claim,
            and these cards are what the claim is made of. */}
        <Businesses
          rows={m.businesses}
          currency={m.display?.currency ?? "USD"}
          ownerName={profile.display_name ?? `@${profile.username}`}
        />


        {/* Only in edit mode, and deliberately HERE rather than on a settings
            page: these toggles decide what the sections above show, and after
            Save the page refetches through `preview` — the same builder the
            public endpoint runs — so turning one on makes the number appear
            exactly where it will appear for everyone else. That is the whole
            argument for editing in place. */}
        {editing ? (
          <section data-profile-visibility="">
            <h2>What the public sees</h2>
            <p>
              Everything here is off until you turn it on. Your name, bio and links are
              always public once you publish; these are the numbers.
            </p>
            {VISIBILITY_FIELDS.map((field) => (
              <p key={field.key}>
                <label>
                  <input
                    type="checkbox"
                    checked={form.visibility[field.key] === true}
                    onChange={(e) =>
                      patch("visibility", { ...form.visibility, [field.key]: e.target.checked })
                    }
                  />{" "}
                  {field.label}
                </label>
              </p>
            ))}
            <p>
              <small>
                Margin can be shown while revenue stays hidden — that is the whole point of
                the site.
              </small>
            </p>
          </section>
        ) : null}

        {editing ? (
          <section data-profile-links="">
            <h2>Links</h2>
            <p>
              <label htmlFor="vm-website">Website</label>
              <br />
              <input
                id="vm-website"
                type="url"
                placeholder="https://…"
                value={form.websiteUrl}
                onChange={(e) => patch("websiteUrl", e.target.value)}
              />
            </p>
            {SOCIAL_FIELDS.map((s) => (
              <p key={s.key}>
                <label htmlFor={`vm-social-${s.key}`}>{s.label}</label>
                <br />
                <input
                  id={`vm-social-${s.key}`}
                  value={form.socials[s.key] ?? ""}
                  onChange={(e) => patch("socials", { ...form.socials, [s.key]: e.target.value })}
                />
              </p>
            ))}
          </section>
        ) : null}

        {m.display ? (
          <p data-fx-note="">
            <small>
              Converted at rates from {m.display.fx.source}, as of {m.display.fx.as_of}.
              {m.display.fx.unconvertible.length > 0
                ? ` No rate for ${m.display.fx.unconvertible.join(", ")} — those markets are shown in their own currency.`
                : ""}
            </small>
          </p>
        ) : null}
      </main>
    </>
  );
}

// ─── the page apps mount ─────────────────────────────────────────────

/**
 * The window selector.
 *
 * 🚨 WHICH OPTIONS ARE LOCKED IS SESSION KNOWLEDGE, and this file is
 * deliberately session-free — it renders public data for anyone, crawlers
 * included. So the host passes the ANSWER (`unlocked`) rather than the
 * question, exactly as it does for `owner`. A page that decided this itself
 * would need two rendering modes to keep honest.
 *
 * Locked options are rendered, not hidden. Hiding them would make the gate
 * invisible and the offer unmakeable — the whole point is that a reader can
 * see what connecting their own business would unlock.
 */
function WindowPicker({
  value,
  options,
  unlocked,
  onPick,
  onLockedPick,
}: {
  value: WindowKey;
  options: ReadonlyArray<{ value: WindowKey; label: string }>;
  unlocked: readonly WindowKey[];
  onPick: (k: WindowKey) => void;
  onLockedPick?: (k: WindowKey) => void;
}) {
  return (
    <span data-window-picker="">
      <label>
        <span className="vm-visually-hidden">Window</span>
        <select
          value={value}
          data-window-select=""
          onChange={(e) => {
            const next = e.target.value as WindowKey;
            if (unlocked.includes(next)) onPick(next);
            /* A locked pick must not change the board underneath the dialog —
               the reader has not earned that view, and leaving it selected
               would show them the answer while asking them to pay for it. */
            else onLockedPick?.(next);
          }}
        >
          {options.map((o) => {
            const locked = !unlocked.includes(o.value);
            return (
              <option key={o.value} value={o.value}>
                {locked ? `🔒 ${o.label}` : o.label}
              </option>
            );
          })}
        </select>
      </label>
    </span>
  );
}

export function PublicProfilePage({
  username,
  actions,
  owner,
  onMoved,
  defaultMonths = 12,
  unlockedWindows,
  onLockedWindow,
  defaultCurrency = "USD",
  onLoaded,
  breadcrumb,
}: PublicProfilePageProps) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  /* CONTROLLED by the host, not seeded from it.
   *
   * These were `useState(defaultCurrency)`, which reads the prop once and
   * then ignores it forever. That was invisible while the on-page selectors
   * were the only thing that could change a currency — and silently wrong
   * the moment a host put a picker in its own chrome, as VerifiedMargins now
   * does in the top bar: the select would move, and the page would go on
   * showing dollars. Held as plain props, a change flows into `load`'s deps
   * and refetches, which is the only way the figures can actually convert. */
  /* `defaultMonths` is now only the fallback label for a payload without a
     window key — the fetch is driven by the selector below. */
  void defaultMonths;
  /* 30 days by default: what a seller is doing NOW, with a year as the
     context you opt into. The backend defaults the same way. */
  const [windowKey, setWindowKey] = useState<WindowKey>("30d");
  const openWindows = unlockedWindows ?? WINDOW_OPTIONS.map((o) => o.value);
  const currency = defaultCurrency;
  const [form, setForm] = useState<ProfileEditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  /* 🚨 A primitive, not the `owner` object. A host that builds `owner` inline
   * (every host will) hands us a new object identity on every render, so
   * making `load` depend on it would refetch forever. */
  const ownerProfileId = owner?.profileId ?? null;

  /* Same hazard as `owner` above, one level down: hosts pass `onLoaded` as an
   * inline arrow, so depending on it directly would rebuild `load` every
   * render and refetch forever. The ref keeps the callback current without
   * putting its identity in the dependency list. */
  const onLoadedRef = useRef(onLoaded);
  useEffect(() => {
    onLoadedRef.current = onLoaded;
  }, [onLoaded]);

  const load = useCallback(async () => {
    try {
      // The owner reads their own profile through `preview`: the same builder
      // as the public endpoint, and it renders an unpublished profile — which
      // is the only reason an owner can look at their own draft page at all.
      const next = ownerProfileId
        ? await fetchProfilePreview(ownerProfileId, { window: windowKey, currency })
        : await fetchPublicProfile(username, { window: windowKey, currency });
      setProfile(next);
      setError(null);
      onLoadedRef.current?.(next);
      return next;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        const body = err.body as { moved_to?: string } | null;
        if (body?.moved_to && onMoved) {
          onMoved(body.moved_to);
          return null;
        }
        setError("No profile here.");
        return null;
      }
      setError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, [username, ownerProfileId, windowKey, currency, onMoved]);

  useEffect(() => {
    void load();
  }, [load]);

  /* Stop editing if the viewer stops being the owner — signed out in another
   * tab, say. Leaving a form on screen with nowhere to save to is exactly the
   * kind of thing that looks like it worked. */
  useEffect(() => {
    if (!ownerProfileId) setForm(null);
  }, [ownerProfileId]);

  if (error) return <p role="alert">{error}</p>;
  if (!profile) return <p>Loading…</p>;

  const save = async () => {
    if (!form || !ownerProfileId) return;
    setSaving(true);
    setStatus(null);
    try {
      await updateProfile(ownerProfileId, {
        display_name: form.displayName.trim() || null,
        bio: form.bio.trim() || null,
        website_url: form.websiteUrl.trim() || null,
        seller_type: form.sellerType || null,
        // Both maps REPLACE wholesale server-side, so send the complete one.
        // The form was seeded from the payload, which carries it complete.
        socials: form.socials,
        visibility: form.visibility,
      });
      const fresh = await load();
      setForm(null);
      setStatus(fresh ? "Saved." : "Saved, but the page could not be reloaded.");
    } catch (err) {
      // The server's own words: it is the only thing that knows why a URL was
      // refused or a bio was too long.
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <PublicProfileBody
      picker={
        <WindowPicker
          value={windowKey}
          options={WINDOW_OPTIONS}
          unlocked={openWindows}
          onPick={setWindowKey}
          onLockedPick={onLockedWindow}
        />
      }
      profile={profile}
      actions={actions}
      breadcrumb={breadcrumb}
      owner={owner}
      form={form}
      onForm={setForm}
      onEdit={() => {
        setStatus(null);
        setForm(editFormFrom(profile));
      }}
      onCancel={() => {
        setStatus(null);
        setForm(null);
      }}
      onSave={() => void save()}
      saving={saving}
      status={status}
    />
  );
}
