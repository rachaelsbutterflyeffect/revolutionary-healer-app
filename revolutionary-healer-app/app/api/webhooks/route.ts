// Kajabi (or Stripe) lifecycle -> Airtable entitlements. Spec ref: SPEC.md §6, §7.
// Decided platform per SPEC.md §6: Kajabi. Entitlement in Airtable is a set of flags
// (member_active, tier_active), never one tier field -- the higher tier is additive.
// Webhook handling must be idempotent (SPEC.md §12 risk: "Billing edge cases").
import { NextRequest, NextResponse } from "next/server";
import base, { Tables, getMemberByEmail } from "@/lib/airtable";

// Map of Kajabi offer IDs -> which Airtable flag they should set. Populate once
// Rachael's offers exist (SPEC.md §9 env vars: MEMBER_OFFER_IDS, TIER_OFFER_IDS).
const MEMBER_OFFER_IDS = (process.env.MEMBER_OFFER_IDS ?? "").split(",").filter(Boolean);
const TIER_OFFER_IDS = (process.env.TIER_OFFER_IDS ?? "").split(",").filter(Boolean);

// Added Aug 10: the GAP Method $9 offer starts the 3-day scoped trial that
// lib/entitlements.js's deriveEntitlement() reads via gap_trial_started_at
// (see GAP_TRIAL_DAYS there -- currently 3). Before this change, nothing in
// the codebase ever wrote this field, so the 3-day cutoff logic existed but
// could never actually fire. Set GAP_TRIAL_OFFER_IDS to the real Kajabi
// offer id for the $9 "GAP Method" checkout (see
// step3-activation-products-reference.md's "GAP Method $9 Checkout"
// section) once it's confirmed/published.
const GAP_TRIAL_OFFER_IDS = (process.env.GAP_TRIAL_OFFER_IDS ?? "").split(",").filter(Boolean);

// TODO(Quantum Dollars): this handler only flips member_active/tier_active today.
// Per the reward economy in lib/quantumDollars.js + SPEC.md, a purchase of one of
// the $9 archetype activation offers should also increment the member's
// quantum_dollars field by QUANTUM_DOLLARS_PER_ACTIVATION. Needs an offer-id -> "this
// is an activation purchase, not a membership" mapping (separate from
// MEMBER_OFFER_IDS/TIER_OFFER_IDS above) once Rachael confirms the activation
// offer IDs to watch for.

function verifyKajabiSignature(req: NextRequest, rawBody: string): boolean {
  // TODO: implement Kajabi's actual signature scheme once webhook docs/secret are
  // confirmed with Rachael's Kajabi account. Never process an unverified webhook
  // in production.
  const secret = process.env.KAJABI_WEBHOOK_SECRET;
  return Boolean(secret);
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  if (!verifyKajabiSignature(req, rawBody)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(rawBody);
  const email: string | undefined = event?.member_email ?? event?.email;
  const offerId: string | undefined = event?.offer_id;
  const eventType: string | undefined = event?.event_type; // e.g. "purchase", "cancellation"

  if (!email) {
    return NextResponse.json({ error: "no member email in payload" }, { status: 400 });
  }

  const isMemberOffer = offerId ? MEMBER_OFFER_IDS.includes(offerId) : true;
  const isTierOffer = offerId ? TIER_OFFER_IDS.includes(offerId) : false;
  const isGapTrialOffer = offerId ? GAP_TRIAL_OFFER_IDS.includes(offerId) : false;
  const isCancellation = eventType === "cancellation" || eventType === "refund";

  const existing = await getMemberByEmail(email);
  const fields: Record<string, any> = {};

  if (isMemberOffer) fields.member_active = !isCancellation;
  if (isTierOffer) fields.tier_active = !isCancellation;

  // Start the 3-day GAP trial clock exactly once. Idempotent on purpose --
  // Kajabi (like most webhook senders) can retry/redeliver the same purchase
  // event, and re-stamping this on every retry would silently extend the
  // member's 3 days each time it fires. Only write it the first time we see
  // this member with no existing gap_trial_started_at value. Not touched on
  // cancellation/refund -- a 3-day trial is short enough that clawing it back
  // isn't worth the complexity, matches how the free trial (trial_started_at)
  // already behaves.
  if (isGapTrialOffer && !isCancellation && !existing?.fields?.gap_trial_started_at) {
    fields.gap_trial_started_at = new Date().toISOString();
  }

  if (existing) {
    await base(Tables.Members).update(existing.id, fields);
  } else {
    await base(Tables.Members).create({ email, member_active: !isCancellation, ...fields });
  }

  return NextResponse.json({ ok: true });
}
