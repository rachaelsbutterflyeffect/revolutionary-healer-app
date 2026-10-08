// Dev-only checks for the Oct 8 2026 "long main-chat replies cut off" fix
// (lib/mainChatReply.js + app/api/chat/route.ts's main reply call).
// NOT part of the app: nothing imports this file, it never calls Anthropic or
// Airtable, and it needs no secrets. Claude is a local fake server.
//
//   npm run test:chat-max-tokens
//
//  A. Settings: the reply ceiling leaves real room for a long visible reply
//     on top of thinking, and is still writable inside the deadline; the
//     deadline fits under the page's 180s cap and Vercel's 300s limit.
//  B. The request the real Anthropic SDK sends for the main reply: same as
//     before except max_tokens (no thinking / effort / other new params).
//  C. Timing with the real SDK: a reply that takes longer than the OLD 45s
//     (scaled) now completes; a hung request stops at the deadline with no
//     further retries; quick "overloaded" errors are still retried.
//  D. Log-only stop check: warns on stop_reason "max_tokens", silent
//     otherwise, never throws.
//  E. Scope: the main reply call uses the shared settings; the GAP bots,
//     GAP marker retry and background memory/summary/title calls do not.
import { register } from "node:module";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const appLibUrl = new URL("../lib/", import.meta.url).href;
register(
  "data:text/javascript," +
    encodeURIComponent(`const APP_LIB = ${JSON.stringify(appLibUrl)};
export async function resolve(spec, ctx, next) {
  try { return await next(spec, ctx); }
  catch (e) { if (spec.startsWith(".") && !/\\.[cm]?js$/.test(spec)) return next(spec + ".js", ctx); throw e; }
}
export async function load(url, ctx, next) {
  if (url.startsWith(APP_LIB) && url.endsWith(".js")) return next(url, { ...ctx, format: "module" });
  return next(url, ctx);
}`),
  import.meta.url
);

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const read = (f) => fs.readFileSync(path.join(appRoot, f), "utf8");
const settings = await import(pathToFileURL(path.join(appRoot, "lib", "mainChatReply.js")).href);
const { MAIN_CHAT_MAX_TOKENS, MAIN_CHAT_REPLY_DEADLINE_MS, mainChatReplyRequestOptions, noteMainChatReplyStop, thinkingTokensFromUsage } = settings;
const Anthropic = (await import("@anthropic-ai/sdk")).default;

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`ok - ${name}`); }
  catch (e) { failed++; console.log(`not ok - ${name}\n   ${e && e.stack ? e.stack.split("\n").slice(0, 3).join("\n   ") : e}`); }
}

// ---------------------------------------------------------------------------
console.log("# A. Settings");
const OLD_MAX_TOKENS = 4096;
const SLOW_TOK_PER_S = 65; // conservative; production/TEST preview measured ~80-90 incl. start-up
const START_UP_S = 5;
await test(`max_tokens raised well above the old 4096 (now ${MAIN_CHAT_MAX_TOKENS}) and within the model's 128k output limit`, () => {
  assert.ok(MAIN_CHAT_MAX_TOKENS >= 2 * OLD_MAX_TOKENS - 200, "needs real extra room");
  assert.ok(MAIN_CHAT_MAX_TOKENS <= 128000);
  assert.ok(MAIN_CHAT_MAX_TOKENS < 21333, "stays under the SDK's 'use streaming' threshold for non-streamed calls");
});
await test("after a typical ~2,000-token think, >= ~8k tokens remain for the visible reply (old cap left ~2k); after a heavy ~7,300-token think, >= ~2.5k remain (old cap: none)", () => {
  assert.ok(MAIN_CHAT_MAX_TOKENS - 2000 >= 7900);
  assert.ok(MAIN_CHAT_MAX_TOKENS - 7300 >= 2500);
  assert.ok(OLD_MAX_TOKENS - 7300 < 0);
});
await test(`a full-length reply can finish inside the deadline even at a slow ${SLOW_TOK_PER_S} tokens/s`, () => {
  const worstWriteS = START_UP_S + MAIN_CHAT_MAX_TOKENS / SLOW_TOK_PER_S;
  console.log(`   ${MAIN_CHAT_MAX_TOKENS} tokens @ ${SLOW_TOK_PER_S}/s + ${START_UP_S}s = ${worstWriteS.toFixed(0)}s <= deadline ${MAIN_CHAT_REPLY_DEADLINE_MS / 1000}s`);
  assert.ok(worstWriteS * 1000 <= MAIN_CHAT_REPLY_DEADLINE_MS);
});
await test("server worst case (deadline + dormant 12s GAP marker retry + ~5s Airtable) < page's 180s cap < Vercel's 300s", () => {
  const html = read("public/app.html");
  const cap = Number((html.match(/RH_CHAT_CLIENT_TIMEOUT_MS = (\d+)/) || [])[1]) / 1000;
  const worst = MAIN_CHAT_REPLY_DEADLINE_MS / 1000 + 12 + 5;
  console.log(`   server worst ~${worst}s | page cap ${cap}s | Vercel 300s (old server worst ~153s)`);
  assert.ok(cap > worst, "page must wait longer than the server can take");
  assert.ok(cap < 300);
});
await test("request options: per-attempt timeout = deadline, plus an abort signal for the same deadline (fresh each call)", () => {
  const a = mainChatReplyRequestOptions(), b = mainChatReplyRequestOptions();
  assert.equal(a.timeout, MAIN_CHAT_REPLY_DEADLINE_MS);
  assert.ok(a.signal instanceof AbortSignal && !a.signal.aborted);
  assert.notEqual(a.signal, b.signal, "each call needs its own deadline");
});

// ---------------------------------------------------------------------------
// Fake Claude
// ---------------------------------------------------------------------------
let requests = [];
let behaviour = () => ({ delay: 0 });
let attempt = 0;
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    attempt++;
    requests.push({ headers: req.headers, body: JSON.parse(body || "{}") });
    const b = behaviour(attempt);
    if (b.hang) return; // never answer
    setTimeout(() => {
      if (res.destroyed) return;
      if (b.status) {
        res.writeHead(b.status, { "content-type": "application/json", "retry-after-ms": "10" });
        return res.end(JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } }));
      }
      const out = JSON.stringify({
        id: "msg_test", type: "message", role: "assistant", model: "fake",
        content: [{ type: "thinking", thinking: "", signature: "x" }, { type: "text", text: "A complete reply." }],
        stop_reason: "end_turn", stop_sequence: null,
        usage: { input_tokens: 40, output_tokens: 6100, output_tokens_details: { thinking_tokens: 1900 }, cache_read_input_tokens: 17962, cache_creation_input_tokens: 0 },
      });
      res.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(out) });
      res.end(out);
    }, b.delay || 0);
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const client = new Anthropic({ apiKey: "test-not-a-real-key", baseURL: `http://127.0.0.1:${server.address().port}` });

// ---------------------------------------------------------------------------
console.log("\n# B. Request on the wire");
await test("same model / system / messages / headers as before; only max_tokens differs; no thinking/effort params added", async () => {
  const base = {
    model: "claude-sonnet-5",
    system: [{ type: "text", text: "fixed", cache_control: { type: "ephemeral" } }, { type: "text", text: "member" }],
    messages: [{ role: "user", content: "earlier" }, { role: "assistant", content: "earlier reply" }, { role: "user", content: "new" }],
  };
  requests = []; attempt = 0; behaviour = () => ({});
  await client.messages.create({ ...base, max_tokens: OLD_MAX_TOKENS }, { timeout: 45000 }); // the old call
  await client.messages.create({ ...base, max_tokens: MAIN_CHAT_MAX_TOKENS }, mainChatReplyRequestOptions()); // the new call
  const [before, after] = requests;
  assert.deepEqual(Object.keys(after.body).sort(), Object.keys(before.body).sort(), "no new request fields");
  for (const k of Object.keys(before.body)) if (k !== "max_tokens") assert.deepEqual(after.body[k], before.body[k], `${k} differs`);
  assert.equal(before.body.max_tokens, 4096);
  assert.equal(after.body.max_tokens, MAIN_CHAT_MAX_TOKENS);
  for (const k of ["thinking", "output_config", "temperature", "stream"]) assert.ok(!(k in after.body), `${k} must not be sent`);
  for (const h of ["anthropic-version", "anthropic-beta", "content-type"]) assert.equal(after.headers[h], before.headers[h], `header ${h} differs`);
});

// ---------------------------------------------------------------------------
console.log("\n# C. Timing with the real SDK (1 simulated second = 5ms)");
const SCALE = 5;
const scaledOpts = () => ({ timeout: (MAIN_CHAT_REPLY_DEADLINE_MS / 1000) * SCALE, signal: AbortSignal.timeout((MAIN_CHAT_REPLY_DEADLINE_MS / 1000) * SCALE) });
await test("a long reply that takes ~100s now completes in one attempt (the old 45s timeout gave up and retried it 3x -> 504)", async () => {
  requests = []; attempt = 0; behaviour = () => ({ delay: 100 * SCALE });
  const r = await client.messages.create({ model: "m", max_tokens: MAIN_CHAT_MAX_TOKENS, messages: [{ role: "user", content: "x" }] }, scaledOpts());
  assert.equal(r.stop_reason, "end_turn");
  assert.equal(attempt, 1);
  // old behaviour, same fake: 45s per attempt, SDK retries -> 3 attempts, then error
  requests = []; attempt = 0;
  const oldErr = await client.messages.create({ model: "m", max_tokens: OLD_MAX_TOKENS, messages: [{ role: "user", content: "x" }] }, { timeout: 45 * SCALE }).then(() => null, (e) => e);
  assert.ok(oldErr, "old settings should fail on a 100s reply");
  assert.equal(attempt, 3, "old settings: 3 timed-out attempts");
});
await test("a hung request stops at the overall deadline, with no retry after it", async () => {
  requests = []; attempt = 0; behaviour = () => ({ hang: true });
  const t0 = Date.now();
  const err = await client.messages.create({ model: "m", max_tokens: MAIN_CHAT_MAX_TOKENS, messages: [{ role: "user", content: "x" }] }, scaledOpts()).then(() => null, (e) => e);
  const simS = (Date.now() - t0) / SCALE;
  console.log(`   gave up after ~${simS.toFixed(0)} simulated s, ${attempt} attempt(s)`);
  assert.ok(err, "should error");
  assert.ok(simS <= MAIN_CHAT_REPLY_DEADLINE_MS / 1000 + 5, "must not run past the deadline");
  await new Promise((r) => setTimeout(r, 1500)); // would a retry still fire?
  assert.equal(attempt, 1, "no retry after the deadline");
});
await test("quick 'overloaded' errors are still retried automatically, then the reply comes through", async () => {
  requests = []; attempt = 0; behaviour = (n) => (n < 3 ? { status: 529 } : { delay: 10 });
  const r = await client.messages.create({ model: "m", max_tokens: MAIN_CHAT_MAX_TOKENS, messages: [{ role: "user", content: "x" }] }, scaledOpts());
  assert.equal(r.stop_reason, "end_turn");
  assert.equal(attempt, 3);
});
server.close();

// ---------------------------------------------------------------------------
console.log("\n# D. Log-only stop check");
await test("warns once on stop_reason max_tokens (with token counts); silent on end_turn; never throws on junk", () => {
  const warns = [];
  const orig = console.warn;
  console.warn = (...a) => warns.push(a.join(" "));
  try {
    assert.equal(noteMainChatReplyStop({ stop_reason: "end_turn", usage: { output_tokens: 10 } }), false);
    assert.equal(warns.length, 0);
    assert.equal(noteMainChatReplyStop({ stop_reason: "max_tokens", usage: { output_tokens: MAIN_CHAT_MAX_TOKENS, output_tokens_details: { thinking_tokens: 3000 } } }), true);
    assert.equal(warns.length, 1);
    assert.match(warns[0], /hit max_tokens/);
    assert.match(warns[0], /"thinking_tokens":3000/);
    assert.equal(noteMainChatReplyStop(null), false);
    assert.equal(noteMainChatReplyStop({ stop_reason: "max_tokens", get usage() { throw new Error("boom"); } }), false);
  } finally { console.warn = orig; }
  assert.equal(thinkingTokensFromUsage({ output_tokens_details: { thinking_tokens: 12 } }), 12);
  assert.equal(thinkingTokensFromUsage({}), null);
  assert.equal(thinkingTokensFromUsage(undefined), null);
});

// ---------------------------------------------------------------------------
console.log("\n# E. Scope");
const route = read("app/api/chat/route.ts");
await test("main reply call uses MAIN_CHAT_MAX_TOKENS + mainChatReplyRequestOptions(); no 4096 left in the main chat route", () => {
  assert.match(route, /max_tokens:\s*MAIN_CHAT_MAX_TOKENS/);
  assert.match(route, /mainChatReplyRequestOptions\(\)/);
  assert.ok(!/max_tokens:\s*4096/.test(route));
  assert.match(route, /noteMainChatReplyStop\(response\)/);
});
await test("GAP Step 3 marker retry keeps max_tokens 200 and its own 12s timeout", () => {
  assert.match(route, /max_tokens:\s*200/);
  assert.match(route, /timeout:\s*DISTORTION_RETRY_TIMEOUT_MS/);
});
await test("GAP bots and background memory/summary/title calls keep their own settings (don't import the main-chat file)", () => {
  // The member GAP bot got its own, separate fix (lib/gapChatReply.js, see npm run test:gap-max-tokens).
  assert.match(read("app/api/gap-chat-member/route.ts"), /max_tokens:\s*GAP_CHAT_MAX_TOKENS/);
  assert.match(read("app/api/gap-chat/route.ts"), /max_tokens:\s*1024/);
  const mem = read("lib/memory.js");
  for (const n of [512, 300, 40]) assert.match(mem, new RegExp(`max_tokens:\\s*${n}\\b`));
  for (const f of ["app/api/gap-chat-member/route.ts", "app/api/gap-chat/route.ts", "lib/memory.js", "lib/prompts.js", "lib/processes.js"]) {
    assert.ok(!/mainChatReply/.test(read(f)), `${f} must not use the main-chat settings`);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
