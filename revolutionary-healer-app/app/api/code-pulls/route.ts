// POST /api/code-pulls : every Code Upgrade card pull is saved (Events row, type "code_pull") for members on the
// SAVE_SECTIONS exact list. Everyone else gets a 404 before anything is read or written. Existing table, no schema change.
import { NextRequest, NextResponse } from "next/server";
import { featureAllowed } from "@/lib/features";
import { logEvent, normalizeEmail } from "@/lib/airtable";
import { getEntitlementForEmail } from "@/lib/entitlements";
import { stampActivity, validateActivityEvent } from "@/lib/activity";
import { createAirtableActivityStore } from "@/lib/activityStore";
import { ACCESS_COOKIE, readCookie, verifyAccessToken } from "@/lib/sessions";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = normalizeEmail(body.email || "");
  if (!email || !featureAllowed("SAVE_SECTIONS", email) || /["'\\]/.test(email)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const cut = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  const name = cut(body.name, 120), card = cut(body.card, 120), code = cut(body.code, 40);
  if (!name || !card) return NextResponse.json({ error: "name and card are required" }, { status: 400 });
  const { record, entitlement } = await getEntitlementForEmail(email);
  if (!entitlement.canUseBase) return NextResponse.json({ error: "not entitled" }, { status: 403 });
  const ev: any = await logEvent("code_pull", { email, name, card, code }, record?.id);
  const deviceId = String(body.deviceId || "");
  const access = verifyAccessToken(readCookie(req.headers.get("cookie"), ACCESS_COOKIE), process.env, Date.now());
  const parsed = validateActivityEvent({ eventId: crypto.randomUUID(), deviceId, event: "code_pull", code, name, card });
  if (!parsed.error) {
    try {
      await createAirtableActivityStore().create(stampActivity(parsed.value, { now: Date.now(), email: access?.email, verified: !!access }));
    } catch (err) { console.error("code pull activity was not stored", err); }
  }
  return NextResponse.json({ id: ev.id });
}
