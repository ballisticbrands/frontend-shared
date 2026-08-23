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

export const SHARED_PACKAGE_VERSION = "0.8.0";

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

// Magic login links (v0.6.0)
export { MagicLoginPage } from "./pages/MagicLogin";

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
  fetchProfilePreview,
  fetchPublicProfile,
  SELLER_TYPES,
  SOCIAL_FIELDS,
  VISIBILITY_FIELDS,
} from "./lib/profiles";
export type {
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

export { ProfileSettingsPage } from "./pages/ProfileSettings";
export type { ProfileSettingsPageProps } from "./pages/ProfileSettings";
export { PublicProfilePage } from "./pages/PublicProfile";
export type { PublicProfilePageProps } from "./pages/PublicProfile";
