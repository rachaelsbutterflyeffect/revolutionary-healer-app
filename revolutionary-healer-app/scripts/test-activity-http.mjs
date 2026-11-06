// Hits a local production server. No Airtable credentials are passed in.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import { ACCESS_COOKIE, ACCESS_MS, OWNER_EMAIL, REFRESH_COOKIE, signAccessToken } from "../lib/sessions.js";

const SECRET = "http-test-secret-0123456789abcdef";
const PORT = 3456;
const BASE = `http://127.0.0.1:${PORT}`;
const envBase = { SESSION_SECRET: SECRET, NODE_ENV: "production" };

function start(migration) {
    const env = { ...process.env, ...envBase, AUTH_SESSION_MIGRATION: migration, PORT: String(PORT) };
    delete env.AIRTABLE_API_KEY;
    delete env.AIRTABLE_BASE_ID;
    return spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT), "-H", "127.0.0.1"], {
        env,
        stdio: ["ignore", "pipe", "pipe"],
    });
}

function portPids() {
    try {
        return execFileSync("lsof", ["-ti", `tcp:${PORT}`], { encoding: "utf8" }).trim().split(/\s+/).filter((pid) => pid && Number(pid) !== process.pid);
    } catch {
        return [];
    }
}

async function waitReady(child) {
    let log = "";
    child.stdout.on("data", (chunk) => { log += chunk; });
    child.stderr.on("data", (chunk) => { log += chunk; });
    const deadline = Date.now() + 25000;
    while (Date.now() < deadline) {
        if (child.exitCode != null) throw new Error(log || "next start exited");
        try {
            const res = await fetch(`${BASE}/api/auth/session`);
            if (res.ok || res.status === 503) return;
        } catch { /* not listening yet */ }
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(log || "next start did not listen");
}

function stop(child) {
    for (const pid of [String(child.pid), ...portPids()]) {
        try { process.kill(Number(pid), "SIGTERM"); } catch { /* already gone */ }
    }
    return new Promise((resolve) => {
        const done = () => resolve();
        child.once("exit", done);
        setTimeout(() => {
            for (const pid of [String(child.pid), ...portPids()]) {
                try { process.kill(Number(pid), "SIGKILL"); } catch { /* already gone */ }
            }
            done();
        }, 4000);
    });
}

async function waitDown() {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
        try {
            await fetch(`${BASE}/api/auth/session`);
        } catch {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error("previous server is still listening");
}

function memberCookie(email, when) {
    const token = signAccessToken(email, "00000000-0000-4000-8000-000000000099", envBase, when);
    return `${ACCESS_COOKIE}=${token}`;
}

if (!fs.existsSync(".next/BUILD_ID")) {
    console.error("Run npm run build before test:activity-http.");
    process.exit(1);
}

const unarmed = start("");
try {
    await waitReady(unarmed);
    const session = await fetch(`${BASE}/api/auth/session`).then((res) => res.json());
    assert.equal(session.migration, false);
    assert.equal(session.reauth, false);
    assert.equal(session.ok, false);

    const anon = await fetch(`${BASE}/api/owner/activity`);
    assert.equal(anon.status, 401);
    assert.equal((await anon.json()).code, "owner_auth");

    const spoof = await fetch(`${BASE}/api/owner/activity?member=${encodeURIComponent(OWNER_EMAIL)}`, {
        headers: { cookie: memberCookie("member@example.com", Date.now()) },
    });
    assert.equal(spoof.status, 401);

    const expired = memberCookie("member@example.com", Date.now() - ACCESS_MS - 5000);
    const logout = await fetch(`${BASE}/api/auth/logout`, {
        method: "POST",
        headers: { cookie: `${expired}; ${REFRESH_COOKIE}=still-live-refresh-token` },
    });
    const logoutBody = await logout.json();
    assert.equal(logout.status, 503);
    assert.equal(logoutBody.ok, false);
    assert.equal(logoutBody.revoked, false);
    assert.equal(logoutBody.code, "revoke_failed");
    const cleared = logout.headers.getSetCookie?.() || [];
    assert.equal(cleared.length, 0);
    assert.equal(JSON.stringify(logoutBody).includes("refreshToken"), false);
    console.log("ok - unarmed session, owner 401, spoof, logout failure keeps the cookie");
} finally {
    await stop(unarmed);
}
await waitDown();

const armed = start("on");
try {
    await waitReady(armed);
    const signedOut = await fetch(`${BASE}/api/auth/session`).then((res) => res.json());
    assert.equal(signedOut.migration, true, JSON.stringify(signedOut));
    assert.equal(signedOut.reauth, true, JSON.stringify(signedOut));
    const signedIn = await fetch(`${BASE}/api/auth/session`, {
        headers: { cookie: memberCookie(OWNER_EMAIL, Date.now()) },
    }).then((res) => res.json());
    assert.equal(signedIn.migration, true);
    assert.equal(signedIn.reauth, false);
    assert.equal(signedIn.email, OWNER_EMAIL);
    console.log("ok - armed migration asks only when the access cookie is missing");
} finally {
    await stop(armed);
}

console.log("\nhttp checks passed");
