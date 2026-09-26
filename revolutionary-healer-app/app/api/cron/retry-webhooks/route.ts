// app/api/cron/retry-webhooks/route.ts
// Sept 26 (webhook-hardening request): runs on a schedule (see vercel.json)
// and retries any WebhookEvents row (lib/airtable.js) that failed Kajabi
// purchase processing, up to 3 total attempts, escalating to a human via
// sendOpsAlert (lib/email.js) once a row has failed 3 times. See
// app/api/webhooks/route.ts for how rows get into this table in the first
// place, and lib/airtable.js's processKajabiPurchase for the shared
// processing logic both routes call.
//
// IMPORTANT CAVEAT: Vercel Cron Jobs on the Hobby plan only support a
// MINIMUM interval of once per day -- the "*/5 * * * *" schedule in
// vercel.json will be silently coerced/rejected on Hobby. If this Vercel
// project is on the Hobby plan, Rachael needs either a Pro plan or an
// external cron trigger (e.g. cron-job.org hitting this route's URL with
// an "Authorization: Bearer <CRON_SECRET>" header) every 5 minutes for
// retries to actually run that often instead of once a day.
import { NextRequest, NextResponse } from "next/server";
import {
  listWebhookEventsDueForRetry,
  processKajabiPurchase,
  updateWebhookEvent,
} from "@/lib/airtable";
import { sendOpsAlert } from "@/lib/email";

// Vercel Cron sends "Authorization: Bearer <CRON_SECRET>" automatically on
// every invocation when a CRON_SECRET env var is set on the project (this is
// Vercel's own documented built-in cron protection) -- no secret needs to be
// embedded in vercel.json's cron path. An external trigger (see caveat
// above) must send the same header manually.
function verifyCronAuth(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const provided = req.headers.get("authorization");
  return provided === `Bearer ${expected}`;
}

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let due: any[] = [];
  try {
    due = await listWebhookEventsDueForRetry();
  } catch (err) {
    console.error("listWebhookEventsDueForRetry failed", err);
    return NextResponse.json({ error: "failed to list due webhook events" }, { status: 500 });
  }

  let retried = 0;
  let succeeded = 0;
  let alerted = 0;
  let stillFailing = 0;

  for (const row of due) {
    retried++;
    const f: any = row.fields ?? {};
    const email = f.email;
    const offerId = f.offer_id || undefined;
    const eventType = f.event_type || undefined;
    const currentAttempts = Number(f.attempt_count ?? 0);

    try {
      // Note: WebhookEvents rows don't store the buyer's first name, so
      // firstName is explicitly undefined here -- processKajabiPurchase
      // (lib/airtable.js) requires the key to be present (even if its value
      // is undefined) since it has no default value in its destructured
      // parameter, which TypeScript then infers as a required property.
      const result = await processKajabiPurchase({ email, firstName: undefined, offerId, eventType });
      await updateWebhookEvent(row.id, {
        outcome: result.outcome,
        member_record_id: result.memberRecordId,
      });
      succeeded++;
    } catch (err: any) {
      const errorMessage = String(err?.message ?? err);
      const newCount = currentAttempts + 1;

      if (newCount < 3) {
        await updateWebhookEvent(row.id, {
          attempt_count: newCount,
          error_message: errorMessage,
          next_retry_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        });
        stillFailing++;
      } else {
        // Final attempt exhausted -- stop retrying, escalate to a human.
        await updateWebhookEvent(row.id, {
          outcome: "alerted",
          attempt_count: 3,
          error_message: errorMessage,
        });
        alerted++;
        try {
          await sendOpsAlert({
            subject: "Webhook failed 3x -- buyer likely locked out",
            message:
              `A Kajabi purchase webhook has now failed 3 times and will not be retried automatically again.\n\n` +
              `Buyer email: ${email}\n` +
              `Offer id: ${offerId ?? "(none)"}\n` +
              `Purchase id: ${f.purchase_id}\n` +
              `Error: ${errorMessage}\n\n` +
              `This buyer probably needs the SAME manual fix that was done for ` +
              `mediumdr51@icloud.com: go into Airtable and manually create (or ` +
              `fix) their Members record so they're not locked out of the app.`,
          });
        } catch (alertErr) {
          console.error("sendOpsAlert failed", alertErr);
        }
      }
    }
  }

  return NextResponse.json({ ok: true, retried, succeeded, alerted, stillFailing });
}
