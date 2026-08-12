// Read/derive access from Airtable.
// Spec ref: SPEC.md §7 ("Access & entitlement") and §6 (billing lesson from MoneyBot):
// entitlement is a set of flags (member_active, tier_active), never one tier field,
// and the higher tier is additive, not a replacement for base.
//
// THREE DIFFERENT TIME-BOXED ACCESS GRANTS -- do not conflate (Aug 6, revised Aug 10):
// 1. Free trial (below, trial_started_at/TRIAL_DAYS/TRIAL_CHAT_LIMIT): top-of-funnel,
//    no purchase, chat-limited, grants canUseBase only. Pre-existing.
// 2. GAP Method trial (gap_trial_started_at/GAP_TRIAL_DAYS below, renamed Aug 10 --
//    was "paid 3-day full-access trial" / PAID_TRIAL_DAYS / onPaidTrial): granted by
//    the $9 Step 3 purchase, not a signup. Unlimited chat (canUseBase), BUT as of
//    Aug 10 this NO LONGER grants canUseTier / the whole Activation Library. It now
//    only unlocks the 7 GAP Method activations (see GAP_METHOD_ACTIVATION_SLUGS in
//    lib/activations.js) via the new `unlockedActivationSlugs` field below. Rachael's
//    Aug 10 request: this trial should be scoped to the GAP Method content the member
//    actually purchased into, not the entire 29-day library. See SPEC.md §4.1c / §6
//    for the original funnel writeup (pre-Aug-10 behavior superseded by this change).
// 3. Beta membership (beta_member_started_at/BETA_MEMBER_DAYS below): NEW (Aug 6,
//    Rachael's Founding Beta request) -- granted by the $79 "Revolutionary Healer
//    App - Founding Beta (20 Spots)" Kajabi offer (offer id 2151324817). Grants
//    canUseTier (full library, unlimited chat) for a 6-month (180-day) term.
//    IMPORTANT: the underlying Kajabi course access this offer grants is
//    PERMANENT (Kajabi has no native "access expires after N days" field we could
//    set via the MCP tools) -- the 6-month cutoff is enforced ENTIRELY here, in
//    app-side entitlement logic, not by Kajabi revoking course access. After the
//    180 days, this flag simply stops granting canUseTier; the member still shows
//    up in Kajabi as having course access, which is expected and fine, since the
//    app is the actual gate. See step3-activation-products-reference.md's "Founding
//    Beta" section and SPEC.md §4.1h for the full writeup.
//
// RENAME (Aug 10): onPaidTrial -> onGapTrial, paidTrialExpired -> gapTrialExpired,
// paidTrialDaysRemaining -> gapTrialDaysRemaining, paid_trial_started_at (Airtable
// source field) -> gap_trial_started_at, PAID_TRIAL_DAYS (env var) -> GAP_TRIAL_DAYS.
// Grep the rest of the codebase for the old names before wiring up the Airtable field
// or any webhook that still writes paid_trial_started_at.

import { getMemberByEmail } from "./airtable.js";
import { GAP_METHOD_ACTIVATION_SLUGS } from "./activations.js";

const TRIAL_DAYS = Number(process.env.TRIAL_DAYS ?? 7);
const TRIAL_CHAT_LIMIT = Number(process.env.TRIAL_CHAT_LIMIT ?? 10);
const GAP_TRIAL_DAYS = Number(process.env.GAP_TRIAL_DAYS ?? 3);
const BETA_MEMBER_DAYS = Number(process.env.BETA_MEMBER_DAYS ?? 180);

/**
 * Pure function: derive entitlement from a Members record's fields.
 * Kept dependency-free so it's easy to unit test (see scripts/test-entitlements.mjs).
 */
export function deriveEntitlement(memberFields, now = new Date()) {
  if (!memberFields) {
    return {
      hasAccount: false,
      memberActive: false,
      tierActive: false,
      onTrial: false,
      trialExpired: false,
      trialChatsRemaining: 0,
      onGapTrial: false,
      gapTrialExpired: false,
      gapTrialDaysRemaining: 0,
      onBetaMembership: false,
      betaMembershipExpired: false,
      betaMembershipDaysRemaining: 0,
      canUseBase: false,
      canUseTier: false,
      unlockedActivationSlugs: [],
    };
  }

  const memberActive = Boolean(memberFields.member_active);
  const tierActive = Boolean(memberFields.tier_active);

  let onTrial = false;
  let trialExpired = false;
  let trialChatsRemaining = 0;

  if (!memberActive && memberFields.trial_started_at) {
    const startedAt = new Date(memberFields.trial_started_at);
    const ageDays = (now.getTime() - startedAt.getTime()) / (1000 * 60 * 60 * 24);
    trialExpired = ageDays > TRIAL_DAYS;
    onTrial = !trialExpired;
    trialChatsRemaining = Math.max(0, TRIAL_CHAT_LIMIT - Number(memberFields.chat_count ?? 0));
  }

  // GAP Method trial -- set by the Kajabi webhook when the member purchases
  // any of the 7 Step 3 $9 offers (see step3-activation-products-reference.md's
  // "3-Day Full Access Trial" section, name pending update there). Independent
  // of member_active/tier_active. AS OF AUG 10 this grants canUseBase (unlimited
  // chat) but NOT canUseTier -- it only scopes access to the 7 GAP Method
  // activations via unlockedActivationSlugs below, not the whole library.
  let onGapTrial = false;
  let gapTrialExpired = false;
  let gapTrialDaysRemaining = 0;

  if (!tierActive && memberFields.gap_trial_started_at) {
    const startedAt = new Date(memberFields.gap_trial_started_at);
    const ageDays = (now.getTime() - startedAt.getTime()) / (1000 * 60 * 60 * 24);
    gapTrialExpired = ageDays > GAP_TRIAL_DAYS;
    onGapTrial = !gapTrialExpired;
    gapTrialDaysRemaining = Math.max(0, Math.ceil(GAP_TRIAL_DAYS - ageDays));
  }

  // Founding Beta membership -- set by the Kajabi webhook when the member
  // purchases the $79 "Revolutionary Healer App - Founding Beta (20 Spots)"
  // offer. Independent of tierActive/onGapTrial so a Beta member reads as
  // fully entitled (canUseTier true) for 180 days from purchase, same shape
  // as the GAP trial derivation above but a much longer window.
  let onBetaMembership = false;
  let betaMembershipExpired = false;
  let betaMembershipDaysRemaining = 0;

  if (!tierActive && memberFields.beta_member_started_at) {
    const startedAt = new Date(memberFields.beta_member_started_at);
    const ageDays = (now.getTime() - startedAt.getTime()) / (1000 * 60 * 60 * 24);
    betaMembershipExpired = ageDays > BETA_MEMBER_DAYS;
    onBetaMembership = !betaMembershipExpired;
    betaMembershipDaysRemaining = Math.max(0, Math.ceil(BETA_MEMBER_DAYS - ageDays));
  }

  const canUseBase = memberActive || onGapTrial || onBetaMembership || (onTrial && trialChatsRemaining > 0);
  // Higher-tier content (the whole Activation Library) requires tier_active or an
  // active Beta membership. As of Aug 10 the GAP trial no longer grants this --
  // it only grants base (chat) access plus the 7 GAP Method activations below.
  const canUseTier = tierActive || onBetaMembership;

  // Aug 10: which activation slugs this member can play. "ALL" is a sentinel the
  // UI can check first (===) before ever consulting the list, for full/Beta
  // members who unlock the entire 29-day library. GAP trial members only get the
  // 7 GAP Method activations. Everyone else (free trial or no qualifying grant)
  // gets none -- chat/base features are all they have.
  let unlockedActivationSlugs;
  if (canUseTier) {
    unlockedActivationSlugs = "ALL";
  } else if (onGapTrial) {
    unlockedActivationSlugs = GAP_METHOD_ACTIVATION_SLUGS;
  } else {
    unlockedActivationSlugs = [];
  }

  return {
    hasAccount: true,
    memberActive,
    tierActive,
    onTrial,
    trialExpired,
    trialChatsRemaining,
    onGapTrial,
    gapTrialExpired,
    gapTrialDaysRemaining,
    onBetaMembership,
    betaMembershipExpired,
    betaMembershipDaysRemaining,
    canUseBase,
    canUseTier,
    unlockedActivationSlugs,
  };
}

// Aug 10 helper: does this entitlement unlock a given activation slug? "ALL" is
// the sentinel used by canUseTier members (full/Beta); otherwise checks
// membership in the scoped list (empty, or the 7 GAP Method slugs).
export function isActivationUnlocked(slug, entitlement) {
  return (
    entitlement.unlockedActivationSlugs === "ALL" ||
    entitlement.unlockedActivationSlugs.includes(slug)
  );
}

export async function getEntitlementForEmail(email) {
  const record = await getMemberByEmail(email);
  return {
    record,
    entitlement: deriveEntitlement(record?.fields, new Date()),
  };
}
