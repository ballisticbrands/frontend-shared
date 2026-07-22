// @ballisticbrands/frontend-shared — public entrypoint.
//
// Every symbol consumers can import must appear here (re-exported from
// its module). Anything not re-exported is an internal implementation
// detail — freely rearrangeable across versions.
//
// v0.0.1 is intentionally empty: proves the build + publish pipeline
// end-to-end before any real code is moved. Actual extraction lands
// in v0.1.0 (lib layer) and v0.2.0 (auth-flow UI).

export const SHARED_PACKAGE_VERSION = "0.0.1";
