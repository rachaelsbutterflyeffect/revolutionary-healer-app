// Kajabi (or Stripe) lifecycle -> Airtable entitlements. Spec ref: SPEC.md §6, §7.
// Decided platform per SPEC.md §6: Kajabi. Entitlement in Airtable is a set of flags
// (member_active, tier_active), never one tier field -- the higher tier is additive.
// Webhook handling must be idempotent (SPEC.md §12 risk: "Billing edge cases").
import { NextRequest, NextResponse } from "next/server";
import base, {
  Tables,
  getMemberByEmail,
  upsertGapMethodResultOnPurchase,
  linkGapMethodResultToMember,
} from "@/lib/airtable";

// Map of Kajabi offer IDs -> which Airtable flag they should set. Populate once
// Rachael's offers exist (SPEC.md §9 env vars: MEMBER_OFFER_IDS, TIER_OFFER_IDS).
const MEMBER_OFFER_IDS = (process.env.MEMBER_OFFER_IDS ?? "").split(",").filter(Boolean);
const TIER_OFFER_IDS = (process.env.TIER_OFFER_IDS ?? "").split(",").filter(Boolean);

// GAP Method offer(s) -- Aug 12, Rachael's GAP Method persistence instruction.
// Defaults to the live $9 GAP Method offer id so this works even before
// Rachael adds the env var in Vercel; add more offer ids to
// GAP_METHOD_OFFER_IDS (comma-separated) if she ever creates additional GAP
// Method offers.
const GAP_METHOD_OFFER_IDS = (process.env.GAP_METHOD_OFFER_IDS ?? "2151330100").split(",").filter(Boolean);

// RETIRED (Aug 12, Rachael's explicit instruction): the $9 GAP Method offer no
// longer auto-grants a 3-day Full Access trial. Buyers move through the 3-step
// diagnostic for free (already paid via the $9 purchase itself); Step 3's CTA now
// sends them to a separate Kajabi sales landing page to buy Full Access ($30/mo or
// $347/yr) instead of unlocking a trial. GAP_TRIAL_DAYS / onGapTrial /
// gap_trial_started_at remain defined in lib/entitlements.js for backward
// compatibility with any already-granted trials, but nothing writes that field
// anymore, so no new $9 purchase will ever start one. GAP_TRIAL_OFFER_IDS env var
// is no longer read here -- safe to leave set or remove from Vercel, it's inert.

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
    const isGapMethodOffer = offerId ? GAP_METHOD_OFFER_IDS.includes(offerId) : false;
    const isCancellation = eventType === "cancellation" || eventType === "refund";

  const existing = await getMemberByEmail(email);
    const fields: Record<string, any> = {};

  if (isMemberOffer) fields.member_active = !isCancellation;
    if (isTierOffer) fields.tier_active = !isCancellation;

  let memberRecordId: string;
  if (existing) {
        await base(Tables.Members).update(existing.id, fields);
    memberRecordId = existing.id;
  } else {
        const created = await base(Tables.Members).create({ email, member_active: !isCancellation, ...fields });
    memberRecordId = created.id;
  }

  // GAP Method persistence (Aug 12, Rachael's GAP Method persistence
  // instruction): backend, zero-action capture -- the moment someone buys the
  // $9 GAP Method offer, record their email + purchase against a
  // GapMethodResults row (email-normalized) before they've done anything else.
  // This is independent of member_active/tier_active above -- the GAP Method
  // offer is not itself a membership offer.
  if (isGapMethodOffer && !isCancellation) {
        await upsertGapMethodResultOnPurchase({ email, offerId });
  }

  // Auto-link (Aug 12): if this event is a real membership/tier purchase (Full
  // Access), and this email already has a GAP Method Results row from an
  // earlier $9 purchase, link it to the permanent member record now so My
  // Revolution can surface the existing Shift without re-running Steps 1-2.
  if ((isMemberOffer || isTierOffer) && !isCancellation) {
        await linkGapMethodResultToMember(email, memberRecordId);
  }

  return NextResponse.json({ ok: true });
}
