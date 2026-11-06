import { NextRequest, NextResponse } from "next/server";
import { createAirtableSessionStore } from "@/lib/sessionAirtable";
import { clearSessionCookies, revokeRequestSession } from "@/lib/sessions";

const store = createAirtableSessionStore();

export async function POST(req: NextRequest) {
    const now = Date.now();
    let revoked = false;
    let failed = false;
    try {
        const result = await revokeRequestSession({ cookieHeader: req.headers.get("cookie"), store, env: process.env, now });
        revoked = result.revoked;
    } catch (err) {
        failed = true;
        console.error("logout revoke failed", err);
    }
    const res = NextResponse.json(failed
        ? { ok: false, revoked: false, code: "revoke_failed", error: "The browser cookies were cleared. The server session may still exist until it expires." }
        : { ok: true, revoked }, { status: failed ? 503 : 200 });
    for (const cookie of clearSessionCookies(process.env)) res.headers.append("Set-Cookie", cookie);
    return res;
}
