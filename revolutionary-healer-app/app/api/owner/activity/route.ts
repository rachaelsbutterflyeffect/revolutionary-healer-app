import { NextRequest, NextResponse } from "next/server";
import { projectReport, reportRangeError } from "@/lib/activity";
import { readReportCursor, signReportCursor } from "@/lib/activityCursor";
import { createAirtableActivityStore, legacySample } from "@/lib/activityStore";
import { getEntitlementForEmail } from "@/lib/entitlements";
import { createAirtableSessionStore } from "@/lib/sessionAirtable";
import { accessCookie, ensureAccess, isOwnerEmail, refreshCookie, sessionSecret } from "@/lib/sessions";

const store = createAirtableActivityStore();
const sessions = createAirtableSessionStore();

function entitled(email: string) {
    return getEntitlementForEmail(email).then(({ entitlement }) => !!(
        entitlement.memberActive || entitlement.tierActive || entitlement.onBetaMembership || entitlement.onDlrhMembership
    ));
}

async function readReport(req: NextRequest) {
    const env = process.env;
    const now = Date.now();
    let ensured;
    try {
        ensured = await ensureAccess({ cookieHeader: req.headers.get("cookie"), store: sessions, env, now, entitled });
    } catch (err) {
        if (err && typeof err === "object" && "digest" in err && err.digest === "DYNAMIC_SERVER_USAGE") throw err;
        console.error("owner session refresh failed", err);
        return NextResponse.json({ error: "Session store unavailable.", code: "session_storage_unavailable" }, { status: 503 });
    }
    const finish = (res: NextResponse) => {
        if (ensured.renewed && ensured.accessToken && ensured.refreshToken) {
            res.headers.append("Set-Cookie", accessCookie(ensured.accessToken, env));
            res.headers.append("Set-Cookie", refreshCookie(ensured.refreshToken, env));
        }
        return res;
    };
    if (!ensured.ok || !isOwnerEmail(ensured.email)) {
        return finish(NextResponse.json({ error: "Owner sign-in required.", code: "owner_auth", signIn: "/?next=/owner" }, { status: 401 }));
    }
    const secret = sessionSecret(env);
    if (!secret) {
        return finish(NextResponse.json({ error: "SESSION_SECRET is not set.", code: "session_unconfigured" }, { status: 503 }));
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
    if (rangeError) return finish(NextResponse.json({ error: rangeError, code: "date_range_required", ready: false }, { status: 400 }));
    let accumulated: any[] = [];
    let cursor = null;
    if (token) {
        const payload = readReportCursor(token, secret);
        if (!payload || payload.from !== from || payload.to !== to || payload.testers !== includeTesters || payload.unverified !== includeUnverified || payload.member !== member) {
            return finish(NextResponse.json({ error: "The report continuation does not match this request.", code: "bad_cursor", ready: false }, { status: 400 }));
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
                    return finish(NextResponse.json({
                        ready: false,
                        code: "report_cursor_limit",
                        error: "This date range has more rows than one exact continuation can carry. Split the dates. Airtable has no transaction and no unique event id, so a stored running total can lose or double a count. A separate database is not being added.",
                    }, { status: 413 }));
                }
                throw err;
            }
            return finish(NextResponse.json({ ...projected.body, scan: { ...projected.body.scan, complete: false, nextCursor } }));
        }
        let legacy = null;
        try { legacy = await legacySample(); } catch { legacy = { label: "Existing chat and favorite rows could not be read.", error: true }; }
        return finish(NextResponse.json({ ...projected.body, legacy, owner: ensured.email }));
    } catch (err) {
        console.error("owner activity report failed", err);
        return finish(NextResponse.json({ error: "Activity report is unavailable.", code: "activity_storage_unavailable", ready: false }, { status: 503 }));
    }
}

export async function GET(req: NextRequest) {
    return readReport(req);
}

export async function POST(req: NextRequest) {
    return readReport(req);
}
