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

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ApiError } from "../api";
import { StatTile } from "../components/ui/StatTile";
import { TrendChart } from "../components/ui/TrendChart";
import {
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
  defaultCurrency?: string;
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

/** The businesses strip: one row per linked platform, its size, and its own
 *  badge. Per connection rather than per profile — a synced Amazon account
 *  and a typed-in legacy business have different claims behind them, and one
 *  badge over both either flatters the weaker or maligns the stronger. */
function Businesses({
  rows,
  currency,
}: {
  rows: PublicProfile["metrics"]["businesses"];
  currency: string;
}) {
  if (!rows || rows.length === 0) return null;
  return (
    <section data-profile-businesses="">
      {rows.map((b) => (
        <div key={b.platform} data-business="">
          <span data-business-name="">{b.label}</span>
          {b.verification.tier.startsWith("verified") ? (
            <span data-badge="" data-state="verified">
              {"\u2713"} {b.verification.label}
            </span>
          ) : (
            <span data-badge="" data-state="estimated">
              {"\u25CB"} {b.verification.label}
            </span>
          )}
          <span data-business-figures="">
            {b.revenue !== null ? <b data-metric="">{money(b.revenue, currency)}</b> : null}
            {b.margin_pct !== null ? (
              <b data-metric="">{pct(b.margin_pct)} margin</b>
            ) : null}
          </span>
        </div>
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

type PlotKey = "revenue" | "profit" | "units" | "margin";

function ProfileDashboard({
  metrics,
  windowMonths,
}: {
  metrics: PublicProfile["metrics"];
  windowMonths: number;
}) {
  const series = metrics.series;
  const marginSeries = metrics.margin_series;
  const currency = metrics.display?.currency ?? "USD";

  // What the seller actually published decides what can be plotted.
  const plots: Array<{ key: PlotKey; label: string; format: (v: number | null) => string }> = [];
  if (series) {
    plots.push({ key: "revenue", label: "Revenue", format: (v) => money(v, currency) });
    if (series.some((p) => p.profit !== null)) {
      plots.push({ key: "profit", label: "Profit", format: (v) => money(v, currency) });
    }
    plots.push({ key: "units", label: "Units", format: (v) => (v === null ? "—" : Math.round(v).toLocaleString()) });
  }
  if (marginSeries) {
    plots.push({ key: "margin", label: "Margin", format: pct });
  }
  const [plot, setPlot] = useState<PlotKey>(() => (marginSeries ? "margin" : "revenue"));
  const active = plots.find((p) => p.key === plot) ?? plots[0];
  if (!active) return null;

  const points =
    active.key === "margin"
      ? (marginSeries ?? []).map((p) => ({ date: `${p.month}-01`, value: p.margin_pct }))
      : (series ?? []).map((p) => ({
          date: `${p.month}-01`,
          value:
            active.key === "revenue" ? p.revenue : active.key === "profit" ? p.profit : p.units,
        }));

  const spark = (key: PlotKey): Array<number | null> | undefined => {
    if (key === "margin") return marginSeries?.map((p) => p.margin_pct);
    if (!series) return undefined;
    return series.map((p) => (key === "revenue" ? p.revenue : key === "profit" ? p.profit : p.units));
  };

  return (
    <section data-profile-dashboard="">
      <h2>Last {windowMonths} months</h2>

      <div data-tiles="">
        {plots.map((p) => (
          <StatTile
            key={p.key}
            label={p.label}
            value={
              p.key === "margin"
                ? pct(metrics.margin_pct)
                : p.key === "revenue"
                  ? money(metrics.display?.revenue ?? null, currency)
                  : p.key === "profit"
                    ? money(metrics.display?.profit ?? null, currency)
                    : (series ?? []).reduce((n, x) => n + x.units, 0).toLocaleString()
            }
            /* No delta chip: a period-over-period change needs a previous
               period, and publishing one the seller did not choose to publish
               is the same mistake as a comparison line. */
            delta={null}
            spark={spark(p.key)}
            selected={p.key === plot}
            onClick={() => setPlot(p.key)}
          />
        ))}
      </div>

      <div data-chart="">
        <TrendChart
          points={points}
          format={active.format}
          label={active.label}
          formatDate={(iso) =>
            new Date(iso).toLocaleDateString(undefined, {
              month: "short",
              year: "2-digit",
              timeZone: "UTC",
            })
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
  actions?: ReactNode;
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
  months: number;
  currency: string;
  onMonths?: (months: number) => void;
  onCurrency?: (currency: string) => void;
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
  actions,
  owner,
  form,
  onForm,
  onEdit,
  onCancel,
  onSave,
  saving,
  status,
  months,
  currency,
  onMonths,
  onCurrency,
}: PublicProfileBodyProps) {
  const m = profile.metrics;
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
          <span data-avatar="" aria-hidden="true">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="" />
            ) : (
              initials(profile.display_name ?? profile.username)
            )}
          </span>
          <span>
            <h1>
              {editing
                ? form.displayName || profile.username
                : profile.display_name ?? profile.username}
            </h1>
            <p data-handle="">@{profile.username}</p>
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

        {/* Social-media order: who → what they run → where to find them.
            The businesses strip is the "what", and it is the reason someone
            is on this page. */}
        <Businesses rows={m.businesses} currency={m.display?.currency ?? "USD"} />

        {profile.website_url || Object.keys(profile.socials).length > 0 ? (
          <section data-profile-socials="">
            {profile.website_url ? (
              <a href={profile.website_url} rel="nofollow noopener" data-social-link="">
                Website
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
                {SOCIAL_LABEL[key] ?? key}
              </a>
            ))}
          </section>
        ) : null}

        {/* The headline figure stays ABOVE the dashboard: it is the number
            the product is named for, and a visitor who reads nothing else
            should still leave with it. */}
        {m.margin_pct !== null ? (
          <section>
            <h2>Margin</h2>
            <p data-metric="headline">{pct(m.margin_pct)}</p>
            <p>
              <small>
                {m.margin_basis === "per_sku"
                  ? "Computed from per-SKU costs."
                  : m.margin_basis === "blended_pct"
                    ? "Modelled from a blended cost percentage the seller supplied."
                    : "Mixed cost basis."}
              </small>
            </p>
          </section>
        ) : null}
        {m.margin_note ? <p>{m.margin_note}</p> : null}

        {m.series || m.margin_series ? (
          <ProfileDashboard metrics={m} windowMonths={profile.window.months} />
        ) : null}

        {m.display ? (
          <section>
            {/* The tiles carry the headline figures; this is the breakdown
                underneath them — fees and COGS are the numbers a seller is
                actually asked to prove, and they do not fit in a tile. */}
            <h2>Breakdown</h2>
            <dl>
              <dt>Revenue</dt>
              <dd>{money(m.display.revenue, m.display.currency)}</dd>
              <dt>Cost of goods</dt>
              <dd>{money(m.display.cogs, m.display.currency)}</dd>
              <dt>Amazon fees</dt>
              <dd>{money(m.display.fees, m.display.currency)}</dd>
              <dt>Ad spend</dt>
              <dd>{money(m.display.ad_spend, m.display.currency)}</dd>
              <dt>Profit</dt>
              <dd>{money(m.display.profit, m.display.currency)}</dd>
            </dl>

            {m.native && m.native.length > 1 ? (
              <>
                <h3>By market</h3>
                <ul>
                  {m.native.map((t) => (
                    <li key={t.currency}>
                      {t.currency}: {money(t.revenue, t.currency)} revenue, {t.units} units
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            <p>
              <small>
                {profile.window.from} to {profile.window.through}
                {profile.window.includes_partial_month ? " (this month is still in progress)" : ""}
              </small>
            </p>
          </section>
        ) : null}

        {m.sku_count !== null || m.brand_count !== null || m.category !== null ? (
          <section>
            <h2>Catalogue</h2>
            <ul>
              {m.sku_count !== null ? (
                <li>
                  <b data-metric="count">{m.sku_count}</b> SKUs
                </li>
              ) : null}
              {m.brand_count !== null ? (
                <li>
                  <b data-metric="count">{m.brand_count}</b> {m.brands_label.toLowerCase()}
                </li>
              ) : null}
              {m.category !== null ? <li>{m.category}</li> : null}
            </ul>
          </section>
        ) : null}

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

        {profile.notes.length > 0 ? (
          <section>
            <h2>Notes</h2>
            <ul>
              {profile.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Window + currency controls live at the bottom, per the plan: the
            numbers come first, the knobs after. */}
        <section>
          <h2>Show</h2>
          <p>
            <label htmlFor="window">Window</label>{" "}
            <select id="window" value={months} onChange={(e) => onMonths?.(Number(e.target.value))}>
              {[3, 6, 12, 24, 36].map((n) => (
                <option key={n} value={n}>
                  Last {n} months
                </option>
              ))}
            </select>
          </p>
          {profile.currency_options.length > 0 ? (
            <p>
              <label htmlFor="currency">Currency</label>{" "}
              <select id="currency" value={currency} onChange={(e) => onCurrency?.(e.target.value)}>
                {profile.currency_options.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </p>
          ) : null}
          {m.display ? (
            <p>
              <small>
                Converted at rates from {m.display.fx.source}, as of {m.display.fx.as_of}.
                {m.display.fx.unconvertible.length > 0
                  ? ` No rate for ${m.display.fx.unconvertible.join(", ")} — those markets are shown in their own currency.`
                  : ""}
              </small>
            </p>
          ) : null}
        </section>
      </main>
    </>
  );
}

// ─── the page apps mount ─────────────────────────────────────────────

export function PublicProfilePage({
  username,
  actions,
  owner,
  onMoved,
  defaultMonths = 12,
  defaultCurrency = "USD",
}: PublicProfilePageProps) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [months, setMonths] = useState(defaultMonths);
  const [currency, setCurrency] = useState(defaultCurrency);
  const [form, setForm] = useState<ProfileEditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  /* 🚨 A primitive, not the `owner` object. A host that builds `owner` inline
   * (every host will) hands us a new object identity on every render, so
   * making `load` depend on it would refetch forever. */
  const ownerProfileId = owner?.profileId ?? null;

  const load = useCallback(async () => {
    try {
      // The owner reads their own profile through `preview`: the same builder
      // as the public endpoint, and it renders an unpublished profile — which
      // is the only reason an owner can look at their own draft page at all.
      const next = ownerProfileId
        ? await fetchProfilePreview(ownerProfileId, { months, currency })
        : await fetchPublicProfile(username, { months, currency });
      setProfile(next);
      setError(null);
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
  }, [username, ownerProfileId, months, currency, onMoved]);

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
      profile={profile}
      actions={actions}
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
      months={months}
      currency={currency}
      onMonths={setMonths}
      onCurrency={setCurrency}
    />
  );
}
