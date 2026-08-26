// VerifiedMargins profile API client.
//
// Mirrors src/routes/profiles.ts and src/routes/public-profiles.ts in
// the sellerconnect backend. Wire shapes are snake_case (the backend's
// convention); this module is the only place that knows that.
//
// Note what is NOT here: nothing computes a margin, converts a currency
// or decides what may be shown. The public payload arrives already
// gated by visibility, already converted, and already labelled with the
// FX as-of date — the page renders it and nothing more. That split is
// deliberate: two implementations of "may we show this?" is one too
// many for a product whose claim is that its numbers are honest.

import { apiFetch } from "../api";

export type SellerType = "private_label" | "wholesaler" | "dropshipper";

export const SELLER_TYPES: Array<{ value: SellerType; label: string }> = [
  { value: "private_label", label: "Private label" },
  { value: "wholesaler", label: "Wholesale" },
  { value: "dropshipper", label: "Dropshipping" },
];

export const VISIBILITY_FIELDS = [
  { key: "margin", label: "Margin %" },
  { key: "sales", label: "Revenue, units and orders" },
  { key: "skuCount", label: "SKU count" },
  { key: "brands", label: "Brands sold" },
  { key: "category", label: "Category" },
] as const;

export type VisibilityField = (typeof VISIBILITY_FIELDS)[number]["key"];
export type Visibility = Partial<Record<VisibilityField, boolean>>;

export const SOCIAL_FIELDS = [
  { key: "reddit", label: "Reddit" },
  { key: "x", label: "X" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "instagram", label: "Instagram" },
  { key: "tiktok", label: "TikTok" },
  { key: "facebook", label: "Facebook" },
] as const;

export type SocialField = (typeof SOCIAL_FIELDS)[number]["key"];
export type Socials = Partial<Record<SocialField, string>>;

export interface Profile {
  id: string;
  username: string;
  username_is_placeholder: boolean;
  type: string;
  seller_type: SellerType | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  website_url: string | null;
  socials: Socials;
  published: boolean;
  verification: string;
  verified_at: string | null;
  verified_note: string | null;
  visibility: Visibility;
  created_at: string;
  updated_at: string;
  role?: string;
}

export interface ProfileDetail extends Profile {
  connections: ProfileConnection[];
  members: Array<{ user_id: string; role: string; added_at: string }>;
  username_changes_used: number;
  username_changes_limit: number;
}

export interface ProfileConnection {
  id: string;
  provider: string;
  /** The REAL account name where one is known — the SP-API storefront name or
   *  the Ads profile's account name — falling back to the generic provider
   *  label. See connectionToWire in the backend's routes/profiles.ts. */
  name: string;
  /** Ads only: "seller" | "vendor" | "agency". */
  account_type?: string | null;
  /** Two-letter country codes. Disambiguates the common case of one seller
   *  holding several connections under the same storefront name. */
  countries?: string[];
  cogs_basis: "per_sku" | "blended_pct";
  blended_cogs_pct: number | null;
}

export interface ConnectionOption extends ProfileConnection {
  linked_here: boolean;
  linked_elsewhere: boolean;
}

export interface UsernameAvailability {
  username: string;
  available: boolean;
  reason: "invalid" | "reserved" | "taken" | "retired" | null;
  detail: string | null;
}

export interface ProfileSettingsPatch {
  display_name?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  website_url?: string | null;
  socials?: Socials;
  seller_type?: SellerType | null;
  visibility?: Visibility;
  published?: boolean;
}

// ─── authenticated (settings) ────────────────────────────────────────

export function listProfiles(): Promise<Profile[]> {
  return apiFetch<Profile[]>("/v1/profiles");
}

export function createProfile(body: { username?: string; display_name?: string } = {}): Promise<Profile> {
  return apiFetch<Profile>("/v1/profiles", { method: "POST", body: JSON.stringify(body) });
}

export function fetchProfile(id: string): Promise<ProfileDetail> {
  return apiFetch<ProfileDetail>(`/v1/profiles/${encodeURIComponent(id)}`);
}

export function updateProfile(id: string, patch: ProfileSettingsPatch): Promise<Profile> {
  return apiFetch<Profile>(`/v1/profiles/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

/** Hard cap the backend enforces on an uploaded picture. Mirrored here
 *  ONLY so the page can say "too big" without a round trip — the server
 *  check is the gate, this is a courtesy. */
export const AVATAR_MAX_BYTES = 1024 * 1024;

/** What the file picker offers. The backend decides from the magic
 *  bytes regardless, so this list narrows the picker, it does not
 *  authorize anything. */
export const AVATAR_ACCEPT = "image/png,image/jpeg,image/webp";

export interface AvatarUploadResult {
  /** A permanent, public URL on our own object storage — never a
   *  hotlink and never a signed URL that expires. */
  avatar_url: string;
  profile: Profile;
}

/**
 * Upload a profile picture: the image file ITSELF as the request body,
 * with its own content type. Not multipart, not base64 — the endpoint
 * takes raw bytes (see the backend's routes/profiles.ts).
 *
 * `file.type` is sent for honesty, not for authorization: the server
 * reads the magic bytes and ignores what we claim.
 */
export function uploadProfileAvatar(id: string, file: Blob): Promise<AvatarUploadResult> {
  return apiFetch<AvatarUploadResult>(`/v1/profiles/${encodeURIComponent(id)}/avatar`, {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
}

/** Take the picture off the profile. The stored object is left alone —
 *  it is content-addressed, so it is nobody's to reuse or bust. */
export function removeProfileAvatar(id: string): Promise<Profile> {
  return updateProfile(id, { avatar_url: null });
}

export function checkUsername(username: string, profileId?: string): Promise<UsernameAvailability> {
  const params = new URLSearchParams({ username });
  if (profileId) params.set("profile_id", profileId);
  return apiFetch<UsernameAvailability>(`/v1/profiles/username-available?${params.toString()}`);
}

export function changeUsername(
  id: string,
  username: string,
): Promise<Profile & { username_changes_used: number; previous_username_retired: boolean }> {
  return apiFetch(`/v1/profiles/${encodeURIComponent(id)}/username`, {
    method: "PUT",
    body: JSON.stringify({ username }),
  });
}

export function fetchConnectionOptions(id: string): Promise<ConnectionOption[]> {
  return apiFetch<ConnectionOption[]>(`/v1/profiles/${encodeURIComponent(id)}/connection-options`);
}

export function linkConnection(id: string, connectionId: string): Promise<ProfileConnection> {
  return apiFetch(`/v1/profiles/${encodeURIComponent(id)}/connections`, {
    method: "POST",
    body: JSON.stringify({ connection_id: connectionId }),
  });
}

export function unlinkConnection(id: string, connectionId: string): Promise<void> {
  return apiFetch(
    `/v1/profiles/${encodeURIComponent(id)}/connections/${encodeURIComponent(connectionId)}`,
    { method: "DELETE" },
  );
}

export function setConnectionCogs(
  id: string,
  connectionId: string,
  body: { cogs_basis: "per_sku" | "blended_pct"; blended_cogs_pct: number | null },
): Promise<void> {
  return apiFetch(
    `/v1/profiles/${encodeURIComponent(id)}/connections/${encodeURIComponent(connectionId)}/cogs`,
    { method: "PUT", body: JSON.stringify(body) },
  );
}

/**
 * Ask the backend to rebuild this profile's numbers now rather than waiting
 * for the nightly 08:30 UTC run. Fired right after a connection is linked.
 *
 * 202, with nothing to wait on: the builder scans two years of warehouse data
 * per connection and takes minutes — and for a connection authorized seconds
 * ago there is no warehouse data at all yet, because the SP-API initial sync
 * runs for hours. So the UI that calls this must say "we're pulling your
 * numbers", never "done". Resolves as soon as the request is accepted.
 */
export function requestProfileSnapshot(id: string): Promise<{ status: string }> {
  return apiFetch(`/v1/profiles/${encodeURIComponent(id)}/snapshot`, { method: "POST" });
}

export function fetchProfilePreview(
  id: string,
  opts: { months?: number; currency?: string } = {},
): Promise<PublicProfile> {
  const params = new URLSearchParams();
  if (opts.months) params.set("months", String(opts.months));
  if (opts.currency) params.set("currency", opts.currency);
  const qs = params.toString();
  return apiFetch<PublicProfile>(
    `/v1/profiles/${encodeURIComponent(id)}/preview${qs ? `?${qs}` : ""}`,
  );
}

// ─── public ──────────────────────────────────────────────────────────

export interface CurrencyTotals {
  currency: string;
  revenue: number;
  units: number;
  orders: number;
  fees: number | null;
  ad_spend: number | null;
  cogs: number | null;
  profit: number | null;
  margin_pct: number | null;
  cogs_complete: boolean;
}

export interface PublicProfile {
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  website_url: string | null;
  socials: Record<string, string>;
  seller_type: string | null;
  type: string;
  claimed: boolean;
  noindex: boolean;
  verification: {
    tier: string;
    label: string;
    description: string;
    revenueSource: string;
    marginBasis: string | null;
    verified_at: string | null;
    note: string | null;
  };
  window: { months: number; from: string; through: string; includes_partial_month: boolean };
  visibility: Visibility;
  metrics: {
    native: CurrencyTotals[] | null;
    display: {
      currency: string;
      revenue: number | null;
      fees: number | null;
      ad_spend: number | null;
      cogs: number | null;
      profit: number | null;
      margin_pct: number | null;
      fx: { as_of: string; source: string; unconvertible: string[] };
    } | null;
    series: Array<{
      month: string;
      currency: string;
      revenue: number;
      units: number;
      orders: number;
      profit: number | null;
    }> | null;
    /** Ratios only, and gated on `visibility.margin` rather than
     *  `visibility.sales` — a margin discloses no absolute figure, so a
     *  seller can plot it with revenue private. */
    margin_series: Array<{ month: string; margin_pct: number | null }> | null;
    /** One row per linked business. `label` is a PLATFORM ("Amazon FBA"),
     *  never the seller's account name, and the badge is per connection —
     *  a synced Amazon account and a typed-in legacy business must not share
     *  one verdict. */
    businesses: Array<{
      platform: string;
      label: string;
      /** Marketplace codes — what tells two Amazon connections apart. */
      markets: string[];
      seller_type: string | null;
      last_30d: { revenue: number | null; profit: number | null; margin_pct: number | null };
      revenue: number | null;
      margin_pct: number | null;
      verification: { tier: string; label: string };
    }>;
    margin_pct: number | null;
    margin_basis: string | null;
    margin_note: string | null;
    sku_count: number | null;
    brand_count: number | null;
    brands_label: string;
    category: string | null;
    categories: Array<{ name: string; revenue: number }> | null;
  };
  currency_options: string[];
  notes: string[];
}

/** 404s carry `moved_to` when the username was released by a profile
 *  that still exists — the caller issues the redirect. */
export interface PublicProfileMoved {
  error_code: "profile_moved";
  moved_to: string;
}

export function fetchPublicProfile(
  username: string,
  opts: { months?: number; currency?: string } = {},
): Promise<PublicProfile> {
  const params = new URLSearchParams();
  if (opts.months) params.set("months", String(opts.months));
  if (opts.currency) params.set("currency", opts.currency);
  const qs = params.toString();
  // auth: false — a public page must render for a signed-out visitor,
  // and sending a stale bearer would be the easiest way to accidentally
  // make it look like it works when it doesn't.
  return apiFetch<PublicProfile>(
    `/v1/public/profiles/${encodeURIComponent(username)}${qs ? `?${qs}` : ""}`,
    { auth: false },
  );
}
