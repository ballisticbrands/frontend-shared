// React context that exposes the resolved BrandConfig to every
// component in the tree.
//
// Consumer pattern:
//
//   const brand = useBrand();
//   return <h1>Welcome to {brand.displayName}</h1>;
//
// Non-React code (utility functions, event handlers outside a
// component tree) should read via getSharedConfig().brand instead.
// Both point at the same value the consumer provided at boot.

import { createContext, useContext, type ReactNode } from "react";
import type { BrandConfig } from "./brand-types";

const BrandContext = createContext<BrandConfig | null>(null);

export function BrandProvider({
  brand,
  children,
}: {
  brand: BrandConfig;
  children: ReactNode;
}) {
  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}

export function useBrand(): BrandConfig {
  const brand = useContext(BrandContext);
  if (!brand) {
    throw new Error("useBrand() must be called from a component wrapped in <BrandProvider>");
  }
  return brand;
}
