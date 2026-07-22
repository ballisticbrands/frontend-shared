// @ballisticbrands/frontend-shared — public entrypoint.
//
// v0.1.0: lib layer + brand context.

export const SHARED_PACKAGE_VERSION = "0.1.0";

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
