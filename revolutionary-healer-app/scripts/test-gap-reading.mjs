// Dev-only tests for the GAP reading restructure (Oct 8 2026, Rachael --
// TEST PREVIEW). NOT part of the app: nothing imports this file. It never
// calls the real Anthropic API or Airtable and needs no secrets: the REAL
// routes (transpiled on the fly) run against a local fake Anthropic server
// (real @anthropic-ai/sdk on the wire), a fake entitlement check and a fake
// Airtable client.
//
//   npm run test:gap-reading
//
//  A. Protected text: GAP's instructions, activation knowledge, identities,
//     distortion routing and the page's identity/activation data are
//     byte-identical to main @ 114c555 (hash-checked, incl. the assembled
//     member GAP system prompt d0b6f9e7... and the activation guide 051866d3...).
//  B. Switch off (default): every Claude request and every JSON reply is
//     byte-for-byte what main sends/returns -- chat turns AND the reading.
//  C. Switch on: chat turns = main's request + output_config.effort "low"
//     only; the ONE reading = main's request with the appended block after
//     the unchanged hidden completion text, default effort, never streamed.
//  D. Activation selection: AI pick validated against the exact library
//     titles; fallback only when missing/invalid; Healer retries once.
//  E. Today's Focus: 2-4 sentences, identity named, stored only when present.
//  F. Shift saving: same Airtable fields as main when there's no Today's
//     Focus text; the optional field never makes a save fail.
import { register } from "node:module";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { undoRemoveRelationships } from "./remove-relationships-scope.mjs"; // Remove Relationships option (Oct 8 2026): see that file

const BASE = "114c555"; // main = what is live (PR 35 merge)
const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rh-gap-reading-test-"));
const tmpUrl = pathToFileURL(tmp + "/").href;
const appRootUrl = pathToFileURL(appRoot + "/").href;
const libUrl = pathToFileURL(path.join(appRoot, "lib") + "/").href;
const FAKES = { "@/lib/entitlements": "fake-entitlements.mjs", "@vercel/functions": "fake-functions.mjs", airtable: "fake-airtable.mjs" };
fs.writeFileSync(path.join(tmp, "fake-entitlements.mjs"), `
export async function getEntitlementForEmail(email) { return globalThis.__fx.entitled === false ? { record: null, entitlement: { canUseBase: false } } : { record: { id: "recMember1" }, entitlement: { canUseBase: true } }; }
`);
fs.writeFileSync(path.join(tmp, "fake-functions.mjs"), `
export function waitUntil(p) { globalThis.__fx.pending.push(Promise.resolve(p).catch((e) => { globalThis.__fx.pendingErrors.push(e); })); }
`);
fs.writeFileSync(path.join(tmp, "fake-airtable.mjs"), `
export default class Airtable {
  constructor() {}
  base() {
    return (table) => ({
      create: async (fields) => {
        const fx = globalThis.__at; fx.creates.push({ table, fields: JSON.parse(JSON.stringify(fields)) });
        if (fx.failWith) { const f = fx.failWith(fields); if (f) { const e = new Error(f.message); e.error = f.error; e.statusCode = 422; throw e; } }
        return { id: "recNew" + fx.creates.length, fields };
      },
      update: async (id, fields) => { globalThis.__at.updates.push({ table, id, fields }); return { id, fields }; },
      select: () => ({ all: async () => (globalThis.__at.rows || []) }),
      find: async () => null, destroy: async () => {},
    });
  }
}
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
  if ((url.startsWith(LIB) || url.startsWith(TMP + "lib-")) && url.endsWith(".js")) return next(url, { ...ctx, format: "module" });
  return next(url, ctx);
}`),
  import.meta.url
);

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`ok - ${name}`); }
  catch (err) { failed++; console.error(`FAIL - ${name}\n   ${err && err.stack ? err.stack.split("\n").slice(0, 6).join("\n   ") : err}`); }
}
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const read = (f) => fs.readFileSync(path.join(appRoot, f), "utf8");
const gitShow = (f) => execFileSync("git", ["show", `${BASE}:revolutionary-healer-app/${f}`], { cwd: appRoot, encoding: "utf8", maxBuffer: 64 << 20, stdio: ["ignore", "pipe", "ignore"] });
const G = await import(pathToFileURL(path.join(appRoot, "lib", "gapReading.js")).href);
const P = await import(pathToFileURL(path.join(appRoot, "lib", "processes.js")).href);
const AG = await import(pathToFileURL(path.join(appRoot, "lib", "activationGuide.js")).href);

// ---------------------------------------------------------------------------
// Fake Anthropic API (real SDK on the wire)
// ---------------------------------------------------------------------------
let apiBehaviour = () => ({ text: "ok" });
const apiRequests = [];
const apiServer = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const body = JSON.parse(raw || "{}");
    apiRequests.push(body);
    const b = apiBehaviour(apiRequests.length, body) || {};
    if (b.status && b.status !== 200) {
      const out = JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "fake" } });
      res.writeHead(b.status, { "content-type": "application/json", "content-length": Buffer.byteLength(out) }); return res.end(out);
    }
    const content = [{ type: "thinking", thinking: "hidden", signature: "sig" }, { type: "text", text: b.text ?? "ok" }];
    const usage = { input_tokens: 13000, output_tokens: 40 };
    if (!body.stream) {
      const out = JSON.stringify({ id: "msg_t", type: "message", role: "assistant", model: "fake", content, stop_reason: "end_turn", stop_sequence: null, usage });
      res.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(out), connection: "close" }); return res.end(out);
    }
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
    ev("message_start", { message: { id: "msg_t", type: "message", role: "assistant", model: "fake", content: [], stop_reason: null, stop_sequence: null, usage } });
    ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
    for (const w of (b.text ?? "ok").match(/\S+\s*|\s+/g) || [""]) ev("content_block_delta", { index: 0, delta: { type: "text_delta", text: w } });
    ev("content_block_stop", { index: 0 });
    ev("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 20 } });
    ev("message_stop", {});
    res.end();
  });
});
await new Promise((r) => apiServer.listen(0, "127.0.0.1", r));
process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${apiServer.address().port}`;
process.env.ANTHROPIC_API_KEY = "test-not-a-real-key";

function transpile(src, name) {
  const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
  const f = path.join(tmp, name); fs.writeFileSync(f, out); return pathToFileURL(f).href;
}
const ROUTE = "app/api/gap-chat-member/route.ts";
const newRoute = await import(transpile(read(ROUTE), "gap-new.mjs"));
const oldRoute = await import(transpile(gitShow(ROUTE), "gap-old.mjs"));

const SWITCH_KEYS = ["GAP_STREAMING", "GAP_STREAMING_ALLOWLIST", "CHAT_STREAMING", "CHAT_STREAMING_ALLOWLIST", "GAP_FAST_READING", "GAP_FAST_READING_ALLOWLIST"];
function setSwitch(env = {}) { for (const k of SWITCH_KEYS) { if (env[k] !== undefined) process.env[k] = env[k]; else delete process.env[k]; } }
const fresh = (over = {}) => ({ pending: [], pendingErrors: [], ...over });
const quiet = async (fn) => { const { log, error, warn } = console; const lines = []; console.log = (...a) => lines.push(a.join(" ")); console.error = (...a) => lines.push(a.map(String).join(" ")); console.warn = (...a) => lines.push(a.join(" ")); try { const r = await fn(); r.logLines = lines; return r; } finally { Object.assign(console, { log, error, warn }); } };
const mkReq = (url, body) => new Request("http://localhost" + url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
async function run(mod, { body, env, api, fx = fresh() } = {}) {
  setSwitch(env); globalThis.__fx = fx; apiBehaviour = api || (() => ({ text: "ok" })); apiRequests.length = 0;
  return quiet(async () => {
    const res = await mod.POST(mkReq("/api/gap-chat-member", body));
    const ctype = res.headers.get("content-type") || "";
    const text = await res.text();
    for (let k = 0; k < 20 && fx.pending.length; k++) await Promise.all(fx.pending.splice(0));
    return { status: res.status, ctype, text, apiBodies: apiRequests.slice(), fastHeader: res.headers.get("x-gap-fast-reading"), headerNames: [...res.headers.keys()].sort().join(",") };
  });
}

// Real shapes
// The member's library = the page's ACTIVATION_DETAILS titles (what "Listen now" can open).
function pageLibraryTitles(html) {
  const i = html.indexOf("var ACTIVATION_DETAILS"); let j = html.indexOf("{", i), d = 0, k = j;
  for (; k < html.length; k++) { if (html[k] === "{") d++; else if (html[k] === "}") { d--; if (d === 0) break; } }
  return Object.values(new Function("return (" + html.slice(j, k + 1) + ")")()).map((x) => x.title);
}
const LIBRARY = pageLibraryTitles(read("public/app.html"));
const KICKOFF = "(The member is ready to move forward. Give your Step 2 completion summary now, in the style already described, then stop.)";
const CTX = { divineIdentity: "The Wayshower", currentFrequency: "Doubt", focusArea: "Business + Visibility", gapSummary: "a", gapExample: "b", gapRestated: "c", identityBelief: "d", distortionLabel: "Doubt" };
const HCTX = { ...CTX, divineIdentity: "The Healer", currentFrequency: "Disconnection", distortionLabel: "Disconnection" };
const HIST = [
  { role: "assistant", content: "What is happening in your business right now that has you feeling like something isn't adding up?" },
  { role: "user", content: "I keep rewriting my sales page instead of launching." },
  { role: "assistant", content: "What do you tell yourself right before you start rewriting it?" },
];
const STEP1 = [
  { question: "Which feels most like who you naturally are?", answer: "Sees ahead, helps people trust the path." },
  { question: "Which kind of transformation feels most natural to you?", answer: "Helping people trust a direction that's becoming clear." },
  { question: "Where are you feeling the gap the most right now?", answer: "Business + Visibility" },
];
const CHAT = { email: "member@example.com", message: "I tell myself it isn't ready yet.", history: HIST, gapContext: CTX };
const READ = { email: "member@example.com", message: KICKOFF, history: HIST, gapContext: CTX, phase: "reading", step1: STEP1, activationLibrary: LIBRARY, fixedActivation: "Removing the Frequency of Doubt" };
const save = (act) => `[[SAVE_SHIFT: {"focusArea": "Business + Visibility", "divineIdentityName": "The Wayshower", "divineIdentitySlug": "wayshower", "currentFrequency": "Doubt", "gap": "You know the program is right, and you keep asking others first.", "howItShowsUp": "Rewriting the sales page four times.", "primaryShift": "From waiting for agreement, into trusting what you know."${act === undefined ? "" : `, "recommendedActivation": ${JSON.stringify(act)}`}}]]`;
const FOCUS6 = "As The Wayshower, you already know this program is right. You said you keep 'rewriting the whole thing' when one person doubts it. That is the gap. Your shift is trusting your knowing first. One. Two.";
const READING_REPLY = (act, extra = "") => `Okay, I see the gap. Let's move to Step 3.\n\n${save(act)}\n[[DISTORTIONS: Doubt, External Confirmation]]\n[[TOPIC: money_business]]\n[[ACTIVATION_WHY: Because you hand your knowing to others, this clears doubt.]]\n[[TODAYS_FOCUS: As The Wayshower, you already know this program is right. You said you keep "rewriting the whole thing" the moment one person doubts it. Today, trust what you know before you ask.]]${extra}`;
const ON = { GAP_FAST_READING: "on" };

// ---------------------------------------------------------------------------
console.log("# A. Protected text is byte-identical to main (" + BASE + ")");
await test("assembled member GAP system prompt (gapContext=null) still hashes to d0b6f9e7... and the activation guide to 051866d3...", () => {
  assert.equal(sha(P.buildGapMemberSystemPrompt(null)), "d0b6f9e73b0aefe0d286e098e8dd53e5e1edb6ffa09de927b53d46d94303f130");
  assert.equal(P.buildGapMemberSystemPrompt(null).length, 35605);
  assert.equal(sha(AG.ACTIVATION_GUIDE), "051866d35a0b975187503319e2db4d1d392fe020bb16adec28908091dbcdf4df");
});
await test("instruction / knowledge files unchanged since main: processes, prompts, activationGuide, activations, divineIdentities, gapDistortions, focusAreas, the funnel GAP route", () => {
  for (const f of ["lib/processes.js", "lib/prompts.js", "lib/activationGuide.js", "lib/activations.js", "lib/divineIdentities.js", "lib/gapDistortions.js", "lib/focusAreas.js", "app/api/gap-chat/route.ts", "app/api/gap-method-result/route.ts", "lib/chatStreaming.js"])
    assert.equal(sha(undoRemoveRelationships(f, read(f))), sha(gitShow(f)), `${f} changed`); // only the reviewed Remove-Relationships hunks may differ
});
const pageBlock = (html, start) => { const i = html.indexOf(start); assert.ok(i >= 0, start); const ends = ["\n  function ", "\n  var ", "\n  async function ", "\n  // ", "\n</script>"].map((e) => html.indexOf(e, i + start.length)).filter((x) => x > 0); return html.slice(i, Math.min(...ends)); };
// Remove Relationships option (Oct 8 2026): main's STEP2_OPENING_QUESTIONS minus ONLY the Relationships line (and the comma it added).
const withoutRelationshipsOpener = (block) => { const t = block.replace(/,\n    relationships: "[^"\n]*"\n/, "\n"); assert.notEqual(t, block, "main's Relationships opener not found"); return t; };
await test("page data + identity scoring unchanged: ARCHETYPES (fixed map), DIVINE_REVEAL, DISCONNECTION_SUB_ACTIVATIONS, IDENTITY_QUESTIONS, nextQ (Q1 tie-break), buildGapContext, STEP2_OPENING_QUESTIONS, ACTIVATION_DETAILS, card text cleaners (setupDay2 greeting + Step 1 Complete copy are checked in test-gap-step2-chat.mjs)", () => {
  const now = read("public/app.html"), old = gitShow("public/app.html");
  for (const b of ["var ARCHETYPES", "var DIVINE_REVEAL", "var DISCONNECTION_SUB_ACTIVATIONS", "var IDENTITY_QUESTIONS", "function nextQ(", "function buildGapContext(", "var STEP2_OPENING_QUESTIONS", "var IDENTITY_SLUG_TO_KEY", "var ACTIVATION_DETAILS", "function rhCleanAiText(", "function rhCleanGapCardData(", "function addBotBubble(", "async function gapReadStream(", "function getGapIdentitySlugForKey(", "function getGapActivationSlugForKey(", "function renderQ("])
    assert.equal(sha(pageBlock(now, b)), sha(b === "var STEP2_OPENING_QUESTIONS" ? withoutRelationshipsOpener(pageBlock(old, b)) : pageBlock(old, b)), `${b} changed`);
  assert.match(pageBlock(now, "function nextQ("), /if \(scores\[identityAnswers\[0\]\] === scores\[winnerKey\]\) \{ winnerKey = identityAnswers\[0\]; \} \/\/ tie-break to Q1/);
});
await test("35 contexts (7 identities x 5 focus areas): the system prompt the route sends is byte-identical to main's, for chat turns AND the reading, switch on and off", async () => {
  const ids = [["The Guardian", "Over-Responsibility"], ["The Wayshower", "Doubt"], ["The Leader", "Fear of Being Seen"], ["The Messenger", "Channel Interference"], ["The Creator", "Control"], ["The Healer", "Disconnection"], ["The Expander", "Restriction"]];
  for (const [n, f] of ids) for (const a of ["Business + Visibility", "Money", "Spiritual Gifts", "Energy + Frequency", "Relationships"]) {
    const ctx = { ...CTX, divineIdentity: n, currentFrequency: f, focusArea: a, distortionLabel: f };
    const o = await run(oldRoute, { body: { ...CHAT, gapContext: ctx }, env: {} });
    for (const [body, env] of [[{ ...CHAT, gapContext: ctx }, ON], [{ ...READ, gapContext: ctx }, ON], [{ ...READ, gapContext: ctx }, {}]]) {
      const r = await run(newRoute, { body, env, api: () => ({ text: READING_REPLY("Removing the Frequency of Doubt") }) });
      assert.equal(r.apiBodies[0].system, o.apiBodies[0].system, `${n}/${a}`);
    }
  }
});

// ---------------------------------------------------------------------------
console.log("\n# B. Switch off (default): identical to main");
const OFFS = [{}, { GAP_FAST_READING: "off" }, { GAP_FAST_READING: "allowlist", CHAT_STREAMING_ALLOWLIST: "other@example.com" }, { GAP_FAST_READING: "yes" }];
await test("chat turns and the reading request, every 'off' setting: same Claude request, same status, same JSON bytes as main", async () => {
  for (const env of OFFS) for (const body of [CHAT, READ, { ...READ, stream: true }]) for (const text of [READING_REPLY("Expansion Activation"), "What happens next?"]) {
    const a = await run(oldRoute, { body, env, api: () => ({ text }) }), b = await run(newRoute, { body, env, api: () => ({ text }) });
    assert.equal(b.status, a.status); assert.equal(b.ctype, a.ctype); assert.equal(b.text, a.text);
    assert.equal(b.apiBodies.length, 1); assert.deepEqual(b.apiBodies[0], a.apiBodies[0]);
    assert.equal(b.fastHeader, null, "switch off must not send the new-flow header"); assert.equal(b.headerNames, a.headerNames, "switch off: same response headers as main");
  }
});
await test("switch on/off signal to the page: chat replies (JSON and streamed) carry x-gap-fast-reading: 1 ONLY when the switch is on for this member", async () => {
  for (const stream of [false, true]) {
    const on = await run(newRoute, { body: stream ? { ...CHAT, stream: true } : CHAT, env: { GAP_STREAMING: "on", ...ON } });
    assert.equal(on.fastHeader, "1");
    for (const env of [...OFFS, { GAP_STREAMING: "on" }, { GAP_FAST_READING: "allowlist", GAP_FAST_READING_ALLOWLIST: "someone-else@example.com", GAP_STREAMING: "on" }]) {
      const off = await run(newRoute, { body: stream ? { ...CHAT, stream: true } : CHAT, env });
      assert.equal(off.fastHeader, null, "header leaked with switch off: " + JSON.stringify(env));
    }
  }
});
await test("GAP streaming still works with the restructure off and on (allowlisted chat turn streams; done.reply == JSON reply)", async () => {
  for (const env of [{ GAP_STREAMING: "on" }, { GAP_STREAMING: "on", ...ON }]) {
    const r = await run(newRoute, { body: { ...CHAT, stream: true }, env, api: () => ({ text: "Tell me more.\n\n" + save("X") }) });
    assert.match(r.ctype, /event-stream/);
    const evs = r.text.split("\n\n").filter((b) => b.startsWith("data:")).map((b) => JSON.parse(b.slice(5)));
    const shown = evs.filter((e) => e.type === "delta").map((e) => e.text).join("");
    assert.ok(!shown.includes("[["), "marker reached the screen"); assert.equal(evs[evs.length - 1].type, "done");
    assert.ok(evs[evs.length - 1].reply.includes("[[SAVE_SHIFT:"));
    assert.equal(r.apiBodies[0].stream, true); assert.equal(r.apiBodies[0].max_tokens, 10000);
    if (env.GAP_FAST_READING) assert.deepEqual(r.apiBodies[0].output_config, { effort: "low" }); else assert.equal(r.apiBodies[0].output_config, undefined);
  }
});
await test("400 / 403 unchanged with the restructure on (Claude never called)", async () => {
  for (const body of [{ ...READ, email: "" }, { ...READ, message: "" }]) {
    const a = await run(oldRoute, { body, env: ON }), b = await run(newRoute, { body, env: ON });
    assert.equal(b.status, 400); assert.equal(b.text, a.text); assert.equal(b.apiBodies.length, 0);
  }
  const b = await run(newRoute, { body: READ, env: ON, fx: fresh({ entitled: false }) });
  assert.equal(b.status, 403); assert.equal(b.apiBodies.length, 0);
});

// ---------------------------------------------------------------------------
console.log("\n# C. Switch on");
await test("chat turn: main's request + output_config.effort 'low' and NOTHING else (same model, max_tokens 10000, system, messages)", async () => {
  const a = await run(oldRoute, { body: CHAT, env: {} }), b = await run(newRoute, { body: CHAT, env: ON });
  const req = { ...b.apiBodies[0] }; assert.deepEqual(req.output_config, { effort: "low" }); delete req.output_config;
  assert.deepEqual(req, a.apiBodies[0]); assert.equal(req.max_tokens, 10000); assert.equal(JSON.parse(b.text).reading, undefined);
});
await test("allowlist: GAP_FAST_READING_ALLOWLIST if set, else CHAT_STREAMING_ALLOWLIST; others get main's request", async () => {
  let r = await run(newRoute, { body: { ...CHAT, email: " Member@Example.com " }, env: { GAP_FAST_READING: "allowlist", CHAT_STREAMING_ALLOWLIST: "member@example.com" } });
  assert.deepEqual(r.apiBodies[0].output_config, { effort: "low" });
  r = await run(newRoute, { body: CHAT, env: { GAP_FAST_READING: "allowlist", GAP_FAST_READING_ALLOWLIST: "x@example.com", CHAT_STREAMING_ALLOWLIST: "member@example.com" } });
  assert.equal(r.apiBodies[0].output_config, undefined);
});
await test("the ONE reading: today's hidden completion text unchanged + appended block; default (high) effort; never streamed even if asked; exactly 1 Claude call", async () => {
  const a = await run(oldRoute, { body: { ...READ, stream: true }, env: {} });
  const b = await run(newRoute, { body: { ...READ, stream: true }, env: { ...ON, GAP_STREAMING: "on" }, api: () => ({ text: READING_REPLY("Removing the Frequency of Doubt") }) });
  assert.match(b.ctype, /application\/json/); assert.equal(b.apiBodies.length, 1);
  const req = b.apiBodies[0], old = a.apiBodies[0];
  assert.equal(req.stream, undefined); assert.equal(req.output_config, undefined); assert.equal(req.thinking, undefined);
  assert.equal(req.model, old.model); assert.equal(req.max_tokens, 10000); assert.equal(req.system, old.system);
  assert.deepEqual(req.messages.slice(0, -1), old.messages.slice(0, -1));
  const last = req.messages[req.messages.length - 1].content;
  assert.ok(last.startsWith(KICKOFF + "\n\n"), "hidden completion text must come first, unchanged");
  const block = last.slice(KICKOFF.length + 2);
  for (const x of STEP1) assert.ok(block.includes(x.answer), "Step 1 answer missing: " + x.answer);
  assert.ok(block.includes(LIBRARY.join(" | ")), "library titles");
  assert.match(block, /\[\[TODAYS_FOCUS:/); assert.match(block, /\[\[ACTIVATION_WHY:/); assert.match(block, /The Wayshower/);
  assert.ok(!block.includes("=== "), "the block must not restate GAP's instruction sections");
});
await test("reading reply: `reply` is the exact Claude text (markers included, so the page parses the same SAVE_SHIFT) + `reading`", async () => {
  const text = READING_REPLY("Removing the Frequency of Doubt");
  const b = await run(newRoute, { body: READ, env: ON, api: () => ({ text }) });
  const j = JSON.parse(b.text);
  assert.equal(j.reply, text);
  assert.deepEqual(j.reading.activation, { title: "Removing the Frequency of Doubt", source: "ai", aiPick: "Removing the Frequency of Doubt", oldFixed: "Removing the Frequency of Doubt", healerRetry: false });
  assert.equal(j.reading.activationWhy, "Because you hand your knowing to others, this clears doubt.");
  assert.equal(j.reading.todaysFocus.split(/(?<=[.!?]["\u201d]?)\s+/).length, 3);
});
await test("page-provided fields are sanitized: hidden-marker brackets removed, lengths capped, max 3 Step 1 answers", () => {
  const s = G.sanitizeStep1([{ question: "Q [[x]]", answer: "A".repeat(500) }, { question: "", answer: "y" }, 1, 2, 3]);
  assert.equal(s.length, 1); assert.ok(!s[0].question.includes("[[")); assert.equal(s[0].answer.length, 200);
  assert.deepEqual(G.sanitizeLibrary(["A", "A", " B ", "[[C]]", 5]), ["A", "B", "C", "5"]);
});

// ---------------------------------------------------------------------------
console.log("\n# D. Activation selection (personalized, validated, fallback)");
await test("AI pick validated against the EXACT library titles: exact, case/space variants -> canonical title; unknown / ambiguous -> null", () => {
  assert.equal(G.matchLibraryTitle("Visibility Activation", LIBRARY), "Visibility Activation");
  assert.equal(G.matchLibraryTitle("  visibility   activation. ", LIBRARY), "Visibility Activation");
  assert.equal(G.matchLibraryTitle("\u201cConfidence Activation\u201d", LIBRARY), "Confidence Activation");
  assert.equal(G.matchLibraryTitle("Nervous System Recalibration", LIBRARY), "Nervous System Recalibration");
  assert.equal(G.matchLibraryTitle("Receiving Activation", LIBRARY), null);
  assert.equal(G.matchLibraryTitle("", LIBRARY), null);
  assert.equal(G.matchLibraryTitle("a b", ["A B", "a  b."]), null, "ambiguous after normalising -> not trusted");
});
await test("a personalized pick different from the identity's old fixed one is used (Wayshower -> Confidence Activation) and logged next to the old value", async () => {
  const b = await run(newRoute, { body: READ, env: ON, api: () => ({ text: READING_REPLY("Confidence Activation") }) });
  const j = JSON.parse(b.text);
  assert.equal(j.reading.activation.title, "Confidence Activation"); assert.equal(j.reading.activation.source, "ai");
  const line = b.logLines.find((l) => l.startsWith("[gap-reading] {"));
  const L = JSON.parse(line.slice(14));
  assert.equal(L.ai_pick, "Confidence Activation"); assert.equal(L.old_fixed, "Removing the Frequency of Doubt"); assert.equal(L.same_as_old, false);
  assert.ok(!/rewriting|sales page|program/i.test(line), "log line must not contain the member's words");
});
await test("missing or invalid pick (non-Healer): no extra call, source 'fallback' (page uses the existing identity map)", async () => {
  for (const act of [undefined, "Receiving Activation"]) {
    const b = await run(newRoute, { body: READ, env: ON, api: () => ({ text: READING_REPLY(act) }) });
    assert.equal(b.apiBodies.length, 1); const j = JSON.parse(b.text);
    assert.equal(j.reading.activation.title, null); assert.equal(j.reading.activation.source, "fallback");
  }
});
await test("Healer with a missing pick: ONE retry for the marker (low effort, 2000 tokens, same system prompt) -> valid pick used ('ai-retry')", async () => {
  const body = { ...READ, gapContext: HCTX, fixedActivation: "Remembrance Activation" };
  const b = await run(newRoute, { body, env: ON, api: (n) => (n === 1 ? { text: READING_REPLY(undefined) } : { text: "[[ACTIVATION_PICK: Activating Your Channel To Spirit Activation]]" }) });
  assert.equal(b.apiBodies.length, 2);
  const r2 = b.apiBodies[1];
  assert.equal(r2.system, b.apiBodies[0].system); assert.equal(r2.max_tokens, 2000); assert.deepEqual(r2.output_config, { effort: "low" });
  assert.equal(r2.messages[r2.messages.length - 2].role, "assistant"); assert.match(r2.messages[r2.messages.length - 1].content, /ACTIVATION_PICK/);
  const j = JSON.parse(b.text); assert.equal(j.reading.activation.title, "Activating Your Channel To Spirit Activation"); assert.equal(j.reading.activation.source, "ai-retry");
  assert.equal(j.reply, READING_REPLY(undefined), "reply text untouched");
});
await test("Healer still missing after the retry (or retry fails): fallback, logged with healer_fallback_needs_rachael", async () => {
  const body = { ...READ, gapContext: HCTX, fixedActivation: "Remembrance Activation" };
  for (const second of [{ text: "no marker" }, { status: 400 }]) {
    const b = await run(newRoute, { body, env: ON, api: (n) => (n === 1 ? { text: READING_REPLY("Not A Real One") } : second) });
    assert.equal(b.status, 200); assert.equal(b.apiBodies.length, 2);
    const j = JSON.parse(b.text); assert.equal(j.reading.activation.source, "fallback"); assert.equal(j.reading.activation.healerRetry, true);
    const L = JSON.parse(b.logLines.find((l) => l.startsWith("[gap-reading] {")).slice(14));
    assert.equal(L.healer_fallback_needs_rachael, true);
  }
});
await test("Healer with a VALID pick is not hard-coded to Remembrance (no retry, AI pick used)", async () => {
  const b = await run(newRoute, { body: { ...READ, gapContext: HCTX, fixedActivation: "Remembrance Activation" }, env: ON, api: () => ({ text: READING_REPLY("Spirit Connection Activation") }) });
  // Spirit Connection is in lib/activations.js but NOT in the page library -> invalid -> retry
  assert.equal(b.apiBodies.length, 2);
  const c = await run(newRoute, { body: { ...READ, gapContext: HCTX, fixedActivation: "Remembrance Activation" }, env: ON, api: () => ({ text: READING_REPLY("Soul Retrieval Activation".replace("Soul Retrieval", "Pink Cloud")) }) });
  assert.equal(c.apiBodies.length, 1); assert.equal(JSON.parse(c.text).reading.activation.title, "Pink Cloud Activation");
});

// ---------------------------------------------------------------------------
console.log("\n# E. Today's Focus text");
await test("2-4 sentences: 3 kept as is; 6 trimmed to the first 4; markdown/bullets/newlines removed; identity named check", () => {
  let f = G.normalizeTodaysFocus("As The Wayshower, you know. You said \"rewrite it\". Trust it.", "The Wayshower");
  assert.equal(f.sentences, 3); assert.equal(f.inRange, true); assert.equal(f.namesIdentity, true); assert.equal(f.trimmed, false);
  f = G.normalizeTodaysFocus(FOCUS6, "The Wayshower");
  assert.equal(f.sentences, 4); assert.equal(f.trimmed, true); assert.ok(f.text.endsWith("trusting your knowing first."));
  f = G.normalizeTodaysFocus("**Bold** line\n- you are a Healer here. Second one!", "The Healer");
  assert.equal(f.text, "Bold line you are a Healer here. Second one!"); assert.equal(f.namesIdentity, true);
  f = G.normalizeTodaysFocus("Just one sentence without the name.", "The Leader");
  assert.equal(f.inRange, false); assert.equal(f.namesIdentity, false);
  f = G.normalizeTodaysFocus(("Long sentence " + "word ".repeat(60) + ". ").repeat(4), "The Leader");
  assert.ok(f.text.length <= 700 || f.sentences === 2);
  assert.equal(G.normalizeTodaysFocus("", "x").text, "");
});
await test("route: no TODAYS_FOCUS marker -> todaysFocus null (page keeps today's Today's Focus behaviour)", async () => {
  const b = await run(newRoute, { body: READ, env: ON, api: () => ({ text: `Okay.\n\n${save("Visibility Activation")}\n[[DISTORTIONS: Doubt, Comparison]]\n[[TOPIC: general]]` }) });
  const j = JSON.parse(b.text); assert.equal(j.reading.todaysFocus, null); assert.equal(j.reading.activationWhy, null);
});

// ---------------------------------------------------------------------------
console.log("\n# F. Shift saving + Today's Focus storage");
globalThis.__at = { creates: [], updates: [] };
const oldAirtableFile = path.join(tmp, "lib-airtable-old.js");
fs.writeFileSync(oldAirtableFile, gitShow("lib/airtable.js").replace(/from "\.\/([a-zA-Z]+)"/g, (m, f) => `from "${libUrl}${f}.js"`));
const newAT = await import(pathToFileURL(path.join(appRoot, "lib", "airtable.js")).href);
const oldAT = await import(pathToFileURL(oldAirtableFile).href);
const SHIFT_ARGS = { email: " Member@Example.com ", memberRecordId: "recMember1", chatId: null, methodName: "GAP Method", divineIdentitySlug: "wayshower", divineIdentityName: "The Wayshower", currentFrequency: "Doubt", focusArea: "GAP Method", gapExplanation: "g", whatWeNoticed: "w\n\nPrimary Shift: p", recommendedActivation: "Removing the Frequency of Doubt" };
const strip = (f) => { const x = { ...f }; delete x.created_at; delete x.updated_at; return x; };
await test("createShiftFromChat without Today's Focus text: EXACTLY main's Airtable fields (one create, same keys and values)", async () => {
  globalThis.__at = { creates: [], updates: [] }; await oldAT.createShiftFromChat(SHIFT_ARGS); const o = globalThis.__at.creates;
  globalThis.__at = { creates: [], updates: [] }; await newAT.createShiftFromChat(SHIFT_ARGS); const n = globalThis.__at.creates;
  assert.equal(n.length, 1); assert.deepEqual(Object.keys(n[0].fields), Object.keys(o[0].fields)); assert.deepEqual(strip(n[0].fields), strip(o[0].fields));
  globalThis.__at = { creates: [], updates: [] }; await newAT.createShiftFromChat({ ...SHIFT_ARGS, todaysFocus: "" }); assert.ok(!("todays_focus" in globalThis.__at.creates[0].fields));
});
await test("with Today's Focus text: same fields + todays_focus (only addition); live base without the field -> saved without it, never fails, still ONE Shift", async () => {
  globalThis.__at = { creates: [], updates: [] }; await newAT.createShiftFromChat({ ...SHIFT_ARGS, todaysFocus: "As The Wayshower, you know." });
  const c = globalThis.__at.creates; assert.equal(c.length, 1); assert.equal(c[0].fields.todays_focus, "As The Wayshower, you know.");
  const x = strip(c[0].fields); delete x.todays_focus;
  globalThis.__at = { creates: [], updates: [] }; await oldAT.createShiftFromChat(SHIFT_ARGS); assert.deepEqual(x, strip(globalThis.__at.creates[0].fields));
  globalThis.__at = { creates: [], updates: [], failWith: (f) => ("todays_focus" in f ? { error: "UNKNOWN_FIELD_NAME", message: 'Unknown field name: "todays_focus"' } : null) };
  const rec = await quiet(() => newAT.createShiftFromChat({ ...SHIFT_ARGS, todaysFocus: "x" }));
  assert.ok(rec.id); const ok = globalThis.__at.creates.filter((k) => !("todays_focus" in k.fields)); assert.equal(ok.length, 1, "exactly one successful save");
  globalThis.__at = { creates: [], updates: [], failWith: () => ({ error: "INVALID_PERMISSIONS", message: "nope" }) };
  await assert.rejects(() => newAT.createShiftFromChat({ ...SHIFT_ARGS, todaysFocus: "x" }), /nope/);
});
await test("/api/gap-shift: body without todaysFocus -> createShiftFromChat gets EXACTLY main's arguments; with it -> + todaysFocus only", async () => {
  const fake = path.join(tmp, "fake-airtable-lib.mjs");
  fs.writeFileSync(fake, `export async function createShiftFromChat(a) { globalThis.__calls.push(a); return { id: "recS" }; }`);
  const withFake = (src) => src.replace(/from "@\/lib\/airtable"/, `from "${pathToFileURL(fake).href}"`);
  const newGS = await import(transpile(withFake(read("app/api/gap-shift/route.ts")), "gs-new.mjs"));
  const oldGS = await import(transpile(withFake(gitShow("app/api/gap-shift/route.ts")), "gs-old.mjs"));
  const body = { email: "member@example.com", divineIdentitySlug: "wayshower", divineIdentityName: "The Wayshower", currentFrequency: "Doubt", focusArea: "GAP Method", gapExplanation: "g", whatWeNoticed: "w", recommendedActivation: "Confidence Activation" };
  globalThis.__fx = fresh();
  for (const extra of [{}, { todaysFocus: "" }, { todaysFocus: "   " }]) {
    globalThis.__calls = []; const ro = await oldGS.POST(mkReq("/api/gap-shift", { ...body, ...extra })); const o = globalThis.__calls;
    globalThis.__calls = []; const rn = await newGS.POST(mkReq("/api/gap-shift", { ...body, ...extra })); const n = globalThis.__calls;
    assert.deepEqual(n, o); assert.equal(await rn.text(), await ro.text());
  }
  globalThis.__calls = []; await newGS.POST(mkReq("/api/gap-shift", { ...body, todaysFocus: " As The Wayshower, you know. " }));
  const n = globalThis.__calls[0]; assert.equal(n.todaysFocus, "As The Wayshower, you know."); delete n.todaysFocus;
  globalThis.__calls = []; await oldGS.POST(mkReq("/api/gap-shift", body)); assert.deepEqual(n, globalThis.__calls[0]);
});
await test("/api/shifts: todaysFocus added to each Shift ('' for older rows); every other field unchanged", async () => {
  const rows = [{ id: "recA", fields: { divine_identity_name: "The Wayshower", todays_focus: "As The Wayshower, you know.", what_we_noticed: "w" } }, { id: "recB", fields: { divine_identity_name: "The Leader", what_we_noticed: "old" } }];
  globalThis.__at = { creates: [], updates: [], rows };
  const newS = await import(transpile(read("app/api/shifts/route.ts"), "sh-new.mjs"));
  fs.writeFileSync(path.join(tmp, "sh-old.ts"), gitShow("app/api/shifts/route.ts"));
  const oldS = await import(transpile(gitShow("app/api/shifts/route.ts"), "sh-old.mjs"));
  const get = (m) => m.GET(Object.assign(new Request("http://localhost/api/shifts?email=member@example.com"), { nextUrl: new URL("http://localhost/api/shifts?email=member@example.com") })).then((r) => r.json());
  const n = await get(newS), o = await get(oldS);
  assert.equal(n.shifts[0].todaysFocus, "As The Wayshower, you know."); assert.equal(n.shifts[1].todaysFocus, "");
  n.shifts.forEach((s) => delete s.todaysFocus); assert.deepEqual(n, o);
});

await test("/api/shifts: x-gap-fast-reading header ONLY when the switch is on for that member (labels); body identical either way", async () => {
  const rows = [{ id: "recA", fields: { divine_identity_name: "The Wayshower", what_we_noticed: "w" } }];
  globalThis.__at = { creates: [], updates: [], rows };
  const newS = await import(transpile(read("app/api/shifts/route.ts"), "sh-new2.mjs"));
  const get = (email) => newS.GET(Object.assign(new Request("http://localhost/api/shifts?email=" + email), { nextUrl: new URL("http://localhost/api/shifts?email=" + email) }));
  const saved = { m: process.env.GAP_FAST_READING, a: process.env.GAP_FAST_READING_ALLOWLIST };
  try {
    delete process.env.GAP_FAST_READING; delete process.env.GAP_FAST_READING_ALLOWLIST;
    const off = await get("member@example.com"); assert.equal(off.headers.get("x-gap-fast-reading"), null); const offBody = await off.text();
    process.env.GAP_FAST_READING = "on";
    const on = await get("member@example.com"); assert.equal(on.headers.get("x-gap-fast-reading"), "1"); assert.equal(await on.text(), offBody);
    process.env.GAP_FAST_READING = "allowlist"; process.env.GAP_FAST_READING_ALLOWLIST = "tester@example.com";
    assert.equal((await get("member@example.com")).headers.get("x-gap-fast-reading"), null);
    assert.equal((await get("tester@example.com")).headers.get("x-gap-fast-reading"), "1");
  } finally {
    if (saved.m === undefined) delete process.env.GAP_FAST_READING; else process.env.GAP_FAST_READING = saved.m;
    if (saved.a === undefined) delete process.env.GAP_FAST_READING_ALLOWLIST; else process.env.GAP_FAST_READING_ALLOWLIST = saved.a;
  }
});

apiServer.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
