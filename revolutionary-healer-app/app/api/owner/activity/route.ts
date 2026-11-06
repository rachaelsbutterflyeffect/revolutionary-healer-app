import { NextRequest, NextResponse } from "next/server";
import { buildOwnerReport, memberTimeline } from "@/lib/activity";
import { createAirtableActivityStore, legacySample } from "@/lib/activityStore";
import { ACCESS_COOKIE, isOwnerEmail, readCookie, verifyAccessToken } from "@/lib/sessions";

const store = createAirtableActivityStore();

export async function GET(req: NextRequest) {
    const access = verifyAccessToken(readCookie(req.headers.get("cookie"), ACCESS_COOKIE), process.env, Date.now());
    if (!access || !isOwnerEmail(access.email)) {
        return NextResponse.json({ error: "Owner sign-in required.", code: "owner_auth" }, { status: 401 });
    }
    const from = req.nextUrl.searchParams.get("from") || "";
    const to = req.nextUrl.searchParams.get("to") || "";
    const member = req.nextUrl.searchParams.get("member") || "";
    const includeTesters = req.nextUrl.searchParams.get("testers") === "1";
    const includeUnverified = req.nextUrl.searchParams.get("unverified") === "1";
    try {
        const scanned = await store.list({ from, to, limit: 200 } as { from?: string; to?: string; limit?: number });
        const report = buildOwnerReport(scanned.rows, { from, to, now: Date.now(), includeTesters, includeUnverified });
        const timeline = member ? memberTimeline(scanned.rows, member) : [];
        const scan = { cap: scanned.cap, truncated: scanned.truncated, complete: scanned.complete === true };
        let legacy = null;
        try { legacy = await legacySample(); } catch (err) { legacy = { label: "Existing chat and favorite rows could not be read.", error: true }; }
        return NextResponse.json({ ...report, scan, timeline, legacy, owner: access.email });
    } catch (err) {
        console.error("GET /api/owner/activity failed", err);
        return NextResponse.json({ error: "Activity report is unavailable.", code: "activity_storage_unavailable" }, { status: 503 });
    }
}
