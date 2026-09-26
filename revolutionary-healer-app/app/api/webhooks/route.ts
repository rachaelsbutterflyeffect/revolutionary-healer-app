// Kajabi (or Stripe) lifecycle -> Airtable entitlements. Spec ref: SPEC.md §6, §7.
// Decided platform per SPEC.md §6: Kajabi. Entitlement in Airtable is a set of flags
// (member_active, tier_active), never one tier field -- the higher tier is additive.
// Webhook handling must be idempotent (SPEC.md §12 risk: "Billing edge cases").
//
// Sept 26 (webhook-hardening request): a real buyer paid via Kajabi and the
// purchase webhook silently never created her Airtable Members record -- she
// was locked out with no alert to anyone. Every inbound webhook is now logged
// to the WebhookEvents table (lib/airtable.js), keyed by an idempotency key
// (purchaseId), so:
//   - a duplicate delivery of an already-successfully-processed event is a
//     safe no-op, and
//   - a failure is never silent: it's recorded with outcome "failed" and
//     retried automatically by app/api/cron/retry-webhooks/route.ts, which
//     escalates to a human via sendOpsAlert (lib/email.js) after 3 failed
//     attempts (outcome "alerted").
// The actual Members-upsert / GAP Method logic that used to live inline here
// now lives in lib/airtable.js's processKajabiPurchase(), so the retry cron
// can call the exact same code path without duplicating it.
//
// This route ALWAYS returns 200 to Kajabi, even when OUR OWN processing
// fails, because Kajabi's retry behavior on a non-200 response is
// undocumented/unknown -- we own retries ourselves via the cron job, so
// returning a 500 here would just add an unpredictable variable on top of a
// problem we already handle deliberately.
import { NextRequest, NextResponse } from "next/server";
import {
  normalizeEmail,
  processKajabiPurchase,
  getWebhookEventByPurchaseId,
  createWebhookEvent,
  updateWebhookEvent,
} from "@/lib/airtable";

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
// MEMBER_OFFER_IDS/TIER_OFFER_IDS, now in lib/airtable.js) once Rachael confirms the
// activation offer IDs to watch for.

function verifyKajabiSignature(req: NextRequest, rawBody: string): boolean {
  // Kajabi's outbound Purchase Created / Payment Succeeded / Cart Purchase
  // webhooks are NOT signed (confirmed against Kajabi's own webhook docs --
  // no HMAC/signature header is sent). The practical way to authenticate an
  // unsigned webhook is a shared secret baked into the URL Kajabi is
  // configured to POST to (e.g. .../api/webhooks?secret=xxxx), which Kajabi
  // sends back verbatim on every call since it just hits the configured URL.
  // Set KAJABI_WEBHOOK_SECRET in Vercel and use that exact value as the
  // ?secret= query param when pasting the Purchase Webhook URL into Kajabi
  // (Sales -> Offers -> offer -> "..." -> Webhooks -> Purchase Webhook URL).
  const expected = process.env.KAJABI_WEBHOOK_SECRET;
  if (!expected) return false;
  const provided = req.nextUrl.searchParams.get("secret");
  return provided === expected;
}

export async function POST(req: NextRequest) {
  let rawBody = "";
  try {
    rawBody = await req.text();

    if (!verifyKajabiSignature(req, rawBody)) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }

    const event = JSON.parse(rawBody);
    // Real Kajabi Purchase Created webhook shape (per Kajabi's outbound webhook
    // docs): { id, offer: { id, title }, member: { id, email, name,
    // first_name, last_name }, ... }. Old flat fallbacks kept in case a
    // different webhook type (e.g. Payment Succeeded) sends a similar shape.
    const emailRaw: string | undefined = event?.member?.email ?? event?.member_email ?? event?.email;
    // Normalize once, here, and use ONLY this value everywhere below -- the
    // raw payload's casing can differ from what the buyer later types
    // signing in (lib/airtable.js's normalizeEmail is what getMemberByEmail /
    // the login route already key off of).
    const email = normalizeEmail(emailRaw);
    const firstName: string | undefined = event?.member?.first_name ?? event?.first_name;
    const offerIdRaw: string | number | undefined = event?.offer?.id ?? event?.offer_id;
    const offerId: string | undefined = offerIdRaw != null ? String(offerIdRaw) : undefined;
    // Purchase Created webhooks only ever represent a purchase -- Kajabi does
    // not send a cancellation/refund signal on this webhook type. event_type
    // is kept as an optional override in case a different Kajabi webhook
    // (with its own shape) is later pointed at this same endpoint.
    const eventType: string | undefined = event?.event_type;

    if (!email) {
      return NextResponse.json({ error: "no member email in payload" }, { status: 400 });
    }

    // Idempotency key: prefer Kajabi's own purchase/event id; fall back to a
    // deterministic synthetic key (plain string concatenation, not a hash --
    // kept simple and readable for debugging in Airtable) so idempotency
    // still holds even if a payload ever omits an id.
    const purchaseId: string = String(
      event?.id ?? event?.purchase?.id ?? `${email}:${offerId ?? "unknown"}:${eventType ?? "purchase"}`
    );

    let existingEvent: any = null;
    try {
      existingEvent = await getWebhookEventByPurchaseId(purchaseId);
    } catch (err) {
      console.error("getWebhookEventByPurchaseId failed", err);
    }

    if (
      existingEvent &&
      (existingEvent.fields?.outcome === "created" || existingEvent.fields?.outcome === "already_existed")
    ) {
      // Duplicate delivery of an already-successfully-processed event --
      // never reprocess a purchase Kajabi (or a flaky network) redelivers.
      return NextResponse.json({ ok: true, idempotent: true });
    }

    try {
      const result = await processKajabiPurchase({ email, firstName, offerId, eventType });

      try {
        if (existingEvent) {
          await updateWebhookEvent(existingEvent.id, {
            outcome: result.outcome,
            member_record_id: result.memberRecordId,
            email,
            offer_id: offerId ?? "",
            event_type: eventType ?? "",
          });
        } else {
          await createWebhookEvent({
            purchaseId,
            email,
            offerId,
            eventType,
            outcome: result.outcome,
            memberRecordId: result.memberRecordId,
            attemptCount: 1,
            rawPayload: rawBody,
          });
        }
      } catch (logErr) {
        // Processing succeeded but logging that success failed -- log to
        // console and move on. This must never turn a successful purchase
        // into a failed-looking webhook response.
        console.error("Failed to log successful WebhookEvents row", logErr);
      }

      return NextResponse.json({ ok: true });
    } catch (err: any) {
      const errorMessage = String(err?.message ?? err);
      console.error("processKajabiPurchase failed", errorMessage);

      try {
        if (existingEvent) {
          await updateWebhookEvent(existingEvent.id, {
            outcome: "failed",
            attempt_count: (existingEvent.fields?.attempt_count ?? 0) + 1,
            error_message: errorMessage,
            next_retry_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            raw_payload: rawBody,
          });
        } else {
          await createWebhookEvent({
            purchaseId,
            email,
            offerId,
            eventType,
            outcome: "failed",
            attemptCount: 1,
            errorMessage,
            rawPayload: rawBody,
          });
        }
      } catch (logErr) {
        // This is the scenario the whole system exists to prevent: a real
        // purchase failed AND we couldn't even log the failure. Console log
        // is the last line of defense here.
        console.error(
          "Failed to log FAILED WebhookEvents row -- this purchase may go unnoticed until manually checked",
          logErr
        );
      }

      // Always 200: we own retries via the cron job, not Kajabi's own
      // (unknown) retry behavior -- see file header comment.
      return NextResponse.json({ ok: true, loggedFailure: true });
    }
  } catch (outerErr) {
    // Outermost safety net -- something unexpected happened (e.g. malformed
    // JSON before we even got to processing). Never let this route throw:
    // our own alerting/retry system depends on it always accepting the
    // delivery from Kajabi.
    console.error("Unexpected error in webhook route", outerErr);
    return NextResponse.json({ ok: true, loggedFailure: true });
  }
}
