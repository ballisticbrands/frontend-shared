/**
 * The verification badge, and the single definition of the ladder it draws.
 *
 * 🚨 THIS EXISTS BECAUSE THE LADDER WAS COPY-PASTED FOUR TIMES — here, and in
 * three separate VerifiedMargins pages, each with its own `badgeState` and its
 * own glyph map. Four copies of "which tier is green" on the one product whose
 * entire claim is that its badges mean something exactly. Import from here.
 *
 * The rungs:
 *
 *   verified_margin   check  data-state="verified"   revenue AND costs checked
 *   verified_revenue  half   data-state="partial"    revenue checked, margin modelled
 *   everything else   ring   data-state="estimated"  nothing checked
 *
 * 🚨 SHAPE AND WORD CARRY THE DISTINCTION, NOT COLOUR (VerifiedMargins
 * BRANDING.md §5). The glyph steps filled → half → empty and the label states
 * the tier in words, so the ladder survives a greyscale screenshot and a
 * colour-blind reader. Colour is the third channel, never the only one, and
 * the COLOURS themselves are the host's to choose — this file names states, not
 * hexes, so a brand that defines no amber degrades to an unfilled pill rather
 * than to a wrong one.
 */

export type VerificationBadgeState = "verified" | "partial" | "estimated";

/** Which rung a tier sits on. Anything unrecognised falls to the bottom —
 *  a tier we do not know is not a tier we may vouch for. */
export function verificationBadgeState(tier: string): VerificationBadgeState {
  if (tier === "verified_margin") return "verified";
  if (tier === "verified_revenue") return "partial";
  return "estimated";
}

/** Filled → half → empty. The shape says it without the colour. */
export const VERIFICATION_GLYPH: Record<VerificationBadgeState, string> = {
  verified: "✓",
  partial: "◑",
  estimated: "○",
};

/**
 * One short sentence per rung, shown on hover.
 *
 * BRANDING.md §5: "A badge never appears without its explainer within reach —
 * a tooltip, or a link to the 'what's the difference' copy. A badge that can't
 * be interrogated is decoration." This is that explainer, everywhere the badge
 * appears away from the page that explains it in full.
 *
 * DELIBERATELY NOT the API's `verification.description`. That field is two
 * sentences written for a profile header with room to breathe, and it is not
 * carried on the per-business payload at all — only `{ tier, label }` is. A
 * tooltip that has to be read in the second before the pointer moves gets its
 * own copy, kept to one line.
 *
 * ⚠️ Says what was CHECKED, never how good the business is. A thin margin we
 * verified is still `verified`; the badge has never been a rating.
 */
export const VERIFICATION_TIP: Record<VerificationBadgeState, string> = {
  verified:
    "Revenue and cost of goods were both checked. This margin is verified, not modelled.",
  partial:
    "Revenue comes straight from Amazon. The margin is modelled from a cost percentage the seller supplied, so it is not verified.",
  estimated: "Nothing on this card was checked against Amazon.",
};

/**
 * `tip` defaults ON. The one place it is turned OFF is
 * /how-verification-works, where the page IS the explanation and a tooltip
 * repeating a paragraph the reader is already looking at is noise.
 */
export function VerificationBadge({
  verification,
  tip = true,
}: {
  verification: { tier: string; label: string };
  tip?: boolean;
}) {
  const state = verificationBadgeState(verification.tier);
  return (
    <span data-badge="" data-state={state} data-tip={tip ? VERIFICATION_TIP[state] : undefined}>
      {VERIFICATION_GLYPH[state]} {verification.label}
    </span>
  );
}
