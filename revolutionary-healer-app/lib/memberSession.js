// Signed member session for server-side identity. Issued only after a
// successful password login. The browser stores it in an HttpOnly cookie, so
// page scripts never see the token and it is not a new environment variable:
// the signature key is the existing AIRTABLE_API_KEY.

import crypto from "crypto";
import { normalizeTesterEmail } from "./testers.js";

export const MEMBER_SESSION_MS = 5 * 24 * 60 * 60 * 1000;
export const MEMBER_SESSION_COOKIE = "rh_session";

function secretFrom(env) {
    const secret = env && env.AIRTABLE_API_KEY;
    if (!secret || typeof secret !== "string") return "";
    return secret;
}

export function signMemberSession(email, env = process.env, now = Date.now()) {
    const secret = secretFrom(env);
    if (!secret) {
        throw new Error("AIRTABLE_API_KEY is required to sign a member session.");
    }
    const normalized = normalizeTesterEmail(email);
    if (!normalized || !normalized.includes("@")) {
        throw new Error("A member email is required to sign a session.");
    }
    const payload = { v: 1, email: normalized, iat: now, exp: now + MEMBER_SESSION_MS };
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const sig = crypto.createHmac("sha256", secret).update(`rh-session-v1.${body}`).digest("base64url");
    return `${body}.${sig}`;
}

export function verifyMemberSession(token, env = process.env, now = Date.now()) {
    if (!token || typeof token !== "string") return null;
    const secret = secretFrom(env);
    if (!secret) return null;
    const parts = token.split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    const expected = crypto.createHmac("sha256", secret).update(`rh-session-v1.${parts[0]}`).digest("base64url");
    const given = Buffer.from(parts[1]);
    const check = Buffer.from(expected);
    if (given.length !== check.length || !crypto.timingSafeEqual(given, check)) return null;
    let payload;
    try {
        payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    } catch {
        return null;
    }
    if (!payload || payload.v !== 1) return null;
    if (typeof payload.exp !== "number" || payload.exp <= now) return null;
    if (typeof payload.iat !== "number" || payload.iat > now + 60 * 1000) return null;
    const email = normalizeTesterEmail(payload.email);
    if (!email || !email.includes("@")) return null;
    return { email, exp: payload.exp, iat: payload.iat };
}

function cookieFlags(env, maxAge) {
    const parts = ["HttpOnly", "SameSite=Lax", "Path=/", `Max-Age=${maxAge}`];
    if (env && env.NODE_ENV === "production") parts.push("Secure");
    return parts.join("; ");
}

export function memberSessionCookie(token, env = process.env) {
    return `${MEMBER_SESSION_COOKIE}=${token}; ${cookieFlags(env, Math.floor(MEMBER_SESSION_MS / 1000))}`;
}

export function clearMemberSessionCookie(env = process.env) {
    return `${MEMBER_SESSION_COOKIE}=; ${cookieFlags(env, 0)}`;
}

export function tokenFromHeaders(headers) {
    const source = headers || {};
    const authorization = source.authorization || source.Authorization || "";
    if (typeof authorization === "string" && authorization.startsWith("Bearer ")) {
        return authorization.slice(7).trim();
    }
    const cookie = source.cookie || source.Cookie || "";
    if (typeof cookie !== "string" || !cookie) return "";
    const parts = cookie.split(";");
    for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed.startsWith(`${MEMBER_SESSION_COOKIE}=`)) {
            return decodeURIComponent(trimmed.slice(MEMBER_SESSION_COOKIE.length + 1));
        }
    }
    return "";
}
