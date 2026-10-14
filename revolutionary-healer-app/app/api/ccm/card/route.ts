// Clear Channel Method card: decide-and-log on app open, and outcome logging.
// Off (always { show: false }) unless CCM_TRACKING is on and CCM_CARD is not off.
// POST { email, midShift }               -> { show, impressionId?, activityDayCount?, reason }
// POST { email, action, impressionId }   -> action: x | not_now | tell_me_more
import { NextRequest, NextResponse } from "next/server";
import { normalizeEmail } from "@/lib/airtable";
import { isTester } from "@/lib/testers";
import {
  ccmCardEnabled, canShowCard, getCcmStatus, countActivityDays, recordCardShown, recordCardOutcome,
} from "@/lib/ccm-tracking";

export const dynamic = "force-dynamic";
const ACTIONS = ["x", "not_now", "tell_me_more"];

export async function POST(req: NextRequest) {
  if (!ccmCardEnabled()) return NextResponse.json({ show: false, reason: "off" });
  let body: any = {};
  try { body = await req.json(); } catch {}
  const email = normalizeEmail(body?.email);
  if (!email) return NextResponse.json({ error: "missing email" }, { status: 400 });
  try {
    if (body.action) {
      if (!ACTIONS.includes(body.action)) return NextResponse.json({ error: "bad action" }, { status: 400 });
      const activityDayCount = await countActivityDays(email);
      await recordCardOutcome(email, body.action, { impressionId: body.impressionId || undefined, activityDayCount });
      return NextResponse.json({ ok: true });
    }
    // Server-side mid-Shift signal is the client's (GAP Method™ dialog open);
    // missing = treat as mid-Shift, so the card never interrupts.
    const midShift = body.midShift !== false;
    const rec = await getCcmStatus(email);
    if (rec?.fields?.purchased) return NextResponse.json({ show: false, reason: "purchased" });
    const activityDayCount = await countActivityDays(email);
    const verdict = canShowCard(rec?.fields, { activityDayCount, midShift });
    if (!verdict.allowed) return NextResponse.json({ show: false, reason: verdict.reason, activityDayCount });
    const imp: any = await recordCardShown(email, { activityDayCount, isTest: isTester(email) });
    return NextResponse.json({ show: true, impressionId: imp?.id ?? null, activityDayCount, reason: "ok" });
  } catch (err: any) {
    console.error("ccm card failed", err?.message);
    return NextResponse.json({ show: false, reason: "error" });
  }
}
