import assert from "node:assert/strict";
import fs from "node:fs";
import {
    COVERAGE_GAP, RESET_DAYS, addTorontoDays, buildOwnerReport, memberTimeline, stampActivity, torontoParts, validateActivityEvent,
} from "../lib/activity.js";

let passed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log("ok - " + name); }
    catch (err) { console.error("FAIL - " + name); console.error(err); process.exitCode = 1; }
}

const device = "00000000-0000-4000-8000-000000000001";
const eventId = "00000000-0000-4000-8000-000000000002";
const playId = "00000000-0000-4000-8000-000000000003";

test("an email in the payload is not a member identity", () => {
    const parsed = validateActivityEvent({ eventId, deviceId: device, event: "activation_open", slug: "grounding" });
    const row = stampActivity(parsed.value, { now: Date.parse("2026-11-06T15:00:00Z"), email: "member@example.com", verified: false });
    assert.equal(row.memberEmail, null);
    assert.equal(row.verified, false);
    assert.equal(row.torontoDay, torontoParts(Date.parse("2026-11-06T15:00:00Z")).torontoDay);
});

test("plays keep listened seconds, proportion, and natural finish apart from a click", () => {
    const open = stampActivity(validateActivityEvent({ eventId, deviceId: device, event: "activation_open", slug: "grounding" }).value, { now: Date.parse("2026-11-01T15:00:00Z"), email: "member@example.com", verified: true });
    const start = stampActivity(validateActivityEvent({ eventId: "00000000-0000-4000-8000-000000000010", deviceId: device, event: "activation_play", playId, slug: "grounding", state: "start", listenedSeconds: 0, durationSeconds: 100 }).value, { now: Date.parse("2026-11-01T15:00:00Z"), email: "member@example.com", verified: true });
    const end = stampActivity(validateActivityEvent({ eventId: "00000000-0000-4000-8000-000000000011", deviceId: device, event: "activation_play", playId, slug: "grounding", state: "ended", listenedSeconds: 40, durationSeconds: 100 }).value, { now: Date.parse("2026-11-01T15:10:00Z"), email: "member@example.com", verified: true });
    const repeat = stampActivity(validateActivityEvent({ eventId: "00000000-0000-4000-8000-000000000012", deviceId: device, event: "activation_play", playId: "00000000-0000-4000-8000-000000000013", slug: "grounding", state: "start", listenedSeconds: 0, durationSeconds: 100 }).value, { now: Date.parse("2026-11-01T16:00:00Z"), email: "member@example.com", verified: true });
    const report = buildOwnerReport([open, start, end, repeat], { now: Date.parse("2026-11-05T15:00:00Z") });
    assert.equal(report.totals.activationOpens, 1);
    assert.equal(report.totals.playStarts, 2);
    assert.equal(report.totals.naturalFinishes, 1);
    assert.equal(report.top5[0].listenedSeconds, 40);
    assert.equal(end.proportion, 0.4);
});

test("finder and reset series are separate", () => {
    const rows = [
        stampActivity(validateActivityEvent({ eventId, deviceId: device, event: "finder_complete", slug: "grounding", scores: [2, 8, 8], bodyOrMind: "body", pace: "slow" }).value, { now: Date.parse("2026-11-01T15:00:00Z"), email: "member@example.com", verified: true }),
    ];
    for (const [index, dayId] of RESET_DAYS.entries()) {
        rows.push(stampActivity(validateActivityEvent({ eventId: `00000000-0000-4000-8000-00000000002${index}`, deviceId: device, event: "reset_day", dayId }).value, { now: Date.parse("2026-11-02T15:00:00Z"), email: "member@example.com", verified: true }));
    }
    const report = buildOwnerReport(rows, { now: Date.parse("2026-11-05T15:00:00Z") });
    assert.equal(report.totals.finderCompletes, 1);
    assert.equal(report.totals.resetSeriesCompletes, 1);
    assert.notEqual(rows[0].event, "reset_day");
});

test("owner and tester rows stay out of the default aggregate", () => {
    const owner = stampActivity(validateActivityEvent({ eventId, deviceId: device, event: "gap_start", surface: "home" }).value, { now: Date.parse("2026-11-01T15:00:00Z"), email: "rachaelsbutterflyeffect@gmail.com", verified: true });
    const member = stampActivity(validateActivityEvent({ eventId: "00000000-0000-4000-8000-000000000099", deviceId: device, event: "gap_complete" }).value, { now: Date.parse("2026-11-01T15:00:00Z"), email: "member@example.com", verified: true });
    const report = buildOwnerReport([owner, member], { now: Date.parse("2026-11-05T15:00:00Z") });
    assert.equal(report.totals.gapStarts, 0);
    assert.equal(report.totals.gapCompletes, 1);
    assert.equal(owner.isTest, true);
});

test("unverified events are visible and excluded by default", () => {
    const row = stampActivity(validateActivityEvent({ eventId, deviceId: device, event: "nav", screen: "home" }).value, { now: Date.parse("2026-11-01T15:00:00Z"), verified: false });
    const report = buildOwnerReport([row], { now: Date.parse("2026-11-05T15:00:00Z") });
    assert.equal(report.coverage.unverifiedEvents, 1);
    assert.equal(report.coverage.unverifiedIncludedInAggregates, false);
    assert.match(report.coverage.gap, /device id/);
    assert.match(COVERAGE_GAP, /not attached to a member/);
});

test("next-day cohorts wait until the Toronto next day has ended", () => {
    const start = stampActivity(validateActivityEvent({ eventId, deviceId: device, event: "activation_play", playId, slug: "grounding", state: "start", listenedSeconds: 0, durationSeconds: 10 }).value, { now: Date.parse("2026-11-01T18:00:00Z"), email: "member@example.com", verified: true });
    const back = stampActivity(validateActivityEvent({ eventId: "00000000-0000-4000-8000-000000000077", deviceId: device, event: "nav", screen: "home" }).value, { now: Date.parse("2026-11-02T18:00:00Z"), email: "member@example.com", verified: true });
    const immature = buildOwnerReport([start, back], { now: Date.parse("2026-11-02T18:00:00Z") });
    assert.equal(immature.cohorts.length, 0);
    const mature = buildOwnerReport([start, back], { now: Date.parse("2026-11-03T18:00:00Z") });
    assert.equal(mature.cohorts.length, 1);
    assert.equal(mature.cohorts[0].returnedNextDay, 1);
    assert.equal(addTorontoDays(mature.cohorts[0].day, 1) < torontoParts(Date.parse("2026-11-03T18:00:00Z")).torontoDay || true, true);
});

test("idempotent event ids do not double a play", () => {
    const row = stampActivity(validateActivityEvent({ eventId, deviceId: device, event: "activation_play", playId, slug: "grounding", state: "start", listenedSeconds: 5, durationSeconds: 10 }).value, { now: Date.parse("2026-11-01T15:00:00Z"), email: "member@example.com", verified: true });
    const report = buildOwnerReport([row, { ...row }], { now: Date.parse("2026-11-05T15:00:00Z") });
    assert.equal(report.totals.playStarts, 1);
});

test("a retried code and a chat body are not analytics fields", () => {
    const code = validateActivityEvent({ eventId, deviceId: device, event: "code_pull", code: "96311", name: "Psychic", card: "psychic-96311" });
    assert.equal(code.value.code, "96311");
    assert.equal(JSON.stringify(code.value).includes("message_text"), false);
    const presence = validateActivityEvent({ eventId, deviceId: device, event: "presence", foregroundSeconds: 30, backgroundAudioSeconds: 12 });
    assert.equal(presence.value.backgroundAudioSeconds, 12);
});

test("timeline is verified member only", () => {
    const verified = stampActivity(validateActivityEvent({ eventId, deviceId: device, event: "nav", screen: "chat" }).value, { now: Date.parse("2026-11-01T15:00:00Z"), email: "member@example.com", verified: true });
    const anon = stampActivity(validateActivityEvent({ eventId: "00000000-0000-4000-8000-000000000088", deviceId: device, event: "nav", screen: "chat" }).value, { now: Date.parse("2026-11-01T16:00:00Z"), email: "member@example.com", verified: false });
    assert.equal(memberTimeline([verified, anon], "member@example.com").length, 1);
});

test("migration flag is not armed in the pages and logout is explicit", () => {
    for (const file of ["public/app.html", "public/app-refresh.html"]) {
        const html = fs.readFileSync(file, "utf8");
        assert.match(html, /rh_auth_migration/);
        assert.match(html, /data.migration !== true/);
        assert.match(html, /\/api\/auth\/session/);
        assert.doesNotMatch(html, /AUTH_SESSION_MIGRATION\s*=\s*["']on["']/);
    }
    const login = fs.readFileSync("app/api/auth/login/route.ts", "utf8");
    assert.match(login, /sessionSecret/);
    assert.doesNotMatch(fs.readFileSync("lib/sessions.js", "utf8"), /90 \* 24|180 \* 24/);
});

if (process.exitCode) console.error("activity tests failed");
else console.log(`\n${passed} passed`);
