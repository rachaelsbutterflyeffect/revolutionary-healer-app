// My Revolution tab + accordion tracking. One open logs once. Nothing is sent
// until the existing /api/activity nav event, and a same-turn hop to another
// refresh screen does not count.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { ACTIVITY_TYPE, stampActivity, validateActivityEvent } from "../lib/activity.js";

const require = createRequire(import.meta.url);
const { createClient } = require("../public/rh-activity.js");

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

test("a My Revolution open is a nav event on screen my-revolution", () => {
    const parsed = validateActivityEvent({ eventId, deviceId: device, event: "nav", screen: "my-revolution" });
    assert.equal(parsed.error, undefined);
    assert.equal(parsed.value.screen, "my-revolution");
    assert.equal(parsed.value.event, "nav");
    assert.equal("section" in parsed.value, false);
    const row = stampActivity(parsed.value, { now: Date.parse("2026-11-26T03:00:00Z"), email: "member@example.com", verified: true });
    const stored = activityMeta(row);
    const meta = JSON.parse(stored.meta);
    assert.equal(stored.type, "activity");
    assert.equal(meta.screen, "my-revolution");
    assert.equal(meta.event, "nav");
    assert.match(stored.meta, /"screen":"my-revolution"/);
    assert.equal(stored.meta.includes('"section"'), false);
    assert.match(fs.readFileSync("lib/activityStore.js", "utf8"), /meta: JSON\.stringify\(row\)/);
});

test("an opened accordion keeps its visible section name on the same nav event", () => {
    for (const section of ["GAP Method™ Shifts", "Code Upgrade Shifts"]) {
        const parsed = validateActivityEvent({ eventId, deviceId: device, event: "nav", screen: "my-revolution", section });
        assert.equal(parsed.value.section, section);
        const row = stampActivity(parsed.value, { now: Date.parse("2026-11-26T03:00:00Z"), email: "member@example.com", verified: true });
        const meta = JSON.parse(activityMeta(row).meta);
        assert.equal(meta.event, "nav");
        assert.equal(meta.screen, "my-revolution");
        assert.equal(meta.section, section);
    }
    const blank = validateActivityEvent({ eventId, deviceId: device, event: "nav", screen: "my-revolution", section: "   " });
    assert.equal("section" in blank.value, false);
});

test("one open logs once, a later open logs again, and a failed send does not throw", async () => {
    const sent = [];
    let clock = 1_000_000;
    const client = createClient({
        deviceId: device,
        now: () => clock,
        send: async (batch) => { sent.push(batch.map((row) => ({ ...row }))); return { ok: true }; },
    });
    await client.nav("my-revolution");
    await client.nav("my-revolution");
    const tabs = () => sent.flat().filter((row) => row.event === "nav" && row.screen === "my-revolution" && !row.section);
    assert.equal(tabs().length, 1);
    clock += 400;
    await client.nav("my-revolution");
    assert.equal(tabs().length, 2);
    await client.nav("my-revolution", "GAP Method™ Shifts");
    await client.nav("my-revolution", "GAP Method™ Shifts");
    clock += 400;
    await client.nav("my-revolution", "Code Upgrade Shifts");
    await client.nav("my-revolution", "Code Upgrade Shifts");
    const sections = sent.flat().filter((row) => row.section);
    assert.deepEqual(sections.map((row) => row.section), ["GAP Method™ Shifts", "Code Upgrade Shifts"]);
    assert.equal(sections.every((row) => row.event === "nav" && row.screen === "my-revolution"), true);
    const failing = createClient({
        deviceId: device,
        now: () => clock,
        schedule: () => 1,
        send: async () => { throw new Error("down"); },
    });
    await failing.nav("my-revolution");
    await failing.nav("library");
});

function trackSource(file) {
    const html = fs.readFileSync(file, "utf8");
    const start = html.indexOf("  function rhTrackMyRevolution() {");
    const end = html.indexOf("  function goToMyRevolution() {", start);
    assert.ok(start > 0 && end > start);
    return html.slice(start, end);
}

async function runTrack(src, { refresh, land }) {
    const sent = [];
    let clock = 1_000_000;
    const client = createClient({
        deviceId: device,
        now: () => clock,
        schedule: () => 1,
        send: async (batch) => { sent.push(...batch.map((row) => ({ event: row.event, screen: row.screen, section: row.section || "" }))); return { ok: true }; },
    });
    const timers = new Map();
    let nextId = 0;
    let screen = "home";
    const context = {
        setTimeout(fn) { nextId += 1; timers.set(nextId, fn); return nextId; },
        clearTimeout(id) { timers.delete(id); },
    };
    context.window = context;
    context.document = {
        body: {
            classList: { contains(name) { return refresh && name === "rf"; } },
            getAttribute(name) { return name === "data-rf" ? screen : ""; },
        },
    };
    context.window.rhActivity = client;
    vm.createContext(context);
    vm.runInContext(src + "\nrhTrackMyRevolution();\nrhTrackMyRevolution();", context);
    screen = land;
    for (const fn of timers.values()) fn();
    await new Promise((resolve) => setImmediate(resolve));
    return sent.filter((row) => row.event === "nav");
}

test("a refresh hop away from My Revolution does not log, and one open logs once", async () => {
    const classic = trackSource("public/app.html");
    const refresh = trackSource("public/app-refresh.html");
    assert.equal(classic, refresh);
    const one = [{ event: "nav", screen: "my-revolution", section: "" }];
    assert.deepEqual(await runTrack(classic, { refresh: false, land: "home" }), one);
    assert.deepEqual(await runTrack(classic, { refresh: true, land: "rev" }), one);
    assert.deepEqual(await runTrack(classic, { refresh: true, land: "focus" }), []);
});

test("both apps log the tab, and an accordion logs only while it opens", () => {
    for (const file of ["public/app.html", "public/app-refresh.html"]) {
        const html = fs.readFileSync(file, "utf8");
        assert.match(html, /function rhTrackMyRevolution\(\)/);
        assert.match(html, /function goToMyRevolution\(\) \{[\s\S]*rhTrackMyRevolution\(\);/);
        assert.match(html, /data-rf'\) !== 'rev'/);
        assert.match(html, /rhActivity\.nav\('my-revolution'\)/);
    }
    const refresh = fs.readFileSync("scripts/ui-refresh/refresh.js", "utf8");
    const refreshPage = fs.readFileSync("public/app-refresh.html", "utf8");
    const hook = "if (s === 'rev') { try { if (typeof rhTrackMyRevolution === 'function') rhTrackMyRevolution(); } catch (e) {} }";
    assert.equal(refresh.includes(hook), true);
    assert.equal(refreshPage.includes(hook), true);
    const sections = fs.readFileSync("public/rf-sections.js", "utf8");
    assert.match(sections, /GAP Method™ Shifts/);
    assert.match(sections, /Code Upgrade Shifts/);
    const openAt = sections.indexOf("if (open) {");
    const logAt = sections.indexOf("window.rhActivity.nav('my-revolution', sectionName)");
    assert.ok(openAt > 0 && logAt > openAt);
    assert.equal(sections.indexOf("window.rhActivity.nav('my-revolution', sectionName)"), sections.lastIndexOf("window.rhActivity.nav('my-revolution', sectionName)"));
    assert.equal(fs.readFileSync("public/bf26.js", "utf8").includes("my-revolution"), false);
    assert.equal(fs.readFileSync("public/bf26.css", "utf8").includes("rhActivity"), false);
});

await Promise.all(tests);
if (process.exitCode) console.error("rev tracking tests failed");
else console.log(`\n${tests.length} passed`);
