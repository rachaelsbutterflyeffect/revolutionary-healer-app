import { NextRequest, NextResponse } from "next/server";
import { getEntitlementForEmail, hasSignInAccess } from "@/lib/entitlements";
import { createAirtableSessionStore } from "@/lib/sessionAirtable";
import {
    accessCookie, ensureAccess, migrationActive, refreshCookie, sessionBody,
} from "@/lib/sessions";

const store = createAirtableSessionStore();

function entitled(email: string) {
    return getEntitlementForEmail(email).then(({ entitlement }) => !!(
        hasSignInAccess(entitlement)
    ));
}

export async function GET(req: NextRequest) {
    const now = Date.now();
    const env = process.env;
    const migration = migrationActive(env);
    try {
        const ensured = await ensureAccess({ cookieHeader: req.headers.get("cookie"), store, env, now, entitled });
        const plan = sessionBody({ migration, ensured });
        const res = NextResponse.json(plan.body, { status: plan.status });
        if (plan.cookies && ensured.ok && ensured.accessToken && ensured.refreshToken) {
            res.headers.append("Set-Cookie", accessCookie(ensured.accessToken, env));
            res.headers.append("Set-Cookie", refreshCookie(ensured.refreshToken, env));
        }
        return res;
    } catch (err) {
        if (err && typeof err === "object" && "digest" in err && err.digest === "DYNAMIC_SERVER_USAGE") throw err;
        console.error("GET /api/auth/session failed", err);
        return NextResponse.json({ migration, reauth: false, ok: false, error: "Session store unavailable." }, { status: 503 });
    }
}
