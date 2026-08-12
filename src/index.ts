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

export const SHARED_PACKAGE_VERSION = "0.6.0";

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
