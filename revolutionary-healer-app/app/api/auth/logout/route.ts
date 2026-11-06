import { NextRequest, NextResponse } from "next/server";
import { createAirtableSessionStore } from "@/lib/sessionAirtable";
import { ACCESS_COOKIE, clearSessionCookies, readCookie, verifyAccessToken } from "@/lib/sessions";

const store = createAirtableSessionStore();

export async function POST(req: NextRequest) {
    const now = Date.now();
    const access = verifyAccessToken(readCookie(req.headers.get("cookie"), ACCESS_COOKIE), process.env, now);
    if (access) {
        try { await store.revokeSession(access.sessionId, now); } catch (err) {
            console.error("logout revoke failed", err);
        }
    }
    const res = NextResponse.json({ ok: true });
    for (const cookie of clearSessionCookies(process.env)) res.headers.append("Set-Cookie", cookie);
    return res;
}
