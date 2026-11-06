import { NextRequest, NextResponse } from "next/server";
import { createAirtableSessionStore } from "@/lib/sessionAirtable";
import { clearSessionCookies, logoutResponse, revokeRequestSession } from "@/lib/sessions";

const store = createAirtableSessionStore();

export async function POST(req: NextRequest) {
    const now = Date.now();
    let revoked = false;
    let failed = false;
    try {
        const result = await revokeRequestSession({ cookieHeader: req.headers.get("cookie"), store, env: process.env, now });
        revoked = result.revoked === true;
    } catch (err) {
        failed = true;
        console.error("logout revoke failed", err);
    }
    const outcome = logoutResponse({ failed, revoked });
    const res = NextResponse.json(outcome.body, { status: outcome.status });
    if (outcome.clearCookies) {
        for (const cookie of clearSessionCookies(process.env)) res.headers.append("Set-Cookie", cookie);
    }
    return res;
}
