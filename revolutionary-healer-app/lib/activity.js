// Future member activity. Identity comes from a server session when one
// exists. A browser email is never accepted as that identity. Device-only
// events stay unverified and are not attached to a member later.

import { isTester, normalizeTesterEmail } from "./testers.js";

export const ACTIVITY_TYPE = "activity";
export const OWNER_EMAIL = "rachaelsbutterflyeffect@gmail.com";
export const BATCH_LIMIT = 8;
export const BATCH_GAP_MS = 15000;
export const RESET_DAYS = ["intro", "d1", "d2", "d3", "d4", "d5"];
export const RESET_SLUGS = {
    intro: "rr-intro",
    d1: "slowing-the-mind",
    d2: "lifting-emotional-anxiety",
    d3: "embodiment-activation",
    d4: "power-activation",
    d5: "prosperity-flow-activation",
};

const EVENTS = new Set([
    "activation_open", "activation_play", "finder_complete", "reset_day",
    "gap_start", "gap_step", "gap_complete", "presence", "nav",
    "favorite_add", "favorite_remove", "code_pull",
]);
const PLAY_STATES = new Set(["start", "pause", "ended", "hidden"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9-]{1,80}$/;

export const COVERAGE_GAP = "People already inside the app on a saved email have no server session. New activity from those browsers is stored under a random device id and shown as unverified. It is not attached to a member, including after a later login. Browsers that do not open the app cannot be counted or signed out from here.";

export function torontoParts(now) {
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", weekday: "long" }).format(new Date(now));
    return { torontoDay: date, weekday };
}

export function addTorontoDays(day, count) {
    const [year, month, date] = day.split("-").map(Number);
    const utc = new Date(Date.UTC(year, month - 1, date + count));
    return utc.toISOString().slice(0, 10);
}

export function isTestIdentity(email, deviceId, env = process.env) {
    if (email && isTester(email, env)) return true;
    if (email && normalizeTesterEmail(email) === OWNER_EMAIL) return true;
    return false;
}

function num(value, max) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max;
}

export function validateActivityEvent(input) {
    if (!input || typeof input !== "object") return { error: "Invalid event." };
    const eventId = String(input.eventId || "").toLowerCase();
    const deviceId = String(input.deviceId || "").toLowerCase();
    if (!UUID.test(eventId) || !UUID.test(deviceId)) return { error: "Invalid event id." };
    if (!EVENTS.has(input.event)) return { error: "Unknown event." };
    const base = { eventId, deviceId, event: input.event };
    if (input.event === "activation_open" || input.event === "favorite_add" || input.event === "favorite_remove") {
        if (!SLUG.test(input.slug || "")) return { error: "Invalid activation." };
        return { value: { ...base, slug: input.slug, entry: String(input.entry || "").slice(0, 40) } };
    }
    if (input.event === "activation_play") {
        if (!SLUG.test(input.slug || "") || !UUID.test(String(input.playId || ""))) return { error: "Invalid play." };
        if (!PLAY_STATES.has(input.state)) return { error: "Invalid play state." };
        if (!num(input.listenedSeconds, 8 * 3600)) return { error: "Invalid listened time." };
        const duration = input.durationSeconds == null ? null : input.durationSeconds;
        if (duration != null && !num(duration, 8 * 3600)) return { error: "Invalid duration." };
        const proportion = duration > 0 ? Math.round((input.listenedSeconds / duration) * 1000) / 1000 : null;
        return { value: { ...base, playId: String(input.playId).toLowerCase(), slug: input.slug, state: input.state, listenedSeconds: input.listenedSeconds, durationSeconds: duration, proportion, finished: input.state === "ended" } };
    }
    if (input.event === "finder_complete") {
        const scores = input.scores;
        if (!Array.isArray(scores) || scores.length !== 3 || scores.some((score) => !num(score, 10))) return { error: "Invalid finder scores." };
        if (!SLUG.test(input.slug || "")) return { error: "Invalid activation." };
        return { value: { ...base, slug: input.slug, scores, bodyOrMind: input.bodyOrMind === "body" ? "body" : "mind", pace: input.pace === "slow" ? "slow" : "move" } };
    }
    if (input.event === "reset_day") {
        if (!RESET_DAYS.includes(input.dayId)) return { error: "Invalid reset day." };
        return { value: { ...base, dayId: input.dayId, slug: RESET_SLUGS[input.dayId] } };
    }
    if (input.event === "gap_start") return { value: { ...base, surface: String(input.surface || "app").slice(0, 40) } };
    if (input.event === "gap_step") {
        const step = Number(input.step);
        if (![1, 2, 3].includes(step)) return { error: "Invalid GAP step." };
        return { value: { ...base, step } };
    }
    if (input.event === "gap_complete") return { value: { ...base } };
    if (input.event === "code_pull") {
        const code = String(input.code || "").trim().slice(0, 40);
        const name = String(input.name || "").trim().slice(0, 80);
        if (!code || !name) return { error: "Invalid code." };
        return { value: { ...base, code, name, card: String(input.card || "").slice(0, 80) } };
    }
    if (input.event === "presence") {
        if (!num(input.foregroundSeconds, 6 * 3600) || !num(input.backgroundAudioSeconds, 6 * 3600)) return { error: "Invalid presence." };
        return { value: { ...base, foregroundSeconds: input.foregroundSeconds, backgroundAudioSeconds: input.backgroundAudioSeconds } };
    }
    if (input.event === "nav") {
        const screen = String(input.screen || "").slice(0, 60);
        if (!screen) return { error: "Invalid screen." };
        return { value: { ...base, screen } };
    }
    return { error: "Unknown event." };
}

export function stampActivity(value, { now, email, verified }) {
    const when = torontoParts(now);
    return {
        ...value,
        verified: verified === true,
        memberEmail: verified ? normalizeTesterEmail(email) : null,
        isTest: verified ? isTestIdentity(email, value.deviceId) : false,
        at: new Date(now).toISOString(),
        torontoDay: when.torontoDay,
        weekday: when.weekday,
    };
}

export function dedupeActivity(rows) {
    const seen = new Set();
    const out = [];
    for (const row of rows) {
        if (!row || seen.has(row.eventId)) continue;
        seen.add(row.eventId);
        out.push(row);
    }
    return out;
}

function inRange(row, from, to) {
    if (!row.torontoDay) return false;
    if (from && row.torontoDay < from) return false;
    if (to && row.torontoDay > to) return false;
    return true;
}

export function buildOwnerReport(rows, { from, to, now, includeTesters = false, includeUnverified = false } = {}) {
    const all = dedupeActivity(rows);
    const verified = all.filter((row) => row.verified === true);
    const unverified = all.filter((row) => row.verified !== true);
    const scoped = verified.filter((row) => (includeTesters || row.isTest !== true) && inRange(row, from, to));
    const plays = new Map();
    for (const row of scoped.filter((item) => item.event === "activation_play")) {
        const prev = plays.get(row.playId) || { playId: row.playId, slug: row.slug, listenedSeconds: 0, finished: false, memberEmail: row.memberEmail, torontoDay: row.torontoDay, at: row.at };
        prev.listenedSeconds = Math.max(prev.listenedSeconds, Number(row.listenedSeconds) || 0);
        prev.finished = prev.finished || row.finished === true || row.state === "ended";
        if (row.proportion != null) prev.proportion = row.proportion;
        if (!prev.at || String(row.at) < String(prev.at)) {
            prev.at = row.at;
            prev.torontoDay = row.torontoDay;
        }
        plays.set(row.playId, prev);
    }
    const playRows = [...plays.values()];
    const bySlug = new Map();
    for (const play of playRows) {
        const bucket = bySlug.get(play.slug) || { slug: play.slug, starts: 0, listenedSeconds: 0, finishes: 0 };
        bucket.starts += 1;
        bucket.listenedSeconds = Math.round((bucket.listenedSeconds + play.listenedSeconds) * 10) / 10;
        if (play.finished) bucket.finishes += 1;
        bySlug.set(play.slug, bucket);
    }
    const top = [...bySlug.values()].sort((a, b) => b.starts - a.starts || b.listenedSeconds - a.listenedSeconds || a.slug.localeCompare(b.slug)).slice(0, 5)
        .map((row, index) => ({ rank: index + 1, ...row }));
    const opens = scoped.filter((row) => row.event === "activation_open").length;
    const finder = scoped.filter((row) => row.event === "finder_complete");
    const reset = scoped.filter((row) => row.event === "reset_day");
    const resetMembers = new Map();
    for (const row of reset) {
        const key = row.memberEmail || row.deviceId;
        const days = resetMembers.get(key) || new Set();
        days.add(row.dayId);
        resetMembers.set(key, days);
    }
    const resetComplete = [...resetMembers.values()].filter((days) => RESET_DAYS.every((day) => days.has(day))).length;
    const today = torontoParts(now || Date.now()).torontoDay;
    const matureBefore = addTorontoDays(today, -1);
    const startsByDay = new Map();
    for (const play of playRows) {
        if (!play.torontoDay || play.torontoDay >= matureBefore) continue;
        const list = startsByDay.get(play.torontoDay) || [];
        list.push(play);
        startsByDay.set(play.torontoDay, list);
    }
    const cohorts = [...startsByDay.entries()].map(([day, list]) => {
        const next = addTorontoDays(day, 1);
        const people = new Set(list.map((play) => play.memberEmail).filter(Boolean));
        const returned = new Set(scoped.filter((row) => row.torontoDay === next && people.has(row.memberEmail)).map((row) => row.memberEmail));
        return { day, starts: people.size, returnedNextDay: returned.size, mature: true };
    });
    return {
        coverage: {
            verifiedEvents: verified.length,
            unverifiedEvents: unverified.length,
            unverifiedIncludedInAggregates: includeUnverified === true,
            testersIncludedInAggregates: includeTesters === true,
            gap: COVERAGE_GAP,
            legacyNote: "Chat counts, current favorites, and code pulls saved before a server session are labelled unverified because the email was supplied by the browser.",
        },
        totals: {
            activationOpens: opens,
            playStarts: playRows.length,
            naturalFinishes: playRows.filter((play) => play.finished).length,
            finderCompletes: finder.length,
            resetDayMarks: reset.length,
            resetSeriesCompletes: resetComplete,
            gapStarts: scoped.filter((row) => row.event === "gap_start").length,
            gapCompletes: scoped.filter((row) => row.event === "gap_complete").length,
            codePulls: scoped.filter((row) => row.event === "code_pull").length,
            foregroundSeconds: scoped.filter((row) => row.event === "presence").reduce((sum, row) => sum + row.foregroundSeconds, 0),
            backgroundAudioSeconds: scoped.filter((row) => row.event === "presence").reduce((sum, row) => sum + row.backgroundAudioSeconds, 0),
        },
        top5: top,
        cohorts,
        lastScreens: lastScreens(scoped),
        lastScreenNote: "Last observed screen in the range. This is not a claim that the member abandoned there.",
        unverifiedSummary: includeUnverified ? { events: unverified.filter((row) => inRange(row, from, to)).length } : { events: unverified.length, hiddenFromAggregates: true },
    };
}

function lastScreens(rows) {
    const byMember = new Map();
    for (const row of rows.filter((item) => item.event === "nav")) {
        const prev = byMember.get(row.memberEmail);
        if (!prev || prev.at < row.at) byMember.set(row.memberEmail, { memberEmail: row.memberEmail, screen: row.screen, at: row.at });
    }
    return [...byMember.values()];
}

export function memberTimeline(rows, email) {
    const normalized = normalizeTesterEmail(email);
    return dedupeActivity(rows).filter((row) => row.verified === true && row.memberEmail === normalized)
        .sort((a, b) => String(a.at).localeCompare(String(b.at)));
}
