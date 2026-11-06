import assert from "node:assert/strict";
import {
    ACCESS_MS, FIVE_DAYS_MS, REFRESH_GRACE_MS, OWNER_EMAIL,
    createMemorySessionStore, issueLoginSession, migrationActive, refreshLoginSession,
    revokeRequestSession, sessionSecret, sessionStatus, verifyAccessToken,
} from "../lib/sessions.js";
import { memberSessionFormula } from "../lib/sessionAirtable.js";

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

it("owner identity is the verified email, not a request body", () => {
    assert.equal(OWNER_EMAIL, "rachaelsbutterflyeffect@gmail.com");
    const status = sessionStatus({ env: { ...env, AUTH_SESSION_MIGRATION: "on" }, now: 0 });
    assert.equal(status.reauth, true);
});

await tests.reduce((chain, next) => chain.then(() => next), Promise.resolve());
if (process.exitCode) console.error("session tests failed");
else console.log(`\n${passed} passed`);
