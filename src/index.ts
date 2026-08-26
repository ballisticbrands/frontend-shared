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
export const SHARED_PACKAGE_VERSION = "0.9.9";

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
} from "./lib/profiles";
export type {
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
export { PublicProfilePage } from "./pages/PublicProfile";
export type { ProfileOwnerProps, PublicProfilePageProps } from "./pages/PublicProfile";
