// Activation listening regressions. No network and no Airtable writes.
// Run: npm run test:listening
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import {
    LISTENING_EXCLUDED_EMAILS,
    METRIC_DEFINITIONS,
    PLAYERS,
    applyListenEvent,
    creditListenSeconds,
    isKnownActivationSlug,
    isListeningExcluded,
    listenWriteCapacity,
    pickCanonicalListenRow,
    postActivationListen,
    rankListeningSessions,
} from "../lib/listening.js";
import { ListenStorageError, createMemoryListenStore, listenCreateFields, listenUpdateFields, parseListenRecord } from "../lib/listeningStore.js";
import { MEMBER_SESSION_MS, PERSISTENT_LOGIN_BLOCKER, PERSISTENT_LOGIN_MIGRATION_CODE, assessPersistentLoginBootstrap, clearMemberSessionCookie, memberSessionCookie, signMemberSession, verifyMemberSession } from "../lib/memberSession.js";

const require = createRequire(import.meta.url);
const { createListeningClient, handleHtmlMediaEvent, handleWistiaEvent } = require("../public/rh-listening.js");

let passed = 0;
function test(name, fn) {
    return Promise.resolve()
        .then(fn)
        .then(() => {
            passed += 1;
            console.log(`ok - ${name}`);
        })
        .catch((err) => {
            console.error(`FAIL - ${name}`);
            console.error(err);
            process.exitCode = 1;
        });
}

const tests = [];
function it(name, fn) { tests.push(test(name, fn)); }

const ENV = { AIRTABLE_API_KEY: "test-secret", NODE_ENV: "test" };
const T0 = 1_700_000_000_000;

let uuidN = 0;
function harness(email = "member@example.com", sendWrap) {
    const store = createMemoryListenStore();
    let now = T0;
    const token = signMemberSession(email, ENV, T0);
    const calls = [];
    const client = createListeningClient({
        now: () => now,
        uuid: () => `00000000-0000-4000-8000-${String(++uuidN).padStart(12, "0")}`,
        send: async (payload, opts) => {
            calls.push({ payload, beacon: !!(opts && opts.beacon) });
            const once = () => postActivationListen({
                headers: { authorization: `Bearer ${token}` },
                body: payload,
                store,
                now,
                env: ENV,
            });
            if (sendWrap) return sendWrap(payload, once, opts);
            return once();
        },
    });
    return {
        client,
        store,
        calls,
        token,
        at(ms) { now = ms; },
        advance(ms) { now += ms; },
        now: () => now,
    };
}

async function play(h, slug, player = "native-audio") {
    h.client.setTarget({ slug, player });
    h.client.uiIntent();
    h.client.manualMark();
    await h.client.onMedia({ type: "playing", mediaTime: 0 });
}

it("a cover click and a play() call are not plays", async () => {
    const h = harness();
    h.client.setTarget({ slug: "grounding", player: "native-audio" });
    h.client.uiIntent();
    await handleHtmlMediaEvent(h.client, "play", 0);
    await handleHtmlMediaEvent(h.client, "click", 0);
    await handleWistiaEvent(h.client, "secondchange", 3);
    assert.equal(h.store.rows.length, 0);
    await handleHtmlMediaEvent(h.client, "playing", 0);
    assert.equal(h.store.rows.length, 1);
    assert.equal(h.store.rows[0].listenedSeconds, 0);
    assert.equal(h.store.rows[0].finished, false);
});

it("pause and resume stay one play and keep listening time", async () => {
    const h = harness();
    await play(h, "grounding");
    const id = h.client.sessionId();
    h.advance(10000);
    await h.client.onMedia({ type: "pause", mediaTime: 10 });
    h.advance(30000);
    await h.client.onMedia({ type: "playing", mediaTime: 10 });
    h.advance(5000);
    await h.client.onMedia({ type: "pause", mediaTime: 15 });
    assert.equal(h.store.rows.length, 1);
    assert.equal(h.client.sessionId(), id);
    assert.equal(h.store.rows[0].finished, false);
    assert.ok(h.store.rows[0].listenedSeconds >= 14 && h.store.rows[0].listenedSeconds <= 16, h.store.rows[0].listenedSeconds);
});

it("ending and playing again counts a repeat", async () => {
    const h = harness();
    await play(h, "visibility-activation");
    h.advance(8000);
    await h.client.onMedia({ type: "ended", mediaTime: 8 });
    const first = h.store.rows[0].sessionId;
    await h.client.onMedia({ type: "playing", mediaTime: 0 });
    h.advance(4000);
    await h.client.onMedia({ type: "pause", mediaTime: 4 });
    assert.equal(h.store.rows.length, 2);
    assert.notEqual(h.store.rows[1].sessionId, first);
    assert.equal(h.store.rows[0].finished, true);
    assert.equal(h.store.rows[1].finished, false);
    assert.equal(h.store.rows[0].listenedSeconds, 8);
    assert.equal(h.store.rows[1].listenedSeconds, 4);
});

it("replacing the player starts a new play; hiding the page does not", async () => {
    const h = harness();
    await play(h, "grounding");
    const id = h.client.sessionId();
    h.advance(4000);
    await h.client.checkpoint();
    assert.equal(h.client.sessionId(), id);
    assert.equal(h.store.rows[0].status, "hidden");
    assert.equal(h.store.rows[0].playing, false);
    await h.client.onMedia({ type: "playing", mediaTime: 4 });
    assert.equal(h.store.rows.length, 1);
    assert.equal(h.client.sessionId(), id);
    h.advance(3000);
    await h.client.release();
    assert.equal(h.client.sessionId(), null);
    assert.equal(h.calls.at(-1).beacon, true);
    await h.client.onMedia({ type: "playing", mediaTime: 0 });
    assert.equal(h.store.rows.length, 2);
});

it("a forward seek does not add the jumped time", async () => {
    const h = harness();
    await play(h, "grounding");
    h.advance(100);
    await h.client.onMedia({ type: "seeked", mediaTime: 300 });
    h.advance(100);
    await h.client.onMedia({ type: "pause", mediaTime: 300 });
    assert.equal(h.store.rows.length, 1);
    assert.ok(h.store.rows[0].listenedSeconds < 5, h.store.rows[0].listenedSeconds);
});

it("a backward seek while paused adds no listening time", async () => {
    const h = harness();
    await play(h, "grounding");
    h.advance(5000);
    await h.client.onMedia({ type: "pause", mediaTime: 5 });
    h.advance(200);
    await h.client.onMedia({ type: "seeked", mediaTime: 0 });
    h.advance(20000);
    await h.client.tick();
    assert.ok(h.store.rows[0].listenedSeconds >= 4.5 && h.store.rows[0].listenedSeconds <= 6.5, h.store.rows[0].listenedSeconds);
    assert.equal(h.store.rows[0].lastMediaTime, 0);
});

it("buffering does not count and a heartbeat retry does not double time", async () => {
    const h = harness();
    await play(h, "grounding");
    h.advance(21000);
    await h.client.onMedia({ type: "heartbeat", mediaTime: 0 });
    assert.equal(h.store.rows[0].listenedSeconds, 0);
    h.advance(21000);
    const wrapped = harness();
    let posts = 0;
    wrapped.client.setTarget({ slug: "grounding", player: "native-audio" });
    const original = wrapped.client;
    // Direct server retries: the same sequence is stored once.
    const event = {
        sessionId: "00000000-0000-4000-8000-000000000099",
        seq: 1,
        activationSlug: "grounding",
        player: "native-audio",
        event: "playing",
        mediaTime: 0,
        clientTs: T0,
    };
    const headers = { authorization: `Bearer ${h.token}` };
    const first = await postActivationListen({ headers, body: event, store: h.store, now: T0, env: ENV });
    const retry = await postActivationListen({ headers, body: event, store: h.store, now: T0, env: ENV });
    assert.equal(first.body.action, "create");
    assert.equal(retry.body.action, "duplicate");
    const beat = { ...event, seq: 2, event: "heartbeat", mediaTime: 25, clientTs: T0 + 25000 };
    const early = await postActivationListen({ headers, body: { ...beat, mediaTime: 5, clientTs: T0 + 5000 }, store: h.store, now: T0 + 5000, env: ENV });
    const earlyAgain = await postActivationListen({ headers, body: { ...beat, mediaTime: 5, clientTs: T0 + 5000 }, store: h.store, now: T0 + 5000, env: ENV });
    const applied = await postActivationListen({ headers, body: beat, store: h.store, now: T0 + 25000, env: ENV });
    const appliedAgain = await postActivationListen({ headers, body: beat, store: h.store, now: T0 + 25000, env: ENV });
    assert.equal(early.body.action, "coalesce");
    assert.equal(earlyAgain.body.action, "coalesce");
    assert.equal(applied.body.action, "update");
    assert.equal(appliedAgain.body.action, "duplicate");
    const row = h.store.rows.find((item) => item.sessionId === event.sessionId);
    assert.equal(row.listenedSeconds, 25);
    assert.equal(h.store.rows.filter((item) => item.sessionId === event.sessionId).length, 1);
    assert.equal(posts, 0);
    assert.ok(original);
    assert.ok(wrapped);
});

it("a lost response retries once and does not add a second play", async () => {
    let attempts = 0;
    const h = harness("member@example.com", async (_payload, once) => {
        const result = await once();
        attempts += 1;
        if (attempts === 1) throw new Error("response dropped");
        return result;
    });
    h.client.setTarget({ slug: "grounding", player: "native-audio" });
    await h.client.onMedia({ type: "playing", mediaTime: 0 });
    assert.equal(h.store.rows.length, 1);
    await h.client.tick();
    assert.equal(attempts, 2);
    assert.equal(h.store.rows.length, 1);
    assert.equal(h.store.rows[0].listenedSeconds, 0);
});

it("identity comes from the signed session, not the body", async () => {
    const h = harness();
    const missing = await postActivationListen({
        headers: {},
        body: { email: "member@example.com", sessionId: "00000000-0000-4000-8000-000000000010", seq: 1, activationSlug: "grounding", player: "native-audio", event: "playing", mediaTime: 0, clientTs: T0 },
        store: h.store,
        now: T0,
        env: ENV,
    });
    assert.equal(missing.status, 401);
    assert.equal(h.store.rows.length, 0);
    const flipped = h.token.slice(0, -1) + (h.token.endsWith("a") ? "b" : "a");
    const bad = await postActivationListen({
        headers: { authorization: `Bearer ${flipped}` },
        body: { sessionId: "00000000-0000-4000-8000-000000000010", seq: 1, activationSlug: "grounding", player: "native-audio", event: "playing", mediaTime: 0, clientTs: T0 },
        store: h.store,
        now: T0,
        env: ENV,
    });
    assert.equal(bad.status, 401);
    await h.client.onMedia({ type: "playing", mediaTime: 0 }).catch(() => {});
    h.client.setTarget({ slug: "grounding", player: "native-audio" });
    await h.client.onMedia({ type: "playing", mediaTime: 0 });
    const spoofed = await postActivationListen({
        headers: { authorization: `Bearer ${h.token}` },
        body: {
            email: "someoneelse@example.com",
            sessionId: h.store.rows[0].sessionId,
            seq: 2,
            activationSlug: "grounding",
            player: "native-audio",
            event: "pause",
            mediaTime: 4,
            clientTs: T0 + 4000,
        },
        store: h.store,
        now: T0 + 4000,
        env: ENV,
    });
    assert.equal(spoofed.status, 200);
    assert.equal(h.store.rows[0].memberEmail, "member@example.com");
    assert.notEqual(h.store.rows[0].memberEmail, "someoneelse@example.com");
});

it("Mark as Listened does not finish or create a play; audio end does", async () => {
    const h = harness();
    h.client.setTarget({ slug: "creator-within-activation", player: "native-audio" });
    h.client.manualMark();
    assert.equal(h.store.rows.length, 0);
    const manual = await postActivationListen({
        headers: { authorization: `Bearer ${h.token}` },
        body: { sessionId: "00000000-0000-4000-8000-000000000011", seq: 1, activationSlug: "creator-within-activation", player: "native-audio", event: "manual", mediaTime: 0, clientTs: T0 },
        store: h.store,
        now: T0,
        env: ENV,
    });
    assert.equal(manual.status, 400);
    assert.equal(h.store.rows.length, 0);
    await h.client.onMedia({ type: "playing", mediaTime: 0 });
    assert.equal(h.store.rows[0].finished, false);
    h.advance(6000);
    await h.client.onMedia({ type: "ended", mediaTime: 6 });
    assert.equal(h.store.rows[0].finished, true);
    assert.equal(h.store.rows[0].status, "ended");
});

it("native audio, wistia video, and wistia audio each count real starts and repeats", async () => {
    for (const player of PLAYERS) {
        const h = harness();
        h.client.setTarget({ slug: "activating-your-channel-to-spirit", player });
        if (player === "native-audio") {
            await handleHtmlMediaEvent(h.client, "play", 0);
            assert.equal(h.store.rows.length, 0);
            await handleHtmlMediaEvent(h.client, "playing", 0);
            await handleHtmlMediaEvent(h.client, "playing", 1);
        } else {
            await handleWistiaEvent(h.client, "secondchange", 1);
            assert.equal(h.store.rows.length, 0);
            await handleWistiaEvent(h.client, "play", 0);
            await handleWistiaEvent(h.client, "play", 1);
        }
        assert.equal(h.store.rows.length, 1, player);
        assert.equal(h.store.rows[0].player, player);
        const id = h.client.sessionId();
        h.advance(2000);
        if (player === "native-audio") await handleHtmlMediaEvent(h.client, "ended", 2);
        else await handleWistiaEvent(h.client, "end", 2);
        assert.equal(h.store.rows[0].finished, true, player);
        assert.equal(h.client.sessionId(), id);
        if (player === "native-audio") await handleHtmlMediaEvent(h.client, "playing", 0);
        else await handleWistiaEvent(h.client, "play", 0);
        assert.equal(h.store.rows.length, 2, player);
        assert.notEqual(h.store.rows[1].sessionId, id);
    }
});

it("owner and tester activity stays stored and leaves the top 5", async () => {
    const rows = [];
    async function session(email, slug, listened, times = 1) {
        for (let i = 0; i < times; i += 1) {
            const h = harness(email);
            h.client.setTarget({ slug, player: "wistia-video" });
            await h.client.onMedia({ type: "playing", mediaTime: 0 });
            h.advance(listened * 1000);
            await h.client.onMedia({ type: "pause", mediaTime: listened });
            rows.push(h.store.rows[0]);
        }
    }
    await session("member@example.com", "grounding", 30, 2);
    await session("member@example.com", "clearing-activation", 100, 1);
    await session("other@example.com", "protection-shielding", 10, 3);
    await session("sarahashleywheeler@gmail.com", "spookbound-2026", 50, 4);
    await session("alysa.rushton@gmail.com", "spookbound-2026", 50, 1);
    await session("rachaelsbutterflyeffect@gmail.com", "expansion-activation", 50, 3);
    await session("rachael.ball08@gmail.com", "expansion-activation", 20, 1);
    await session("rachaelsbutterflyeffect+gapqa@gmail.com", "intuition-activation", 40, 2);
    rows.push({
        sessionId: "00000000-0000-4000-8000-000000009999",
        memberEmail: "quiet-member@example.com",
        activationSlug: "pink-cloud-activation",
        listenedSeconds: 999,
        finished: true,
        isTest: true,
        player: "native-audio",
    });
    const ranked = rankListeningSessions(rows, { limit: 5, env: ENV });
    assert.equal(ranked.rawSessions, rows.length);
    assert.ok(ranked.excludedSessions >= 4 + 1 + 3 + 1 + 2 + 1);
    assert.deepEqual(ranked.top.map((row) => row.activationSlug), ["protection-shielding", "grounding", "clearing-activation"]);
    assert.equal(ranked.top[0].plays, 3);
    assert.equal(ranked.top[1].plays, 2);
    assert.equal(ranked.top[1].listenedSeconds, 60);
    assert.ok(ranked.top.every((row) => !row.activationSlug.includes("spookbound") && row.activationSlug !== "expansion-activation" && row.activationSlug !== "pink-cloud-activation" && row.activationSlug !== "intuition-activation"));
    for (const email of LISTENING_EXCLUDED_EMAILS) {
        assert.equal(isListeningExcluded(email, { ...ENV, TESTER_EMAILS: "extra@example.com" }), true);
    }
    assert.equal(isListeningExcluded("extra@example.com", { TESTER_EMAILS: "extra@example.com" }), true);
    assert.equal(isListeningExcluded("member@example.com", ENV), false);
    assert.equal(rows.filter((row) => row.isTest).length > 0, true);
});

it("storage fields stay on the Events listening row", async () => {
    const h = harness();
    await play(h, "more-than-enough-activation", "wistia-audio");
    const created = listenCreateFields(h.store.rows[0]);
    assert.deepEqual(Object.keys(created).sort(), ["created_at", "meta", "type"]);
    assert.equal(created.type, "activation_listen");
    const parsed = parseListenRecord({ id: "recKeep", fields: { type: created.type, meta: created.meta, created_at: created.created_at } });
    assert.equal(parsed.id, "recKeep");
    assert.equal(parsed.memberEmail, "member@example.com");
    const updated = listenUpdateFields({ ...h.store.rows[0], id: "recKeep", listenedSeconds: 3 });
    assert.deepEqual(Object.keys(updated), ["meta"]);
    assert.equal(JSON.parse(updated.meta).id, undefined);
    const broken = createMemoryListenStore();
    broken.create = async () => { throw new ListenStorageError("table missing"); };
    await assert.rejects(() => postActivationListen({
        headers: { authorization: `Bearer ${h.token}` },
        body: { sessionId: "00000000-0000-4000-8000-000000000077", seq: 1, activationSlug: "grounding", player: "native-audio", event: "playing", mediaTime: 0, clientTs: T0 },
        store: broken,
        now: T0,
        env: ENV,
    }));
});

it("session tokens expire, reject tampering, and hide the signing key", () => {
    const token = signMemberSession("Member@Example.com", ENV, T0);
    assert.equal(verifyMemberSession(token, ENV, T0).email, "member@example.com");
    assert.equal(token.includes("test-secret"), false);
    assert.equal(verifyMemberSession(token, { AIRTABLE_API_KEY: "other" }, T0), null);
    assert.equal(verifyMemberSession(token, ENV, T0 + MEMBER_SESSION_MS + 1), null);
    const cookie = memberSessionCookie(token, ENV);
    assert.match(cookie, /rh_session=/);
    assert.match(cookie, /HttpOnly/);
    assert.equal(cookie.includes("Secure"), false);
    assert.match(memberSessionCookie(token, { ...ENV, NODE_ENV: "production" }), /Secure/);
    assert.match(clearMemberSessionCookie(ENV), /Max-Age=0/);
    const prev = { playing: true, lastServerTs: T0, lastClientTs: T0, lastMediaTime: 10 };
    assert.equal(creditListenSeconds(prev, { mediaTime: 400, clientTs: T0 + 2000 }, T0 + 2000) < 5, true);
    assert.equal(creditListenSeconds({ ...prev, playing: false }, { mediaTime: 0, clientTs: T0 + 5000 }, T0 + 5000), 0);
    const created = applyListenEvent(null, { sessionId: "00000000-0000-4000-8000-000000000055", seq: 1, activationSlug: "grounding", player: "native-audio", event: "playing", mediaTime: 12, clientTs: T0 }, { serverNow: T0, email: "member@example.com", isTest: false });
    assert.equal(created.state.listenedSeconds, 0);
    assert.equal(created.state.lastMediaTime, 12);
    const skipped = applyListenEvent(created.state, { sessionId: created.state.sessionId, seq: 3, activationSlug: "grounding", player: "native-audio", event: "heartbeat", mediaTime: 20, clientTs: T0 + 8000 }, { serverNow: T0 + 8000, email: "member@example.com", isTest: false });
    assert.equal(skipped.error, "Out of order listening event.");
    const flushed = applyListenEvent(created.state, { sessionId: created.state.sessionId, seq: 3, activationSlug: "grounding", player: "native-audio", event: "hidden", mediaTime: 10, clientTs: T0 + 10000 }, { serverNow: T0 + 10000, email: "member@example.com", isTest: false });
    assert.equal(flushed.action, "update");
    assert.equal(flushed.state.listenedSeconds, 10);
    const lateHeartbeat = applyListenEvent(flushed.state, { sessionId: created.state.sessionId, seq: 2, activationSlug: "grounding", player: "native-audio", event: "heartbeat", mediaTime: 8, clientTs: T0 + 8000 }, { serverNow: T0 + 10000, email: "member@example.com", isTest: false });
    assert.equal(lateHeartbeat.action, "duplicate");
    assert.equal(lateHeartbeat.state.listenedSeconds, 10);
});

it("an existing signed-in browser cannot become a listening session from its email", async () => {
    const store = createMemoryListenStore();
    const decision = assessPersistentLoginBootstrap({
        email: "member@example.com",
        loginAt: T0,
        headers: {},
        env: ENV,
        now: T0 + 60 * 1000,
    });
    assert.equal(decision.authorized, false);
    assert.equal(decision.email, null);
    assert.equal(decision.code, PERSISTENT_LOGIN_MIGRATION_CODE);
    assert.match(decision.blocker, /rh_member_email/);
    assert.match(PERSISTENT_LOGIN_BLOCKER, /POST \/api\/access/);
    const refused = await postActivationListen({
        headers: {},
        body: {
            email: "member@example.com",
            loginAt: T0,
            sessionId: "00000000-0000-4000-8000-000000000066",
            seq: 1,
            activationSlug: "grounding",
            player: "native-audio",
            event: "playing",
            mediaTime: 0,
            clientTs: T0,
        },
        store,
        now: T0,
        env: ENV,
    });
    assert.equal(refused.status, 401);
    assert.equal(refused.body.code, PERSISTENT_LOGIN_MIGRATION_CODE);
    assert.equal(store.rows.length, 0);
    const access = fs.readFileSync("app/api/access/route.ts", "utf8");
    assert.doesNotMatch(access, /rh_session|signMemberSession|memberSessionCookie/);
    const token = signMemberSession("member@example.com", ENV, T0);
    const allowed = assessPersistentLoginBootstrap({
        email: "someoneelse@example.com",
        loginAt: T0,
        headers: { cookie: `rh_session=${token}` },
        env: ENV,
        now: T0,
    });
    assert.equal(allowed.authorized, true);
    assert.equal(allowed.email, "member@example.com");
    assert.equal(listenWriteCapacity().heartbeatMs, 20000);
    assert.equal(listenWriteCapacity().requestsPerPersistedSample, 2);
    assert.equal(listenWriteCapacity().steadyConcurrentListeners, 50);
});

it("concurrent duplicate retries upsert onto one canonical session", async () => {
    const rows = [];
    let n = 0;
    const store = {
        rows,
        async findAllBySessionId(sessionId) {
            await Promise.resolve();
            return rows.filter((row) => row.sessionId === sessionId).map((row) => ({ ...row }));
        },
        async create(state) {
            await Promise.resolve();
            n += 1;
            const row = { id: `rec${String(n).padStart(3, "0")}`, ...state };
            rows.push(row);
            return { ...row };
        },
        async update(id, state) {
            const row = rows.find((item) => item.id === id);
            Object.assign(row, state);
            return { ...row };
        },
    };
    const headers = { authorization: `Bearer ${signMemberSession("member@example.com", ENV, T0)}` };
    const event = {
        sessionId: "00000000-0000-4000-8000-000000000088",
        seq: 1,
        activationSlug: "grounding",
        player: "native-audio",
        event: "playing",
        mediaTime: 0,
        clientTs: T0,
        email: "attacker@example.com",
    };
    const [first, second] = await Promise.all([
        postActivationListen({ headers, body: event, store, now: T0, env: ENV }),
        postActivationListen({ headers, body: event, store, now: T0, env: ENV }),
    ]);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(pickCanonicalListenRow(rows).memberEmail, "member@example.com");
    const beat = { ...event, seq: 2, event: "heartbeat", mediaTime: 20, clientTs: T0 + 20000 };
    const applied = await postActivationListen({ headers, body: beat, store, now: T0 + 20000, env: ENV });
    const replay = await postActivationListen({ headers, body: beat, store, now: T0 + 20000, env: ENV });
    assert.equal(applied.body.action, "update");
    assert.equal(replay.body.action, "duplicate");
    const ranked = rankListeningSessions(rows, { env: ENV });
    assert.equal(ranked.rankedSessions, 1);
    assert.equal(ranked.top[0].plays, 1);
    assert.equal(ranked.top[0].listenedSeconds, 20);
    assert.equal(pickCanonicalListenRow(rows).id, "rec001");
    assert.equal(pickCanonicalListenRow(rows).listenedSeconds, 20);
});

it("a mobile beacon stays unconfirmed until a retry, and a 429 does not double a play", async () => {
    let posts = 0;
    const beaconed = harness("member@example.com", async (payload, once, opts) => {
        if (opts && opts.beacon) return { status: 202, body: { action: "unconfirmed" } };
        posts += 1;
        return once();
    });
    beaconed.client.setTarget({ slug: "grounding", player: "native-audio" });
    await beaconed.client.onMedia({ type: "playing", mediaTime: 0 });
    beaconed.advance(4000);
    await beaconed.client.onMedia({ type: "hidden", mediaTime: 4, retain: true, beacon: true });
    assert.equal(beaconed.calls.at(-1).beacon, true);
    assert.equal(beaconed.store.rows[0].listenedSeconds, 0);
    await beaconed.client.tick();
    assert.equal(posts, 2);
    assert.equal(beaconed.store.rows.length, 1);
    assert.equal(beaconed.store.rows[0].listenedSeconds, 4);
    assert.equal(beaconed.store.rows[0].status, "hidden");
    await beaconed.client.tick();
    assert.equal(beaconed.store.rows[0].listenedSeconds, 4);

    let attempts = 0;
    const limited = harness("member@example.com", async (_payload, once) => {
        attempts += 1;
        if (attempts === 1) return { status: 429, body: {} };
        return once();
    });
    limited.client.setTarget({ slug: "clearing-activation", player: "wistia-video" });
    await limited.client.onMedia({ type: "playing", mediaTime: 0 });
    assert.equal(limited.store.rows.length, 0);
    await limited.client.tick();
    assert.equal(limited.store.rows.length, 1);
    await limited.client.tick();
    assert.equal(limited.store.rows.length, 1);
    assert.equal(attempts, 2);
});

it("both apps keep legacy completions and wire every player", () => {
    const airtable = fs.readFileSync("lib/airtable.js", "utf8");
    const completed = airtable.slice(airtable.indexOf("export async function logActivationCompleted"), airtable.indexOf("export async function getCompletedActivationSlugsByEmail"));
    const favorite = airtable.slice(airtable.indexOf("export async function addFavoriteActivation"), airtable.indexOf("export async function removeFavoriteActivation"));
    assert.match(completed, /Tables\.ActivationCompletions/);
    assert.match(completed, /member_email/);
    assert.match(completed, /activation_slug/);
    assert.match(completed, /completed_at/);
    assert.doesNotMatch(completed, /activation_listen/);
    assert.match(favorite, /Tables\.Favorites/);
    assert.doesNotMatch(favorite, /activation_listen/);
    const completionsRoute = fs.readFileSync("app/api/activation-completions/route.ts", "utf8");
    const favoritesRoute = fs.readFileSync("app/api/favorites/route.ts", "utf8");
    assert.doesNotMatch(completionsRoute, /listening/);
    assert.doesNotMatch(favoritesRoute, /listening/);
    assert.match(fs.readFileSync("app/api/auth/login/route.ts", "utf8"), /memberSessionCookie/);
    const refresh = fs.readFileSync("public/app-refresh.html", "utf8");
    assert.match(refresh, /data-rr-slug/);
    assert.match(refresh, /handleActivationCardClick\(slug\)/);
    for (const file of ["public/app.html", "public/app-refresh.html"]) {
        const html = fs.readFileSync(file, "utf8");
        assert.match(html, /src="\/rh-listening\.js"/);
        assert.match(html, /player: "wistia-video"/);
        assert.match(html, /player: "wistia-audio"/);
        assert.match(html, /player: "native-audio"/);
        assert.match(html, /function handleActivationCardClick/);
        assert.match(html, /function gapListenNow/);
        assert.match(html, /function addRhActivationButton/);
        assert.match(html, /shift-modal-listen-btn/);
        assert.match(html, /class="listen-btn"/);
        assert.equal((html.match(/markActivationCompleted/g) || []).length, 3);
        const markFn = html.slice(html.indexOf("function markActivationCompleted"), html.indexOf("async function loadCompletedActivations"));
        assert.match(markFn, /\/api\/activation-completions/);
        assert.match(markFn, /activationSlug: slug/);
        assert.doesNotMatch(markFn, /rhListening/);
        assert.match(html, /Mark as Listened/);
        const slugs = [...html.matchAll(/'([a-z0-9-]+)': \{ title:/g)].map((match) => match[1]);
        assert.ok(slugs.length > 20, file);
        for (const slug of slugs) assert.equal(isKnownActivationSlug(slug), true, `${slug} in ${file}`);
    }
    for (const slug of ["rr-intro", "slowing-the-mind", "lifting-emotional-anxiety", "embodiment-activation", "power-activation", "prosperity-flow-activation"]) {
        assert.equal(isKnownActivationSlug(slug), true);
    }
    assert.match(METRIC_DEFINITIONS.play, /resume/);
    assert.match(METRIC_DEFINITIONS.finish, /Mark as Listened/);
    assert.match(METRIC_DEFINITIONS.listenedSeconds, /seek/);
    assert.match(METRIC_DEFINITIONS.ranking, /Top 5/);
});

await tests.reduce((chain, next) => chain.then(() => next), Promise.resolve());

if (process.exitCode) {
    console.error("listening tests failed");
} else {
    console.log(`\n${passed} passed`);
}
