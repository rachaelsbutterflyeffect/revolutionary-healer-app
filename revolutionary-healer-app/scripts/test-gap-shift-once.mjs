// Dev-only tests for the duplicate-save fix (Oct 8 2026): one GAP run = one
// Shift card. NOT part of the app: nothing imports this file. No secrets, no
// real Airtable: the REAL /api/gap-shift route (main's and this branch's) and
// the REAL page save code from public/app.html (main's and this branch's) run
// against an in-memory fake Shifts table.
//
//   npm run test:gap-shift-once
//
//  A. Reproduce-then-fix at the route: the same save arriving twice (lost
//     response + retry, concurrent double POST, older cached page) makes TWO
//     Shifts on main and ONE with the fix; separate runs still get one each.
//  B. Reproduce-then-fix with the real page code: slow network / lost response
//     + "Listen now" retry, and double taps during a slow save.
//  C. Content unchanged: createShiftFromChat gets exactly main's arguments.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const BASE = process.env.GAP_SHIFT_ONCE_BASE || "89c9696"; // main before the fix (PR 38 merge = live at 2:42 PM ET Oct 8)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rh-gap-shift-once-"));
const read = (f) => fs.readFileSync(path.join(appRoot, f), "utf8");
const gitShow = (f) => execFileSync("git", ["show", `${BASE}:revolutionary-healer-app/${f}`], { cwd: appRoot, encoding: "utf8", maxBuffer: 64 << 20 });
const nextServer = pathToFileURL(path.join(appRoot, "node_modules", "next", "server.js")).href;

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`ok - ${name}`); }
  catch (err) { failed++; console.error(`FAIL - ${name}\n   ${err && err.stack ? err.stack.split("\n").slice(0, 6).join("\n   ") : err}`); }
}
const quiet = async (fn) => { const { log, error, warn, info } = console; const lines = []; console.log = console.error = console.warn = console.info = (...a) => lines.push(a.map(String).join(" ")); try { return await fn(lines); } finally { Object.assign(console, { log, error, warn, info }); } };

// ---------------------------------------------------------------------------
// Fake Shifts table shared by every module (globalThis.__db)
// ---------------------------------------------------------------------------
fs.writeFileSync(path.join(tmp, "fake-airtable-lib.mjs"), `
export function normalizeEmail(e) { return String(e || "").trim().toLowerCase(); }
export async function createShiftFromChat(a) {
  const db = globalThis.__db; db.calls.push(JSON.parse(JSON.stringify(a)));
  if (db.createDelayMs) await new Promise((r) => setTimeout(r, db.createDelayMs));
  if (db.failCreate && db.failCreate()) throw new Error("airtable create failed");
  const now = new Date(db.now()).toISOString();
  const rec = { id: "recShift" + (db.rows.length + 1), createdTime: now, fields: { member_email: normalizeEmail(a.email), method_name: a.methodName, divine_identity_slug: a.divineIdentitySlug, divine_identity_name: a.divineIdentityName, current_frequency: a.currentFrequency, focus_area: a.focusArea, gap_explanation: a.gapExplanation, what_we_noticed: a.whatWeNoticed, recommended_activation: a.recommendedActivation, created_at: now, ...(a.todaysFocus ? { todays_focus: a.todaysFocus } : {}) } };
  db.rows.push(rec); return rec;
}
export async function getShiftsByEmail(email) {
  const db = globalThis.__db; db.lookups++;
  if (db.failLookup) throw new Error("airtable lookup failed");
  return db.rows.filter((r) => r.fields.member_email === normalizeEmail(email)).slice().reverse();
}
`);
fs.writeFileSync(path.join(tmp, "fake-entitlements.mjs"), `export async function getEntitlementForEmail() { return { record: { id: "recMember1" }, entitlement: { canUseBase: true } }; }`);
const fakeLib = pathToFileURL(path.join(tmp, "fake-airtable-lib.mjs")).href;
const fakeEnt = pathToFileURL(path.join(tmp, "fake-entitlements.mjs")).href;
let seq = 0;
function load(src, name) {
  const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
  const f = path.join(tmp, `${name}-${++seq}.mjs`); fs.writeFileSync(f, out); return import(pathToFileURL(f).href);
}
const onceSrc = read("lib/gapShiftOnce.js").replace(/from "\.\/airtable"/, `from "${fakeLib}"`);
const onceFile = path.join(tmp, "gapShiftOnce.mjs"); fs.writeFileSync(onceFile, onceSrc);
const ONCE = await import(pathToFileURL(onceFile).href);
const wire = (src) => src.replace(/from "next\/server"/, `from "${nextServer}"`).replace(/from "@\/lib\/entitlements"/, `from "${fakeEnt}"`).replace(/from "@\/lib\/airtable"/, `from "${fakeLib}"`).replace(/from "@\/lib\/gapShiftOnce"/, `from "${pathToFileURL(onceFile).href}"`);
const NEW = await load(wire(read("app/api/gap-shift/route.ts")), "route-new");
const OLD = await load(wire(gitShow("app/api/gap-shift/route.ts")), "route-old");

function freshDb(over = {}) { ONCE.__resetGapShiftOnce(); globalThis.__db = { rows: [], calls: [], lookups: 0, now: () => Date.now(), ...over }; return globalThis.__db; }
const ageRows = (db, ms) => db.rows.forEach((r) => { r.fields.created_at = r.createdTime = new Date(Date.parse(r.fields.created_at) - ms).toISOString(); });
const mkReq = (body) => new Request("http://localhost/api/gap-shift", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const post = async (route, body) => { const r = await route.POST(mkReq(body)); return { status: r.status, body: await r.json() }; };
const READING = { email: "member@example.com", divineIdentitySlug: "creator", divineIdentityName: "The Creator", currentFrequency: "Control", focusArea: "GAP Method", gapExplanation: "You know your work is valuable, and you discount it the moment you say the number.", whatWeNoticed: "You soften the price before anyone reacts.\n\nPrimary Shift: From controlling the outcome, into letting your price stand.", recommendedActivation: "Million Dollar Blueprint Activation", todaysFocus: "As The Creator, let your price stand today." };
const OTHER = { ...READING, divineIdentitySlug: "guardian", divineIdentityName: "The Guardian", currentFrequency: "Over-Responsibility", gapExplanation: "You make everyone feel safe and pay for it with your own depletion.", whatWeNoticed: "Automatic yes.\n\nPrimary Shift: From carrying it all, into being supported.", recommendedActivation: "Nervous System Recalibration" };
const PLACEHOLDER = { ...READING, gapExplanation: "This reflection wasn't captured this time -- reopen a fresh GAP Method walkthrough to generate it.", whatWeNoticed: "This part of the reflection wasn't captured this time -- reopen a fresh GAP Method walkthrough to generate it.", todaysFocus: undefined };

// ---------------------------------------------------------------------------
console.log("# A. Route: reproduce on main, fixed on this branch");
await test("REPRO lost response + retry (same save sent twice): main makes 2 Shifts; fix makes 1 and returns the same shiftId", async () => {
  await quiet(async () => {
    let db = freshDb(); const body = { ...READING, clientRunId: "gr_test_run_1" };
    await post(OLD, body); await post(OLD, body); assert.equal(db.rows.length, 2, "main should reproduce the duplicate");
    db = freshDb(); const a = await post(NEW, body), b = await post(NEW, body);
    assert.equal(db.rows.length, 1); assert.equal(a.body.shiftId, b.body.shiftId); assert.equal(b.body.deduped, true);
    assert.deepEqual(a.body, { shiftId: "recShift1" }, "a normal first save answers exactly like main");
  });
});
await test("REPRO concurrent double POST (double tap / two tabs racing, slow Airtable): main 2 Shifts; fix 1", async () => {
  await quiet(async () => {
    let db = freshDb({ createDelayMs: 60 }); const body = { ...READING, clientRunId: "gr_test_run_2" };
    await Promise.all([post(OLD, body), post(OLD, body)]); assert.equal(db.rows.length, 2);
    db = freshDb({ createDelayMs: 60 });
    const [a, b, c] = await Promise.all([post(NEW, body), post(NEW, body), post(NEW, body)]);
    assert.equal(db.rows.length, 1); assert.equal(new Set([a.body.shiftId, b.body.shiftId, c.body.shiftId]).size, 1);
  });
});
await test("REPRO older cached page (no run id) re-sending the same reading: main 2; fix 1 (same reading = same card), across server instances", async () => {
  await quiet(async () => {
    let db = freshDb(); await post(OLD, READING); await post(OLD, READING); assert.equal(db.rows.length, 2);
    db = freshDb(); await post(NEW, READING); ONCE.__resetGapShiftOnce(); /* a different, cold server instance */ ageRows(db, 4 * 60 * 1000);
    const b = await post(NEW, READING); assert.equal(db.rows.length, 1); assert.equal(b.body.deduped, true);
  });
});
await test("separate runs still get one card each: different readings, and 2 placeholder ('wasn't captured') runs with different run ids", async () => {
  await quiet(async () => {
    const db = freshDb();
    await post(NEW, { ...READING, clientRunId: "gr_run_A_0001" }); await post(NEW, { ...OTHER, clientRunId: "gr_run_B_0001" });
    await post(NEW, { ...PLACEHOLDER, clientRunId: "gr_run_C_0001" }); await post(NEW, { ...PLACEHOLDER, clientRunId: "gr_run_D_0001" });
    assert.equal(db.rows.length, 4);
    await post(NEW, { ...PLACEHOLDER, clientRunId: "gr_run_D_0001" }); assert.equal(db.rows.length, 4, "same run id is still one card");
  });
});
await test("same reading more than 15 minutes later is treated as a new save (window); other members are never matched", async () => {
  await quiet(async () => {
    const db = freshDb(); await post(NEW, READING); ageRows(db, 16 * 60 * 1000); ONCE.__resetGapShiftOnce();
    await post(NEW, READING); assert.equal(db.rows.length, 2);
    await post(NEW, { ...READING, email: "someone.else@example.com" }); assert.equal(db.rows.length, 3);
  });
});
await test("the check never blocks a save: lookup failure -> saved exactly once, as before", async () => {
  await quiet(async (lines) => {
    const db = freshDb({ failLookup: true }); const r = await post(NEW, { ...READING, clientRunId: "gr_lookup_fail" });
    assert.equal(r.status, 200); assert.equal(db.rows.length, 1); assert.ok(lines.some((l) => /duplicate check skipped/.test(l)));
  });
});
await test("a save that really failed can be retried with the same run id and then saves once", async () => {
  await quiet(async () => {
    let n = 0; const db = freshDb({ failCreate: () => ++n === 1 }); const body = { ...READING, clientRunId: "gr_retry_after_fail" };
    await assert.rejects(() => post(NEW, body), /airtable create failed/);
    const r = await post(NEW, body); assert.equal(r.status, 200); assert.equal(db.rows.length, 1);
    await post(NEW, body); assert.equal(db.rows.length, 1);
  });
});

// ---------------------------------------------------------------------------
console.log("\n# C. Card content unchanged");
await test("createShiftFromChat gets EXACTLY main's arguments (with and without Today's Focus, with and without a run id); 400 unchanged", async () => {
  await quiet(async () => {
    for (const body of [READING, { ...READING, todaysFocus: undefined }, OTHER, PLACEHOLDER]) {
      let db = freshDb(); await post(OLD, body); const o = db.calls;
      db = freshDb(); await post(NEW, { ...body, clientRunId: "gr_content_check" }); assert.deepEqual(db.calls, o);
      db = freshDb(); await post(NEW, body); assert.deepEqual(db.calls, o);
    }
    freshDb(); const a = await post(OLD, { ...READING, divineIdentitySlug: "" }), b = await post(NEW, { ...READING, divineIdentitySlug: "" });
    assert.equal(b.status, 400); assert.deepEqual(b.body, a.body);
  });
});

// ---------------------------------------------------------------------------
// B. The REAL page save code (autoCreateMemberShift + gapListenNow) in a sandbox
// ---------------------------------------------------------------------------
console.log("\n# B. Page save code: reproduce on main, fixed on this branch");
function grab(html, start, opts = {}) {
  const i = html.indexOf(start); if (i < 0) { if (opts.optional) return ""; throw new Error("not found: " + start); }
  let j = html.indexOf("{", i), d = 0, k = j;
  for (; k < html.length; k++) { if (html[k] === "{") d++; else if (html[k] === "}") { d--; if (d === 0) break; } }
  return html.slice(i, k + 1);
}
function pageCode(html) {
  return ["var gapListenBusy = false;", grab(html, "function gapShiftNewRunId()", { optional: true }), grab(html, "function autoCreateMemberShift()"), grab(html, "function gapListenNow(btn)")].join("\n");
}
const PAGE_NEW = pageCode(read("public/app.html")), PAGE_OLD = pageCode(gitShow("public/app.html"));
assert.ok(/clientRunId/.test(PAGE_NEW) && !/clientRunId/.test(PAGE_OLD));
const resetSnippet = (html) => { const i = html.indexOf("function resetGapMethodState() {"); return html.slice(i, html.indexOf("if (typeof gapCancelReading", i)) + "}"; };

function makePage(code, route, { net = () => ({}) } = {}) {
  const posts = [];
  const status = { textContent: "", hidden: true };
  const ctx = {
    console: { info() {}, error() {}, log() {}, warn() {} }, JSON, Math, Date, Promise, String, Object, Array,
    setTimeout: (f, ms) => setTimeout(f, Math.max(0, ms / 1000)), // 1000x faster clock: 20s -> 20ms
    sessionStorage: { setItem() {}, getItem() { return null; } },
    document: { getElementById: (id) => (id === "d3-listen-status" ? status : null) },
    RH_EMAIL: "member@example.com", winnerKey: "creator",
    ARCHETYPES: { creator: { name: "The Creator", label: "Control", activation: { title: "Million Dollar Blueprint Activation" } } },
    ACTIVATION_DETAILS: { "gap-method-creator": { title: "Million Dollar Blueprint Activation" } },
    getGapIdentitySlugForKey: () => "creator", getGapActivationSlugForKey: () => "gap-method-creator",
    gapResolveActivation: () => ({ source: "ai", slug: "gap-method-creator", title: "Million Dollar Blueprint Activation" }),
    closeHeroGapEmbed() { ctx.opened = (ctx.opened || 0) + 1; }, handleActivationCardClick() {},
    SHIFTS: [],
    loadMemberRevolutionData: async () => { ctx.SHIFTS.length = 0; globalThis.__db.rows.forEach((r) => ctx.SHIFTS.push({ id: r.id })); },
    fetch: async (url, opts) => {
      const body = JSON.parse(opts.body); posts.push(body);
      const n = net(posts.length) || {};
      if (n.delayBeforeServerMs) await new Promise((r) => ctx.setTimeout(r, n.delayBeforeServerMs));
      const res = await route.POST(mkReq(body));
      if (n.delayAfterServerMs) await new Promise((r) => ctx.setTimeout(r, n.delayAfterServerMs));
      if (n.loseResponse) throw new TypeError("Failed to fetch"); // the save landed, the phone never heard back
      return res;
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(code + "\n" + "this.__card = function () { window.__gapCardData = { gap: " + JSON.stringify(READING.gapExplanation) + ", howItShowsUp: 'You soften the price before anyone reacts.', primaryShift: 'From controlling the outcome, into letting your price stand.' }; window.__gapReading = { enabled: true, todaysFocus: 'As The Creator, let your price stand today.' }; };", ctx);
  ctx.__card();
  const btn = { textContent: "Listen now →" };
  const settle = (ms = 200) => new Promise((r) => setTimeout(r, ms));
  return { ctx, posts, status, btn, settle, tap: () => ctx.gapListenNow(btn), arrive: () => ctx.autoCreateMemberShift() };
}

await test("REPRO slow network, the save lands but the response is lost, member taps Listen now: main 2 Shifts; fix 1 (retry carries the same run id)", async () => {
  await quiet(async () => {
    for (const [code, route, want] of [[PAGE_OLD, OLD, 2], [PAGE_NEW, NEW, 1]]) {
      const db = freshDb();
      const p = makePage(code, route, { net: (n) => (n === 1 ? { delayAfterServerMs: 3000, loseResponse: true } : {}) });
      p.arrive(); await p.settle(10);        // Step 3 opens -> the one save starts
      await p.settle(40);                    // ...lands on the server, response lost (network error)
      p.tap(); await p.settle(100);          // "Listen now" retries the save
      assert.equal(db.rows.length, want, (code === PAGE_OLD ? "main" : "fix") + " Shift count");
      if (want === 1) { assert.equal(p.posts.length, 2); assert.equal(p.posts[0].clientRunId, p.posts[1].clientRunId); assert.ok(/^gr_/.test(p.posts[0].clientRunId)); assert.equal(p.ctx.opened, 1, "activation opened once the Shift was saved"); }
    }
  });
});
await test("double / triple taps on Listen now during a slow save (25s): one POST, one Shift, activation opens once", async () => {
  await quiet(async () => {
    for (const [code, route] of [[PAGE_OLD, OLD], [PAGE_NEW, NEW]]) {
      const db = freshDb();
      const p = makePage(code, route, { net: () => ({ delayBeforeServerMs: 25000 }) });
      p.arrive(); p.tap(); p.tap(); await p.settle(5); p.tap();
      await p.settle(21); p.tap(); p.tap(); // after the 20s "still saving" message, tap again (twice)
      await p.settle(120);
      assert.equal(p.posts.length, 1); assert.equal(db.rows.length, 1);
      p.tap(); await p.settle(60); assert.equal(p.posts.length, 1, "after the save, Listen now never posts again"); assert.ok(p.ctx.opened >= 1);
    }
  });
});
await test("server answered with an error (nothing saved): Listen now retries with the same run id and saves once", async () => {
  await quiet(async () => {
    let n = 0; const db = freshDb({ failCreate: () => ++n === 1 });
    const p = makePage(PAGE_NEW, { POST: async (req) => { try { return await NEW.POST(req); } catch (e) { return new Response(JSON.stringify({ error: "x" }), { status: 500 }); } } });
    p.arrive(); await p.settle(30); assert.equal(db.rows.length, 0);
    p.tap(); await p.settle(80); assert.equal(db.rows.length, 1); assert.equal(p.posts[0].clientRunId, p.posts[1].clientRunId);
  });
});
await test("a NEW run (Start over / going back) gets a new run id and its own card; the same run never saves twice", async () => {
  await quiet(async () => {
    const db = freshDb();
    const p = makePage(PAGE_NEW + "\n" + resetSnippet(read("public/app.html")).replace(/^function resetGapMethodState\(\) \{[\s\S]*?(?=  window\.__gapCardData = null;)/, "function resetGapMethodState() {\n"), NEW);
    p.arrive(); await p.settle(30); p.arrive(); p.ctx.__gapShiftAutoCreated = false; p.arrive(); await p.settle(30);
    assert.equal(p.posts.length, 1, "same run: guarded even if the in-flight flag is cleared"); assert.equal(db.rows.length, 1);
    p.ctx.resetGapMethodState(); p.ctx.__card(); p.ctx.__gapCardData.gap = OTHER.gapExplanation;
    p.arrive(); await p.settle(30);
    assert.equal(p.posts.length, 2); assert.notEqual(p.posts[0].clientRunId, p.posts[1].clientRunId); assert.equal(db.rows.length, 2);
  });
});
await test("the page's save body is main's body + clientRunId only (same card content sent)", async () => {
  await quiet(async () => {
    freshDb(); const a = makePage(PAGE_OLD, OLD); a.arrive(); await a.settle(30);
    freshDb(); const b = makePage(PAGE_NEW, NEW); b.arrive(); await b.settle(30);
    const nb = { ...b.posts[0] }; delete nb.clientRunId; assert.deepEqual(nb, a.posts[0]);
  });
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
