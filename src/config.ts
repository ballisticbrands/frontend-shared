// Module-level singleton holding the runtime config a consumer app
// must provide at boot. Non-hook code (attribution helpers, fetch
// wrapper) reads brand + apiUrl from here; React components can
// alternately read brand via useBrand().
//
// Call configureShared({...}) ONCE at the top of main.tsx BEFORE
// anything else in this library runs. If you forget, the first
// shared function to touch config throws — no silent misconfig.

import type { BrandConfig } from "./brand-types";

export interface SharedConfig {
  /** Origin of the shared backend, no trailing slash. */
  apiUrl: string;
  /** The active brand for this deployment. */
  brand: BrandConfig;
}

let cfg: SharedConfig | null = null;

export function configureShared(opts: SharedConfig): void {
  cfg = {
    apiUrl: opts.apiUrl.replace(/\/$/, ""),
    brand: opts.brand,
  };
}

export function getSharedConfig(): SharedConfig {
  if (!cfg) {
    throw new Error(
      "@ballisticbrands/frontend-shared: configureShared({ apiUrl, brand }) must be called at boot before any shared function runs.",
    );
  }
  return cfg;
}
