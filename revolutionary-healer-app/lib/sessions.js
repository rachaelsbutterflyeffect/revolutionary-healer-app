// Rolling 5-day server session. Mass re-login stays off until
// AUTH_SESSION_MIGRATION is exactly "on". Nothing here clears a browser.

import crypto from "crypto";
import { normalizeTesterEmail } from "./testers.js";

export const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;
export const ACCESS_MS = 30 * 60 * 1000;
export const REFRESH_GRACE_MS = 2 * 60 * 1000;
export const OWNER_EMAIL = "rachaelsbutterflyeffect@gmail.com";
export const ACCESS_COOKIE = "rh_access";
export const REFRESH_COOKIE = "rh_refresh";

export function migrationActive(env = process.env) {
    return String(env && env.AUTH_SESSION_MIGRATION || "").trim() === "on";
}

export function sessionSecret(env = process.env) {
    const secret = env && env.SESSION_SECRET;
    return typeof secret === "string" && Buffer.byteLength(secret) >= 32 ? secret : "";
}

export function hashRefreshToken(token) {
    return crypto.createHash("sha256").update(String(token)).digest("hex");
}

export function newRefreshToken() {
    return crypto.randomBytes(32).toString("base64url");
}

function sign(body, env) {
    return crypto.createHmac("sha256", sessionSecret(env)).update(body).digest("base64url");
}

export function signAccessToken(email, sessionId, env, now = Date.now()) {
    if (!sessionSecret(env)) throw new Error("SESSION_SECRET is required to sign a session.");
    const payload = { v: 1, email: normalizeTesterEmail(email), sid: sessionId, iat: now, exp: now + ACCESS_MS };
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${body}.${sign(`rh-access-v1.${body}`, env)}`;
}

export function verifyAccessToken(token, env, now = Date.now()) {
    if (!token || !sessionSecret(env)) return null;
    const parts = String(token).split(".");
    if (parts.length !== 2) return null;
    const expected = sign(`rh-access-v1.${parts[0]}`, env);
    const a = Buffer.from(parts[1]);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    let payload;
    try { payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")); } catch { return null; }
    if (!payload || payload.v !== 1 || payload.exp <= now) return null;
    const email = normalizeTesterEmail(payload.email);
    if (!email || !email.includes("@") || !payload.sid) return null;
    return { email, sessionId: payload.sid, exp: payload.exp };
}

function cookie(name, value, maxAge, env) {
    const parts = [`${name}=${value}`, "HttpOnly", "SameSite=Lax", "Path=/", `Max-Age=${maxAge}`];
    if (env && env.NODE_ENV === "production") parts.push("Secure");
    return parts.join("; ");
}

export function accessCookie(token, env = process.env) {
    return cookie(ACCESS_COOKIE, token, Math.floor(ACCESS_MS / 1000), env);
}

export function refreshCookie(token, env = process.env) {
    return cookie(REFRESH_COOKIE, token, Math.floor(FIVE_DAYS_MS / 1000), env);
}

export function clearSessionCookies(env = process.env) {
    return [cookie(ACCESS_COOKIE, "", 0, env), cookie(REFRESH_COOKIE, "", 0, env)];
}

export function readCookie(header, name) {
    const raw = header || "";
    for (const part of String(raw).split(";")) {
        const trimmed = part.trim();
        if (trimmed.startsWith(`${name}=`)) return decodeURIComponent(trimmed.slice(name.length + 1));
    }
    return "";
}

export function createSessionFamily(email, now = Date.now()) {
    const refreshToken = newRefreshToken();
    const sessionId = crypto.randomUUID();
    const familyId = crypto.randomUUID();
    return {
        tokens: { refreshToken, accessToken: null, sessionId },
        record: {
            sessionId,
            familyId,
            memberEmail: normalizeTesterEmail(email),
            version: 1,
            hashes: [{ hash: hashRefreshToken(refreshToken), current: true, expiresAt: now + FIVE_DAYS_MS }],
            refreshExpiresAt: now + FIVE_DAYS_MS,
            revokedAt: null,
            createdAt: now,
        },
    };
}

// Rotates a refresh token. A previous token inside the grace window rotates
// again and does not revoke the family, so a second tab or a retried request
// is not treated as theft. A previous token after that window revokes it.
export function rotateRefresh(record, presentedToken, now = Date.now()) {
    if (!record || record.revokedAt) return { ok: false, reason: "revoked" };
    if (record.refreshExpiresAt <= now) return { ok: false, reason: "expired" };
    const presented = hashRefreshToken(presentedToken);
    const known = (record.hashes || []).find((item) => item.hash === presented);
    if (!known) return { ok: false, reason: "unknown" };
    if (!known.current && known.expiresAt <= now) {
        return { ok: false, reason: "reuse", revoke: true };
    }
    const next = newRefreshToken();
    const hashes = (record.hashes || []).map((item) => (
        item.current ? { ...item, current: false, expiresAt: now + REFRESH_GRACE_MS } : item
    )).filter((item) => item.current || item.expiresAt > now);
    hashes.push({ hash: hashRefreshToken(next), current: true, expiresAt: now + FIVE_DAYS_MS });
    return {
        ok: true,
        refreshToken: next,
        record: {
            ...record,
            version: (record.version || 1) + 1,
            hashes: hashes.slice(-6),
            refreshExpiresAt: now + FIVE_DAYS_MS,
        },
    };
}

export function isOwnerEmail(email) {
    return normalizeTesterEmail(email) === OWNER_EMAIL;
}

export function createMemorySessionStore() {
    const rows = [];
    return {
        rows,
        async findByRefreshToken(token) {
            const hash = hashRefreshToken(token);
            return rows.find((row) => (row.hashes || []).some((item) => item.hash === hash)) || null;
        },
        async findBySessionId(sessionId) {
            return rows.find((row) => row.sessionId === sessionId) || null;
        },
        async insert(record) {
            rows.push({ ...record, hashes: record.hashes.map((item) => ({ ...item })) });
            return record;
        },
        async save(record) {
            const index = rows.findIndex((row) => row.sessionId === record.sessionId);
            if (index < 0) return false;
            if (rows[index].version !== record.version - 1 && rows[index].version !== record.version) {
                // Caller passes the already-incremented version. Reject if the stored
                // version is not the one this rotation started from.
            }
            if (rows[index].version !== (record.version - 1)) return false;
            rows[index] = { ...record, hashes: record.hashes.map((item) => ({ ...item })) };
            return true;
        },
        async revokeSession(sessionId, now) {
            const row = rows.find((item) => item.sessionId === sessionId);
            if (row) row.revokedAt = now;
        },
        async revokeEmail(email, now) {
            const normalized = normalizeTesterEmail(email);
            for (const row of rows) if (row.memberEmail === normalized) row.revokedAt = now;
        },
    };
}

export async function issueLoginSession(email, store, env, now = Date.now()) {
    if (!sessionSecret(env)) return null;
    const created = createSessionFamily(email, now);
    created.tokens.accessToken = signAccessToken(email, created.tokens.sessionId, env, now);
    await store.insert(created.record);
    return created.tokens;
}

export async function refreshLoginSession({ refreshToken, store, env, now, entitled }) {
    if (!sessionSecret(env)) return { ok: false, reason: "unconfigured" };
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const current = await store.findByRefreshToken(refreshToken);
        if (!current) return { ok: false, reason: "unknown" };
        const rotated = rotateRefresh(current, refreshToken, now);
        if (!rotated.ok) {
            if (rotated.revoke) await store.revokeSession(current.sessionId, now);
            return { ok: false, reason: rotated.reason };
        }
        if (entitled && !(await entitled(rotated.record.memberEmail))) {
            await store.revokeSession(current.sessionId, now);
            return { ok: false, reason: "entitlement" };
        }
        const saved = await store.save(rotated.record);
        if (!saved) continue;
        return {
            ok: true,
            email: rotated.record.memberEmail,
            sessionId: rotated.record.sessionId,
            refreshToken: rotated.refreshToken,
            accessToken: signAccessToken(rotated.record.memberEmail, rotated.record.sessionId, env, now),
            refreshExpiresAt: rotated.record.refreshExpiresAt,
        };
    }
    return { ok: false, reason: "conflict" };
}

export function logoutResponse({ failed, revoked }) {
    if (failed) {
        return {
            status: 503,
            clearCookies: false,
            body: {
                ok: false,
                revoked: false,
                code: "revoke_failed",
                error: "The server session was not revoked. This device can clear its saved sign-in and retry. The refresh cookie stays in the browser and is not shown.",
            },
        };
    }
    return { status: 200, clearCookies: true, body: { ok: true, revoked: revoked === true } };
}

export async function revokeRequestSession({ cookieHeader, store, env, now = Date.now() }) {
    const access = verifyAccessToken(readCookie(cookieHeader, ACCESS_COOKIE), env, now);
    const refreshToken = readCookie(cookieHeader, REFRESH_COOKIE);
    let revoked = false;
    if (access) {
        await store.revokeSession(access.sessionId, now);
        revoked = true;
    }
    if (refreshToken) {
        const row = await store.findByRefreshToken(refreshToken);
        if (row && !row.revokedAt) {
            await store.revokeSession(row.sessionId, now);
            revoked = true;
        } else if (row && row.revokedAt) {
            revoked = true;
        }
    }
    return { revoked, hadAccess: !!access, hadRefresh: !!refreshToken };
}

export function sessionStatus({ accessToken, refreshToken, env, now }) {
    const active = migrationActive(env);
    if (!active) return { migration: false, reauth: false };
    const access = verifyAccessToken(accessToken, env, now);
    if (access) return { migration: true, reauth: false, ok: true, email: access.email };
    if (refreshToken) return { migration: true, reauth: false, refresh: true };
    return { migration: true, reauth: true };
}
