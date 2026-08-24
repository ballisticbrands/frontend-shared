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

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ApiError } from "../api";
import { fetchPublicProfile, type PublicProfile } from "../lib/profiles";

export interface PublicProfilePageProps {
  username: string;
  /**
   * Rendered beside the profile header — the host app's slot for an "Edit
   * your profile" link when the viewer owns this page, and whatever else
   * belongs there later (share, report).
   *
   * ⚠️ A slot rather than a `canEdit` flag on purpose: whether you own a
   * profile is SESSION knowledge, and this component is deliberately
   * session-free — it renders public data for anyone, including a crawler
   * with no cookies. Handing it the session so it can decide would make the
   * public page depend on auth state and give it two rendering modes to keep
   * honest. The host already knows who is signed in; it passes the answer,
   * not the question.
   */
  actions?: ReactNode;
  /** Called when the username was released and the caller should
   *  redirect (301) to the current one. */
  onMoved?: (to: string) => void;
  defaultMonths?: number;
  defaultCurrency?: string;
}

function pct(n: number | null): string {
  return n === null ? "—" : `${n.toFixed(1)}%`;
}

function money(n: number | null, currency: string): string {
  if (n === null) return "—";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

export function PublicProfilePage({
  username,
  actions,
  onMoved,
  defaultMonths = 12,
  defaultCurrency = "USD",
}: PublicProfilePageProps) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [months, setMonths] = useState(defaultMonths);
  const [currency, setCurrency] = useState(defaultCurrency);

  const load = useCallback(async () => {
    try {
      setProfile(await fetchPublicProfile(username, { months, currency }));
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        const body = err.body as { moved_to?: string } | null;
        if (body?.moved_to && onMoved) {
          onMoved(body.moved_to);
          return;
        }
        setError("No profile here.");
        return;
      }
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [username, months, currency, onMoved]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <p role="alert">{error}</p>;
  if (!profile) return <p>Loading…</p>;

  const m = profile.metrics;

  return (
    <main data-noindex={profile.noindex ? "true" : undefined}>
      <h1>{profile.display_name ?? profile.username}</h1>
      <p>/{profile.username}</p>
      {actions ? <p data-profile-actions>{actions}</p> : null}
      {profile.bio ? <p>{profile.bio}</p> : null}
      {profile.seller_type ? <p>{profile.seller_type.replace(/_/g, " ")}</p> : null}

      <section>
        <h2>{profile.verification.label}</h2>
        <p>{profile.verification.description}</p>
        {profile.verification.verified_at ? (
          <p>
            <small>Last verified {new Date(profile.verification.verified_at).toLocaleDateString()}</small>
          </p>
        ) : null}
        {profile.verification.note ? <p>{profile.verification.note}</p> : null}
      </section>

      {m.margin_pct !== null ? (
        <section>
          <h2>Margin</h2>
          <p>{pct(m.margin_pct)}</p>
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

      {m.display ? (
        <section>
          <h2>Last {profile.window.months} months</h2>
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
            {m.sku_count !== null ? <li>{m.sku_count} SKUs</li> : null}
            {m.brand_count !== null ? (
              <li>
                {m.brand_count} {m.brands_label.toLowerCase()}
              </li>
            ) : null}
            {m.category !== null ? <li>{m.category}</li> : null}
          </ul>
        </section>
      ) : null}

      {profile.website_url || Object.keys(profile.socials).length > 0 ? (
        <section>
          <h2>Links</h2>
          <ul>
            {profile.website_url ? (
              <li>
                <a href={profile.website_url} rel="nofollow noopener">
                  {profile.website_url}
                </a>
              </li>
            ) : null}
            {Object.entries(profile.socials).map(([key, value]) => (
              <li key={key}>
                {key}: {value}
              </li>
            ))}
          </ul>
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
          <select id="window" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
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
            <select id="currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
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
  );
}
