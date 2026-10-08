// Dev-only tests for main-chatbot STREAMING (Oct 8 2026, lib/chatStreaming.js).
// NOT part of the app: nothing imports this file. It never calls the real
// Anthropic API or Airtable and needs no secrets -- the REAL route
// (app/api/chat/route.ts, transpiled on the fly) runs against a local fake
// Anthropic server (real @anthropic-ai/sdk on the wire) and in-memory fakes
// for lib/airtable, lib/memory and lib/entitlements.
//
//   npm run test:chat-streaming
//
//  A. Switch logic + marker hold-back (markers split at EVERY character
//     boundary never reach the screen).
//  B. Switch off / missing / not allowed / processSlug: the new route
//     returns byte-for-byte the same JSON, makes the same Airtable writes and
//     sends the same Claude request as the route before this change
//     (git d98b36f).
//  C. Streaming on: events, same final reply + same saves as the JSON path,
//     no Airtable write while text is arriving, member disconnect still saves
//     exactly once, mid-reply failures save nothing, SDK retries only before
//     the first word, stall timers.
//  D. Page: the real send/stream code from public/app.html with fake timers
//     and a fake streaming server.
import { register } from "node:module";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import vm from "node:vm";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rh-stream-test-"));
const tmpUrl = pathToFileURL(tmp + "/").href;
const appRootUrl = pathToFileURL(appRoot + "/").href;
const libUrl = pathToFileURL(path.join(appRoot, "lib") + "/").href;

// ---------------------------------------------------------------------------
// Module wiring: "@/lib/x" -> real lib/x.js, except the fakes below;
// extensionless relative imports get ".js"; bare imports from the temp dir
// resolve from the app's node_modules.
// ---------------------------------------------------------------------------
const FAKES = {
  "@/lib/airtable": "fake-airtable.mjs",
  "@/lib/memory": "fake-memory.mjs",
  "@/lib/entitlements": "fake-entitlements.mjs",
  "@vercel/functions": "fake-functions.mjs",
};
fs.writeFileSync(path.join(tmp, "fake-airtable.mjs"), `
const fx = () => globalThis.__fx;
const rec = (name, args) => { fx().writes.push([name, args]); };
export const normalizeEmail = (e) => String(e || "").trim().toLowerCase();
export async function logEvent(type, meta, memberRecordId) { rec("logEvent", { type, meta, memberRecordId }); return { id: "recEvt" }; }
export async function getShiftById(id) { return fx().shifts.find((s) => s.id === id) || null; }
export async function getShiftsByEmail() { return fx().shifts; }
export async function updateShiftFields(id, fields) { rec("updateShiftFields", { id, fields }); return { id }; }
export async function createShiftFromChat(args) { rec("createShiftFromChat", args); return { id: "recShiftNew" }; }
export async function createChatSession(args) { rec("createChatSession", args); return { id: "recChatNew", fields: { title: args.title, title_is_auto: true } }; }
export async function getChatSessionById(id) { return fx().sessions[id] ? { id, fields: { ...fx().sessions[id] } } : null; }
export async function listMessagesByChatId(id, opts = {}) { const all = (fx().history[id] || []).map((m, i) => ({ id: "recMsg" + i, fields: m })); return opts.limit && all.length > opts.limit ? all.slice(all.length - opts.limit) : all; }
export async function createMessage(args) { rec("createMessage", { chatId: args.chatId, email: args.email, role: args.role, text: args.text }); return { id: "recMsgNew" }; }
export async function updateChatSession(id, fields) { const f = { ...fields }; for (const k of ["updated_at", "last_message_at"]) if (k in f) f[k] = "<time>"; rec("updateChatSession", { id, fields: f }); return { id }; }
`);
fs.writeFileSync(path.join(tmp, "fake-memory.mjs"), `
const rec = (name, args) => { globalThis.__fx.writes.push([name, args]); };
export async function getRelevantMemoriesForPrompt() { return globalThis.__fx.memories; }
export async function extractMemoriesFromExchange(args) { rec("extractMemoriesFromExchange", args); }
export async function updateRollingSummary(args) { rec("updateRollingSummary", args); return "rolling summary"; }
export async function generateChatTitle(args) { rec("generateChatTitle", args); return "A Clear Title"; }
`);
fs.writeFileSync(path.join(tmp, "fake-entitlements.mjs"), `
export async function getEntitlementForEmail() { return { record: { id: "recMember1" }, entitlement: { canUseBase: true } }; }
`);
fs.writeFileSync(path.join(tmp, "fake-functions.mjs"), `
export function waitUntil(p) { globalThis.__fx.pending.push(Promise.resolve(p).catch((e) => { globalThis.__fx.pendingErrors.push(e); })); }
`);
register(
  "data:text/javascript," +
    encodeURIComponent(`
const FAKES = ${JSON.stringify(FAKES)};
const TMP = ${JSON.stringify(tmpUrl)};
const ROOT = ${JSON.stringify(appRootUrl)};
const LIB = ${JSON.stringify(libUrl)};
export async function resolve(spec, ctx, next) {
  if (FAKES[spec]) return { url: TMP + FAKES[spec], shortCircuit: true, format: "module" };
  if (spec.startsWith("@/lib/")) { const f = spec.slice(6); return { url: LIB + (f.endsWith(".js") ? f : f + ".js"), shortCircuit: true, format: "module" }; }
  if (spec === "next/server") spec = "next/server.js";
  const fromTmp = ctx.parentURL && ctx.parentURL.startsWith(TMP);
  const c = fromTmp && !spec.startsWith(".") && !spec.startsWith("file:") && !spec.startsWith("node:") ? { ...ctx, parentURL: ROOT + "package.json" } : ctx;
  try { return await next(spec, c); }
  catch (e) { if (spec.startsWith(".") && !/\\.[cm]?js$/.test(spec)) return next(spec + ".js", c); throw e; }
}
export async function load(url, ctx, next) {
  if (url.startsWith(LIB) && url.endsWith(".js")) return next(url, { ...ctx, format: "module" });
  return next(url, ctx);
}`),
  import.meta.url
);

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL - ${name}\n   ${err && err.stack ? err.stack.split("\n").slice(0, 6).join("\n   ") : err}`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const streaming = await import(pathToFileURL(path.join(appRoot, "lib", "chatStreaming.js")).href);
const { chatStreamingAllowed, createMarkerHoldback, runStreamedReply } = streaming;
const { DISTORTION_REGISTRY } = await import(pathToFileURL(path.join(appRoot, "lib", "gapDistortions.js")).href);

// ---------------------------------------------------------------------------
// A. Switch + hold-back
// ---------------------------------------------------------------------------
console.log("\n# A. Switch logic and marker hold-back");
await test("switch: off by default; 'on' needs the page to ask; processSlug never streams; allowlist matches emails case/space-insensitively", () => {
  const cases = [
    [{ requested: true }, false],
    [{ mode: "off", requested: true }, false],
    [{ mode: "garbage", requested: true }, false],
    [{ mode: "on" }, false],
    [{ mode: "on", requested: "true" }, false],
    [{ mode: "on", requested: true }, true],
    [{ mode: " ON ", requested: true }, true],
    [{ mode: "on", requested: true, processSlug: "3-step-gap-method" }, false],
    [{ mode: "allowlist", requested: true, email: "rachaelsbutterflyeffect@gmail.com" }, false],
    [{ mode: "allowlist", allowlist: "rachaelsbutterflyeffect@gmail.com, rachael.ball08@gmail.com", requested: true, email: "Rachael.Ball08@Gmail.com " }, true],
    [{ mode: "allowlist", allowlist: "rachaelsbutterflyeffect@gmail.com,rachael.ball08@gmail.com", requested: true, email: "rachaelsbutterflyeffect@gmail.com" }, true],
    [{ mode: "allowlist", allowlist: "rachaelsbutterflyeffect@gmail.com", requested: true, email: "someone@else.com" }, false],
    [{ mode: "allowlist", allowlist: "rachaelsbutterflyeffect@gmail.com", requested: true, email: "" }, false],
    [{ mode: "allowlist", allowlist: ",,", requested: true, email: "" }, false],
    [{ mode: "allowlist", allowlist: "rachaelsbutterflyeffect@gmail.com", requested: true, email: "rachaelsbutterflyeffect@gmail.com", processSlug: "x" }, false],
  ];
  for (const [input, want] of cases) assert.equal(chatStreamingAllowed(input), want, JSON.stringify(input));
});

// The same strip the route does on the final text (route.ts, unchanged).
function routeStrip(raw) {
  const re = /\n?\[\[([A-Z_]+):\s*([\s\S]*?)\]\]\s*$/;
  let s = raw;
  let m = s.match(re);
  while (m) { s = s.slice(0, m.index).replace(/\s+$/, ""); m = s.match(re); }
  return s.trim();
}
const SAVE_SHIFT_REPLY =
  "That makes so much sense, love. I've saved this as a new Shift on your My Revolution page so we can keep working with it.\n\n" +
  '[[SAVE_SHIFT: {"focusArea": "Prosperity", "divineIdentityName": "Healer", "divineIdentitySlug": "healer", "currentFrequency": "Over-giving", "gap": "She wants ease but keeps rescuing clients", "howItShowsUp": "Discounts every session", "primaryShift": "Receiving", "recommendedActivation": "Receiving"}]]';
const UPDATE_SHIFT_REPLY =
  "Yes -- this is the same pattern we've been working on, so I've added it to that Shift.\n\n\n" +
  '[[UPDATE_SHIFT: {"shiftId": "recShift1", "gap": "Still rescuing clients", "howItShowsUp": "Said yes to a free session"}]]\n';
const LINK_REPLY =
  "If you'd like to go deeper, you can [book a 1:1 with Rachael](https://www.rachaelsbutterflyeffect.com/book) any time.\n" +
  '[[SAVE_SHIFT: {"focusArea": "General", "gap": "x"}]]';
const PLAIN_REPLY = "  Hi love. Take a breath with me.\n\nWhat's the part of this that feels heaviest right now?\n\n";
const HOLDBACK_SAMPLES = { SAVE_SHIFT_REPLY, UPDATE_SHIFT_REPLY, LINK_REPLY, PLAIN_REPLY };

function runHoldback(pieces) {
  const h = createMarkerHoldback();
  const out = [];
  for (const p of pieces) { const v = h.push(p); if (v) out.push(v); }
  return out;
}
function assertNoLeak(deltas, label) {
  for (const d of deltas) {
    assert.ok(!d.includes("[["), `${label}: "[[" leaked: ${JSON.stringify(d)}`);
    assert.ok(!/SAVE_SHIFT|UPDATE_SHIFT|DISTORTIONS|TOPIC:|OPEN_ACTIVATION|\{"/.test(d), `${label}: marker text leaked: ${JSON.stringify(d)}`);
  }
}
for (const [name, text] of Object.entries(HOLDBACK_SAMPLES)) {
  await test(`hold-back: ${name} split at every character boundary (2 pieces, 3 pieces, 1 char at a time) never shows marker text; shown text == final cleaned reply`, () => {
    const want = routeStrip(text);
    const check = (pieces, label) => {
      const deltas = runHoldback(pieces);
      assertNoLeak(deltas, label);
      assert.equal(deltas.join(""), want, `${label}: shown text differs from final reply`);
    };
    for (let i = 0; i <= text.length; i++) check([text.slice(0, i), text.slice(i)], `split@${i}`);
    for (let i = 0; i < text.length; i += 7) for (let j = i; j <= text.length; j += 11) check([text.slice(0, i), text.slice(i, j), text.slice(j)], `split@${i},${j}`);
    check([...text], "1-char");
  });
}
await test("hold-back: a single '[' at the end of a piece is held until the next piece shows it isn't '[['", () => {
  const h = createMarkerHoldback();
  assert.equal(h.push("Read this ["), "Read this");
  assert.equal(h.push("note]"), " [note]");
  assert.equal(h.push("\n["), "");
  assert.equal(h.push("[SAVE_SHIFT: {}]]"), "");
  assert.equal(h.push(" more after marker"), "");
});
await test("hold-back: '[[' that is NOT a final marker stops the live text (the final 'done' text fills in the rest)", () => {
  const deltas = runHoldback(["We can use [[double brackets]] here", " and keep going."]);
  assert.equal(deltas.join(""), "We can use");
});

// ---------------------------------------------------------------------------
// Fake Anthropic API (real SDK on the wire)
// ---------------------------------------------------------------------------
let apiBehaviour = () => ({ text: "ok" });
const apiRequests = [];
const sockets = new Set();
const apiServer = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", async () => {
    const body = JSON.parse(raw || "{}");
    apiRequests.push({ body, headers: req.headers });
    const b = apiBehaviour(apiRequests.length, body) || {};
    if (b.status && b.status !== 200) {
      const out = JSON.stringify({ type: "error", error: { type: b.status === 529 ? "overloaded_error" : "invalid_request_error", message: "fake" } });
      res.writeHead(b.status, { "content-type": "application/json", "content-length": Buffer.byteLength(out) });
      return res.end(out);
    }
    const text = b.text ?? "ok";
    const usage = { input_tokens: 40, output_tokens: 2, cache_read_input_tokens: 13900, cache_creation_input_tokens: 0 };
    if (!body.stream) {
      const out = JSON.stringify({ id: "msg_test", type: "message", role: "assistant", model: "fake", content: [{ type: "text", text }], stop_reason: "end_turn", stop_sequence: null, usage });
      res.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(out), connection: "close" });
      return res.end(out);
    }
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
    ev("message_start", { message: { id: "msg_test", type: "message", role: "assistant", model: "fake", content: [], stop_reason: null, stop_sequence: null, usage } });
    ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
    const pieces = b.pieces || text.match(/\S+\s*|\s+/g) || [""];
    for (let i = 0; i < pieces.length; i++) {
      if (b.failAt === i) {
        if (b.fail === "destroy") return req.socket.destroy();
        if (b.fail === "clean-close") return res.end();
        if (b.fail === "error-event") { ev("error", { error: { type: "overloaded_error", message: "Overloaded" } }); return res.end(); }
        if (b.fail === "hang") return; // keep the connection open, send nothing more
      }
      if (b.onPiece) b.onPiece(i);
      ev("content_block_delta", { index: 0, delta: { type: "text_delta", text: pieces[i] } });
      if (b.delayMs) await sleep(b.delayMs);
    }
    if (b.onAllPiecesSent) b.onAllPiecesSent();
    if (b.fail === "hang-at-end") return;
    ev("content_block_stop", { index: 0 });
    ev("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 20 } });
    ev("message_stop", {});
    res.end();
  });
});
apiServer.on("connection", (s) => { sockets.add(s); s.on("close", () => sockets.delete(s)); });
await new Promise((r) => apiServer.listen(0, "127.0.0.1", r));
process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${apiServer.address().port}`;
process.env.ANTHROPIC_API_KEY = "test-not-a-real-key";

// ---------------------------------------------------------------------------
// Load the NEW route and the route as it was before streaming (git d98b36f)
// ---------------------------------------------------------------------------
function transpileRoute(src, name) {
  const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
  const f = path.join(tmp, name);
  fs.writeFileSync(f, out);
  return pathToFileURL(f).href;
}
const newRoute = await import(transpileRoute(fs.readFileSync(path.join(appRoot, "app/api/chat/route.ts"), "utf8"), "route-new.mjs"));
let oldRoute = null;
try {
  const oldSrc = execFileSync("git", ["show", "d98b36f:revolutionary-healer-app/app/api/chat/route.ts"], { cwd: appRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  oldRoute = await import(transpileRoute(oldSrc, "route-old.mjs"));
} catch (e) {
  console.log("   (git d98b36f not available -- old-vs-new comparisons will fail)");
}

const SHIFT1 = { id: "recShift1", fields: { member_email: "member@example.com", focus_area: "Prosperity", divine_identity_name: "Healer", current_frequency: "Over-giving", progress_status: "shifting", gap_explanation: "Rescues clients", recommended_activation: "Receiving" } };
function freshFx(over = {}) {
  return {
    writes: [], pending: [], pendingErrors: [], memories: "",
    shifts: [SHIFT1],
    sessions: { recChatA: { title: "New Chat · Oct 8", title_is_auto: true, summary: "" } },
    history: { recChatA: [
      { role: "user", message_text: "I keep discounting my sessions", created_at: "2026-10-08T10:00:00.000Z" },
      { role: "assistant", message_text: "Tell me more about that.", created_at: "2026-10-08T10:00:05.000Z" },
    ] },
    ...over,
  };
}
async function settle(fx) {
  for (let i = 0; i < 50 && fx.pending.length; i++) { const ps = fx.pending.splice(0); await Promise.all(ps); }
}
const quiet = async (fn) => {
  const { log, error, warn } = console;
  console.log = () => {}; console.error = () => {}; console.warn = () => {};
  try { return await fn(); } finally { Object.assign(console, { log, error, warn }); }
};
function setSwitch(env) {
  for (const k of ["CHAT_STREAMING", "CHAT_STREAMING_ALLOWLIST"]) {
    if (env && env[k] !== undefined) process.env[k] = env[k]; else delete process.env[k];
  }
}
const BASE_BODY = { email: "member@example.com", focusAreaSlug: "general", message: "I did it again today", chatId: "recChatA", timeZone: "America/Toronto" };
const mkReq = (body) => new Request("http://localhost/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

// Run a route to completion (including background saves) and collect what it did.
async function runJson(mod, { body, env, fx, api }) {
  setSwitch(env);
  globalThis.__fx = fx;
  apiBehaviour = api;
  apiRequests.length = 0;
  const out = await quiet(async () => {
    const res = await mod.POST(mkReq(body));
    const text = await res.text();
    await settle(fx);
    return { status: res.status, ctype: res.headers.get("content-type"), text };
  });
  return { ...out, writes: fx.writes, apiBodies: apiRequests.map((r) => r.body) };
}
function parseSse(text) {
  return text.split("\n\n").filter((b) => b.trim()).map((b) => {
    const data = b.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("\n");
    return data ? JSON.parse(data) : { type: "comment" };
  });
}
async function runStream(mod, { body, env, fx, api, onEvent, cancelWhen }) {
  setSwitch(env);
  globalThis.__fx = fx;
  apiBehaviour = api;
  apiRequests.length = 0;
  return quiet(async () => {
    const res = await mod.POST(mkReq(body));
    const ctype = res.headers.get("content-type") || "";
    if (!/event-stream/.test(ctype)) { const text = await res.text(); await settle(fx); return { status: res.status, ctype, text, events: null, writes: fx.writes }; }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    const events = [];
    let cancelled = false;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) !== -1) {
        const evs = parseSse(buf.slice(0, i + 2));
        buf = buf.slice(i + 2);
        for (const e of evs) { events.push(e); if (onEvent) onEvent(e, fx); }
      }
      if (cancelWhen && cancelWhen(events)) { cancelled = true; await reader.cancel(); break; }
    }
    await settle(fx);
    return { status: res.status, ctype, events, cancelled, writes: fx.writes, apiBodies: apiRequests.map((r) => r.body), pendingErrors: fx.pendingErrors };
  });
}
const writesNamed = (w, n) => w.filter(([name]) => name === n);
const assistantSaves = (w) => w.filter(([n, a]) => n === "createMessage" && a.role === "assistant");

// ---------------------------------------------------------------------------
// B. Switch off: identical to before
// ---------------------------------------------------------------------------
console.log("\n# B. Switch off / not allowed / processSlug: identical to the route before this change (git d98b36f)");
const gapStep3 =
  "Step 3: Your Recommended Activation\n\nHere is what I see for you...\n" +
  `[[SAVE_SHIFT: {"focusArea": "Prosperity", "divineIdentityName": "Healer", "divineIdentitySlug": "healer", "currentFrequency": "Over-giving", "gap": "g", "howItShowsUp": "h", "primaryShift": "p", "recommendedActivation": "free text"}]]\n` +
  `[[DISTORTIONS: ${DISTORTION_REGISTRY[0]}, ${DISTORTION_REGISTRY[1]}]]\n[[TOPIC: general]]`;
const longHistory = Array.from({ length: 12 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", message_text: `m${i}`, created_at: `2026-10-08T09:${String(i).padStart(2, "0")}:00.000Z` }));
const SCEN = [
  { name: "plain reply", body: BASE_BODY, api: () => ({ text: PLAIN_REPLY }) },
  { name: "brand-new chat (no chatId)", body: { ...BASE_BODY, chatId: undefined, message: "hi, I'm new" }, api: () => ({ text: "Welcome, love." }) },
  { name: "SAVE_SHIFT marker", body: { ...BASE_BODY, message: "yes, save it" }, api: () => ({ text: SAVE_SHIFT_REPLY }) },
  { name: "UPDATE_SHIFT marker", body: { ...BASE_BODY, message: "yes" }, api: () => ({ text: UPDATE_SHIFT_REPLY }) },
  { name: "Update Progress -> Embodied", body: { ...BASE_BODY, message: "yes it's complete", shiftId: "recShift1" }, api: () => ({ text: "I've updated your card to mark this as Embodied. Look how far you've come!" }) },
  { name: "long chat (summary + titles)", fx: { history: { recChatA: longHistory } }, body: BASE_BODY, api: () => ({ text: "Long thread reply." }) },
  { name: "Claude error -> 504", body: BASE_BODY, api: () => ({ status: 400 }) },
  { name: "GAP-process Step 3 (processSlug)", body: { ...BASE_BODY, processSlug: "3-step-gap-method", message: "ready" }, api: () => ({ text: gapStep3 }) },
];
const ENVS = [
  { label: "switch missing", env: undefined, stream: true },
  { label: "CHAT_STREAMING=off", env: { CHAT_STREAMING: "off" }, stream: true },
  { label: "CHAT_STREAMING=nonsense", env: { CHAT_STREAMING: "maybe" }, stream: true },
  { label: "allowlist, member not on it", env: { CHAT_STREAMING: "allowlist", CHAT_STREAMING_ALLOWLIST: "rachaelsbutterflyeffect@gmail.com,rachael.ball08@gmail.com" }, stream: true },
  { label: "CHAT_STREAMING=on but page did not ask (old cached page)", env: { CHAT_STREAMING: "on" }, stream: undefined },
];
for (const sc of SCEN) {
  await test(`${sc.name}: same status, same JSON bytes, same Airtable writes, same Claude request -- for every 'not streaming' setting`, async () => {
    assert.ok(oldRoute, "old route not loaded");
    const before = await runJson(oldRoute, { body: sc.body, env: undefined, fx: freshFx(sc.fx), api: sc.api });
    assert.match(before.ctype, /application\/json/);
    for (const e of ENVS) {
      const body = e.stream === undefined ? sc.body : { ...sc.body, stream: e.stream };
      const after = await runJson(newRoute, { body, env: e.env, fx: freshFx(sc.fx), api: sc.api });
      assert.equal(after.status, before.status, `${e.label}: status`);
      assert.equal(after.ctype, before.ctype, `${e.label}: content-type`);
      assert.equal(after.text, before.text, `${e.label}: response body bytes`);
      assert.deepEqual(after.writes, before.writes, `${e.label}: Airtable writes`);
      assert.deepEqual(after.apiBodies, before.apiBodies, `${e.label}: Claude request(s)`);
    }
  });
}
await test("processSlug NEVER streams, even with CHAT_STREAMING=on and the page asking (identical JSON to before)", async () => {
  const sc = SCEN.find((s) => s.name.startsWith("GAP-process"));
  const before = await runJson(oldRoute, { body: sc.body, fx: freshFx(), api: sc.api });
  const after = await runJson(newRoute, { body: { ...sc.body, stream: true }, env: { CHAT_STREAMING: "on" }, fx: freshFx(), api: sc.api });
  assert.match(after.ctype, /application\/json/);
  assert.equal(after.text, before.text);
  assert.deepEqual(after.writes, before.writes);
});

// ---------------------------------------------------------------------------
// C. Streaming on
// ---------------------------------------------------------------------------
console.log("\n# C. Streaming on (real route, real SDK, fake Claude + fake Airtable)");
const ON = { CHAT_STREAMING: "on" };
const SBODY = { ...BASE_BODY, stream: true };

for (const sc of SCEN.filter((s) => !/504|GAP-process/.test(s.name))) {
  await test(`${sc.name}: streams meta -> words -> done; done == the JSON path's reply; exactly the same saves as the JSON path; no marker text on screen`, async () => {
    const json = await runJson(oldRoute, { body: sc.body, fx: freshFx(sc.fx), api: sc.api });
    const want = JSON.parse(json.text);
    const r = await runStream(newRoute, { body: { ...sc.body, stream: true }, env: ON, fx: freshFx(sc.fx), api: sc.api });
    assert.match(r.ctype, /text\/event-stream/);
    const types = r.events.filter((e) => e.type !== "comment").map((e) => e.type);
    assert.equal(types[0], "meta");
    assert.equal(types[types.length - 1], "done");
    assert.ok(types.filter((t) => t === "delta").length >= 1 || !want.reply, "words arrived as deltas");
    const deltas = r.events.filter((e) => e.type === "delta").map((e) => e.text);
    assertNoLeak(deltas, sc.name);
    const done = r.events.find((e) => e.type === "done");
    assert.equal(done.reply, want.reply, "final reply");
    assert.equal(done.chatId, want.chatId);
    assert.equal(done.openActivationSlug, want.openActivationSlug);
    assert.equal(deltas.join(""), want.reply, "words shown == final reply");
    assert.deepEqual(r.writes, json.writes, "same saves, same order, same content");
    assert.equal(assistantSaves(r.writes).length, 1);
    // Same Claude request, plus only stream:true
    const { stream, ...rest } = r.apiBodies[0];
    assert.equal(stream, true);
    assert.deepEqual(rest, json.apiBodies[0]);
  });
}

await test("SAVE_SHIFT reply streamed with Claude's text split at EVERY character boundary: marker never shown, Shift saved exactly once, final reply correct", async () => {
  const want = routeStrip(SAVE_SHIFT_REPLY);
  const text = SAVE_SHIFT_REPLY;
  const splits = [];
  for (let i = 1; i < text.length; i++) splits.push([text.slice(0, i), text.slice(i)]);
  splits.push([...text]);
  for (const pieces of splits) {
    const r = await runStream(newRoute, { body: SBODY, env: ON, fx: freshFx(), api: () => ({ text, pieces }) });
    const deltas = r.events.filter((e) => e.type === "delta").map((e) => e.text);
    assertNoLeak(deltas, `split ${pieces.length > 2 ? "1-char" : "@" + pieces[0].length}`);
    assert.equal(deltas.join(""), want);
    assert.equal(r.events.find((e) => e.type === "done").reply, want);
    assert.equal(writesNamed(r.writes, "createShiftFromChat").length, 1);
    assert.equal(assistantSaves(r.writes).length, 1);
  }
  console.log(`   ${splits.length} streamed runs through the real route`);
});

await test("nothing is written to Airtable while words are arriving (only the member's message, before Claude); everything after the last word", async () => {
  let atFirst = -1, atLast = -1;
  const fx = freshFx();
  await runStream(newRoute, { body: { ...SBODY, message: "yes, save it" }, env: ON, fx, api: () => ({ text: SAVE_SHIFT_REPLY, delayMs: 2, onPiece: (i) => { if (i === 0) atFirst = fx.writes.length; atLast = fx.writes.length; }, onAllPiecesSent: () => { atLast = fx.writes.length; } }) });
  assert.equal(atFirst, 1, "only the member's message saved before the first word");
  assert.equal(atLast, atFirst, "no write while the reply was streaming");
  assert.ok(fx.writes.length > 3, "the saves happened afterwards");
  assert.deepEqual(fx.writes[0], ["createMessage", { chatId: "recChatA", email: "member@example.com", role: "user", text: "yes, save it" }]);
});

await test("'done' is sent only after the Shift is saved (activation button / drawer refresh arrive after the save, as before)", async () => {
  let shiftSavedAtDone = null;
  await runStream(newRoute, { body: SBODY, env: ON, fx: freshFx(), api: () => ({ text: SAVE_SHIFT_REPLY }), onEvent: (e, fx) => { if (e.type === "done") shiftSavedAtDone = writesNamed(fx.writes, "createShiftFromChat").length; } });
  assert.equal(shiftSavedAtDone, 1);
});

await test("member disconnects mid-reply (closes tab / loses signal): the job keeps going and saves the FULL reply exactly once (+ Shift, title, memory)", async () => {
  const r = await runStream(newRoute, {
    body: SBODY, env: ON, fx: freshFx(), api: () => ({ text: SAVE_SHIFT_REPLY, delayMs: 3 }),
    cancelWhen: (evs) => evs.filter((e) => e.type === "delta").length >= 2,
  });
  assert.ok(r.cancelled);
  assert.ok(!r.events.some((e) => e.type === "done"), "member was gone before the end");
  const saves = assistantSaves(r.writes);
  assert.equal(saves.length, 1, "bot message saved exactly once");
  assert.equal(saves[0][1].text, routeStrip(SAVE_SHIFT_REPLY), "full cleaned reply saved");
  assert.equal(writesNamed(r.writes, "createShiftFromChat").length, 1);
  assert.equal(writesNamed(r.writes, "extractMemoriesFromExchange").length, 1);
  assert.equal(writesNamed(r.writes, "extractMemoriesFromExchange")[0][1].assistantText, routeStrip(SAVE_SHIFT_REPLY));
  assert.equal(r.pendingErrors.length, 0, "writing to the closed connection caused no errors");
});

for (const [fail, label] of [["destroy", "connection to Claude torn down"], ["clean-close", "Claude's stream closes early WITHOUT an error (SDK would treat the partial text as final)"], ["error-event", "Claude sends an error part-way (e.g. overloaded)"]]) {
  await test(`reply breaks mid-way (${label}): error event, NO retry, nothing saved except the member's message`, async () => {
    const r = await runStream(newRoute, { body: SBODY, env: ON, fx: freshFx(), api: () => ({ text: SAVE_SHIFT_REPLY, failAt: 4, fail, delayMs: 3 }) });
    const types = r.events.filter((e) => e.type !== "comment").map((e) => e.type);
    assert.ok(types.includes("delta"), "some words had been shown");
    assert.equal(types[types.length - 1], "error");
    assert.ok(!types.includes("done"));
    assert.equal(r.apiBodies.length, 1, "not retried after words were shown");
    assert.deepEqual(r.writes.map(([n, a]) => `${n}:${a.role || ""}`), ["createMessage:user"], "no bot message / Shift / title / memory / session update / event");
  });
}

await test("SDK retries only BEFORE the first word: Claude overloaded (529) on connect -> retried, reply streams normally, saved once", async () => {
  const r = await runStream(newRoute, { body: SBODY, env: ON, fx: freshFx(), api: (n) => (n === 1 ? { status: 529 } : { text: PLAIN_REPLY }) });
  assert.equal(r.apiBodies.length, 2);
  assert.equal(r.events.find((e) => e.type === "done").reply, routeStrip(PLAIN_REPLY));
  assert.equal(assistantSaves(r.writes).length, 1);
});

await test("Claude rejects the request outright (400): error event, nothing saved but the member's message", async () => {
  const r = await runStream(newRoute, { body: SBODY, env: ON, fx: freshFx(), api: () => ({ status: 400 }) });
  assert.deepEqual(r.events.filter((e) => e.type !== "comment").map((e) => e.type), ["meta", "error"]);
  assert.equal(r.events.find((e) => e.type === "error").error, "The response took too long. Please try again.");
  assert.deepEqual(r.writes.map(([n]) => n), ["createMessage"]);
});

await test("allowlist: listed member streams, everyone else gets the old JSON", async () => {
  const env = { CHAT_STREAMING: "allowlist", CHAT_STREAMING_ALLOWLIST: " RachaelsButterflyEffect@gmail.com , rachael.ball08@gmail.com" };
  const yes = await runStream(newRoute, { body: { ...SBODY, email: "rachaelsbutterflyeffect@gmail.com" }, env, fx: freshFx(), api: () => ({ text: "hi" }) });
  assert.match(yes.ctype, /event-stream/);
  const ray = await runStream(newRoute, { body: { ...SBODY, email: "Rachael.Ball08@gmail.com" }, env, fx: freshFx(), api: () => ({ text: "hi" }) });
  assert.match(ray.ctype, /event-stream/);
  const no = await runStream(newRoute, { body: SBODY, env, fx: freshFx(), api: () => ({ text: "hi" }) });
  assert.match(no.ctype, /application\/json/);
  assert.equal(no.text, JSON.stringify({ reply: "hi", chatId: "recChatA", openActivationSlug: null }));
});

// Stall timers: runStreamedReply with short timers, real SDK, fake Claude.
import AnthropicSdk from "@anthropic-ai/sdk";
const sdk = new AnthropicSdk({ apiKey: "test", baseURL: process.env.ANTHROPIC_BASE_URL, maxRetries: 0 });
function fakeChannel() {
  const events = [];
  let closed = false;
  return { events, send: (e) => { if (!closed) events.push(e); }, close: () => { closed = true; }, get closed() { return closed; } };
}
async function stallRun(api, timers) {
  apiBehaviour = api;
  apiRequests.length = 0;
  const ch = fakeChannel();
  let finishCalls = 0;
  const t0 = Date.now();
  const res = await quiet(() => runStreamedReply({
    channel: ch, chatId: "recChatA",
    startStream: (signal) => sdk.messages.stream({ model: "m", max_tokens: 10, messages: [{ role: "user", content: "x" }] }, { signal, timeout: 5000 }),
    finishReply: async () => { finishCalls++; return { replyText: "x", openActivationSlug: null }; },
    ...timers,
  }));
  return { res, ch, finishCalls, ms: Date.now() - t0 };
}
await test("stall: Claude goes silent mid-reply -> idle timer stops it, error sent, finishReply (all saves) never runs", async () => {
  const { res, ch, finishCalls, ms } = await stallRun(() => ({ text: "one two three four", failAt: 2, fail: "hang" }), { idleMs: 150, overallMs: 5000 });
  assert.equal(res.stalled, "idle");
  assert.equal(finishCalls, 0);
  assert.equal(ch.events[ch.events.length - 1].type, "error");
  assert.ok(ms < 2000, `stopped after ${ms}ms`);
});
await test("stall: words keep dribbling past the overall cap -> stopped, error, nothing saved", async () => {
  const { res, ch, finishCalls } = await stallRun(() => ({ text: "a b c d e f g h i j k l m n o p q r s t", delayMs: 60 }), { idleMs: 5000, overallMs: 300 });
  assert.equal(res.stalled, "overall");
  assert.equal(finishCalls, 0);
  assert.equal(ch.events[ch.events.length - 1].type, "error");
});
await test("stall: all words sent but Claude never says it's finished -> stopped, nothing saved", async () => {
  const { res, finishCalls } = await stallRun(() => ({ text: "all the words", fail: "hang-at-end" }), { idleMs: 150, overallMs: 5000 });
  assert.equal(res.stalled, "idle");
  assert.equal(finishCalls, 0);
});
await test("stall timers: production values are below the page's limits (idle 30s; overall 170s < page's 180s cap < Vercel 300s)", () => {
  assert.equal(streaming.STREAM_IDLE_MS, 30000);
  assert.ok(streaming.STREAM_OVERALL_MS < 180000 && streaming.STREAM_OVERALL_MS >= 150000);
  assert.ok(streaming.STREAM_HEARTBEAT_MS < 30000, "keep-alive is more frequent than the page's 30s dead-connection check");
});
await test("hard rule: the route never writes to Airtable from inside the streaming code (lib/chatStreaming.js imports no Airtable code)", () => {
  const src = fs.readFileSync(path.join(appRoot, "lib/chatStreaming.js"), "utf8");
  assert.ok(!/from\s+["'][^"']*(airtable|memory)/.test(src));
  assert.ok(!/createMessage|createShiftFromChat|updateShiftFields|updateChatSession|createMemory/.test(src.replace(/\/\/.*$/gm, "")));
});
await test("funnel GAP bot, Shift-creation route and GAP prompts untouched; the member GAP bot streams only behind its OWN switch (GAP_STREAMING, see npm run test:gap-streaming)", () => {
  for (const f of ["app/api/gap-chat/route.ts", "app/api/gap-shift/route.ts"]) {
    const src = fs.readFileSync(path.join(appRoot, f), "utf8");
    assert.ok(!/chatStreaming|CHAT_STREAMING|GAP_STREAMING/.test(src), `${f} references streaming`);
  }
  const gapMember = fs.readFileSync(path.join(appRoot, "app/api/gap-chat-member/route.ts"), "utf8");
  assert.match(gapMember, /mode:\s*process\.env\.GAP_STREAMING\b/);
  assert.ok(!/mode:\s*process\.env\.CHAT_STREAMING\b/.test(gapMember), "GAP must not follow the main chat's on/off switch");
  try {
    const changed = execFileSync("git", ["diff", "--name-only", "d98b36f", "--", "."], { cwd: appRoot, encoding: "utf8" }).split("\n").filter(Boolean);
    const allowed = /^revolutionary-healer-app\/(app\/api\/chat\/route\.ts|app\/api\/gap-chat-member\/route\.ts|lib\/chatStreaming\.js|public\/app\.html|scripts\/test-chat-streaming\.mjs|scripts\/test-chat-streaming-browser\.mjs|scripts\/test-gap-streaming\.mjs|package\.json|lib\/gapReading\.js|lib\/gapChatReply\.js|lib\/airtable\.js|app\/api\/gap-shift\/route\.ts|app\/api\/shifts\/route\.ts|scripts\/test-gap-reading\.mjs|scripts\/gap-reading-scope\.mjs|scripts\/test-gap-max-tokens\.mjs|lib\/processes\.js|app\/api\/gap-method-result\/route\.ts|scripts\/test-remove-relationships\.mjs|scripts\/remove-relationships-scope\.mjs|lib\/gapShiftOnce\.js|scripts\/gap-shift-once-scope\.mjs|scripts\/test-gap-shift-once\.mjs|scripts\/test-gap-step2-chat\.mjs)$/; // + GAP reading restructure files (Oct 8 2026; checked in scripts/test-gap-reading.mjs); + Remove Relationships option (Oct 8 2026; processes.js / gap-method-result hunks proven exact by remove-relationships-scope.mjs); + duplicate-save fix (Oct 8 2026; gap-shift hunks proven exact by gap-shift-once-scope.mjs, behaviour in test-gap-shift-once.mjs)
    for (const f of changed) assert.match(f, allowed, `unexpected file changed: ${f}`);
  } catch (e) { if (e instanceof assert.AssertionError) throw e; }
});
apiServer.close();
for (const s of sockets) s.destroy();

// ---------------------------------------------------------------------------
// D. Page: the real send/stream code from public/app.html
// ---------------------------------------------------------------------------
const html = fs.readFileSync(path.join(appRoot, "public", "app.html"), "utf8");
const startIdx = html.lastIndexOf("\n", html.indexOf("// Main chat send + waiting logic"));
const endIdx = html.indexOf("var RH_THINKING_MESSAGES", startIdx);
assert.ok(startIdx > 0 && endIdx > startIdx, "could not find the main chat send code in app.html");
const pageSrc = html.slice(startIdx, endIdx);
console.log("\n# D. Page streaming logic (public/app.html), timers sped up: 1s -> 2ms");

const P = 2; // real ms per simulated second
function makePage({ onChat, db = {}, activeChatId = "recChatA", follow = true, scrollBtnShown = false }) {
  const realSet = setTimeout;
  const log = [];
  const renders = [];
  const removed = [];
  let posts = 0;
  let chatsReads = 0;
  let thinking = null;
  let thinkingCount = 0;
  const t0 = Date.now();
  const sec = () => (Date.now() - t0) / P;
  const at = (s, fn) => realSet(fn, s * P);
  const parent = { removeChild(el) { el.isConnected = false; removed.push(el); } };
  const thread = { scrollTop: 0, scrollHeight: 1000, clientHeight: 400, followScrolls: 0 };
  const scrollBtn = { classes: new Set(scrollBtnShown ? ["rh-show"] : []), classList: null };
  scrollBtn.classList = { contains: (c) => scrollBtn.classes.has(c), add: (c) => scrollBtn.classes.add(c), remove: (c) => scrollBtn.classes.delete(c) };
  let lastPayload = null;
  const mkEl = (role, text) => {
    const el = { role, textContent: text, isConnected: true, parentNode: parent, classes: new Set(), buttons: [] };
    el.classList = { add: (c) => el.classes.add(c), remove: (c) => el.classes.delete(c), contains: (c) => el.classes.has(c) };
    return el;
  };
  const ctx = {
    console, Intl, AbortController, JSON, Promise, DOMException, Date, isNaN, TextDecoder, ReadableStream, Math,
    window: { __rhActiveChatId: activeChatId, requestAnimationFrame: (fn) => realSet(fn, 0), innerHeight: 800, scrollBy() {} },
    document: {
      getElementById: (id) => (id === "rh-scroll-down-btn" ? scrollBtn : { value: "x", disabled: false, classList: { contains: () => false, add() {} } }),
      querySelectorAll: () => [],
      documentElement: { clientHeight: 800 },
    },
    localStorage: { setItem() {} },
    setTimeout: (fn, ms) => realSet(fn, (ms / 1000) * P),
    clearTimeout,
    RH_EMAIL: "member@example.com",
    rhFollowReply: follow,
    rhUserScrollUntil: 0,
    rhThread: () => thread,
    rhScrollToBottom() {},
    rhSetTextWithLinks: (el, text) => { el.textContent = text; renders.push({ text, sec: sec() }); },
    showRhThinking: () => {
      thinkingCount++;
      const textEl = { textContent: "Give me a second…" };
      thinking = { isConnected: true, __rhThinkingTimer: null, querySelector: () => textEl, classList: { add() {} }, textEl, parentNode: parent };
      log.push({ kind: "thinking", sec: sec() });
      return thinking;
    },
    removeRhThinking: (el) => { if (el) el.isConnected = false; },
    hideRhWelcome() {}, rhStartFollowingReply() {}, autoGrowChatInput() {},
    rhMaybeRefreshDrawerAfterSend() {}, rhKeepComposerInView() {}, rhUpdateScrollDownBtn() {},
    addRhActivationButton: (el, slug) => { el.buttons.push(slug); },
    addRhMessage: (role, text) => { const el = mkEl(role, text); log.push({ kind: role === "assistant" ? "reply" : "user", el, text, sec: sec() }); return el; },
    addRhError: (msg) => log.push({ kind: "error", text: msg || "Something glitched on my end. Try that again for me.", sec: sec() }),
    fetch: (url, init = {}) =>
      new Promise((resolve, reject) => {
        const json = (status, body) => resolve({ ok: status >= 200 && status < 300, status, json: async () => body });
        if (url === "/api/chat") {
          posts++;
          lastPayload = JSON.parse(init.body);
          // Streaming response: script = [[sec, chunk | {drop} | {end}], ...]
          const stream = (script) => {
            const queue = [];
            let waiting = null;
            let done = false;
            const push = (item) => { if (done) return; if (waiting) { const w = waiting; waiting = null; w(item); } else queue.push(item); };
            if (init.signal) init.signal.addEventListener("abort", () => push({ abort: true }));
            for (const [s, item] of script) at(s, () => push(item));
            const reader = {
              cancelled: false,
              read: () => new Promise((res, rej) => {
                const handle = (item) => {
                  if (item.abort) { done = true; return rej(new DOMException("The operation was aborted.", "AbortError")); }
                  if (item.drop) { done = true; return rej(new TypeError("network error")); }
                  if (item.end || item.cancel) { done = true; return res({ done: true, value: undefined }); }
                  res({ done: false, value: new TextEncoder().encode(item) });
                };
                if (done) return res({ done: true, value: undefined });
                if (queue.length) handle(queue.shift()); else waiting = handle;
              }),
              cancel: () => { reader.cancelled = true; push({ cancel: true }); return Promise.resolve(); },
            };
            resolve({ ok: true, status: 200, headers: { get: (h) => (h.toLowerCase() === "content-type" ? "text/event-stream; charset=utf-8" : null) }, body: { getReader: () => reader } });
            return reader;
          };
          return onChat({ body: lastPayload, json, stream, reject, at, db });
        }
        if (url.startsWith("/api/chats?email=")) { chatsReads++; return json(200, { chats: Object.keys(db).map((id) => ({ id, createdAt: db[id].createdAt })) }); }
        chatsReads++;
        const id = decodeURIComponent(url.split("/api/chats/")[1] || "");
        if (db[id]) return json(200, { chat: { id }, messages: db[id].messages });
        return json(404, { error: "chat not found" });
      }),
  };
  vm.createContext(ctx);
  vm.runInContext(pageSrc + "\n;globalThis.__send = rhSendMessage; globalThis.__retry = rhRetryLastMessage;", ctx);
  return {
    ctx, log, renders, removed, thread, scrollBtn, at, sec,
    get posts() { return posts; },
    get chatsReads() { return chatsReads; },
    get thinking() { return thinking; },
    get thinkingCount() { return thinkingCount; },
    get payload() { return lastPayload; },
    get stillWorkingShown() { return !!(thinking && /Still with you/.test(thinking.textEl.textContent)); },
    send: (text) => ctx.__send(text),
    retry: () => ctx.__retry(),
    bubbles: () => log.filter((l) => l.kind === "reply" || l.kind === "error"),
    visible: () => log.filter((l) => (l.kind === "reply" && l.el.isConnected) || l.kind === "error"),
  };
}
const sse = (o) => `data: ${JSON.stringify(o)}\n\n`;
const nowIso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();
const saveUser = (db, id, text) => { (db[id] ||= { createdAt: nowIso(), messages: [] }).messages.push({ role: "user", text, createdAt: nowIso() }); };
const saveReply = (db, id, text) => db[id].messages.push({ role: "assistant", text, createdAt: nowIso() });
const words = (s) => s.match(/\S+\s*/g);

const pageCases = [
  {
    name: "page asks for streaming (stream:true); thinking lines stay through meta + keep-alive pings; first words at 3s swap in the reply bubble; 'still with you' never shows; words drawn as they arrive; done sets final text + activation button",
    run: async () => {
      let snapAt2 = null;
      const reply = "Hi love. Take a breath with me. What feels heaviest right now?";
      const p = makePage({ onChat: ({ stream, at }) => {
        const script = [[0.5, sse({ type: "meta", chatId: "recChatA" })], [1, ": ping\n\n"]];
        words(reply).forEach((w, i) => script.push([3 + i * 0.5, sse({ type: "delta", text: w.trimEnd() === w ? w : w.trimEnd() + " " })]));
        script.push([3 + words(reply).length * 0.5 + 0.5, sse({ type: "done", reply, chatId: "recChatA", openActivationSlug: "receiving" })]);
        at(2, () => { snapAt2 = { thinkingUp: p.thinking.isConnected, replies: p.log.filter((l) => l.kind === "reply").length }; });
        stream(script);
      } });
      await p.send("hello");
      assert.equal(p.payload.stream, true);
      assert.deepEqual(snapAt2, { thinkingUp: true, replies: 0 }, "thinking bubble still up at 2s, no reply bubble yet");
      assert.equal(p.thinking.isConnected, false, "thinking bubble removed once words arrived");
      assert.equal(p.stillWorkingShown, false, "30s timer was cancelled by the first words");
      const replies = p.bubbles();
      assert.equal(replies.length, 1);
      assert.equal(replies[0].kind, "reply");
      assert.ok(replies[0].sec >= 2.9 && replies[0].sec < 8, `bubble appeared at ${replies[0].sec}s`);
      assert.equal(replies[0].el.textContent, reply);
      assert.ok(!replies[0].el.classes.has("rh-msg-streaming"), "streaming style removed at the end");
      assert.deepEqual(replies[0].el.buttons, ["receiving"]);
      const progressive = p.renders.map((r) => r.text);
      assert.ok(progressive.length >= 5, `drawn ${progressive.length} times`);
      for (let i = 1; i < progressive.length; i++) assert.ok(progressive[i].length >= progressive[i - 1].length, "text only grows");
      assert.equal(p.ctx.window.__rhActiveChatId, "recChatA");
      assert.equal(p.ctx.window.__rhSending, false);
    },
  },
  {
    name: "first words only after 35s: 'still with you' shows at 30s, then the reply streams in normally, no error",
    run: async () => {
      const p = makePage({ onChat: ({ stream }) => stream([[0.5, sse({ type: "meta", chatId: "recChatA" })], [10, ": ping\n\n"], [20, ": ping\n\n"], [30, ": ping\n\n"], [35, sse({ type: "delta", text: "Slow" })], [36, sse({ type: "delta", text: " but here" })], [37, sse({ type: "done", reply: "Slow but here", chatId: "recChatA", openActivationSlug: null })]]) });
      let sw = null;
      p.at(33, () => { sw = p.stillWorkingShown; });
      await p.send("hello");
      assert.equal(sw, true, "'still with you' at 33s");
      assert.deepEqual(p.bubbles().map((b) => `${b.kind}:${b.el ? b.el.textContent : b.text}`), ["reply:Slow but here"]);
    },
  },
  {
    name: "server error part-way through: half reply removed, Try Again shown, no saved-reply check; Try Again re-sends once and the new reply shows",
    run: async () => {
      let n = 0;
      const p = makePage({ onChat: ({ stream, json, at }) => {
        n++;
        if (n === 1) stream([[0.5, sse({ type: "meta", chatId: "recChatA" })], [2, sse({ type: "delta", text: "Here is the start" })], [3, sse({ type: "delta", text: " of something" })], [4, sse({ type: "error", error: "The response took too long. Please try again." })], [4.1, { end: true }]]);
        else at(1, () => json(200, { reply: "Second time lucky", chatId: "recChatA" }));
      } });
      await p.send("hello");
      const first = p.log.find((l) => l.kind === "reply");
      assert.equal(first.el.isConnected, false, "partial bubble removed");
      assert.deepEqual(p.visible().map((b) => b.kind), ["error"]);
      assert.equal(p.chatsReads, 0, "a server error means nothing was saved: no saved-reply check");
      assert.equal(p.ctx.window.__rhLastFailedText, "hello");
      await p.retry();
      await new Promise((r) => setTimeout(r, 30));
      assert.equal(p.posts, 2);
      assert.deepEqual(p.visible().map((b) => `${b.kind}:${b.text}`).slice(-1), ["reply:Second time lucky"]);
    },
  },
  {
    name: "connection drops mid-reply; the server finishes and saves 20s later -> half reply removed, 'still with you' while checking, SAVED reply shown (needs the ~40s window), no error",
    run: async () => {
      const db = {};
      const p = makePage({ db, onChat: ({ stream, at, db }) => {
        saveUser(db, "recChatA", "hello");
        stream([[0.5, sse({ type: "meta", chatId: "recChatA" })], [2, sse({ type: "delta", text: "Part of" })], [3, sse({ type: "delta", text: " a reply" })], [4, { drop: true }]]);
        at(24, () => saveReply(db, "recChatA", "The full saved reply"));
      } });
      let midCheck = null;
      p.at(10, () => { midCheck = { stillWorking: p.stillWorkingShown, thinkingUp: p.thinking.isConnected }; });
      await p.send("hello");
      assert.deepEqual(midCheck, { stillWorking: true, thinkingUp: true });
      assert.equal(p.log.find((l) => l.kind === "reply").el.isConnected, false, "partial bubble removed");
      assert.deepEqual(p.visible().map((b) => `${b.kind}:${b.text}`), ["reply:The full saved reply"]);
    },
  },
  {
    name: "connection drops mid-reply and nothing was saved -> half reply removed, Try Again after the ~40s check (not before)",
    run: async () => {
      const db = {};
      const p = makePage({ db, onChat: ({ stream, db }) => { saveUser(db, "recChatA", "hello"); stream([[0.5, sse({ type: "meta", chatId: "recChatA" })], [2, sse({ type: "delta", text: "Part of" })], [4, { drop: true }]]); } });
      await p.send("hello");
      const err = p.visible();
      assert.deepEqual(err.map((b) => b.kind), ["error"]);
      assert.ok(err[0].sec >= 4 + 36, `error at ${err[0].sec}s`);
      assert.ok(err[0].sec < 60, `error at ${err[0].sec}s`);
    },
  },
  {
    name: "stream goes completely silent (no pings) for 30s -> treated as a dropped connection -> saved reply found and shown",
    run: async () => {
      const db = {};
      const p = makePage({ db, onChat: ({ stream, at, db }) => {
        saveUser(db, "recChatA", "hello");
        stream([[0.5, sse({ type: "meta", chatId: "recChatA" })], [2, sse({ type: "delta", text: "Part" })]]);
        at(36, () => saveReply(db, "recChatA", "Saved after the silence"));
      } });
      await p.send("hello");
      assert.deepEqual(p.visible().map((b) => `${b.kind}:${b.text}`), ["reply:Saved after the silence"]);
    },
  },
  {
    name: "brand-new chat: drop mid-reply, nothing saved yet -> Try Again; reply lands later -> Try Again shows it WITHOUT re-sending (uses the chat id the stream announced)",
    run: async () => {
      const db = {};
      const p = makePage({ db, activeChatId: null, onChat: ({ stream, db }) => { saveUser(db, "recNew1", "first message"); stream([[0.5, sse({ type: "meta", chatId: "recNew1" })], [2, sse({ type: "delta", text: "Welcome" })], [3, { drop: true }]]); } });
      await p.send("first message");
      assert.equal(p.visible().slice(-1)[0].kind, "error");
      assert.equal(p.ctx.window.__rhLastFailedSend.chatId, "recNew1");
      saveReply(db, "recNew1", "Welcome, love -- the late reply");
      await p.retry();
      assert.equal(p.posts, 1, "not re-sent");
      assert.equal(p.visible().slice(-1)[0].text, "Welcome, love -- the late reply");
      assert.equal(p.ctx.window.__rhActiveChatId, "recNew1");
    },
  },
  {
    name: "member opens another chat mid-reply -> drawing stops, nothing dropped into the other chat, no error, send button released",
    run: async () => {
      let reader;
      const p = makePage({ onChat: ({ stream, at }) => {
        reader = stream([[0.5, sse({ type: "meta", chatId: "recChatA" })], [2, sse({ type: "delta", text: "Belongs" })], [4, sse({ type: "delta", text: " to chat A" })], [6, sse({ type: "done", reply: "Belongs to chat A", chatId: "recChatA" })]]);
        at(3, () => { p.log.find((l) => l.kind === "reply").el.isConnected = false; }); // opening another chat removes .rh-msg nodes
      } });
      await p.send("hello");
      assert.equal(p.log.filter((l) => l.kind === "error").length, 0);
      assert.equal(p.log.filter((l) => l.kind === "reply").length, 1, "no second bubble");
      assert.ok(reader.cancelled, "stopped reading");
      assert.equal(p.ctx.window.__rhSending, false);
    },
  },
  {
    name: "scrolling: at the bottom -> the chat follows the words down; scrolled up -> never pulled down, the scroll-down arrow glows",
    run: async () => {
      const script = (stream) => stream([[0.5, sse({ type: "meta", chatId: "recChatA" })], [2, sse({ type: "delta", text: "One" })], [2.5, sse({ type: "delta", text: " two" })], [3, sse({ type: "delta", text: " three" })], [4, sse({ type: "done", reply: "One two three", chatId: "recChatA" })]]);
      const a = makePage({ follow: true, onChat: ({ stream }) => { a.thread.scrollHeight = 1500; script(stream); } });
      await a.send("hello");
      assert.equal(a.thread.scrollTop, 1500, "followed to the bottom");
      const b = makePage({ follow: false, scrollBtnShown: true, onChat: ({ stream }) => { b.thread.scrollHeight = 1500; script(stream); } });
      await b.send("hello");
      assert.equal(b.thread.scrollTop, 0, "not pulled down");
      assert.ok(b.scrollBtn.classes.has("rh-glow"), "arrow glows");
    },
  },
  {
    name: "scrolling: her finger/wheel is moving right now -> the stream doesn't fight her",
    run: async () => {
      const p = makePage({ follow: true, onChat: ({ stream }) => { p.ctx.rhUserScrollUntil = Date.now() + 60000; p.thread.scrollHeight = 1500; stream([[0.5, sse({ type: "meta", chatId: "recChatA" })], [2, sse({ type: "delta", text: "One" })], [2.5, sse({ type: "delta", text: " two" })], [3, sse({ type: "delta", text: " three" })], [3.5, { end: true }]]); } });
      p.ctx.rhFollowReply = true;
      await Promise.race([p.send("hello"), new Promise((r) => setTimeout(r, 30))]);
      assert.equal(p.thread.scrollTop, 0);
    },
  },
  {
    name: "switch off: server answers with the usual JSON even though the page asked -> exactly the old behaviour",
    run: async () => {
      const p = makePage({ onChat: ({ json, at }) => at(5, () => json(200, { reply: "Plain JSON reply", chatId: "recChatA", openActivationSlug: null })) });
      await p.send("hello");
      assert.equal(p.payload.stream, true);
      assert.deepEqual(p.bubbles().map((b) => `${b.kind}:${b.text}`), ["reply:Plain JSON reply"]);
      assert.equal(p.thinking.isConnected, false);
    },
  },
];
for (const c of pageCases) await test(c.name, c.run);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
