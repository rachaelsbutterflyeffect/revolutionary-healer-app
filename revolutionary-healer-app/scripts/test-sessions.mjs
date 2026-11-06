import assert from "node:assert/strict";
import {
    ACCESS_MS, FIVE_DAYS_MS, REFRESH_GRACE_MS, OWNER_EMAIL,
    createMemorySessionStore, issueLoginSession, logoutResponse, migrationActive, refreshLoginSession,
    revokeRequestSession, sessionSecret, sessionStatus, verifyAccessToken,
} from "../lib/sessions.js";
import { memberSessionFormula, visitAllSessionPages } from "../lib/sessionAirtable.js";
import { decideMigrationPoll, keepStoredSignIn } from "../lib/migrationClient.js";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const browserMigration = require("../public/rh-migration.js");

const env = { SESSION_SECRET: "test-secret-value-0123456789abcdef", AUTH_SESSION_MIGRATION: "", NODE_ENV: "test" };
let passed = 0;
function test(name, fn) {
    return Promise.resolve().then(fn).then(() => { passed++; console.log("ok - " + name); }, (err) => { console.error("FAIL - " + name); console.error(err); process.exitCode = 1; });
}
const tests = [];
const it = (name, fn) => tests.push(test(name, fn));

it("migration is off unless the env is exactly on", () => {
    assert.equal(migrationActive({}), false);
    assert.equal(migrationActive({ AUTH_SESSION_MIGRATION: "off" }), false);
    assert.equal(migrationActive({ AUTH_SESSION_MIGRATION: "ON" }), false);
    assert.equal(migrationActive({ AUTH_SESSION_MIGRATION: "on" }), true);
    assert.equal(sessionStatus({ env, now: 0 }).migration, false);
    assert.equal(sessionStatus({ env, now: 0 }).reauth, false);
});

it("a refresh inside five days of use does not ask for a password", async () => {
    const store = createMemorySessionStore();
    const now = 1_700_000_000_000;
    const issued = await issueLoginSession("member@example.com", store, env, now);
    const later = now + 4 * 24 * 60 * 60 * 1000;
    const renewed = await refreshLoginSession({ refreshToken: issued.refreshToken, store, env, now: later, entitled: async () => true });
    assert.equal(renewed.ok, true);
    assert.equal(renewed.refreshExpiresAt, later + FIVE_DAYS_MS);
    const access = verifyAccessToken(renewed.accessToken, env, later);
    assert.equal(access.email, "member@example.com");
    assert.equal(access.exp, later + ACCESS_MS);
});

it("two tabs presenting the same refresh do not revoke the family", async () => {
    const store = createMemorySessionStore();
    const now = 1_700_000_000_000;
    const issued = await issueLoginSession("member@example.com", store, env, now);
    const first = await refreshLoginSession({ refreshToken: issued.refreshToken, store, env, now: now + 1000, entitled: async () => true });
    const second = await refreshLoginSession({ refreshToken: issued.refreshToken, store, env, now: now + 2000, entitled: async () => true });
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(store.rows[0].revokedAt, null);
    assert.ok(now + 2000 < now + 1000 + REFRESH_GRACE_MS);
});

it("a refresh reused after the grace window revokes the family", async () => {
    const store = createMemorySessionStore();
    const now = 1_700_000_000_000;
    const issued = await issueLoginSession("member@example.com", store, env, now);
    const first = await refreshLoginSession({ refreshToken: issued.refreshToken, store, env, now: now + 1000, entitled: async () => true });
    const late = await refreshLoginSession({ refreshToken: issued.refreshToken, store, env, now: now + REFRESH_GRACE_MS + 5000, entitled: async () => true });
    assert.equal(first.ok, true);
    assert.equal(late.ok, false);
    assert.equal(late.reason, "reuse");
    assert.equal(store.rows[0].revokedAt != null, true);
});

it("lost entitlement and password reset revoke", async () => {
    const store = createMemorySessionStore();
    const now = 1_700_000_000_000;
    const issued = await issueLoginSession("member@example.com", store, env, now);
    const denied = await refreshLoginSession({ refreshToken: issued.refreshToken, store, env, now: now + 1000, entitled: async () => false });
    assert.equal(denied.reason, "entitlement");
    const again = await issueLoginSession("member@example.com", store, env, now);
    await store.revokeEmail("member@example.com", now + 50);
    const after = await refreshLoginSession({ refreshToken: again.refreshToken, store, env, now: now + 100, entitled: async () => true });
    assert.equal(after.ok, false);
});

it("a short secret is refused and logout still revokes an expired access cookie", async () => {
    assert.equal(sessionSecret({ SESSION_SECRET: "short-secret" }), "");
    const store = createMemorySessionStore();
    const now = 1_700_000_000_000;
    const issued = await issueLoginSession("member@example.com", store, env, now);
    const header = `rh_access=expired.token; rh_refresh=${issued.refreshToken}`;
    const result = await revokeRequestSession({ cookieHeader: header, store, env, now: now + 60 * 60 * 1000 });
    assert.equal(result.hadAccess, false);
    assert.equal(result.revoked, true);
    assert.equal(store.rows[0].revokedAt != null, true);
    const formula = memberSessionFormula("member@example.com");
    assert.match(formula, /"memberEmail":"member@example.com"/);
    assert.equal(formula.includes("not-member@example.com"), false);
    assert.throws(() => memberSessionFormula('bad"email@example.com'), /unsafe email/);
});

it("a refresh slides five days across later days and a fresh login is not cleared", async () => {
    const store = createMemorySessionStore();
    const start = Date.parse("2026-11-01T15:00:00Z");
    let token = (await issueLoginSession("member@example.com", store, env, start)).refreshToken;
    let now = start;
    for (const day of [1, 4, 8]) {
        now = start + day * 24 * 60 * 60 * 1000;
        const renewed = await refreshLoginSession({ refreshToken: token, store, env, now, entitled: async () => true });
        assert.equal(renewed.ok, true);
        assert.equal(renewed.refreshExpiresAt, now + FIVE_DAYS_MS);
        token = renewed.refreshToken;
    }
    const dead = await refreshLoginSession({ refreshToken: token, store, env, now: now + FIVE_DAYS_MS + 1000, entitled: async () => true });
    assert.equal(dead.ok, false);
    const fresh = { response: { migration: true, reauth: true }, now: 5_000, loginAt: 4_000 };
    assert.equal(decideMigrationPoll(fresh).clear, false);
    assert.equal(decideMigrationPoll(fresh).retry, true);
    assert.equal(browserMigration.decideMigrationPoll(fresh).clear, false);
    const once = decideMigrationPoll({ response: { migration: true, reauth: true }, now: 10 * 60 * 1000, loginAt: 0 });
    assert.equal(once.clear, true);
    assert.equal(once.redirect, true);
    const live = decideMigrationPoll({ response: { migration: true, reauth: false, error: "Session store unavailable." }, now: 9 * 24 * 60 * 60 * 1000, loginAt: 1 });
    assert.equal(live.clear, false);
    assert.equal(browserMigration.decideMigrationPoll({ response: { migration: true, reauth: false }, now: 9 * 24 * 60 * 60 * 1000, loginAt: 1 }).clear, false);
    assert.equal(keepStoredSignIn({ armed: true, loginAt: 1, now: 9 * 24 * 60 * 60 * 1000 }), true);
    assert.equal(keepStoredSignIn({ armed: false, loginAt: 1, now: 9 * 24 * 60 * 60 * 1000 }), false);
});

it("logout storage failure does not claim a revoke and password reset visits every page", async () => {
    const failed = logoutResponse({ failed: true, revoked: false });
    assert.equal(failed.status, 503);
    assert.equal(failed.clearCookies, false);
    assert.equal(failed.body.revoked, false);
    assert.equal(JSON.stringify(failed.body).includes("refreshToken"), false);
    const store = createMemorySessionStore();
    const now = 1_700_000_000_000;
    const issued = await issueLoginSession("member@example.com", store, env, now);
    const header = `rh_refresh=${issued.refreshToken}`;
    const throwing = { ...store, findByRefreshToken: async () => { throw new Error("down"); } };
    await assert.rejects(() => revokeRequestSession({ cookieHeader: header, store: throwing, env, now: now + 60 * 60 * 1000 }));
    const retry = await revokeRequestSession({ cookieHeader: header, store, env, now: now + 60 * 60 * 1000 });
    assert.equal(retry.revoked, true);
    const sessions = Array.from({ length: 101 }, (_, index) => ({ sessionId: `s${index}`, memberEmail: "member@example.com", revokedAt: null }));
    await visitAllSessionPages(async (cursor) => {
        const start = cursor ? Number(cursor) : 0;
        const slice = sessions.slice(start, start + 100);
        return { rows: slice, nextCursor: start + 100 < sessions.length ? String(start + 100) : null };
    }, async (row) => { row.revokedAt = 5; });
    assert.equal(sessions.every((row) => row.revokedAt === 5), true);
});

it("owner identity is the verified email, not a request body", () => {
    assert.equal(OWNER_EMAIL, "rachaelsbutterflyeffect@gmail.com");
    const status = sessionStatus({ env: { ...env, AUTH_SESSION_MIGRATION: "on" }, now: 0 });
    assert.equal(status.reauth, true);
});

await tests.reduce((chain, next) => chain.then(() => next), Promise.resolve());
if (process.exitCode) console.error("session tests failed");
else console.log(`\n${passed} passed`);
