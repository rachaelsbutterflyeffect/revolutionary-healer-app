// Quantum Dollars reward economy (renamed from "Quantum Cash"/"QCash" Aug 5,
// per Rachael -- "Quantum Dollars" reads more naturally spoken aloud and is
// easier for members to understand; the abbreviation "QD" replaces "QCash"
// in tight UI spots, full "Quantum Dollars" everywhere space allows). Before
// that it was "EnergyBucks" (Aug 3). Spec ref: SPEC.md §6 (monetization) +
// §8 (data model). Numbers unchanged from the Aug 3 design -- see
// step3-activation-products-reference.md for the full reasoning; only the
// name changed.
//
// Philosophy (Aug 5, Rachael's own words): Quantum Dollars are not a
// discount system -- they're earned by engaging with Revolutionary Healer
// and participating in your transformation (completing Methods, listening
// to Activations, integrating work, updating progress, completing
// programs), then redeemed for exclusive Unlocks. Every interaction should
// reinforce: transformation creates momentum, momentum creates opportunity,
// every shift earns something valuable.
//
// Pure, dependency-free derivation function -- easy to unit test, same
// pattern as lib/entitlements.js deriveEntitlement. Actual crediting happens
// in the Kajabi webhook handler (app/api/webhooks/route.ts) and an
// activations-completion endpoint (not built yet), not here -- this module
// only answers "given a balance, what can they do with it."

export const QUANTUM_DOLLARS_PER_ACTIVATION = 90; // earned per activation: purchased (Tier 1) or completed (Tier 2)
export const QUANTUM_DOLLARS_PER_PROGRAM = 250; // earned per Go Deeper program completed (Tier 2 only)

// Tier 1 spend mechanics (single-purchase members -- no bot access by default,
// Quantum Dollars are the only way in until they upgrade).
export const CHAT_PASS_COST = 10; // Quantum Dollars
export const CHAT_PASS_HOURS = 24;
export const ACTIVATION_CREDIT_PER_QUANTUM_DOLLAR = 0.10; // $ credit per Quantum Dollar toward their next $9 activation (90 QD = $9 = a free one)

// Step 3 of the 3 Step GAP Method ("Unlock Your Personalized Frequency
// Diagnostic," $9 -- see lib/processes.js FREQUENCY_DIAGNOSTIC_PRICE) bundles
// a bonus block of limited app access with the purchase. Same duration as the
// Quantum-Dollars-funded chat pass above, but granted as a purchase perk, not
// paid for out of a member's balance.
export const FREQUENCY_DIAGNOSTIC_BONUS_CHAT_HOURS = 24;

// Tier 2 milestone unlocks (Full Access members -- chat is already unlimited,
// so Quantum Dollars fund bigger, one-time rewards instead). NOT spent:
// balance keeps accumulating and these unlock once, permanently, when it
// crosses the threshold.
export const MOMENTUM_MANIFESTOR_THRESHOLD = 500;
export const MOMENTUM_MANIFESTOR_KAJABI_OFFER_ID = "2149064223"; // real, confirmed via Kajabi search Aug 3 -- normally $111
export const QUANTUM_RECODE_THRESHOLD = 1000;
// RESOLVED (Aug 4): this IS the same session as lib/programs.js
// QUANTUM_RECODE_SESSION / the old "Book 1-1"/"1-1 Session with Rachael"
// Kajabi offer (BOOK_1_1_URL in processes.js) -- Rachael's Go Deeper spec
// reframed that $555 direct-purchase link as "Quantum Recode Session." What's
// still TODO is the FREE path: once a member crosses 1000 saved Quantum
// Dollars, they need a way to redeem the same session without paying again
// (a no-charge booking link or coupon code) -- Rachael hasn't provided that
// redemption mechanism yet, hence this still being null.
export const QUANTUM_RECODE_KAJABI_OFFER_ID = null; // TODO(Rachael): no-charge redemption link/coupon for the loyalty-unlock path (the paid path is fully wired -- see lib/programs.js QUANTUM_RECODE_SESSION)

/**
 * Pure function: derive a member's Quantum Dollars/reward state from their
 * Members record fields (see SPEC.md §8 for the quantum_dollars /
 * chat_pass_expires_at / momentum_manifestor_unlocked / quantum_recode_unlocked
 * fields this expects).
 */
export function deriveQuantumDollarsState(memberFields, now = new Date()) {
  const balance = Number(memberFields?.quantum_dollars ?? 0);
  const chatPassExpiresAt = memberFields?.chat_pass_expires_at
    ? new Date(memberFields.chat_pass_expires_at)
    : null;
  const chatPassActive = Boolean(chatPassExpiresAt && chatPassExpiresAt.getTime() > now.getTime());

  return {
    quantumDollars: balance,
    chatPassActive,
    canRedeemChatPass: balance >= CHAT_PASS_COST,
    creditTowardNextActivation: Math.round(balance * ACTIVATION_CREDIT_PER_QUANTUM_DOLLAR * 100) / 100,
    momentumManifestorUnlocked:
      Boolean(memberFields?.momentum_manifestor_unlocked) || balance >= MOMENTUM_MANIFESTOR_THRESHOLD,
    quantumRecodeUnlocked:
      Boolean(memberFields?.quantum_recode_unlocked) || balance >= QUANTUM_RECODE_THRESHOLD,
  };
}
