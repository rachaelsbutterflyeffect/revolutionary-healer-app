// Dev-only checks for the Oct 8 2026 GAP-bot long-reply fix
// (lib/gapChatReply.js + app/api/gap-chat-member/route.ts).
// NOT part of the app: nothing imports this file. It never calls Anthropic or
// Airtable and needs no secrets -- the REAL route (transpiled on the fly) runs
// against a local fake Anthropic server (real @anthropic-ai/sdk on the wire)
// and a fake entitlement check.
//
//   npm run test:gap-max-tokens
//
//  A. Setting: 10,000 ceiling, room for thinking + reply + Shift markers.
//  B. The request on the wire is the same as before (git 7d13fab) except
//     max_tokens; the JSON the page gets is byte-for-byte the same,
//     markers included (the page needs them to save the Shift).
//  C. A reply that needs more than 4096 tokens: the old route hands the page
//     a reply cut off before its Shift markers; the new one the full reply.
//  D. Log-only usage line: counts + marker presence only (never reply text),
//     warns on a cut-off, never throws, never changes the reply.
//  E. Scope: the funnel GAP bot, the main chat and the background calls are
//     untouched; 400 / 403 answers unchanged.
import { register } from "node:module";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rh-gap-maxtok-"));
const tmpUrl = pathToFileURL(tmp + "/").href;
const appRootUrl = pathToFileURL(appRoot + "/").href;
const libUrl = pathToFileURL(path.join(appRoot, "lib") + "/").href;
const FAKES = { "@/lib/entitlements": "fake-entitlements.mjs" };
fs.writeFileSync(path.join(tmp, "fake-entitlements.mjs"), `
export async function getEntitlementForEmail(email) { return globalThis.__entitled === false ? { record: null, entitlement: { canUseBase: false } } : { record: { id: "recMember1" }, entitlement: { canUseBase: true } }; }
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
  catch (e) { failed++; console.log(`not ok - ${name}\n   ${e && e.stack ? e.stack.split("\n").slice(0, 4).join("\n   ") : e}`); }
}
const read = (f) => fs.readFileSync(path.join(appRoot, f), "utf8");
const { GAP_CHAT_MAX_TOKENS, logGapChatUsage } = await import(pathToFileURL(path.join(appRoot, "lib", "gapChatReply.js")).href);

// Fake Anthropic: writes `need` tokens worth of output (thinking first, then
// the reply text, markers last) and stops at max_tokens like the real API.
let behaviour = () => ({ thinking: 0, text: "ok" });
const requests = [];
const api = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const body = JSON.parse(raw || "{}");
    requests.push(body);
    const b = behaviour(body);
    const words = b.text.match(/\S+\s*/g) || [];
    const room = Math.max(0, body.max_tokens - b.thinking); // 1 word = 1 token here
    const cut = words.length > room;
    const text = cut ? words.slice(0, room).join("") : b.text;
    const out = JSON.stringify({ id: "msg_t", type: "message", role: "assistant", model: "fake", content: b.thinking ? [{ type: "thinking", thinking: "(hidden)", signature: "s" }, { type: "text", text }] : [{ type: "text", text }],
      stop_reason: cut ? "max_tokens" : "end_turn", stop_sequence: null,
      usage: { input_tokens: 13000, output_tokens: Math.min(body.max_tokens, b.thinking + words.length), output_tokens_details: { thinking_tokens: b.thinking } } });
    res.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(out), connection: "close" });
    res.end(out);
  });
});
await new Promise((r) => api.listen(0, "127.0.0.1", r));
process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${api.address().port}`;
process.env.ANTHROPIC_API_KEY = "test-not-a-real-key";

function transpile(src, name) {
  const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
  const f = path.join(tmp, name); fs.writeFileSync(f, out); return pathToFileURL(f).href;
}
const ROUTE = "app/api/gap-chat-member/route.ts";
const newRoute = await import(transpile(read(ROUTE), "gap-new.mjs"));
const oldSrc = execFileSync("git", ["show", `7d13fab:revolutionary-healer-app/${ROUTE}`], { cwd: appRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
const oldRoute = await import(transpile(oldSrc, "gap-old.mjs"));

const quiet = async (fn) => { const { log, warn, error } = console; const lines = []; console.log = (...a) => lines.push(["log", a.join(" ")]); console.warn = (...a) => lines.push(["warn", a.join(" ")]); console.error = (...a) => lines.push(["error", a.join(" ")]); try { return { out: await fn(), lines }; } finally { Object.assign(console, { log, warn, error }); } };
const GAP_CONTEXT = { divineIdentity: "The Wayshower", currentFrequency: "Doubt", focusArea: "Business" };
const BODY = { email: "member@example.com", message: "I keep discounting before they even ask.", history: [{ role: "assistant", content: "What is happening in your business right now?" }], gapContext: GAP_CONTEXT };
async function call(mod, body = BODY) {
  requests.length = 0;
  const { out, lines } = await quiet(async () => {
    const res = await mod.POST(new Request("http://localhost/api/gap-chat-member", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
    return { status: res.status, text: await res.text() };
  });
  return { ...out, lines, reqs: requests.slice() };
}
const SAVE = `[[SAVE_SHIFT: {"focusArea": "Business", "divineIdentityName": "The Wayshower", "divineIdentitySlug": "wayshower", "currentFrequency": "Doubt", "gap": "You want to be paid well but you discount first.", "howItShowsUp": "Rewriting the offer instead of following up.", "primaryShift": "From proving to receiving.", "recommendedActivation": "Receiving"}]]`;
const COMPLETION = `Okay, I see the gap. Let's move to Step 3 and I'll show you exactly what it is and how to shift it.\n\n${SAVE}\n[[DISTORTIONS: Doubt, External Confirmation]]\n[[TOPIC: money_business]]`;
const pageMarkers = (reply) => ({ saveShift: (reply.match(/\[\[SAVE_SHIFT:\s*([\s\S]*?)\]\]/i) || [])[1] || null, distortions: /\[\[DISTORTIONS:/.test(reply), topic: /\[\[TOPIC:/.test(reply) });

console.log("# A. Setting");
await test(`GAP ceiling is ${GAP_CHAT_MAX_TOKENS}: > 3x the largest measured GAP reply (3,213 of 4,096) and within the model's output limit`, () => {
  assert.equal(GAP_CHAT_MAX_TOKENS, 10000);
  assert.ok(GAP_CHAT_MAX_TOKENS >= 3 * 3213 && GAP_CHAT_MAX_TOKENS <= 64000);
});
await test("10,000 tokens can be written inside Vercel's 300s limit even at a slow 65 tokens/s (+ start-up)", () => {
  assert.ok(5 + GAP_CHAT_MAX_TOKENS / 65 < 290);
});

console.log("\n# B. Same request and same JSON as before (git 7d13fab), apart from max_tokens");
await test("request on the wire: identical to the old route except max_tokens 4096 -> 10000; no thinking/effort/new fields", async () => {
  behaviour = () => ({ thinking: 300, text: "Tell me more about that." });
  const a = await call(oldRoute), b = await call(newRoute);
  assert.equal(a.reqs.length, 1); assert.equal(b.reqs.length, 1);
  assert.deepEqual(Object.keys(b.reqs[0]).sort(), Object.keys(a.reqs[0]).sort());
  for (const k of Object.keys(a.reqs[0])) if (k !== "max_tokens") assert.deepEqual(b.reqs[0][k], a.reqs[0][k], k);
  assert.equal(a.reqs[0].max_tokens, 4096); assert.equal(b.reqs[0].max_tokens, 10000);
  assert.ok(!("thinking" in b.reqs[0]) && !("effort" in b.reqs[0]) && !("output_config" in b.reqs[0]));
});
await test("normal turn and Step 2 completion (with SAVE_SHIFT / DISTORTIONS / TOPIC): byte-for-byte the same JSON as before", async () => {
  for (const text of ["When they go quiet, what do you tell yourself?", COMPLETION, "  Leading space and a trailing newline\n"]) {
    behaviour = () => ({ thinking: 700, text });
    const a = await call(oldRoute), b = await call(newRoute);
    assert.equal(b.status, a.status); assert.equal(b.text, a.text);
    assert.equal(JSON.parse(b.text).reply, text);
  }
});

console.log("\n# C. Replies that need more than 4096 tokens");
const longReflection = Array.from({ length: 2600 }, (_, i) => `w${i}`).join(" ") + ".";
await test("heavy thinking (4,050) + Step 2 completion: OLD route loses the SAVE_SHIFT marker (Shift would save as 'wasn't captured'); NEW keeps every marker", async () => {
  const text = COMPLETION;
  behaviour = () => ({ thinking: 4050, text });
  const a = await call(oldRoute), b = await call(newRoute);
  assert.equal(pageMarkers(JSON.parse(a.text).reply).saveShift, null, "old route should have been cut before the marker");
  const m = pageMarkers(JSON.parse(b.text).reply);
  assert.ok(m.saveShift && m.distortions && m.topic);
  assert.equal(JSON.parse(m.saveShift).divineIdentitySlug, "wayshower");
});
await test("long reflection (1,800 thinking + 2,600-word reply): OLD cut mid-sentence; NEW complete, ends on its last word", async () => {
  behaviour = () => ({ thinking: 1800, text: longReflection });
  const a = await call(oldRoute), b = await call(newRoute);
  assert.ok(!JSON.parse(a.text).reply.endsWith("."));
  assert.equal(JSON.parse(b.text).reply, longReflection);
});

console.log("\n# D. Log-only usage line");
await test("route logs one usage line per reply: tokens, thinking, stop reason, marker presence -- never the reply text or marker contents", async () => {
  behaviour = () => ({ thinking: 700, text: COMPLETION });
  const b = await call(newRoute);
  const lines = b.lines.filter(([, l]) => l.includes("[gap-chat-member]"));
  assert.equal(lines.length, 1); assert.equal(lines[0][0], "log");
  const j = JSON.parse(lines[0][1].replace(/^.*?\{/, "{"));
  assert.equal(j.max_tokens, 10000); assert.equal(j.thinking_tokens, 700); assert.equal(j.stop_reason, "end_turn");
  assert.equal(j.save_shift, true); assert.equal(j.distortions, true); assert.equal(j.final_identity, false);
  assert.ok(!/wayshower|Step 3|discount/i.test(lines[0][1]), "no reply text / marker contents in logs");
});
await test("a reply that still hits the ceiling is logged as a warning (reply unchanged)", async () => {
  behaviour = () => ({ thinking: 9990, text: longReflection });
  const b = await call(newRoute);
  assert.ok(b.lines.some(([lvl, l]) => lvl === "warn" && /reply hit max_tokens/.test(l)));
  assert.equal(b.status, 200);
});
await test("logGapChatUsage never throws on junk and returns null instead", () => {
  const { log, warn } = console; console.log = () => {}; console.warn = () => {};
  try {
    assert.equal(logGapChatUsage({ get usage() { throw new Error("boom"); } }, 1, 10000), null);
    assert.ok(logGapChatUsage(undefined, 1, 10000));
    assert.ok(logGapChatUsage({ content: [null, { type: "text" }] }, 1, 10000));
  } finally { console.log = log; console.warn = warn; }
});

console.log("\n# E. Scope");
await test("400 (missing fields) and 403 (not entitled) answers unchanged", async () => {
  behaviour = () => ({ thinking: 0, text: "x" });
  for (const body of [{ ...BODY, email: "" }, { ...BODY, message: "" }]) {
    const a = await call(oldRoute, body), b = await call(newRoute, body);
    assert.equal(b.status, 400); assert.equal(b.text, a.text); assert.equal(b.reqs.length, 0);
  }
  globalThis.__entitled = false;
  try { const a = await call(oldRoute), b = await call(newRoute); assert.equal(b.status, 403); assert.equal(b.text, a.text); assert.equal(b.reqs.length, 0); }
  finally { globalThis.__entitled = undefined; }
});
await test("funnel GAP bot (/api/gap-chat, 1024), GAP Step 3 marker retry (200) and background calls keep their own settings", () => {
  assert.match(read("app/api/gap-chat/route.ts"), /max_tokens:\s*1024/);
  assert.ok(!/gapChatReply/.test(read("app/api/gap-chat/route.ts")));
  const chat = read("app/api/chat/route.ts");
  assert.match(chat, /max_tokens:\s*200/); assert.ok(!/gapChatReply|GAP_CHAT_MAX_TOKENS/.test(chat));
  const mem = read("lib/memory.js");
  for (const n of [512, 300, 40]) assert.match(mem, new RegExp(`max_tokens:\\s*${n}\\b`));
});
await test("GAP prompt and Shift-saving code untouched by this fix (processes.js, gap-shift route, airtable.js identical to 7d13fab)", () => {
  for (const f of ["lib/processes.js", "app/api/gap-shift/route.ts", "lib/airtable.js"]) {
    const old = execFileSync("git", ["show", `7d13fab:revolutionary-healer-app/${f}`], { cwd: appRoot, encoding: "utf8", maxBuffer: 64 << 20 });
    assert.equal(read(f), old, `${f} changed`);
  }
});

api.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
