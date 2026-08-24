// VerifiedMargins profile settings — FUNCTIONAL, DELIBERATELY UNSTYLED.
//
// Plain HTML elements, no classNames, no design system: the brand app
// that mounts this is being stood up with minimal styling and the look
// is a later pass. What must be right NOW is the behaviour:
//
//   * every toggle starts OFF and the page says so — a seller turns
//     each field on deliberately (the backend defaults visibility to
//     `{}` and nothing here silently sends `true`)
//   * publishing is a separate, explicit action from saving
//   * the connection opt-in lists only the signed-in user's OWN
//     connections, because only they may publish them
//   * there is a way to CONNECT an account, not just to opt one in —
//     VerifyAccountsSection, above the list. Without it a seller who has
//     never used another Dragon product has an empty list and no way to
//     fill it
//   * the username field reports availability before it is spent, and
//     shows how many of the two changes remain
//
// The page never computes a metric. It reads what the API returns.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "../api";
import { VerifyAccountsSection } from "../components/verification/VerifyAccounts";
import {
  changeUsername,
  checkUsername,
  fetchConnectionOptions,
  fetchProfile,
  linkConnection,
  setConnectionCogs,
  SELLER_TYPES,
  SOCIAL_FIELDS,
  unlinkConnection,
  updateProfile,
  VISIBILITY_FIELDS,
  type ConnectionOption,
  type ProfileDetail,
  type SellerType,
  type Socials,
  type UsernameAvailability,
  type Visibility,
} from "../lib/profiles";

/** Where a confirmation belongs — beside the control that caused it. */
type StatusSlot = "save" | "publish" | "username" | "connections";

export interface ProfileSettingsPageProps {
  profileId: string;
  /** Where the public page lives, for the "view profile" link. */
  publicBaseUrl?: string;
  /** Called with the public URL after a successful publish. Lets the host app
   *  route internally or open a tab; when unset the page navigates there. */
  onPublished?: (publicUrl: string) => void;
}

interface FormState {
  displayName: string;
  bio: string;
  avatarUrl: string;
  websiteUrl: string;
  sellerType: SellerType | "";
  socials: Socials;
  visibility: Visibility;
}

function formFrom(profile: ProfileDetail): FormState {
  return {
    displayName: profile.display_name ?? "",
    bio: profile.bio ?? "",
    avatarUrl: profile.avatar_url ?? "",
    websiteUrl: profile.website_url ?? "",
    sellerType: profile.seller_type ?? "",
    socials: { ...profile.socials },
    visibility: { ...profile.visibility },
  };
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return err instanceof Error ? err.message : String(err);
}

export function ProfileSettingsPage({ profileId, publicBaseUrl, onPublished }: ProfileSettingsPageProps) {
  const [profile, setProfile] = useState<ProfileDetail | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [connections, setConnections] = useState<ConnectionOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  /* Where the message belongs, not just what it says.
   *
   * 🚨 This used to be a bare string rendered once, next to the <h1>. Save
   * lives at the bottom of "What the public sees" and Publish at the very
   * bottom of the page, so the confirmation appeared hundreds of pixels above
   * the fold — you clicked Save and nothing visibly happened. The message was
   * there the whole time; it was just somewhere you were never looking. */
  const [status, setStatus] = useState<{ at: StatusSlot; message: string } | null>(null);
  const say = (at: StatusSlot, message: string) => setStatus({ at, message });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [detail, options] = await Promise.all([
        fetchProfile(profileId),
        fetchConnectionOptions(profileId),
      ]);
      setProfile(detail);
      setForm(formFrom(detail));
      setConnections(options);
      setLoadError(null);
    } catch (err) {
      setLoadError(errorMessage(err));
    }
  }, [profileId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loadError) return <p role="alert">Could not load this profile: {loadError}</p>;
  if (!profile || !form) return <p>Loading…</p>;

  const patch = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      await updateProfile(profileId, {
        display_name: form.displayName || null,
        bio: form.bio || null,
        avatar_url: form.avatarUrl || null,
        website_url: form.websiteUrl || null,
        seller_type: form.sellerType || null,
        socials: form.socials,
        visibility: form.visibility,
      });
      await load();
      say("save", "Saved.");
    } catch (err) {
      say("save", errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const publicUrl = `${publicBaseUrl ?? "https://verifiedmargins.com"}/${profile.username}`;

  /**
   * Publish, or re-publish after edits.
   *
   * ⚠️ There is deliberately NO unpublish control here any more. The button
   * used to toggle, which meant that once a profile was live the only thing
   * the Publish section offered was "Unpublish" — so pushing an edit read as
   * unpublish-then-publish-again. Taking a page down is a rare, deliberate act
   * and belongs somewhere it cannot be confused with saving; updating is the
   * common one and now has the button to itself. The API still accepts
   * `published: false`, so nothing is lost by moving that control later.
   */
  const setPublished = async (published: boolean) => {
    setStatus(null);
    try {
      await updateProfile(profileId, { published });
      await load();
      if (!published) {
        say("publish", "Your profile is no longer public.");
        return;
      }
      say("publish", "Your profile is live. Taking you there…");
      // Publishing is the one action whose whole point is the page it
      // produces — confirming it in place and leaving the seller on a form
      // makes them go and find their own profile to check it worked. The host
      // app can override the destination (open a tab, route internally); the
      // default just goes.
      if (onPublished) onPublished(publicUrl);
      else window.location.assign(publicUrl);
    } catch (err) {
      say("publish", errorMessage(err));
    }
  };

  return (
    <main>
      <h1>Profile settings</h1>

      <p>
        {profile.published ? "Public at" : "Not published. It would live at"}{" "}
        <a href={`${publicBaseUrl ?? "https://verifiedmargins.com"}/${profile.username}`}>
          /{profile.username}
        </a>
      </p>
      <Status status={status} at="username" />

      <UsernameSection profile={profile} onChanged={load} />

      <section>
        <h2>About</h2>
        <p>
          <label htmlFor="displayName">Display name</label>
          <br />
          <input
            id="displayName"
            value={form.displayName}
            onChange={(e) => patch("displayName", e.target.value)}
          />
        </p>
        <p>
          <label htmlFor="bio">Bio</label>
          <br />
          <textarea
            id="bio"
            rows={4}
            maxLength={500}
            value={form.bio}
            onChange={(e) => patch("bio", e.target.value)}
          />
          <br />
          <small>{form.bio.length}/500</small>
        </p>
        <p>
          <label htmlFor="avatarUrl">Avatar URL</label>
          <br />
          <input
            id="avatarUrl"
            type="url"
            placeholder="https://…"
            value={form.avatarUrl}
            onChange={(e) => patch("avatarUrl", e.target.value)}
          />
        </p>
        <p>
          <label htmlFor="websiteUrl">Website</label>
          <br />
          <input
            id="websiteUrl"
            type="url"
            placeholder="https://…"
            value={form.websiteUrl}
            onChange={(e) => patch("websiteUrl", e.target.value)}
          />
        </p>
        <p>
          <label htmlFor="sellerType">What kind of seller are you?</label>
          <br />
          <select
            id="sellerType"
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
          <br />
          <small>Self-declared. It decides which metrics your profile leads with.</small>
        </p>
      </section>

      <section>
        <h2>Links</h2>
        {SOCIAL_FIELDS.map((s) => (
          <p key={s.key}>
            <label htmlFor={`social-${s.key}`}>{s.label}</label>
            <br />
            <input
              id={`social-${s.key}`}
              value={form.socials[s.key] ?? ""}
              onChange={(e) =>
                patch("socials", { ...form.socials, [s.key]: e.target.value })
              }
            />
          </p>
        ))}
      </section>

      <section>
        <h2>What the public sees</h2>
        <p>
          Everything here is off until you turn it on. Your name, bio and links are always
          public once you publish; these are the numbers.
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
            Margin can be shown while revenue stays hidden — that is the whole point of the
            site.
          </small>
        </p>
      </section>

      <p>
        <Status status={status} at="save" />
        <button type="button" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </p>

      {/* Verification sits ABOVE the connected-accounts list, and that order is
          the point: the list can only ever show accounts you already have, and
          until this section existed there was nothing anywhere in the product
          that STARTED an Amazon connection. A seller who had never used
          DragonBot arrived at an empty list with no way to fill it — connect →
          verified numbers → publish was unreachable from the product's own UI.
          See FEATURE_VM_2026-08-24_amazon-account-verification-flow. */}
      <VerifyAccountsSection profileId={profileId} onLinked={load} />

      <ConnectionsSection
        profileId={profileId}
        connections={connections}
        onChanged={load}
        onStatus={(m) => say("username", m)}
      />

      <section>
        <h2>Publish</h2>
        {profile.username_is_placeholder ? (
          <p>Pick a username above before publishing.</p>
        ) : null}
        <p>
          <button
            type="button"
            onClick={() => setPublished(true)}
            disabled={profile.username_is_placeholder}
          >
            {profile.published ? "Update my profile" : "Publish my profile"}
          </button>
        </p>
        <Status status={status} at="publish" />
        <p>
          <small>
            {profile.published
              ? "Your profile is live. Publishing again pushes your latest changes and takes you to the page."
              : "Publishing makes your page public and takes you straight to it."}
          </small>
        </p>
      </section>
    </main>
  );
}

// ─── username ────────────────────────────────────────────────────────

function UsernameSection({
  profile,
  onChanged,
}: {
  profile: ProfileDetail;
  onChanged: () => Promise<void>;
}) {
  const [value, setValue] = useState(profile.username_is_placeholder ? "" : profile.username);
  const [availability, setAvailability] = useState<UsernameAvailability | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const remaining = Math.max(
    0,
    profile.username_changes_limit - profile.username_changes_used,
  );
  const isCurrent = value.trim().toLowerCase() === profile.username;

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const candidate = value.trim().toLowerCase();
    if (!candidate || candidate === profile.username) {
      setAvailability(null);
      return;
    }
    debounce.current = setTimeout(() => {
      checkUsername(candidate, profile.id)
        .then(setAvailability)
        .catch(() => setAvailability(null));
    }, 350);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [value, profile.id, profile.username]);

  const submit = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const result = await changeUsername(profile.id, value.trim().toLowerCase());
      await onChanged();
      setStatus(
        result.previous_username_retired
          ? `Now /${result.username}. Your old username is retired and can't be reused by anyone.`
          : `Now /${result.username}.`,
      );
    } catch (err) {
      setStatus(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h2>Username</h2>
      {profile.username_is_placeholder ? (
        <p>
          You have a temporary username. Picking a real one now doesn't count against your
          {" "}
          {profile.username_changes_limit} changes.
        </p>
      ) : (
        <p>
          {remaining} of {profile.username_changes_limit} changes left. A username you give up
          is retired permanently — nobody else can take it, so old links to you can never
          point at someone else.
        </p>
      )}
      <p>
        <label htmlFor="username">verifiedmargins.com/</label>
        <input id="username" value={value} onChange={(e) => setValue(e.target.value)} />{" "}
        <button
          type="button"
          onClick={submit}
          disabled={busy || isCurrent || !value.trim() || availability?.available === false}
        >
          {busy ? "Saving…" : "Change"}
        </button>
      </p>
      {availability ? (
        <p role="status">
          {availability.available ? `/${availability.username} is available.` : availability.detail}
        </p>
      ) : null}
      {status ? (
        <p role="status" data-status>
          {status}
        </p>
      ) : null}
    </section>
  );
}

// ─── connections ─────────────────────────────────────────────────────

function ConnectionsSection({
  profileId,
  connections,
  onChanged,
  onStatus,
}: {
  profileId: string;
  connections: ConnectionOption[];
  onChanged: () => Promise<void>;
  onStatus: (s: string) => void;
}) {
  const linked = useMemo(() => connections.filter((c) => c.linked_here), [connections]);

  const toggle = async (option: ConnectionOption) => {
    try {
      if (option.linked_here) await unlinkConnection(profileId, option.id);
      else await linkConnection(profileId, option.id);
      await onChanged();
      onStatus(
        option.linked_here
          ? "Removed. That account's numbers are no longer on your profile."
          : "Added. Your numbers will appear after the next refresh.",
      );
    } catch (err) {
      onStatus(errorMessage(err));
    }
  };

  return (
    <section>
      <h2>Connected accounts</h2>
      <p>
        Only accounts you connected yourself can be published here — nobody else can put your
        numbers on a profile, and nobody can put theirs on yours.
      </p>
      {connections.length === 0 ? (
        <p>You haven't connected an Amazon account yet.</p>
      ) : (
        <ul>
          {connections.map((c) => (
            <li key={c.id}>
              <label>
                <input
                  type="checkbox"
                  checked={c.linked_here}
                  disabled={c.linked_elsewhere}
                  onChange={() => toggle(c)}
                />{" "}
                <span data-account-name>{c.name}</span>{" "}
                <span data-pill>{providerLabel(c.provider, c.account_type)}</span>
                {c.countries && c.countries.length > 0 ? (
                  <span data-countries>{c.countries.join(" · ")}</span>
                ) : null}
              </label>
              {c.linked_elsewhere ? <small> — already on another profile</small> : null}
              {c.linked_here ? <CogsBasisControl profileId={profileId} connection={c} onChanged={onChanged} onStatus={onStatus} /> : null}
            </li>
          ))}
        </ul>
      )}
      {linked.length === 0 ? (
        <p>
          <small>
            With no account linked, your profile shows who you are but no verified numbers.
          </small>
        </p>
      ) : null}
    </section>
  );
}

/** Renders the confirmation only in the slot that produced it, so clicking
 *  Save does not also flash a message down beside Publish. */
function Status({
  status,
  at,
}: {
  status: { at: StatusSlot; message: string } | null;
  at: StatusSlot;
}) {
  if (!status || status.at !== at) return null;
  return (
    <p role="status" data-status>
      {status.message}
    </p>
  );
}

/** What kind of account this is, for the pill beside its name.
 *
 * ⚠️ The PLATFORM is part of the label, deliberately: "Amazon seller account",
 * not "Seller account". Today every connection is Amazon, so the platform
 * reads as redundant — but a Shopify store is a plausible next provider, and
 * at that point an unqualified "Seller account" beside a "Shopify store" is
 * actively confusing. Naming it now costs nothing and means the pills stay
 * consistent when a second platform lands, instead of needing a migration of
 * everyone's mental model.
 *
 * Derived from the provider rather than sent by the API: the provider IS the
 * type, and a second server-side string would be one more thing to keep in
 * step.
 *
 * The Ads sub-type is surfaced only when it is NOT "seller". A normal ads
 * account is a seller account and saying so twice is noise; an Attribution
 * profile comes back as "agency" and is worth flagging, because it looks
 * identical to a real ads account otherwise. */
function providerLabel(provider: string, accountType?: string | null): string {
  if (provider === "amazon_selling_partner") return "Amazon seller account";
  if (provider === "amazon_ads") {
    return accountType && accountType !== "seller"
      ? `Amazon ads account · ${accountType}`
      : "Amazon ads account";
  }
  if (provider === "manual") return "Added by hand";
  return provider;
}

/** The blendedCogsPct fallback, for the seller who will never upload per-SKU
 *  costs. The page is explicit that this makes the margin modelled rather than
 *  verified — the badge changes accordingly.
 *
 *  Keeps its OWN status rather than reporting into the page-level slot: there
 *  is one of these per linked connection, so a shared slot would show "Cost
 *  basis saved." against whichever control happened to render it, not the one
 *  you pressed. Local state puts the confirmation next to the button that
 *  earned it, which is the whole point. */
function CogsBasisControl({
  profileId,
  connection,
  onChanged,
  onStatus,
}: {
  profileId: string;
  connection: ConnectionOption;
  onChanged: () => Promise<void>;
  /** Still reported upward for errors worth surfacing page-wide. */
  onStatus: (s: string) => void;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [basis, setBasis] = useState(connection.cogs_basis);
  const [pct, setPct] = useState(
    connection.blended_cogs_pct === null ? "" : String(connection.blended_cogs_pct),
  );

  const save = async () => {
    try {
      await setConnectionCogs(profileId, connection.id, {
        cogs_basis: basis,
        blended_cogs_pct: basis === "blended_pct" && pct !== "" ? Number(pct) : null,
      });
      await onChanged();
      setStatus("Cost basis saved.");
    } catch (err) {
      setStatus(errorMessage(err));
      onStatus(errorMessage(err));
    }
  };

  return (
    <div>
      <p>
        <label>
          <input
            type="radio"
            name={`cogs-${connection.id}`}
            checked={basis === "per_sku"}
            onChange={() => setBasis("per_sku")}
          />{" "}
          Use the per-SKU costs I uploaded (verified margin)
        </label>
        <br />
        <label>
          <input
            type="radio"
            name={`cogs-${connection.id}`}
            checked={basis === "blended_pct"}
            onChange={() => setBasis("blended_pct")}
          />{" "}
          Use one blended cost percentage (modelled margin)
        </label>
      </p>
      {basis === "blended_pct" ? (
        <p>
          <label htmlFor={`pct-${connection.id}`}>Cost of goods, % of revenue</label>{" "}
          <input
            id={`pct-${connection.id}`}
            type="number"
            min={0}
            max={100}
            step="0.1"
            value={pct}
            onChange={(e) => setPct(e.target.value)}
          />
          <br />
          <small>
            Your profile will say the margin is modelled from a percentage you supplied, not
            computed from per-SKU costs.
          </small>
        </p>
      ) : null}
      <p>
        <button type="button" onClick={save}>
          Save cost basis
        </button>
      </p>
      {status ? (
        <p role="status" data-status>
          {status}
        </p>
      ) : null}
    </div>
  );
}
