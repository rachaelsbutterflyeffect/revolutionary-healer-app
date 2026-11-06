import { NextRequest, NextResponse } from "next/server";
import { getEntitlementForEmail } from "@/lib/entitlements";
import { createAirtableSessionStore } from "@/lib/sessionAirtable";
import {
    ACCESS_COOKIE, REFRESH_COOKIE, accessCookie,
    readCookie, refreshCookie, refreshLoginSession, sessionSecret, sessionStatus, verifyAccessToken,
} from "@/lib/sessions";

const store = createAirtableSessionStore();

function entitled(email: string) {
    return getEntitlementForEmail(email).then(({ entitlement }) => !!(
        entitlement.memberActive || entitlement.tierActive || entitlement.onBetaMembership || entitlement.onDlrhMembership
    ));
}

export async function GET(req: NextRequest) {
    const now = Date.now();
    const env = process.env;
    const cookie = req.headers.get("cookie");
    const status = sessionStatus({
        accessToken: readCookie(cookie, ACCESS_COOKIE),
        refreshToken: readCookie(cookie, REFRESH_COOKIE),
        env,
        now,
    });
    if (!status.migration) return NextResponse.json({ migration: false, reauth: false });
    if (!sessionSecret(env)) {
        return NextResponse.json({ migration: true, reauth: false, error: "SESSION_SECRET is not set." }, { status: 503 });
    }
    const access = verifyAccessToken(readCookie(cookie, ACCESS_COOKIE), env, now);
    if (access) return NextResponse.json({ migration: true, reauth: false, ok: true, email: access.email });
    const refreshToken = readCookie(cookie, REFRESH_COOKIE);
    if (!refreshToken) return NextResponse.json({ migration: true, reauth: true });
    try {
        const renewed = await refreshLoginSession({ refreshToken, store, env, now, entitled });
        if (!renewed.ok) return NextResponse.json({ migration: true, reauth: true });
        const res = NextResponse.json({ migration: true, reauth: false, ok: true, email: renewed.email });
        res.headers.append("Set-Cookie", accessCookie(renewed.accessToken, env));
        res.headers.append("Set-Cookie", refreshCookie(renewed.refreshToken, env));
        return res;
    } catch (err) {
        console.error("GET /api/auth/session failed", err);
        return NextResponse.json({ migration: true, reauth: false, error: "Session store unavailable." }, { status: 503 });
    }
}
