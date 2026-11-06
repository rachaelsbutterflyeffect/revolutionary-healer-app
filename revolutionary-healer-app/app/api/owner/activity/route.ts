import { NextRequest, NextResponse } from "next/server";
import { projectReport, reportRangeError } from "@/lib/activity";
import { readReportCursor, signReportCursor } from "@/lib/activityCursor";
import { createAirtableActivityStore, legacySample } from "@/lib/activityStore";
import { ACCESS_COOKIE, isOwnerEmail, readCookie, sessionSecret, verifyAccessToken } from "@/lib/sessions";

const store = createAirtableActivityStore();

async function readReport(req: NextRequest) {
    const access = verifyAccessToken(readCookie(req.headers.get("cookie"), ACCESS_COOKIE), process.env, Date.now());
    if (!access || !isOwnerEmail(access.email)) {
        return NextResponse.json({ error: "Owner sign-in required.", code: "owner_auth" }, { status: 401 });
    }
    const secret = sessionSecret(process.env);
    if (!secret) {
        return NextResponse.json({ error: "SESSION_SECRET is not set.", code: "session_unconfigured" }, { status: 503 });
    }
    let from = req.nextUrl.searchParams.get("from") || "";
    let to = req.nextUrl.searchParams.get("to") || "";
    let member = req.nextUrl.searchParams.get("member") || "";
    let includeTesters = req.nextUrl.searchParams.get("testers") === "1";
    let includeUnverified = req.nextUrl.searchParams.get("unverified") === "1";
    let token = req.nextUrl.searchParams.get("cursor") || "";
    if (req.method === "POST") {
        let body: any = {};
        try { body = await req.json(); } catch { body = {}; }
        from = String(body.from || from);
        to = String(body.to || to);
        member = String(body.member || member);
        includeTesters = body.testers === true || body.testers === "1" || includeTesters;
        includeUnverified = body.unverified === true || body.unverified === "1" || includeUnverified;
        token = String(body.cursor || token);
    }
    const rangeError = reportRangeError(from, to);
    if (rangeError) return NextResponse.json({ error: rangeError, code: "date_range_required", ready: false }, { status: 400 });
    let accumulated: any[] = [];
    let cursor = null;
    if (token) {
        const payload = readReportCursor(token, secret);
        if (!payload || payload.from !== from || payload.to !== to || payload.testers !== includeTesters || payload.unverified !== includeUnverified || payload.member !== member) {
            return NextResponse.json({ error: "The report continuation does not match this request.", code: "bad_cursor", ready: false }, { status: 400 });
        }
        accumulated = payload.rows;
        cursor = payload.cursor;
    }
    try {
        const page = await store.listPage({ from, to, cursor, pageSize: 100 });
        const projected = projectReport([...accumulated, ...page.rows], {
            done: !page.nextCursor,
            from,
            to,
            now: Date.now(),
            includeTesters,
            includeUnverified,
            member,
        });
        if (!projected.ready) {
            let nextCursor = "";
            try {
                nextCursor = signReportCursor({
                    v: 1,
                    from,
                    to,
                    testers: includeTesters,
                    unverified: includeUnverified,
                    member,
                    cursor: page.nextCursor,
                    rows: projected.rows,
                }, secret);
            } catch (err: any) {
                if (err?.code === "report_cursor_limit") {
                    return NextResponse.json({
                        ready: false,
                        code: "report_cursor_limit",
                        error: "This date range has more rows than one exact continuation can carry. Split the dates. Airtable has no transaction and no unique event id, so a stored running total can lose or double a count. A separate database is not being added.",
                    }, { status: 413 });
                }
                throw err;
            }
            return NextResponse.json({ ...projected.body, scan: { ...projected.body.scan, complete: false, nextCursor } });
        }
        let legacy = null;
        try { legacy = await legacySample(); } catch { legacy = { label: "Existing chat and favorite rows could not be read.", error: true }; }
        return NextResponse.json({ ...projected.body, legacy, owner: access.email });
    } catch (err) {
        console.error("owner activity report failed", err);
        return NextResponse.json({ error: "Activity report is unavailable.", code: "activity_storage_unavailable", ready: false }, { status: 503 });
    }
}

export async function GET(req: NextRequest) {
    return readReport(req);
}

export async function POST(req: NextRequest) {
    return readReport(req);
}
