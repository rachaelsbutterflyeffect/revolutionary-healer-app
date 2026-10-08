// Dev-only tests for GAP-bot STREAMING (Oct 8 2026,
// app/api/gap-chat-member/route.ts + lib/chatStreaming.js).
// NOT part of the app: nothing imports this file. It never calls the real
// Anthropic API or Airtable and needs no secrets -- the REAL route
// (transpiled on the fly) runs against a local fake Anthropic server (real
// @anthropic-ai/sdk on the wire) and a fake entitlement check.
//
//   npm run test:gap-streaming
//
//  A. Switch: GAP_STREAMING is separate from CHAT_STREAMING (either can be
//     off on its own); allowlist; the page must ask.
//  B. Switch off / not allowed: byte-for-byte the same JSON and the same
//     Claude request as the route before streaming (git d98b36f, PR #37 head).
//  C. Streaming on: hidden markers (FINAL_IDENTITY, SUB_ACTIVATION,
//     SAVE_SHIFT, DISTORTIONS, TOPIC) never reach the screen, split at
//     every character boundary; hidden thinking never reaches the screen;
//     the final "done" reply is exactly the JSON path's reply (markers
//     included, so the page saves the Shift / deals the card the same way);
//     breaks send "error" and never "done"; retries only before the first word.
import { register } from "node:module";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { undoGapReadingRestructure } from "./gap-reading-scope.mjs"; // GAP reading restructure (Oct 8 2026): see that file
import { undoRemoveRelationships } from "./remove-relationships-scope.mjs"; // Remove Relationships option (Oct 8 2026): see that file

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rh-gap-stream-test-"));
const tmpUrl = pathToFileURL(tmp + "/").href;
const appRootUrl = pathToFileURL(appRoot + "/").href;
const libUrl = pathToFileURL(path.join(appRoot, "lib") + "/").href;
const FAKES = { "@/lib/entitlements": "fake-entitlements.mjs", "@vercel/functions": "fake-functions.mjs" };
fs.writeFileSync(path.join(tmp, "fake-entitlements.mjs"), `
export async function getEntitlementForEmail(email) { globalThis.__fx.entitlementChecks++; return globalThis.__fx.entitled === false ? { record: null, entitlement: { canUseBase: false } } : { record: { id: "recMember1" }, entitlement: { canUseBase: true } }; }
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

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`ok - ${name}`); }
  catch (err) { failed++; console.error(`FAIL - ${name}\n   ${err && err.stack ? err.stack.split("\n").slice(0, 6).join("\n   ") : err}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const read = (f) => fs.readFileSync(path.join(appRoot, f), "utf8");
const { createMarkerHoldback, runStreamedReply } = await import(pathToFileURL(path.join(appRoot, "lib", "chatStreaming.js")).href);

// ---------------------------------------------------------------------------
// Real GAP replies' shapes (markers exactly as lib/processes.js asks for them)
// ---------------------------------------------------------------------------
const SAVE = `[[SAVE_SHIFT: {"focusArea": "Business", "divineIdentityName": "The Wayshower", "divineIdentitySlug": "wayshower", "currentFrequency": "Doubt", "gap": "You want to be paid well, [and] you discount first.", "howItShowsUp": "Rewriting the offer instead of following up.", "primaryShift": "From proving to receiving.", "recommendedActivation": "Receiving"}]]`;
const COMPLETION = `Yes -- I can see it clearly now. Let's move into Step 3 so I can show you exactly what's going on and how to shift it.\n\n${SAVE}\n[[DISTORTIONS: Doubt, External Confirmation, Fear of Consequence]]\n[[TOPIC: money_business]]`;
const FINAL_ID = `We've got enough now to name the GAP clearly. Move into Step 3 and I'll show you:\n- your Divine Identity\n- your exact GAP\n\n[[FINAL_IDENTITY: healer]]\n[[SUB_ACTIVATION: remembrance]]`;
const QUESTION = "When they go quiet, what's the very first thing you tell yourself -- and what do you do next?";
const BRACKETS = "Some members write [like this] or use a single [ bracket mid-reply, and that's fine.";
const SAMPLES = { COMPLETION, FINAL_ID, QUESTION, BRACKETS };
// The page's own marker clean-up (public/app.html sendToGapChat), for checks.
function pageVisible(reply) {
  let r = reply;
  for (const re of [/\[\[FINAL_IDENTITY:\s*(\w+)\s*\]\]/i, /\[\[SUB_ACTIVATION:\s*(\w+)\s*\]\]/i, /\[\[SAVE_SHIFT:\s*([\s\S]*?)\]\]/i, /\[\[DISTORTIONS:[\s\S]*?\]\]/i, /\[\[TOPIC:[\s\S]*?\]\]/i]) {
    const m = r.match(re); if (m) r = r.replace(m[0], "").trim();
  }
  return r;
}

// ---------------------------------------------------------------------------
// Fake Anthropic API (real SDK on the wire). Optional hidden thinking block.
// ---------------------------------------------------------------------------
let apiBehaviour = () => ({ text: "ok" });
const apiRequests = [];
const sockets = new Set();
const apiServer = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", async () => {
    const body = JSON.parse(raw || "{}");
    apiRequests.push(body);
    const b = apiBehaviour(apiRequests.length, body) || {};
    if (b.status && b.status !== 200) {
      const out = JSON.stringify({ type: "error", error: { type: b.status === 529 ? "overloaded_error" : "invalid_request_error", message: "fake" } });
      res.writeHead(b.status, { "content-type": "application/json", "content-length": Buffer.byteLength(out) });
      return res.end(out);
    }
    const text = b.text ?? "ok";
    const usage = { input_tokens: 13000, output_tokens: 2 };
    const content = [...(b.thinking ? [{ type: "thinking", thinking: b.thinking, signature: "sig" }] : []), { type: "text", text }];
    if (!body.stream) {
      const out = JSON.stringify({ id: "msg_t", type: "message", role: "assistant", model: "fake", content, stop_reason: "end_turn", stop_sequence: null, usage });
      res.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(out), connection: "close" });
      return res.end(out);
    }
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
    ev("message_start", { message: { id: "msg_t", type: "message", role: "assistant", model: "fake", content: [], stop_reason: null, stop_sequence: null, usage } });
    let idx = 0;
    if (b.thinking) {
      ev("content_block_start", { index: 0, content_block: { type: "thinking", thinking: "", signature: "" } });
      if (b.thinkingSilenceMs) await sleep(b.thinkingSilenceMs); // the real API sends nothing while it thinks
      if (b.thinkingHang) return;
      for (const w of b.thinking.match(/\S+\s*/g)) ev("content_block_delta", { index: 0, delta: { type: "thinking_delta", thinking: w } });
      ev("content_block_delta", { index: 0, delta: { type: "signature_delta", signature: "sig" } });
      ev("content_block_stop", { index: 0 });
      idx = 1;
    }
    ev("content_block_start", { index: idx, content_block: { type: "text", text: "" } });
    const pieces = b.pieces || text.match(/\S+\s*|\s+/g) || [""];
    for (let i = 0; i < pieces.length; i++) {
      if (b.failAt === i) {
        if (b.fail === "destroy") return req.socket.destroy();
        if (b.fail === "error-event") { ev("error", { error: { type: "overloaded_error", message: "Overloaded" } }); return res.end(); }
        if (b.fail === "hang") return;
      }
      ev("content_block_delta", { index: idx, delta: { type: "text_delta", text: pieces[i] } });
      if (b.delayMs) await sleep(b.delayMs);
    }
    ev("content_block_stop", { index: idx });
    ev("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 20 } });
    ev("message_stop", {});
    res.end();
  });
});
apiServer.on("connection", (s) => { sockets.add(s); s.on("close", () => sockets.delete(s)); });
await new Promise((r) => apiServer.listen(0, "127.0.0.1", r));
process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${apiServer.address().port}`;
process.env.ANTHROPIC_API_KEY = "test-not-a-real-key";

function transpile(src, name) {
  const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
  const f = path.join(tmp, name); fs.writeFileSync(f, out); return pathToFileURL(f).href;
}
const ROUTE = "app/api/gap-chat-member/route.ts";
const newRoute = await import(transpile(read(ROUTE), "gap-new.mjs"));
const oldRoute = await import(transpile(execFileSync("git", ["show", `d98b36f:revolutionary-healer-app/${ROUTE}`], { cwd: appRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }), "gap-old.mjs"));

const SWITCH_KEYS = ["GAP_STREAMING", "GAP_STREAMING_ALLOWLIST", "CHAT_STREAMING", "CHAT_STREAMING_ALLOWLIST"];
function setSwitch(env = {}) { for (const k of SWITCH_KEYS) { if (env[k] !== undefined) process.env[k] = env[k]; else delete process.env[k]; } }
const fresh = (over = {}) => ({ pending: [], pendingErrors: [], entitlementChecks: 0, ...over });
const quiet = async (fn) => { const { log, error, warn } = console; const lines = []; console.log = (...a) => lines.push(a.join(" ")); console.error = (...a) => lines.push(a.map(String).join(" ")); console.warn = () => {}; try { const r = await fn(); r.logLines = lines; return r; } finally { Object.assign(console, { log, error, warn }); } };
const BODY = { email: "member@example.com", message: "I keep discounting before they even ask.", history: [{ role: "assistant", content: "What is happening in your business right now that has you feeling like something isn't adding up?" }], gapContext: { divineIdentity: "The Wayshower", currentFrequency: "Doubt", focusArea: "Business" } };
const SBODY = { ...BODY, stream: true };
const mkReq = (body) => new Request("http://localhost/api/gap-chat-member", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
function parseSse(text) {
  return text.split("\n\n").filter((b) => b.trim()).map((b) => {
    const data = b.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("\n");
    return data ? JSON.parse(data) : { type: "comment" };
  });
}
async function run(mod, { body, env, api, fx = fresh(), cancelWhen } = {}) {
  setSwitch(env); globalThis.__fx = fx; apiBehaviour = api || (() => ({ text: "ok" })); apiRequests.length = 0;
  return quiet(async () => {
    const res = await mod.POST(mkReq(body));
    const ctype = res.headers.get("content-type") || "";
    if (!/event-stream/.test(ctype)) { const text = await res.text(); return { status: res.status, ctype, text, events: null, apiBodies: apiRequests.slice(), fx }; }
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = ""; const events = []; let cancelled = false;
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i; while ((i = buf.indexOf("\n\n")) !== -1) { events.push(...parseSse(buf.slice(0, i + 2))); buf = buf.slice(i + 2); }
      if (cancelWhen && cancelWhen(events)) { cancelled = true; await reader.cancel(); break; }
    }
    for (let k = 0; k < 20 && fx.pending.length; k++) await Promise.all(fx.pending.splice(0));
    return { status: res.status, ctype, events, cancelled, apiBodies: apiRequests.slice(), fx };
  });
}
const deltasOf = (events) => events.filter((e) => e.type === "delta").map((e) => e.text);

// ---------------------------------------------------------------------------
console.log("# A. Switch");
await test("GAP_STREAMING is independent of CHAT_STREAMING: main on + GAP off -> GAP JSON; main off + GAP on -> GAP streams", async () => {
  let r = await run(newRoute, { body: SBODY, env: { CHAT_STREAMING: "on" }, api: () => ({ text: QUESTION }) });
  assert.equal(r.events, null); assert.equal(JSON.parse(r.text).reply, QUESTION);
  r = await run(newRoute, { body: SBODY, env: { GAP_STREAMING: "off", CHAT_STREAMING: "on" }, api: () => ({ text: QUESTION }) });
  assert.equal(r.events, null);
  r = await run(newRoute, { body: SBODY, env: { GAP_STREAMING: "on", CHAT_STREAMING: "off" }, api: () => ({ text: QUESTION }) });
  assert.ok(r.events && r.events.some((e) => e.type === "done"));
});
await test("the page must ask (no stream:true -> JSON even with GAP_STREAMING=on); unknown values mean off", async () => {
  let r = await run(newRoute, { body: BODY, env: { GAP_STREAMING: "on" }, api: () => ({ text: QUESTION }) });
  assert.equal(r.events, null);
  for (const v of ["", "yes", "true", "ON "]) {
    r = await run(newRoute, { body: SBODY, env: { GAP_STREAMING: v }, api: () => ({ text: QUESTION }) });
    if (v === "ON ") assert.ok(r.events, "'ON ' (case/space) counts as on, same as the main chat switch"); else assert.equal(r.events, null, `'${v}' should be off`);
  }
});
await test("allowlist: GAP_STREAMING_ALLOWLIST if set, otherwise the main chat's CHAT_STREAMING_ALLOWLIST", async () => {
  const yes = { ...SBODY, email: " Ray@Example.com " }, no = { ...SBODY, email: "someone@example.com" };
  let r = await run(newRoute, { body: yes, env: { GAP_STREAMING: "allowlist", CHAT_STREAMING_ALLOWLIST: "rachael@example.com, ray@example.com" }, api: () => ({ text: QUESTION }) });
  assert.ok(r.events);
  r = await run(newRoute, { body: no, env: { GAP_STREAMING: "allowlist", CHAT_STREAMING_ALLOWLIST: "rachael@example.com, ray@example.com" }, api: () => ({ text: QUESTION }) });
  assert.equal(r.events, null);
  r = await run(newRoute, { body: yes, env: { GAP_STREAMING: "allowlist", GAP_STREAMING_ALLOWLIST: "rachael@example.com", CHAT_STREAMING_ALLOWLIST: "ray@example.com" }, api: () => ({ text: QUESTION }) });
  assert.equal(r.events, null, "GAP's own list wins when set");
  r = await run(newRoute, { body: yes, env: { GAP_STREAMING: "allowlist" }, api: () => ({ text: QUESTION }) });
  assert.equal(r.events, null, "no list = nobody");
});

// ---------------------------------------------------------------------------
console.log("\n# B. Switch off / not allowed: identical to the route before this change (git d98b36f = PR #37 head, incl. the GAP max_tokens fix)");
const OFF_ENVS = [{}, { GAP_STREAMING: "off" }, { GAP_STREAMING: "allowlist", CHAT_STREAMING_ALLOWLIST: "other@example.com" }, { CHAT_STREAMING: "on" }];
await test("every reply shape x every 'off' setting x page asking or not: same status, same JSON bytes, same Claude request", async () => {
  for (const env of OFF_ENVS) for (const [name, text] of Object.entries(SAMPLES)) for (const body of [BODY, SBODY]) {
    const api = () => ({ text, thinking: "hidden reasoning here" });
    const a = await run(oldRoute, { body: BODY, env, api }), b = await run(newRoute, { body, env, api });
    assert.equal(b.status, a.status, name); assert.equal(b.ctype, a.ctype, name); assert.equal(b.text, a.text, name);
    assert.equal(b.apiBodies.length, 1); assert.deepEqual(b.apiBodies[0], a.apiBodies[0], `${name}: Claude request differs`);
  }
});
await test("400 (missing email/message) and 403 (not entitled) unchanged, Claude never called", async () => {
  for (const body of [{ ...SBODY, email: "" }, { ...SBODY, message: "" }]) {
    const a = await run(oldRoute, { body, env: { GAP_STREAMING: "on" } }), b = await run(newRoute, { body, env: { GAP_STREAMING: "on" } });
    assert.equal(b.status, 400); assert.equal(b.text, a.text); assert.equal(b.apiBodies.length, 0);
  }
  const a = await run(oldRoute, { body: SBODY, env: { GAP_STREAMING: "on" }, fx: fresh({ entitled: false }) });
  const b = await run(newRoute, { body: SBODY, env: { GAP_STREAMING: "on" }, fx: fresh({ entitled: false }) });
  assert.equal(b.status, 403); assert.equal(b.text, a.text); assert.equal(b.apiBodies.length, 0);
});

// ---------------------------------------------------------------------------
console.log("\n# C. Streaming on");
const ON = { GAP_STREAMING: "on" };
await test("events: meta first, then words, then ONE done; done.reply == the JSON path's reply (markers included) for every reply shape", async () => {
  for (const [name, text] of Object.entries(SAMPLES)) {
    const api = () => ({ text, thinking: "I should name the gap carefully" });
    const j = await run(oldRoute, { body: BODY, env: {}, api });
    const s = await run(newRoute, { body: SBODY, env: ON, api });
    assert.equal(s.events[0].type, "meta", name);
    const done = s.events.filter((e) => e.type === "done");
    assert.equal(done.length, 1, name); assert.equal(s.events[s.events.length - 1].type, "done", name);
    assert.equal(done[0].reply, JSON.parse(j.text).reply, `${name}: final reply differs from JSON path`);
    assert.ok(!s.events.some((e) => e.type === "error"));
  }
});
await test("Claude request when streaming = the JSON request + stream:true (same model, max_tokens, system, messages)", async () => {
  const api = () => ({ text: QUESTION });
  const j = await run(oldRoute, { body: BODY, env: {}, api }), s = await run(newRoute, { body: SBODY, env: ON, api });
  const { stream, ...rest } = s.apiBodies[0];
  assert.equal(stream, true); assert.deepEqual(rest, j.apiBodies[0]);
});
await test("markers never on screen: every GAP reply shape split at EVERY character boundary (hold-back helper)", () => {
  for (const [name, text] of Object.entries(SAMPLES)) for (let i = 0; i <= text.length; i++) for (const pieces of [[text.slice(0, i), text.slice(i)], [text.slice(0, i), ...text.slice(i).split("")]]) {
    const h = createMarkerHoldback(); const shown = pieces.map((p) => h.push(p)).join("");
    assert.ok(!shown.includes("[["), `${name} @${i}: marker shown`);
    assert.ok(!/FINAL_IDENTITY|SUB_ACTIVATION|SAVE_SHIFT|DISTORTIONS|TOPIC:/.test(shown), `${name} @${i}`);
    assert.ok(pageVisible(text).startsWith(shown), `${name} @${i}: shown text is not the start of what the page shows`);
  }
});
await test("markers never on screen through the REAL route: completion reply streamed one character at a time", async () => {
  for (const text of [COMPLETION, FINAL_ID]) {
    const s = await run(newRoute, { body: SBODY, env: ON, api: () => ({ text, pieces: text.split("") }) });
    const shown = deltasOf(s.events).join("");
    assert.ok(!shown.includes("[["), "marker shown");
    assert.ok(!/SAVE_SHIFT|FINAL_IDENTITY|DISTORTIONS|TOPIC|SUB_ACTIVATION|divineIdentitySlug/.test(shown));
    assert.equal(shown, pageVisible(text).replace(/\s+$/, ""));
    assert.equal(s.events.find((e) => e.type === "done").reply, text);
  }
});
await test("hidden thinking never reaches the screen (only the reply's words are streamed)", async () => {
  const s = await run(newRoute, { body: SBODY, env: ON, api: () => ({ text: QUESTION, thinking: "SECRET reasoning about the member" }) });
  assert.ok(!deltasOf(s.events).join("").includes("SECRET"));
  assert.equal(deltasOf(s.events).join(""), QUESTION);
});
await test("the page's Shift data from a streamed completion == from the JSON path (same SAVE_SHIFT JSON, same distortions/topic)", async () => {
  const api = () => ({ text: COMPLETION, pieces: COMPLETION.match(/.{1,7}/gs) });
  const j = JSON.parse((await run(oldRoute, { body: BODY, env: {}, api })).text).reply;
  const d = (await run(newRoute, { body: SBODY, env: ON, api })).events.find((e) => e.type === "done").reply;
  const card = (r) => JSON.parse(r.match(/\[\[SAVE_SHIFT:\s*([\s\S]*?)\]\]/i)[1]);
  assert.deepEqual(card(d), card(j)); assert.equal(card(d).divineIdentitySlug, "wayshower");
  assert.equal(pageVisible(d), pageVisible(j));
});
await test("break mid-reply (connection dropped / Claude error event): error event, NO done (page removes the partial, saves nothing)", async () => {
  for (const fail of ["destroy", "error-event"]) {
    const s = await run(newRoute, { body: SBODY, env: ON, api: () => ({ text: COMPLETION, failAt: 6, fail, delayMs: 3 }) });
    assert.ok(deltasOf(s.events).length > 0, "some words went out first");
    assert.equal(s.events[s.events.length - 1].type, "error", fail);
    assert.ok(!s.events.some((e) => e.type === "done"), fail);
    assert.ok(/try again/i.test(s.events[s.events.length - 1].error));
  }
});
await test("Claude rejects the request (400): error event, no done, not retried", async () => {
  const s = await run(newRoute, { body: SBODY, env: ON, api: () => ({ status: 400 }) });
  assert.deepEqual(s.events.map((e) => e.type).filter((t) => t !== "comment"), ["meta", "error"]);
  assert.equal(s.apiBodies.length, 1);
});
await test("overloaded (529) before the first word -> retried by the SDK, then streams normally", async () => {
  const s = await run(newRoute, { body: SBODY, env: ON, api: (n) => (n === 1 ? { status: 529 } : { text: QUESTION }) });
  assert.equal(s.apiBodies.length, 2);
  assert.equal(s.events.find((e) => e.type === "done").reply, QUESTION);
});
await test("member closes the GAP window mid-reply: the job finishes quietly in the background, no errors (nothing to save)", async () => {
  const s = await run(newRoute, { body: SBODY, env: ON, api: () => ({ text: COMPLETION, delayMs: 3 }), cancelWhen: (ev) => ev.some((e) => e.type === "delta") });
  assert.ok(s.cancelled); assert.equal(s.fx.pendingErrors.length, 0);
  assert.ok(s.logLines.some((l) => /\[gap-chat-member\] stream stats .*"ok":true/.test(l)), "job completed");
});
await test("stream stats logged with the GAP label (log-only: counts and timings, never reply text)", async () => {
  const s = await run(newRoute, { body: SBODY, env: ON, api: () => ({ text: COMPLETION, thinking: "think think" }) });
  const line = s.logLines.find((l) => l.includes("[gap-chat-member] stream stats"));
  assert.ok(line); assert.ok(!/wayshower|Step 3|SAVE_SHIFT/i.test(line));
  const j = JSON.parse(line.replace(/^.*?stream stats /, ""));
  assert.equal(j.ok, true); assert.ok(j.events["content_block_delta:thinking_delta"] >= 1); assert.ok(typeof j.firstVisibleMs === "number");
});
// Stall timers vs hidden thinking (the API sends no data while Claude thinks).
const AnthropicSdk = (await import("@anthropic-ai/sdk")).default;
async function timerRun(api, timers) {
  apiBehaviour = api; apiRequests.length = 0;
  const events = []; let closed = false; let finishCalls = 0; const t0 = Date.now();
  const res = await quiet(async () => ({ r: await runStreamedReply({
    channel: { send: (e) => { if (!closed) events.push(e); }, close: () => { closed = true; } }, chatId: null, label: "test",
    startStream: (signal) => new AnthropicSdk({ apiKey: "test", baseURL: process.env.ANTHROPIC_BASE_URL, maxRetries: 0, fetch: (u, i) => fetch(u, i) /* same transport as the routes */ }).messages.stream({ model: "m", max_tokens: 10, messages: [{ role: "user", content: "x" }] }, { signal, timeout: 5000 }),
    finishReply: async (m) => { finishCalls++; return { replyText: "done", openActivationSlug: null }; }, ...timers }) }));
  return { ...res.r, events, finishCalls, ms: Date.now() - t0 };
}
await test("long hidden thinking (silence 4x the idle limit) is NOT treated as a stall: reply completes", async () => {
  const r = await timerRun(() => ({ text: QUESTION, thinking: "deep thought", thinkingSilenceMs: 600 }), { idleMs: 150, overallMs: 5000 });
  assert.equal(r.ok, true); assert.equal(r.stalled, null); assert.equal(r.finishCalls, 1);
  assert.equal(r.events[r.events.length - 1].type, "done");
});
await test("silence while WRITING the reply is still a stall (idle timer resumes after thinking): error, finishReply never runs", async () => {
  const r = await timerRun(() => ({ text: QUESTION, thinking: "t", failAt: 3, fail: "hang" }), { idleMs: 150, overallMs: 5000 });
  assert.equal(r.stalled, "idle"); assert.equal(r.finishCalls, 0); assert.equal(r.events[r.events.length - 1].type, "error");
  assert.ok(r.ms < 2000);
});
await test("thinking that never ends is still stopped by the overall cap: error, finishReply never runs", async () => {
  const r = await timerRun(() => ({ text: QUESTION, thinking: "t", thinkingHang: true }), { idleMs: 100, overallMs: 500 });
  assert.equal(r.stalled, "overall"); assert.equal(r.finishCalls, 0); assert.equal(r.events[r.events.length - 1].type, "error");
});
await test("REAL route: a hidden-thinking pause streams the full reply (meta first, then words, then done)", async () => {
  const s = await run(newRoute, { body: SBODY, env: ON, api: () => ({ text: COMPLETION, thinking: "hidden", thinkingSilenceMs: 300 }) });
  assert.equal(s.events.find((e) => e.type === "done").reply, COMPLETION);
});
await test("scope: the GAP route saves nothing (no Airtable write imports) and the funnel GAP bot / Shift creation route are untouched", () => {
  const src = read(ROUTE);
  assert.ok(!/from\s+["']@\/lib\/(airtable|memory)["']/.test(src));
  for (const f of ["app/api/gap-chat/route.ts", "app/api/gap-shift/route.ts", "lib/processes.js", "lib/airtable.js"]) {
    assert.equal(undoRemoveRelationships(f, undoGapReadingRestructure(f, read(f))), execFileSync("git", ["show", `7d13fab:revolutionary-healer-app/${f}`], { cwd: appRoot, encoding: "utf8", maxBuffer: 64 << 20 }), `${f} changed`);
  }
});

apiServer.close();
for (const s of sockets) s.destroy();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
