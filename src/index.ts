// @ballisticbrands/frontend-shared — public entrypoint.
//
// v0.2.0: adds auth-flow UI on top of v0.1.x's lib + brand context.

export const SHARED_PACKAGE_VERSION = "0.3.0";

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
  signOut,
  requestPasswordReset,
  verifyEmail,
  resendVerification,
} from "./auth";
export type {
  VerifyEmailSuccess,
  VerifyEmailFailure,
  ResendVerificationResult,
} from "./auth";

// Attribution
export {
  captureAttribution,
  readAttribution,
  identifyUserAcrossPlatforms,
  tagClarityIdentity,
  trackAccountConnected,
} from "./attribution";
export type { Attribution } from "./attribution";

// UI primitives (v0.2.0)
export { Button } from "./components/Button";
export { Input, Label } from "./components/Input";
export { Turnstile } from "./components/Turnstile";
export { VerifyEmailBanner } from "./components/VerifyEmailBanner";

// Pages (v0.2.0)
export { VerifyEmailPage } from "./pages/VerifyEmail";
export { ForgotPasswordPage } from "./pages/ForgotPassword";

// Auth form hooks (v0.3.0)
export { useSignUpForm } from "./hooks/useSignUpForm";
export type { UseSignUpFormReturn } from "./hooks/useSignUpForm";
export { useSignInForm } from "./hooks/useSignInForm";
export type { UseSignInFormReturn } from "./hooks/useSignInForm";
