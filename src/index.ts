// @ballisticbrands/frontend-shared — public entrypoint.
//
// v0.2.0: adds auth-flow UI on top of v0.1.x's lib + brand context.
// v0.5.1: sign_up / CompleteRegistration conversions fire only on real
//         account creation (identifyUserAcrossPlatforms opts), not on
//         every sign-in.
// v0.6.0: magic login links — requestMagicLink / redeemMagicLink,
//         MagicLoginPage (/magic route), useMagicLinkForm;
//         ForgotPasswordPage now requests a magic link (supersedes the
//         never-built reset flow). Magic logins are sign-INS: redeem
//         identifies with fireSignUpEvent: false.

// v0.7.0: the dashboard rebuild. Adds a left-nav AppShell (replacing
//         each brand's four-tab strip), a metrics DashboardMetricsPage
//         backed by the new /v1/metrics endpoints, a ConnectAiPage
//         backed by /v1/usage, and the chart/stat primitives both need.
//         Keys move here from the brand apps because ConnectAiPage
//         mints them.

// v0.8.0: VerifiedMargins — the profile settings surface
//         (ProfileSettingsPage) and the public profile renderer
//         (PublicProfilePage), plus the /v1/profiles + 
//         /v1/public/profiles clients they sit on. Both pages are
//         deliberately unstyled: correct behaviour first, design
//         pass later.

// v0.8.1: ProfileSettings — the connected-accounts list shows the real
//         account name with a type pill instead of the provider label;
//         confirmations render beside the control that caused them; and
//         publishing navigates to the profile it just produced.

// v0.8.2: pills name the platform ("Amazon seller account") so a second
//         provider can be added without renaming everything; the cost-basis
//         control confirms its own save; and Publish no longer doubles as
//         Unpublish.

// v0.8.3: PublicProfilePage takes an `actions` slot, so a host app can put an
//         "Edit your profile" link on a page the viewer owns without the
//         component itself having to know who is signed in.

// v0.9.0: passwordless brands. requestMagicLink now carries the
//         first-touch attribution blob (on a passwordless brand that
//         request CREATES the account, so without it every signup lands
//         with null UTMs), and redeemMagicLink relays the backend's
//         `created` flag instead of pinning fireSignUpEvent to false —
//         the v0.6.0 note below ("magic logins are sign-INS") is no
//         longer true where /magic-link signs people up. MagicLoginPage
//         takes optional footer-link props so a brand with no passwords
//         need not ask "Know your password?".

// v0.9.0: VerifiedMargins can finally CONNECT an account. ProfileSettings
//         gains a "Verify your numbers" section above the connected-accounts
//         list — two buttons (seller, ads), three methods each, of which
//         Amazon OAuth is real and screenshot-upload / book-a-call ship as
//         labelled placeholders. Adds the shared OAuth popup client
//         (lib/connections), lifted out of dragonbot-frontend rather than
//         copied a second time, and requestProfileSnapshot.

// v0.9.0: VerifiedMargins profiles get a real picture. ProfileSettings'
//         About section gains an Upload picture control (with a preview
//         and Remove) beside the paste-a-URL field, on
//         POST /v1/profiles/:id/avatar — the image file itself as the
//         body, ≤ 1 MB. The URL field stays: some people genuinely want
//         to point at their own CDN.

// v0.9.2: the "Verify Amazon ads account" button is COMMENTED OUT (see
//         VerifyAccounts.tsx for the full why). Linking an ads connection
//         wrote zero metric rows, so the control implied work it never
//         did; the backend now refuses the link outright and no longer
//         offers ads in connection-options. The ads wiring
//         (VERIFY_TARGETS.ads, the "ads" VerifyTarget, the modal) is kept
//         live and tested so restoring it is an edit, not a rewrite.
//         sellerconnect FEATURE_VM_2026-08-24_comment-out-ads-connection.

// v0.9.3: your own profile page IS the editor. PublicProfilePage takes an
//         `owner` slot ({ profileId, published, actions }); with it set, the
//         page sources its payload from GET /v1/profiles/:id/preview instead
//         of the public endpoint — the SAME builder, so what the owner sees
//         is definitionally what the world sees, and an UNPUBLISHED profile
//         renders for its owner without /:username becoming an existence
//         oracle for anyone else. The owner bar sits OUTSIDE <main>, so the
//         public render is byte-identical for a stranger (pinned by
//         test/public-profile-owner.test.mjs); edit mode swaps the six fields
//         the payload already carries — display name, bio, seller type,
//         website, socials, visibility — for inputs in place. No endpoint was
//         widened and no public field was added; ProfileSettingsPage keeps
//         username, picture, connections and publishing.
//         sellerconnect BUG_VM_2026-08-25_profile-page-not-editable-in-place.

// v0.9.4: styling hooks for the VerifiedMargins brand system —
//         `data-verification` on the tier section, `data-metric` on the
//         figures, and a `.vm-badge` span so the two verification states
//         differ in shape and word, not only colour. Markup only; the
//         look lives in the host app's globals.css.
// v0.9.5: the public profile gets a dashboard — StatTile + TrendChart,
//         the same primitives DashboardMetrics uses, plus margin_series
//         so a margin-public/revenue-private profile can still plot a
//         trend that discloses no absolute figure.
// v0.9.6: the profile reads like a social profile — name, bio, the
//         businesses someone runs (each with its OWN badge), links, then
//         the dashboard. Drops the profile-wide verification explainer and
//         the self-declared seller-type tag.
// v0.9.7: business rows carry `markets`, because a seller with a US and an
//         EU Amazon account had two identical "Amazon FBA" rows and no way
//         to tell which figure was which.
// v0.9.8: the profile takes the trustmrr founder-page shape — handle beside
//         the name, share button, links in the identity block, and
//         "Businesses by <name>" as cards with a platform mark, a blurred
//         brand name and 30-day figures.
// v0.9.9: the profile stripped to what a visitor reads — a big round
//         avatar, "N businesses with verified revenue", share + social
//         marks in one row, 30-day figures, then the businesses. Drops the
//         breakdown, catalogue, notes and window/currency blocks.
// v0.9.10: the dashboard opens on revenue, and the "margin is hidden"
//          note is shown to the profile's OWNER only.
// v0.9.11: profile links stack and name their destination —
//          "Visit 𝕏 profile ↗" rather than a bare glyph.
// v0.9.12: PublicProfilePage takes a controlled `currency` and an `onLoaded`
//          hook, so a host app can hang its own chrome off the payload
//          without fetching it a second time.
// v0.9.13: PublicProfilePage takes a `breadcrumb` slot in its header.
// v0.9.14: the profile chart plots the last 30 DAYS, converted to the display
//          currency, rather than 12 months of raw currencies —
//          `metrics.daily`. The heading and the axis finally agree.
// v0.9.15: the business cards LINK to their own pages. Each row carries
//          `page: {slug, name} | null` and the card's name becomes an <a> to
//          /business/<slug>, with `page.name` ("Amazon FBA 48213") as the
//          link's accessible name — the blurred "Stealth Brand" placeholder
//          is aria-hidden behind it, so a screen reader's link list names the
//          destination rather than announcing "Business name hidden". `page`
//          is null for a business whose page 404s by design (Amazon Ads) and
//          that card stays unlinked. The host app supplies the CSS that
//          stretches the link over the whole card.
//          sellerconnect FEATURE_VM_2026-08-28_business-detail-page.
//
// v0.9.16: the verification badge is a three-step ladder — ✓ verified_margin,
//          ◑ verified_revenue, ○ everything else — so a modelled margin no
//          longer renders in the same green as a checked one.
// v0.9.17: the profile shows the SAME FOUR TILES as a business page — Profit,
//          Revenue, Margin, SKUs, all on the trailing 30 days. `Units` is
//          gone; SKUs is a tile but NOT a chart selector, because the payload
//          carries one count rather than a series and a control that plots
//          nothing is a control that lies. The chart opens on profit, which is
//          what the site ranks on.
//          The header line is now one per TIER, each carrying the real badge:
//          "2 businesses with ◑ Verified revenue · 1 with ✓ Verified margins".
//          "N businesses with verified revenue" counted every verified
//          business and then named one of the two things they could be
//          verified FOR, so a mixed portfolio was described wrongly.
// v0.9.18: the four tiles are ALWAYS the same four. 0.9.17 dropped the Profit
//          tile entirely on a profile with no costs while Margin still
//          rendered a dash beside it — two different answers to the same
//          question, and a tile row that changed shape from profile to
//          profile. A tile now renders whether or not its figure exists, and
//          is clickable only when it has a series behind it.
// v0.9.19: the standalone "Margin" section is gone. It rendered a 12-MONTH
//          margin as the page's headline while the tiles directly below it
//          showed a 30-day one — two different margins on one page, the
//          larger of them unlabelled. The tile is the margin now, on the same
//          window as everything beside it, and the cost basis that section
//          explained is what the verification badge already says.
// v0.9.20: business cards show their real name ("Amazon FBA 08873") instead
//          of a blurred "Stealth Brand" placeholder. The name is derived from
//          the opaque slug and is what the destination page's own <h1> says,
//          so blurring it taught a reader we were withholding something we
//          were not. The seller's REAL storefront name is still nowhere on
//          the payload, which is what the blur was actually protecting.
//          PlatformMark serves the real Amazon logo from the host app's own
//          origin (AMAZON_MARK_SRC, default /amazon-mark.png) rather than a
//          hand-drawn SVG smile that read as a smear at card size. Still no
//          third-party request — the file is ours.
// v0.9.22: exports ShareButton and AMAZON_MARK_SRC, so the per-business page
//          can share itself and show the same mark with the same code rather
//          than growing a second copy of each. ShareButton takes
//          `fallbackPath` instead of `username`: it never resolved to a
//          profile URL anyway, it only needed something to offer when there
//          is no `window` (the static prerender).
//
// v0.9.23: shorter badge tooltips.
// v0.9.24: a PPC tile on the profile dashboard — 30-day advertising spend in
//          money, between Margin and SKUs. 🚨 It is the one tile that
//          DISAPPEARS when its figure is absent rather than showing a dash:
//          `last_30d.ad_spend` is null for "not reported", so "—" would imply
//          we looked and found nothing while "$0" would assert that a seller
//          who advertises does not.
// v0.9.25: the business mark follows the business, not how its data arrived —
//          a manual Amazon business drew an anonymous square on the founder
//          profile while its own page drew the Amazon mark.
//          🚨 Shipped with this constant left at 0.9.24: the version was
//          bumped in package.json and published without re-running the tests
//          that exist to catch exactly that.
// v0.9.26: a reader-chosen window on the profile — 7d / 30d / 3m / 6m / 12m,
//          defaulting to 30d. Which options are LOCKED is session knowledge,
//          so the host passes `unlockedWindows` and `onLockedWindow` rather
//          than this page deciding; locked options render locked rather than
//          hidden, because a gate nobody can see is an offer nobody can take.
// v0.9.27: export WindowKey + WINDOW_OPTIONS. 0.9.26 shipped the props that
//          take them without the types to build them, so a host could not
//          name what it was passing.
// v0.9.28: 🚨 the dashboard's render guard listed only the MONTHLY series, so
//          a day-grained window — which nulls it by design — took the tiles,
//          the chart AND the picker with it. 7d and 30d rendered a profile
//          with no dashboard at all.

// v0.9.29: the Margin tile carries an "unverified" tag on any profile whose
//          tier is not verified_margin, with the explainer on hover.
//          verified_revenue means the REVENUE came from Amazon and the cost
//          side is a percentage the seller supplied — so the margin is
//          theirs, not ours, and showing it beside a green tick let a checked
//          figure vouch for an unchecked one. StatTile gains a `tag` prop for
//          it: a hint explains a missing number, a tag says the number is
//          there and we are not vouching for it.

// v0.9.31: a profile bio keeps its LINE BREAKS. It rendered in a plain <p>,
//          which collapses every newline into a space — and people write
//          lists in a bio, so a five-line one became one run-on sentence.
//          The <p> carries `data-profile-bio` and the host sets
//          white-space: pre-line; the text is still interpolated, never
//          dangerouslySet, so markup in a bio stays inert.

// v0.9.32: the Margin tile PLOTS. It was gated on `metrics.margin_series`,
//          which the backend sends only for the monthly fallback — so on
//          every daily profile it rendered inert: no sparkline, no click.
//          Margin is a ratio of two series already on the page, so it is
//          derived from the same daily rows as Profit. Still not a control
//          when no day carries profit: there would be nothing to draw.

// 🚨 KEEP THIS CONSTANT AND package.json's "version" IN STEP, and add a line
// above for every bump. The constant exists to tell us at runtime which build
// a brand is actually serving, so a stale value is worse than no value — it
// is a confident wrong answer. It drifted three releases behind (0.9.11 while
// the package said 0.9.14) before test/version.test.mjs was added to fail on
// exactly that, and on a version with no changelog line.
// v0.9.30: the window picker becomes the dashboard's heading, and a real
//          listbox rather than a <select> — a native option cannot draw a
//          lock, so the gate had to be spelled with an emoji. Locked options
//          carry a lock icon; the selected one carries a check.

export const SHARED_PACKAGE_VERSION = "0.9.32";

// Config
export { configureShared, getSharedConfig } from "./config";
export type { SharedConfig } from "./config";

// Brand
export type { BrandConfig } from "./brand-types";
export { BrandProvider, useBrand } from "./brand-context";

// API
export { ApiError, apiFetch, SESSION_KEY } from "./api";

// Session
export {
  getSessionToken,
  setSessionToken,
  clearSessionToken,
  fetchCurrentUser,
  useSession,
} from "./session";
export type { SessionUser } from "./session";

// Auth
export {
  signIn,
  signUp,
  signInWithGoogle,
  signOut,
  requestPasswordReset,
  verifyEmail,
  resendVerification,
  requestMagicLink,
  redeemMagicLink,
} from "./auth";
export type {
  VerifyEmailSuccess,
  VerifyEmailFailure,
  ResendVerificationResult,
  RequestMagicLinkResult,
  RedeemMagicLinkResult,
  MagicLinkErrorCode,
} from "./auth";

// Attribution
export {
  captureAttribution,
  readAttribution,
  identifyUserAcrossPlatforms,
  tagClarityIdentity,
  trackAccountConnected,
  reconcileConnectionActivations,
} from "./attribution";
export type { Attribution, IdentifyOptions } from "./attribution";

// UI primitives (v0.2.0)
export { Button } from "./components/Button";
export { Input, Label } from "./components/Input";
export { Turnstile } from "./components/Turnstile";
export { VerifyEmailBanner } from "./components/VerifyEmailBanner";

// Google sign-in (v0.5.0)
export { GoogleSignInButton } from "./components/GoogleSignInButton";
export { AuthDivider } from "./components/AuthDivider";

// Pages (v0.2.0)
export { VerifyEmailPage } from "./pages/VerifyEmail";
export { ForgotPasswordPage } from "./pages/ForgotPassword";

// Magic login links (v0.6.0; props added in v0.9.0)
export { MagicLoginPage } from "./pages/MagicLogin";
export type { MagicLoginPageProps } from "./pages/MagicLogin";

// Auth form hooks (v0.3.0)
export { useSignUpForm } from "./hooks/useSignUpForm";
export type { UseSignUpFormReturn } from "./hooks/useSignUpForm";
export { useSignInForm } from "./hooks/useSignInForm";
export type { UseSignInFormReturn } from "./hooks/useSignInForm";
export { useMagicLinkForm } from "./hooks/useMagicLinkForm";
export type { UseMagicLinkFormReturn } from "./hooks/useMagicLinkForm";

// ─── Dashboard (v0.7.0) ───────────────────────────────────────────────

// Metrics API + formatters
export {
  fetchMetricsOverview,
  fetchTopSkus,
  METRIC_RANGES,
  RANGE_LABELS,
  NO_VALUE,
  formatMoney,
  formatNumber,
  formatPercent,
  formatRelativeTime,
  formatDateRange,
  deltaRatio,
} from "./lib/metrics";
export type {
  MetricsRange,
  MetricTotals,
  MetricsCoverage,
  MetricsOverview,
  MetricsSeriesPoint,
  TopSku,
  TopSkuSort,
  TopSkusResult,
} from "./lib/metrics";

// Agent-usage API
export { fetchUsageActivity, fetchUsageSummary, describeTool } from "./lib/usage";
export type { UsageActivityRow, UsageSummary } from "./lib/usage";

// API keys (moved out of the brand apps — ConnectAiPage mints them)
export { listApiKeys, createApiKey, revokeApiKey } from "./lib/keys";
export type { ApiKey, MintedKey, McpClientConfigs } from "./lib/keys";

// MCP client catalog
export {
  MCP_CLIENTS,
  STARTER_PROMPTS,
  mcpClientById,
  defaultClientForAiChoice,
} from "./lib/mcp-clients";
export type { McpClient, McpClientId, McpClientStep, SnippetKind } from "./lib/mcp-clients";

// Layout + navigation
export { AppShell, PageContainer, PageHeader } from "./components/layout/AppShell";
export type { AppShellProps } from "./components/layout/AppShell";
export { SideNav, MobileNav } from "./components/nav/SideNav";
export type { NavItem, SideNavProps } from "./components/nav/SideNav";

// Surface + data-display primitives
export { Card, CardHeader, CardTitle, CardDescription, CardBody } from "./components/ui/Card";
export { Badge } from "./components/ui/Badge";
export { StatTile, Sparkline } from "./components/ui/StatTile";
export type { StatTileProps } from "./components/ui/StatTile";
export { TrendChart } from "./components/ui/TrendChart";
export type { TrendChartProps, TrendPoint } from "./components/ui/TrendChart";
export { CodeBlock } from "./components/ui/CodeBlock";
export { CopyButton } from "./components/ui/CopyButton";
export {
  Skeleton,
  StatRowSkeleton,
  EmptyState,
  ErrorState,
  CoverageNotes,
} from "./components/ui/feedback";
export {
  ChartIcon,
  PlugIcon,
  DatabaseIcon,
  KeyIcon,
  SettingsIcon,
  LifebuoyIcon,
  CheckIcon,
  SparkIcon,
  ExternalLinkIcon,
} from "./components/ui/icons";

// Dashboard pages
export { DashboardMetricsPage, useMetricsOverview } from "./pages/DashboardMetrics";
export type { DashboardMetricsPageProps } from "./pages/DashboardMetrics";
export { ConnectAiPage } from "./pages/ConnectAi";
export type { ConnectAiPageProps } from "./pages/ConnectAi";

// ─── VerifiedMargins (v0.8.0) ─────────────────────────────────────────

export {
  listProfiles,
  createProfile,
  fetchProfile,
  updateProfile,
  checkUsername,
  changeUsername,
  fetchConnectionOptions,
  linkConnection,
  unlinkConnection,
  setConnectionCogs,
  requestProfileSnapshot,
  fetchProfilePreview,
  fetchPublicProfile,
  uploadProfileAvatar,
  removeProfileAvatar,
  AVATAR_ACCEPT,
  AVATAR_MAX_BYTES,
  SELLER_TYPES,
  SOCIAL_FIELDS,
  VISIBILITY_FIELDS,
  WINDOW_OPTIONS,
} from "./lib/profiles";
export type { WindowKey,
  AvatarUploadResult,
  Profile,
  ProfileDetail,
  ProfileConnection,
  ConnectionOption,
  ProfileSettingsPatch,
  PublicProfile,
  PublicProfileMoved,
  CurrencyTotals,
  SellerType,
  SocialField,
  Socials,
  UsernameAvailability,
  Visibility,
  VisibilityField,
} from "./lib/profiles";

// ─── Amazon OAuth connect (v0.9.0) ────────────────────────────────────
//
// The popup dance, shared instead of copied a third time. Brand apps with
// their own working copy (dragonbot-frontend) can keep it; new surfaces
// use this one.

export {
  apiOrigin,
  openOAuthPopup,
  pollUntilClosed,
  providerLabel,
  readOAuthResult,
  startConnection,
} from "./lib/connections";
export type { ConnectProvider, OAuthResultMessage, StartConnectionResult } from "./lib/connections";

// Account verification (v0.9.0). NO_IDENTIFYING_INFO is exported because it
// is a promise the product makes, not decoration: a host app that restates it
// must restate THIS string, and the backend has a public-payload regression
// test that keeps the promise true
// (sellerconnect src/routes/public-profile-privacy.http.test.ts).
export {
  CALENDLY_URL,
  NO_IDENTIFYING_INFO,
  PrivacyPromise,
  VERIFY_TARGETS,
  VerifyAccountModal,
  VerifyAccountsSection,
} from "./components/verification/VerifyAccounts";
export type {
  VerifyAccountModalProps,
  VerifyAccountsSectionProps,
  VerifyMethod,
  VerifyTarget,
} from "./components/verification/VerifyAccounts";

export { ProfileSettingsPage } from "./pages/ProfileSettings";
export type { ProfileSettingsPageProps } from "./pages/ProfileSettings";
/* The verification badge and the ONE definition of the ladder it draws —
 * state, glyph and the hover explainer. Host pages import these instead of
 * re-deriving "which tier is green" locally; it had been copy-pasted four
 * times before this existed. */
export {
  VerificationBadge,
  verificationBadgeState,
  VERIFICATION_GLYPH,
  VERIFICATION_TIP,
} from "./components/VerificationBadge";
export type { VerificationBadgeState } from "./components/VerificationBadge";
export {
  PublicProfilePage,
  ShareButton,
  AMAZON_MARK_SRC,
  UNVERIFIED_MARGIN_TAG,
} from "./pages/PublicProfile";
export type { ProfileOwnerProps, PublicProfilePageProps } from "./pages/PublicProfile";
