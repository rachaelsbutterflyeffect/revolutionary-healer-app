// GAP Method distortion registry + activation routing table (Sept, GAP
// Method distortion/routing upgrade -- Rachael's approved spec).
//
// WHY THIS FILE EXISTS: the old system routed Step 3's recommended
// activation from a fixed, 1:1 Divine-Identity -> activation table (see the
// retired DIVINE_IDENTITY_RECOMMENDATION_TABLE that used to live in
// lib/processes.js). That meant two members with the same Divine Identity
// but completely different Step 2 conversations always got the same
// activation -- the identity was being treated as the verdict instead of a
// starting frame. It also depended on the model's free-text activation name
// either matching an invisible [[OPEN_ACTIVATION]] marker (proven unreliable
// in testing -- 0 successful emissions across 5+ clean end-to-end tests) or
// appearing verbatim in the visible Step 3 reply (impossible for Healer,
// whose activation was never a single fixed name -- see the old
// `recommendationLanguage` prose on the healer entry in
// lib/divineIdentities.js).
//
// NEW MODEL: the AI privately detects 2-4 distortions from the FIXED
// registry below, evidenced in what the member actually said in Steps 1-2
// (see lib/processes.js's GAP_METHOD_SCRIPT_MEMBER), plus a coarse topic
// signal, and emits them as an invisible marker. app/api/chat/route.ts then
// validates those names against DISTORTION_REGISTRY and looks up the actual
// activation via DISTORTION_ROUTING + the topic-gating rules below -- in
// CODE, never trusted from the model's own activation-name text. This is
// the same reasoning Rachael gave for the old SUB_ACTIVATION marker (healer
// only) -- generalized here to all identities and made fully validate-able.
//
// NEVER SILENTLY DEFAULT (Rachael's explicit rule): every function here that
// can fail (bad distortion name, empty list, no eligible activation) returns
// a clear invalid/null result rather than guessing -- app/api/chat/route.ts
// is responsible for re-prompting once and then surfacing a visible,
// honest error to the member if validation still fails. Nothing in this
// file ever picks a "close enough" fallback on its own.

import { getActivationBySlug, getGapMethodActivationBySlug } from "./activations.js";

// The 16 distortions Step 2 evidence can point to. Names must match
// byte-for-byte everywhere they're used -- in this file, in the
// lib/processes.js prompt text, and in the model's [[DISTORTIONS: ...]]
// marker. Retired names ("Hiddenness", "Money Limitation", "Gift
// Uncertainty") must never appear here -- "Hiddenness" is renamed to "Fear
// of Being Seen" everywhere it used to live (see lib/divineIdentities.js and
// lib/processes.js).
export const DISTORTION_REGISTRY = [
  "Over-Responsibility",
  "Doubt",
  "Channel Interference",
  "Control / Gripping",
  "Restriction",
  "Disconnection",
  "External Confirmation",
  "Comparison",
  "Receiving",
  "Fear of Consequence",
  "Over-analysis",
  "Misalignment",
  "Scarcity / Not Enough",
  "Fear of Being Seen",
  "Intuitive Confusion",
  "Leadership Contraction",
];

const DISTORTION_SET = new Set(DISTORTION_REGISTRY);

// Natural-language phrasing bank (Rachael's voice) for each distortion --
// used only in the Step 3 prompt so Claude can render the reveal in warm,
// human language instead of ever naming the registry label itself. Modeled
// on the tone of DIVINE_IDENTITIES' `recommendationLanguage` /
// `highestLeverageShift` prose and the cross-identity gating guardrails
// already written in lib/activationGuide.js (e.g. "Doubt is a current
// pattern, not an identity trait."). These are examples for the model to
// draw from and adapt to the member's own words -- not a script to recite
// verbatim every time.
export const NATURAL_LANGUAGE_PHRASING = {
  "Over-Responsibility":
    "you've been carrying more than was ever actually yours to carry",
  "Doubt":
    "you know what you know, and then a few minutes later you've talked yourself out of it",
  "Channel Interference":
    "there's static between what you're receiving and how clearly you're able to trust and translate it",
  "Control / Gripping":
    "you're gripping the outcome so tightly that you're squeezing out the very flow you're trying to create",
  "Restriction":
    "part of you is still keeping the door only cracked open instead of letting the fullness of this in",
  "Disconnection":
    "you've drifted from the deeper part of yourself this all is meant to flow through",
  "External Confirmation":
    "you're waiting for permission or proof from outside yourself before you'll actually move",
  "Comparison":
    "you keep measuring your process against everyone else's instead of trusting your own",
  "Receiving":
    "you're wired to give, and it's genuinely hard for you to let something come back to you",
  "Fear of Consequence":
    "some part of you is bracing for what might go wrong if you actually go for it",
  "Over-analysis":
    "you're thinking your way around something that's actually asking to be felt and moved through",
  "Misalignment":
    "there's a mismatch between what you're doing day to day and what's actually true for you",
  "Scarcity / Not Enough":
    "there's a quiet belief running that there won't be enough, so you hold on tighter than you need to",
  "Fear of Being Seen":
    "you're willing to be seen, and then you find a way to pull back right as the visibility starts to build",
  "Intuitive Confusion":
    "you can't quite tell what's your intuition and what's just noise in your head",
  "Leadership Contraction":
    "you shrink your presence right when it's time to actually step up and lead",
};

// ---------------------------------------------------------------------------
// Distortion -> activation candidate routing (exact table from Rachael's
// approved spec). Values are ACTIVATIONS/GAP_METHOD_ACTIVATIONS slugs, not
// display titles -- resolved to real registry entries below, never guessed
// or fuzzy-matched. Order matters: earlier entries are preferred as the
// PRIMARY pick when multiple candidates are eligible.
//
// Slug source notes (checked against lib/activations.js Sept upgrade):
// - "Removing the Frequency of Doubt" and "Freedom Timeline Activation"
//   exist only in GAP_METHOD_ACTIVATIONS (gap-method-wayshower /
//   gap-method-creator) -- there is no separate ACTIVATIONS-library entry.
// - "Expansion Activation" (plain, day 9, slug "expansion-activation") is a
//   DIFFERENT activation from gap-method-leader's "Expansion Activation:
//   Become Visible & Seen As You Expand Your Light" (confirmed by a prior
//   audit). Restriction and Leadership Contraction route to the plain
//   library one -- Fear of Being Seen has its own dedicated Visibility
//   Activation instead, so the visibility-specific Expansion variant isn't
//   needed here.
// - "Creator Within Activation", "More Than Enough Activation", and
//   "Visibility Activation" did not exist in lib/activations.js before this
//   upgrade -- added as new ACTIVATIONS entries (see that file's Sept
//   comment) with placeholder Wistia IDs flagged for Rachael to replace.
export const DISTORTION_ROUTING = {
  "Over-Responsibility": ["pink-cloud-activation", "nervous-system-recalibration"],
  "Doubt": ["confidence-activation", "impact-vibe-booster", "gap-method-wayshower"],
  "Channel Interference": ["clearing-activation", "protection-shielding", "activating-your-channel-to-spirit"],
  "Control / Gripping": ["nervous-system-recalibration", "creator-within-activation"],
  "Restriction": ["expansion-activation", "gap-method-creator"],
  "Disconnection": ["remembrance-activation", "alignment-activation"],
  "External Confirmation": ["intuition-activation", "activating-your-gifts", "gap-method-wayshower"],
  "Comparison": ["clearing-activation", "light-frequency-activation", "emerging-your-soul-into-your-business"],
  "Receiving": ["sacred-bowl-activation", "magnetic-field-activation", "more-than-enough-activation"],
  "Fear of Consequence": [
    "grounding",
    "protection-shielding",
    "pink-cloud-activation",
    "lifting-you-higher-activation",
    "timeline-collapse-activation",
    "nervous-system-recalibration",
  ],
  "Over-analysis": ["grounding", "10-min-earth-star-activation"],
  "Misalignment": ["alignment-activation"],
  "Scarcity / Not Enough": ["crystal-business-activation", "magnetic-field-activation", "more-than-enough-activation"],
  "Fear of Being Seen": ["visibility-activation"],
  "Intuitive Confusion": ["intuition-activation", "activating-your-channel-to-spirit", "gap-method-wayshower"],
  "Leadership Contraction": [
    "expansion-activation",
    "yes-factor-vibe-booster",
    "impact-vibe-booster",
    "leadership-recode-activation",
  ],
};

// ---------------------------------------------------------------------------
// TOPIC GATING (hard rules, enforced in code -- never left to a prompt
// instruction alone). The model self-reports a coarse topic via
// [[TOPIC: money_business|general]] alongside its [[DISTORTIONS: ...]]
// marker; this is intentionally a 2-value signal (not the full focus-area
// taxonomy) to keep the model's job simple and the happy path reliable.
export const VALID_TOPICS = ["money_business", "general"];

// Money/business-only activations (Rachael's spec): only eligible when the
// Step 2 conversation was actually about money/business.
const MONEY_BUSINESS_ONLY_SLUGS = new Set([
  "crystal-business-activation",
  "emerging-your-soul-into-your-business",
  "more-than-enough-activation",
]);

// Magnetic Field Activation is deliberately NOT in the set above -- per spec
// it's broader (money, business, manifestation, visibility, or love/
// attraction conversations) and is never restricted by the money/business-
// only gate, so it's treated as eligible regardless of the 2-value topic
// signal.
const MAGNETIC_FIELD_SLUG = "magnetic-field-activation";

// Never recommend, under any circumstance, in any topic -- retired Aug 15
// per Rachael's explicit request. Must never appear in DISTORTION_ROUTING
// above; this set is a second, independent guard so a future edit to that
// table can't silently reintroduce it.
const NEVER_RECOMMEND_SLUGS = new Set(["spirit-connection-activation"]);

function isEligibleForTopic(slug, topic) {
  if (NEVER_RECOMMEND_SLUGS.has(slug)) return false;
  if (slug === MAGNETIC_FIELD_SLUG) return true;
  if (MONEY_BUSINESS_ONLY_SLUGS.has(slug)) return topic === "money_business";
  return true;
}

// Rule 3 of the spec: Scarcity / Not Enough detected in a NON-money
// conversation routes to Magnetic Field Activation instead of the
// money-gated options (Crystal Business / More Than Enough) -- applied here
// rather than relying on isEligibleForTopic alone, since otherwise a
// non-money Scarcity conversation with no other distortion could fail to
// find any eligible candidate at all.
function candidatesForDistortion(distortion, topic) {
  const base = DISTORTION_ROUTING[distortion] || [];
  if (distortion === "Scarcity / Not Enough" && topic !== "money_business") {
    return [MAGNETIC_FIELD_SLUG];
  }
  return base.filter((slug) => isEligibleForTopic(slug, topic));
}

// ---------------------------------------------------------------------------
// VALIDATION (never silently default -- see file header). Both functions
// return { valid: false } rather than throwing or guessing, so
// app/api/chat/route.ts can decide whether to re-prompt or show a visible
// error.

/**
 * Parses and validates a raw "[[DISTORTIONS: ...]]" marker payload -- a
 * comma-separated list of 2-4 names that must match DISTORTION_REGISTRY
 * byte-for-byte (aside from surrounding whitespace). Order is preserved --
 * the model is instructed to list the most-evidenced distortion first, and
 * that order drives which one becomes the PRIMARY activation pick.
 */
export function validateDistortionList(raw) {
  if (!raw || typeof raw !== "string") return { valid: false, distortions: [] };
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const deduped = [...new Set(parts)];
  if (deduped.length < 2 || deduped.length > 4) return { valid: false, distortions: [] };
  const allValid = deduped.every((name) => DISTORTION_SET.has(name));
  if (!allValid) return { valid: false, distortions: [] };
  return { valid: true, distortions: deduped };
}

/** Parses and validates a raw "[[TOPIC: ...]]" marker payload. */
export function validateTopic(raw) {
  const topic = (raw || "").trim().toLowerCase();
  if (!VALID_TOPICS.includes(topic)) return { valid: false, topic: null };
  return { valid: true, topic };
}

/**
 * Picks 1 primary + 1 optional secondary activation slug from a validated,
 * ordered list of 2-4 distortions and a validated topic. Returns null (never
 * a guess) if not even the primary distortion has any topic-eligible
 * candidate -- per spec this should be effectively unreachable today since
 * every DISTORTION_ROUTING entry has at least one always-eligible
 * candidate, but app/api/chat/route.ts treats a null result the same as a
 * failed marker validation rather than assuming it can't happen.
 */
export function pickActivations(distortions, topic) {
  let primarySlug = null;
  let primaryDistortion = null;
  for (const distortion of distortions) {
    const candidates = candidatesForDistortion(distortion, topic);
    if (candidates.length) {
      primarySlug = candidates[0];
      primaryDistortion = distortion;
      break;
    }
  }
  if (!primarySlug) return null;

  let secondarySlug = null;
  for (const distortion of distortions) {
    if (distortion === primaryDistortion) continue;
    const candidates = candidatesForDistortion(distortion, topic).filter((slug) => slug !== primarySlug);
    if (candidates.length) {
      secondarySlug = candidates[0];
      break;
    }
  }

  return { primarySlug, primaryDistortion, secondarySlug };
}

/**
 * Resolves an activation slug (from either ACTIVATIONS or
 * GAP_METHOD_ACTIVATIONS in lib/activations.js) to its member-facing display
 * title, for use in Shift records and the Step 3 reveal. Returns null for an
 * unknown slug rather than a placeholder string.
 */
export function getActivationTitleForSlug(slug) {
  const activation = getActivationBySlug(slug) || getGapMethodActivationBySlug(slug);
  return activation ? activation.title : null;
}
