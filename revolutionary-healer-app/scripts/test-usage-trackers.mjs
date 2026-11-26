// Live usage counters only. A chat category card tap and the activation
// finder write Events type "activity". A second fire in the same moment
// is dropped. Nothing here changes the chat or the finder result.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { ACTIVITY_TYPE, stampActivity, validateActivityEvent } from "../lib/activity.js";

const root = new URL("../", import.meta.url);
const require = createRequire(import.meta.url);
const { createClient } = require("../public/rh-activity.js");
function read(rel) {
    return fs.readFileSync(new URL(rel, root), "utf8");
}

function activityMeta(row) {
    return { type: ACTIVITY_TYPE, meta: JSON.stringify(row), created_at: row.at };
}

const device = "00000000-0000-4000-8000-000000000001";
const eventId = "00000000-0000-4000-8000-000000000002";
const tests = [];
function test(name, fn) {
    tests.push(Promise.resolve().then(fn).then(() => { console.log("ok - " + name); }, (err) => {
        console.error("FAIL - " + name);
        console.error(err);
        process.exitCode = 1;
    }));
}

function client(send, clock) {
    return createClient({
        deviceId: device,
        now: () => clock.t,
        schedule: () => 1,
        send,
    });
}

test("a chat card tap is an activity row with the card label", () => {
    const parsed = validateActivityEvent({ eventId, deviceId: device, event: "chat_card_tap", card: "  Money & Prosperity  " });
    assert.equal(parsed.error, undefined);
    assert.equal(parsed.value.event, "chat_card_tap");
    assert.equal(parsed.value.card, "Money & Prosperity");
    const row = stampActivity(parsed.value, { now: Date.parse("2026-11-26T03:00:00Z"), email: "member@example.com", verified: true });
    const stored = activityMeta(row);
    const meta = JSON.parse(stored.meta);
    assert.equal(stored.type, "activity");
    assert.equal(meta.event, "chat_card_tap");
    assert.equal(meta.card, "Money & Prosperity");
    assert.match(read("lib/activityStore.js"), /meta: JSON\.stringify\(row\)/);
    const blank = validateActivityEvent({ eventId, deviceId: device, event: "chat_card_tap", card: "   " });
    assert.equal(blank.error, "Invalid card.");
});

test("finder start and complete use the new event names, and the name is optional", () => {
    const start = validateActivityEvent({ eventId, deviceId: device, event: "activation_finder_start" });
    assert.equal(start.error, undefined);
    assert.equal(start.value.event, "activation_finder_start");
    assert.equal("activation" in start.value, false);
    const done = validateActivityEvent({
        eventId, deviceId: device, event: "activation_finder_complete", activation: " Nervous System Recalibration Activation ",
    });
    assert.equal(done.value.activation, "Nervous System Recalibration Activation");
    const meta = JSON.parse(activityMeta(stampActivity(done.value, { now: Date.parse("2026-11-26T03:00:00Z"), email: "member@example.com", verified: true })).meta);
    assert.equal(meta.event, "activation_finder_complete");
    assert.equal(meta.activation, "Nervous System Recalibration Activation");
    const unnamed = validateActivityEvent({ eventId, deviceId: device, event: "activation_finder_complete", activation: "  " });
    assert.equal(unnamed.error, undefined);
    assert.equal("activation" in unnamed.value, false);
});

test("one tap logs once, a different card logs again, and a failed send does not throw", async () => {
    const sent = [];
    const clock = { t: 1_000_000 };
    const api = client(async (batch) => { sent.push(batch.map((row) => ({ ...row }))); return { ok: true }; }, clock);
    await api.chatCard("Spiritual Gifts");
    await api.chatCard("Spiritual Gifts");
    await api.chatCard("  Energy & Frequency ");
    clock.t += 400;
    await api.chatCard("Spiritual Gifts");
    const cards = sent.flat().filter((row) => row.event === "chat_card_tap");
    assert.deepEqual(cards.map((row) => row.card), ["Spiritual Gifts", "Energy & Frequency", "Spiritual Gifts"]);
    const failing = client(async () => { throw new Error("down"); }, clock);
    await failing.chatCard("Visibility & Impact");
    await failing.finderStart();
    await failing.finderDone("Visibility Activation");
});

test("finder start and complete each log once, and the existing finder result still flushes with the name", async () => {
    const sent = [];
    const clock = { t: 2_000_000 };
    const api = client(async (batch) => { sent.push(batch.map((row) => ({ event: row.event, activation: row.activation || "", slug: row.slug || "" }))); return { ok: true }; }, clock);
    await api.finderStart();
    await api.finderStart();
    clock.t += 400;
    await api.finderDone("Nervous System Recalibration Activation", true);
    await api.finderDone("Nervous System Recalibration Activation", true);
    assert.equal(sent.flat().some((row) => row.event === "activation_finder_complete"), false);
    await api.finder({ slug: "nervous-system-recalibration", scores: [1, 9, 9], bm: "body", sm: "slow" });
    const flat = sent.flat();
    assert.deepEqual(flat.map((row) => row.event), ["activation_finder_start", "activation_finder_complete", "finder_complete"]);
    assert.equal(flat[1].activation, "Nervous System Recalibration Activation");
    assert.equal(flat[2].slug, "nervous-system-recalibration");
    clock.t += 400;
    await api.finderDone("", true);
    await api.finder({ slug: "grounding", scores: [8, 8, 8], bm: "mind", sm: "move" });
    const second = sent.flat().filter((row) => row.event === "activation_finder_complete");
    assert.equal(second.length, 2);
    assert.equal(second[1].activation, "");
});

test("refresh logs the square category cards, classic has none, and the chat reply path is untouched", () => {
    const refresh = read("scripts/ui-refresh/refresh.js");
    const page = read("public/app-refresh.html");
    const classic = read("public/app.html");
    const click = refresh.indexOf("e.target.closest('[data-rf-lane]')");
    const log = refresh.indexOf("window.rhActivity.chatCard(label)", click);
    const lane = refresh.indexOf("startLane(lane)", log);
    assert.ok(click > 0 && log > click && lane > log);
    assert.equal(refresh.split("window.rhActivity.chatCard(label)").length - 1, 1);
    assert.equal(page.split("window.rhActivity.chatCard(label)").length - 1, 1);
    assert.equal(classic.includes("data-rf-lane"), false);
    assert.equal(classic.includes("chatCard"), false);
    assert.equal(classic.includes("finderStart"), false);
    const typeStart = refresh.indexOf("function startLane(lane)");
    const typeEnd = refresh.indexOf("function laneChips(lane)", typeStart);
    const typewriter = refresh.slice(typeStart, typeEnd);
    assert.match(typewriter, /setTimeout\(tick/);
    assert.equal(typewriter.includes("rhActivity"), false);
    const bottom = "function toBottom() { var th = document.getElementById('rh-chat-thread'); if (th) setTimeout(function () { th.scrollTop = th.scrollHeight; }, 30); }";
    assert.equal(refresh.includes(bottom), true);
    assert.equal(bottom.includes("rhActivity"), false);
    for (const file of ["public/bf26.js", "public/bf26.css"]) {
        const text = read(file);
        assert.equal(text.includes("chat_card_tap"), false);
        assert.equal(text.includes("finderStart"), false);
        assert.equal(text.includes("activation_finder"), false);
    }
    assert.match(classic, /function rhTrackMyRevolution\(\)/);
    assert.match(page, /function rhTrackMyRevolution\(\)/);
});

test("the fits-you-today finder logs a start on open and a named complete beside the existing result", () => {
    const checkin = read("public/rf-checkin.js");
    const door = checkin.indexOf("data-rf-go=\"fit\"]')) { dv = []; dp = {}; dStep(0); try { if (window.rhActivity && typeof window.rhActivity.finderStart === 'function') window.rhActivity.finderStart();");
    const retake = checkin.indexOf("$('#d-again').onclick = function () { dv = []; dp = {}; dStep(0); try { if (window.rhActivity && typeof window.rhActivity.finderStart === 'function') window.rhActivity.finderStart();");
    const done = checkin.indexOf("window.rhActivity.finderDone(finderName, true)");
    const kept = checkin.indexOf("window.rhActivity.finder(window.__rfCheckinResult)");
    assert.ok(door > 0 && retake > 0 && done > 0 && kept > done);
    assert.equal(checkin.split("finderStart()").length - 1, 2);
    assert.equal(checkin.includes("dStep(0); swirl();"), true);
    assert.equal(checkin.slice(checkin.indexOf("dStep(0); swirl();") - 40, checkin.indexOf("dStep(0); swirl();")).includes("finderStart"), false);
    assert.equal((checkin.match(/activation that best fits you today/g) || []).length, 3);
});

await Promise.all(tests);
if (process.exitCode) console.error("usage tracker tests failed");
else console.log(`\n${tests.length} passed`);
