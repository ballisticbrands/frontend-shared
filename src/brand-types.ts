// Shape of a brand config. Each consumer app provides one at boot
// via configureShared({ brand }); shared code reads via useBrand()
// in components or getSharedConfig().brand in plain functions.

export interface BrandConfig {
  /** Stable identifier — matches the backend's src/lib/brand.ts entry. */
  id: string;
  /** Public app hostname this brand is served from. */
  appHost: string;
  /** Full app origin (protocol + host, no trailing slash). Used as the
   *  `return_to` param when starting SP-API / Ads OAuth so the callback
   *  bounces the seller back to THIS brand's app. */
  appOrigin: string;
  /** Header label. DragonBot uses "getDragonBot.com"; Dragon Refunds
   *  uses "Dragon Refunds". */
  headerLabel: string;
  /** Short brand name for HTML <title> and greetings. */
  displayName: string;
  /** Meta description for the HTML head. */
  metaDescription: string;
  /** Where users can email us with support questions. */
  supportEmail: string;
  /** GA4 measurement ID for this brand. */
  ga4MeasurementId: string;
  /** Microsoft Clarity project ID for this brand. */
  clarityId: string;
  /** postMessage type the backend sends after OAuth. Kept the same
   *  across brands for now — it's just a namespace to distinguish our
   *  messages, brand differentiation is meaningless here. */
  oauthMessageType: string;
}
