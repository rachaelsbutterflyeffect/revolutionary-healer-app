// Future activation listening. One row per actual play session.
// Legacy ActivationCompletions (audio end or Mark as Listened, one slug per
// member) and Favorites are not written here and are not read as plays.
//
// Storage: existing Events table, type "activation_listen", full session in
// meta. No new table, field, or environment variable. If that write fails,
// the request errors and nothing is stored anywhere else.

import { ACTIVATIONS, GAP_METHOD_ACTIVATIONS } from "./activations.js";
import { isTester, normalizeTesterEmail } from "./testers.js";
import { assessPersistentLoginBootstrap } from "./memberSession.js";

export const LISTEN_EVENT_TYPE = "activation_listen";
export const LISTEN_TABLE = "Events";

// Heartbeats inside this window are not written. The next persisted sample
// still credits the whole gap, so skipping the write does not drop time.
export const LISTEN_HEARTBEAT_MS = 20 * 1000;
export const LISTEN_CLOCK_SLOP_SECONDS = 1.5;
export const LISTEN_SERVER_SLOP_MS = 2000;
// Airtable's REST API allows 5 requests per second per base, shared with
// every other table this app writes. A persisted sample is one filtered read
// plus one create or update.
export const AIRTABLE_BASE_REQUESTS_PER_SECOND = 5;
export const LISTEN_REQUESTS_PER_SAMPLE = 2;

export const PLAYERS = ["native-audio", "wistia-video", "wistia-audio"];

// Every library, favorites, recommended, shift, GAP, and Reset & Restore
// opener reaches the detail player. These three players are the only media
// elements that opener creates.
export const PLAYBACK_SURFACES = [
    { id: "library-card", opener: "handleActivationCardClick" },
    { id: "favorites-listen", opener: "handleActivationCardClick" },
    { id: "favorites-grid", opener: "cloned library card" },
    { id: "recommended", opener: "cloned library card" },
    { id: "gap-open-button", opener: "addRhActivationButton" },
    { id: "gap-listen-now", opener: "gapListenNow" },
    { id: "shift-listen", opener: "shift-modal-listen-btn" },
    { id: "reset-restore", opener: "data-rr-slug" },
];

export const RESET_RESTORE_SLUGS = [
    "rr-intro",
    "slowing-the-mind",
    "lifting-emotional-anxiety",
    "embodiment-activation",
    "power-activation",
    "prosperity-flow-activation",
];

// Always excluded from rankings, even when TESTER_EMAILS overrides the
// default tester list. isTester() still adds QA aliases and configured testers.
export const LISTENING_EXCLUDED_EMAILS = [
    "rachaelsbutterflyeffect@gmail.com",
    "rachael.ball08@gmail.com",
    "sarahashleywheeler@gmail.com",
    "alysa.rushton@gmail.com",
];

export const METRIC_DEFINITIONS = {
    play: "One play is one listening session. The session starts at the first actual playback start for that player instance: the HTML audio playing event, or the Wistia play event. A cover-button click, a play() call before playback has started, a seek, and a resume of the same session are not plays. After the media ends, or after the detail player is replaced, the next actual start is a new play, so repeats count.",
    listenedSeconds: "Seconds the playhead advanced while that session was in playing state, never more than the real time between stored samples. A forward seek does not add the jumped distance. A backward seek does not add the jumped distance. Paused time and a frozen playhead (buffering) add nothing. Heartbeat retries do not add time twice.",
    finish: "A finish is that session's media reaching its natural end. Mark as Listened still writes only the legacy ActivationCompletions row. It does not finish a play session and it does not create a play.",
    ranking: "Top 5 is the five activation slugs with the most plays among sessions that are not owner/tester activity. Ties break by listened seconds, then slug. Raw rows are kept, including tester rows. Rankings omit isTest sessions, the four owner emails, and any account isTester() already flags.",
};

export function listenWriteCapacity(heartbeatMs = LISTEN_HEARTBEAT_MS, baseRps = AIRTABLE_BASE_REQUESTS_PER_SECOND) {
    const samplesPerSecond = 1000 / heartbeatMs;
    const requestsPerListenerPerSecond = samplesPerSecond * LISTEN_REQUESTS_PER_SAMPLE;
    return {
        heartbeatMs,
        baseRequestsPerSecond: baseRps,
        requestsPerPersistedSample: LISTEN_REQUESTS_PER_SAMPLE,
        steadyConcurrentListeners: Math.floor(baseRps / requestsPerListenerPerSecond),
        sharedWith: "every other Airtable call on this base",
    };
}

export const LISTEN_STORAGE = {
    table: LISTEN_TABLE,
    type: LISTEN_EVENT_TYPE,
    fields: ["type", "meta", "created_at"],
    writeCapacity: listenWriteCapacity(),
    prerequisite: "No new Airtable table, field, or environment variable. Sessions reuse Events (type, meta, created_at). The session cookie is signed with the existing AIRTABLE_API_KEY and is set only after a password login. An already-open login cannot be migrated: see PERSISTENT_LOGIN_BLOCKER. Do not delete or edit ActivationCompletions or Favorites. Do not mint a listening session from a client email.",
};

const KNOWN_SLUGS = new Set([
    ...ACTIVATIONS.map((activation) => activation.slug),
    ...GAP_METHOD_ACTIVATIONS.map((activation) => activation.slug),
    ...RESET_RESTORE_SLUGS,
]);

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENTS = new Set(["playing", "pause", "seeked", "ended", "heartbeat", "hidden"]);
const TERMINAL_EVENTS = new Set(["pause", "ended", "hidden"]);
const MAX_MEDIA_SECONDS = 8 * 60 * 60;
const MAX_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;

export function isKnownActivationSlug(slug) {
    return typeof slug === "string" && KNOWN_SLUGS.has(slug);
}

export function isListeningExcluded(email, env = process.env) {
    const normalized = normalizeTesterEmail(email);
    if (!normalized) return false;
    if (LISTENING_EXCLUDED_EMAILS.includes(normalized)) return true;
    return isTester(normalized, env);
}

export function roundListenSeconds(value) {
    return Math.round(value * 10) / 10;
}

function finiteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}

export function validateListenEvent(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return { error: "Invalid listening event." };
    }
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim().toLowerCase() : "";
    if (!SESSION_ID.test(sessionId)) return { error: "Invalid session." };
    const activationSlug = typeof body.activationSlug === "string" ? body.activationSlug.trim().toLowerCase() : "";
    if (!isKnownActivationSlug(activationSlug)) return { error: "Unknown activation." };
    if (!PLAYERS.includes(body.player)) return { error: "Unknown player." };
    if (!EVENTS.has(body.event)) return { error: "Unknown listening event." };
    if (!Number.isInteger(body.seq) || body.seq < 1 || body.seq > 100000) return { error: "Invalid event sequence." };
    if (!finiteNumber(body.mediaTime) || body.mediaTime < 0 || body.mediaTime > MAX_MEDIA_SECONDS) {
        return { error: "Invalid playhead time." };
    }
    if (!finiteNumber(body.clientTs)) return { error: "Invalid client time." };
    return {
        value: {
            sessionId,
            seq: body.seq,
            activationSlug,
            player: body.player,
            event: body.event,
            mediaTime: body.mediaTime,
            clientTs: body.clientTs,
        },
    };
}

// Credit only real playback between two stored samples.
export function creditListenSeconds(prev, sample, serverNow) {
    if (!prev || !prev.playing) return 0;
    if (!finiteNumber(serverNow) || !finiteNumber(sample.clientTs) || !finiteNumber(sample.mediaTime)) return 0;
    if (!finiteNumber(prev.lastServerTs) || !finiteNumber(prev.lastClientTs) || !finiteNumber(prev.lastMediaTime)) return 0;
    const serverWall = (serverNow - prev.lastServerTs) / 1000;
    const clientWall = (sample.clientTs - prev.lastClientTs) / 1000;
    if (serverWall < 0 || clientWall < 0) return 0;
    const wall = Math.min(clientWall, serverWall + LISTEN_SERVER_SLOP_MS / 1000);
    const mediaDelta = sample.mediaTime - prev.lastMediaTime;
    if (!finiteNumber(mediaDelta)) return 0;
    // Backward seek: count time spent in playback, not the size of the jump.
    if (mediaDelta < -0.35) return roundListenSeconds(wall);
    // Forward seek or normal playback: the playhead advance, capped by real time.
    // A frozen playhead (buffering) has ~0 advance and credits nothing.
    const played = Math.min(Math.max(0, mediaDelta), wall + LISTEN_CLOCK_SLOP_SECONDS);
    return roundListenSeconds(played);
}

function shouldPersist(prev, event, serverNow) {
    if (!prev) return event.event === "playing";
    if (event.event === "heartbeat" || event.event === "seeked") {
        return serverNow - prev.lastServerTs >= LISTEN_HEARTBEAT_MS;
    }
    return true;
}

export function applyListenEvent(prev, event, { serverNow, email, isTest }) {
    if (prev && event.seq <= prev.lastSeq) {
        return { action: "duplicate", state: prev };
    }
    if (!prev) {
        if (event.event !== "playing" || event.seq !== 1) {
            return { error: "Playback has not started." };
        }
        if (Math.abs(event.clientTs - serverNow) > MAX_CLOCK_SKEW_MS) {
            return { error: "Client clock is too far from the server." };
        }
        const startedAt = new Date(serverNow).toISOString();
        return {
            action: "create",
            state: {
                kind: LISTEN_EVENT_TYPE,
                sessionId: event.sessionId,
                memberEmail: email,
                activationSlug: event.activationSlug,
                player: event.player,
                isTest: !!isTest,
                startedAt,
                listenedSeconds: 0,
                finished: false,
                status: "playing",
                playing: true,
                lastSeq: 1,
                lastMediaTime: event.mediaTime,
                lastClientTs: event.clientTs,
                lastServerTs: serverNow,
            },
        };
    }
    if (prev.memberEmail !== email) return { error: "Session belongs to another member." };
    if (prev.activationSlug !== event.activationSlug || prev.player !== event.player) {
        return { error: "Session does not match this activation." };
    }
    // A mobile flush can skip the in-flight heartbeat (one or two sequence
    // numbers). Credit still comes from the last stored sample, so the skip
    // does not add the missing event a second time when it arrives later.
    const sequential = event.seq === prev.lastSeq + 1;
    const terminalSkip = TERMINAL_EVENTS.has(event.event) && event.seq > prev.lastSeq + 1 && event.seq <= prev.lastSeq + 3;
    if (!sequential && !terminalSkip) return { error: "Out of order listening event." };
    if (Math.abs(event.clientTs - serverNow) > MAX_CLOCK_SKEW_MS) {
        return { error: "Client clock is too far from the server." };
    }
    if (!shouldPersist(prev, event, serverNow)) {
        return { action: "coalesce", state: prev };
    }
    const credit = creditListenSeconds(prev, event, serverNow);
    const next = {
        ...prev,
        isTest: prev.isTest === true || !!isTest,
        listenedSeconds: roundListenSeconds(prev.listenedSeconds + credit),
        lastSeq: event.seq,
        lastMediaTime: event.mediaTime,
        lastClientTs: event.clientTs,
        lastServerTs: serverNow,
    };
    if (event.event === "playing") {
        next.playing = true;
        next.status = "playing";
    } else if (event.event === "pause") {
        next.playing = false;
        next.status = "paused";
    } else if (event.event === "ended") {
        next.playing = false;
        next.status = "ended";
        next.finished = true;
    } else if (event.event === "hidden") {
        next.playing = false;
        next.status = "hidden";
    }
    if (prev.finished) next.finished = true;
    return { action: "update", state: next };
}

export function pickCanonicalListenRow(rows) {
    const list = (rows || []).filter((row) => row && row.id);
    if (!list.length) return null;
    return list.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)))[0];
}

function listenResult(action, state) {
    return {
        status: 200,
        body: {
            ok: true,
            action,
            listenedSeconds: state ? state.listenedSeconds : 0,
            finished: !!(state && state.finished),
        },
    };
}

// One logical session under concurrent duplicate creates. Extra physical rows
// can appear if two creates pass the empty read together; later writes all
// target the lowest record id, and ranking keeps the max listened time.
export async function ingestListen(body, { email, store, now, env }) {
    const parsed = validateListenEvent(body);
    if (parsed.error) return { status: 400, body: { error: parsed.error } };
    const event = parsed.value;
    const context = { serverNow: now, email, isTest: isListeningExcluded(email, env) };
    for (let attempt = 0; attempt < 4; attempt += 1) {
        const matches = await store.findAllBySessionId(event.sessionId);
        const existing = pickCanonicalListenRow(matches);
        const applied = applyListenEvent(existing, event, context);
        if (applied.error) return { status: 400, body: { error: applied.error } };
        if (applied.action === "duplicate" || applied.action === "coalesce") {
            return listenResult(applied.action, existing);
        }
        if (applied.action === "create") {
            await store.create(applied.state);
            const confirmed = pickCanonicalListenRow(await store.findAllBySessionId(event.sessionId));
            if (confirmed && confirmed.lastSeq >= event.seq) return listenResult("create", confirmed);
            continue;
        }
        await store.update(existing.id, applied.state);
        return listenResult("update", applied.state);
    }
    const confirmed = pickCanonicalListenRow(await store.findAllBySessionId(event.sessionId));
    if (confirmed && confirmed.lastSeq >= event.seq) return listenResult("duplicate", confirmed);
    return { status: 503, body: { error: "Listening event was not stored.", code: "listen_storage_unavailable" } };
}

export async function postActivationListen({ headers, body, store, now, env }) {
    const decision = assessPersistentLoginBootstrap({
        email: body && body.email,
        loginAt: body && body.loginAt,
        headers,
        env,
        now,
    });
    if (!decision.authorized) {
        return { status: 401, body: { error: "Sign in required.", code: decision.code } };
    }
    return ingestListen(body, { email: decision.email, store, now, env });
}

export function mergeListenRows(rows) {
    const bySession = new Map();
    for (const row of rows) {
        if (!row || !row.sessionId) continue;
        const prev = bySession.get(row.sessionId);
        if (!prev) {
            bySession.set(row.sessionId, { ...row });
            continue;
        }
        prev.listenedSeconds = Math.max(Number(prev.listenedSeconds) || 0, Number(row.listenedSeconds) || 0);
        prev.finished = prev.finished === true || row.finished === true;
        prev.isTest = prev.isTest === true || row.isTest === true;
    }
    return [...bySession.values()];
}

export function rankListeningSessions(rows, { limit = 5, env = process.env } = {}) {
    const merged = mergeListenRows(rows);
    let excluded = 0;
    const grouped = new Map();
    for (const row of merged) {
        if (row.isTest === true || isListeningExcluded(row.memberEmail, env)) {
            excluded += 1;
            continue;
        }
        if (!row.activationSlug) continue;
        let bucket = grouped.get(row.activationSlug);
        if (!bucket) {
            bucket = { activationSlug: row.activationSlug, plays: 0, listenedSeconds: 0, finishes: 0 };
            grouped.set(row.activationSlug, bucket);
        }
        bucket.plays += 1;
        bucket.listenedSeconds = roundListenSeconds(bucket.listenedSeconds + (Number(row.listenedSeconds) || 0));
        if (row.finished === true) bucket.finishes += 1;
    }
    const ranked = [...grouped.values()].sort((a, b) =>
        b.plays - a.plays || b.listenedSeconds - a.listenedSeconds || a.activationSlug.localeCompare(b.activationSlug)
    );
    return {
        metric: "real_member_plays",
        definitions: METRIC_DEFINITIONS,
        rawSessions: merged.length,
        excludedSessions: excluded,
        rankedSessions: merged.length - excluded,
        top: ranked.slice(0, limit).map((row, index) => ({ rank: index + 1, ...row })),
    };
}
