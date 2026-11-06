import { NextRequest, NextResponse } from "next/server";
import { BATCH_GAP_MS, BATCH_LIMIT, stampActivity, validateActivityEvent } from "@/lib/activity";
import { createAirtableActivityStore } from "@/lib/activityStore";
import { readCookie, ACCESS_COOKIE, verifyAccessToken } from "@/lib/sessions";

const store = createAirtableActivityStore();
const lastBatch = new Map<string, number>();

export async function POST(req: NextRequest) {
    let body: any = null;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
    const events = Array.isArray(body?.events) ? body.events.slice(0, BATCH_LIMIT) : [];
    if (!events.length) return NextResponse.json({ error: "No events." }, { status: 400 });
    const deviceId = String(events[0]?.deviceId || "");
    const now = Date.now();
    const previous = lastBatch.get(deviceId) || 0;
    if (deviceId && now - previous < BATCH_GAP_MS) {
        return NextResponse.json({ error: "Slow down.", code: "rate_limited" }, { status: 429 });
    }
    const access = verifyAccessToken(readCookie(req.headers.get("cookie"), ACCESS_COOKIE), process.env, now);
    const saved = [];
    try {
        for (const input of events) {
            const parsed = validateActivityEvent(input);
            if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
            if (parsed.value.deviceId !== events[0].deviceId) {
                return NextResponse.json({ error: "Mixed devices." }, { status: 400 });
            }
            const row = stampActivity(parsed.value, { now, email: access?.email, verified: !!access });
            saved.push(await store.create(row));
        }
    } catch (err) {
        console.error("POST /api/activity failed", err);
        return NextResponse.json({ error: "Activity was not stored.", code: "activity_storage_unavailable" }, { status: 503 });
    }
    if (deviceId) lastBatch.set(deviceId, now);
    return NextResponse.json({ ok: true, stored: saved.length, verified: !!access });
}
