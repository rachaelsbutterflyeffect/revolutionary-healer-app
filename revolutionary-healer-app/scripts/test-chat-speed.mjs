// Dev-only test harness for the Oct 8 2026 main-chatbot changes:
//   1. prompt caching for /api/chat (lib/promptCache.js)
//   2. the "false try again" fix in the page's waiting logic (public/app.html)
// NOT part of the app: nothing imports this file, it never calls Anthropic or
// Airtable, and it needs no secrets. Everything runs against local fakes.
//
//   npm run test:chat-speed
//   node scripts/test-chat-speed.mjs --app-html <path>   (run the page checks
//        against another copy of app.html, e.g. the pre-fix one, to see the
//        old behaviour fail)
//
//  A. The system prompt TEXT is byte-identical: joining the cached blocks
//     gives back exactly the string buildSystemPrompt() returns (which is
//     what used to be sent), across representative members/messages.
//  B. The request the real Anthropic SDK puts on the wire is identical before
//     vs after (model, max_tokens, messages, headers, system text) apart from
//     `system` now being 2 text blocks + one cache_control marker.
//  C. Page: the real main-chat send/retry code from public/app.html, run with
//     sped-up timers and a fake server: slow replies show normally (no false
//     error), real failures still show Try Again, and Try Again never re-sends
//     a message whose reply actually landed.
//  D. The page's last-resort cap is longer than the server's own worst case.
import { register } from "node:module";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// lib/*.js use extensionless imports (fine for Next.js, not plain Node), so
// add ".js" and treat them as ES modules while this script runs.
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
const lib = (f) => pathToFileURL(path.join(appRoot, "lib", f)).href;
const args = process.argv.slice(2);
const appHtmlArg = args.includes("--app-html") ? args[args.indexOf("--app-html") + 1] : null;
const appHtmlPath = appHtmlArg ? path.resolve(appHtmlArg) : path.join(appRoot, "public", "app.html");

const { buildSystemPrompt, detectFaqTopics } = await import(lib("prompts.js"));
const { getFocusAreaBySlug, FOCUS_AREAS } = await import(lib("focusAreas.js"));
const { getProcessBySlug } = await import(lib("processes.js"));
const { toCachedSystemBlocks, SYSTEM_PROMPT_CACHE_CUT_AFTER } = await import(lib("promptCache.js"));
const Anthropic = (await import("@anthropic-ai/sdk")).default;

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL - ${name}\n   ${err && err.message ? err.message.split("\n").join("\n   ") : err}`);
  }
}
const joinBlocks = (sys) => (typeof sys === "string" ? sys : sys.map((b) => b.text).join(""));

// ---------------------------------------------------------------------------
// A. System prompt text is byte-identical
// ---------------------------------------------------------------------------
console.log("\n# A. System prompt: cached blocks joined === original string");
const general = getFocusAreaBySlug("general");
const embodimentAddendum = `\n\n=== SHIFT PROGRESS CHECK-IN (Update Progress button) ===\nThe member clicked "Update Progress" on this Shift: Healer / Over-giving. GAP: example. Recommended Activation: example.`;
const SCENARIOS = [
  { name: "brand-new member, first message", fa: general, opts: { faqTopics: detectFaqTopics("hi, I'm new here") } },
  {
    name: "established member: memories + Shifts + rolling summary",
    fa: general,
    opts: {
      memberMemories: "- [confirmed] Runs a Reiki practice; struggles to raise prices\n- [hypothesis] Over-gives to clients",
      existingShifts: "- id: recABC123 | focus: Prosperity | Divine Identity: Healer | Current Frequency: Over-giving | status: shifting | Gap: says she wants ease but...",
      chatSummary: "She opened talking about a heavy session and moved to pricing.",
      faqTopics: detectFaqTopics("I feel heavy after my last session"),
    },
  },
  { name: "FAQ question (privacy) adds the approved answer", fa: general, opts: { faqTopics: detectFaqTopics("Can Rachael read my chats?") } },
  { name: "FAQ question (website/code boundary)", fa: general, opts: { faqTopics: detectFaqTopics("can you help me write my website copy?") } },
  { name: "Update Progress check-in (addendum appended by the route)", fa: general, opts: {}, append: embodimentAddendum },
  {
    name: "dormant GAP-in-main-chat path (process + gapMethodResult)",
    fa: general,
    opts: { process: getProcessBySlug("3-step-gap-method"), gapMethodResult: { step1: { divineIdentity: "Healer" } } },
  },
  ...FOCUS_AREAS.filter((f) => f.slug !== "general").map((f) => ({ name: `focus area "${f.slug}"`, fa: f, opts: { memberMemories: "- [confirmed] x" } })),
];
const generalStable = new Set();
for (const sc of SCENARIOS) {
  await test(sc.name, () => {
    let original = buildSystemPrompt(sc.fa, sc.opts);
    if (sc.append) original += sc.append;
    const sys = toCachedSystemBlocks(original);
    assert.ok(Array.isArray(sys), "expected a split into blocks (cut point not found?)");
    assert.equal(joinBlocks(sys), original, "joined blocks differ from the original prompt");
    assert.equal(sys.length, 2);
    assert.deepEqual(sys[0].cache_control, { type: "ephemeral" });
    assert.equal(sys[1].cache_control, undefined);
    assert.ok(sys.every((b) => b.type === "text" && b.text.trim().length > 0), "no empty blocks");
    assert.ok(sys[0].text.endsWith(SYSTEM_PROMPT_CACHE_CUT_AFTER));
    assert.ok(sys[1].text.startsWith("\n"), "cut lands on a paragraph break");
    if (sc.fa.slug === "general") generalStable.add(sys[0].text);
  });
}
await test("cached piece is identical for every 'general' member/message (so it is actually reusable)", () => {
  assert.equal(generalStable.size, 1);
  const chars = [...generalStable][0].length;
  console.log(`   cached piece: ${chars} chars (~${Math.round(chars / 4)} tokens; minimum cacheable for Sonnet 5 is 1,024)`);
  assert.ok(chars / 4 > 2048);
});
await test("fallback: if the cut point is ever missing, the exact original string is sent (no caching)", () => {
  const s = "some prompt without the cut point";
  const w = console.warn;
  console.warn = () => {};
  try { assert.equal(toCachedSystemBlocks(s), s); } finally { console.warn = w; }
});

// ---------------------------------------------------------------------------
// B. Wire request: before vs after, through the real SDK to a local fake API
// ---------------------------------------------------------------------------
console.log("\n# B. Request on the wire (real @anthropic-ai/sdk -> local fake server)");
const requests = [];
let behaviour = () => ({ delay: 0, status: 200 });
let attempt = 0;
const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    attempt++;
    requests.push({ headers: req.headers, body: JSON.parse(raw || "{}") });
    const b = behaviour(attempt);
    if (b.hang) return;
    setTimeout(() => {
      const out = JSON.stringify({
        id: "msg_test", type: "message", role: "assistant", model: "fake", content: [{ type: "text", text: "ok" }],
        stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 40, output_tokens: 2, cache_read_input_tokens: 13900, cache_creation_input_tokens: 0 },
      });
      res.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(out), connection: "close" });
      res.end(out);
    }, b.delay);
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const client = new Anthropic({ apiKey: "test-not-a-real-key", baseURL: `http://127.0.0.1:${server.address().port}` });
await test("same model / max_tokens / messages / headers; system text identical; only change is 2 blocks + cache_control", async () => {
  const systemPrompt = buildSystemPrompt(general, SCENARIOS[1].opts);
  const params = (system) => ({
    model: "claude-sonnet-5",
    max_tokens: 4096,
    system,
    messages: [{ role: "user", content: "earlier" }, { role: "assistant", content: "earlier reply" }, { role: "user", content: "new message" }],
  });
  requests.length = 0;
  await client.messages.create(params(systemPrompt), { timeout: 45000 }); // the old call
  const r = await client.messages.create(params(toCachedSystemBlocks(systemPrompt)), { timeout: 45000 }); // the new call
  const [before, after] = requests;
  assert.deepEqual(Object.keys(after.body).sort(), Object.keys(before.body).sort());
  for (const k of Object.keys(before.body)) if (k !== "system") assert.deepEqual(after.body[k], before.body[k], `${k} differs`);
  assert.equal(typeof before.body.system, "string");
  assert.equal(joinBlocks(after.body.system), before.body.system);
  assert.equal(after.body.system.filter((b) => b.cache_control).length, 1);
  for (const h of ["anthropic-version", "anthropic-beta", "content-type"]) assert.equal(after.headers[h], before.headers[h], `header ${h} differs`);
  assert.equal(after.headers["anthropic-beta"], undefined, "no beta header needed or sent");
  assert.equal(r.usage.cache_read_input_tokens, 13900, "SDK passes cache usage fields through for logging");
});

// ---------------------------------------------------------------------------
// D (measured here, asserted later). Server worst case with the UNCHANGED
// server settings: 45s per Claude attempt, SDK retries a timed-out attempt.
// ---------------------------------------------------------------------------
attempt = 0;
behaviour = () => ({ hang: true });
const S = 10; // 1 simulated second = 10ms for the attempt timeout
const t0 = Date.now();
await client.messages.create({ model: "m", max_tokens: 1, messages: [{ role: "user", content: "x" }] }, { timeout: 45 * S }).catch(() => {});
const attemptsOnHang = attempt;
const retryPausesSec = (Date.now() - t0 - attemptsOnHang * 45 * S) / 1000; // SDK back-off pauses are real time
const serverWorstSec = attemptsOnHang * 45 + Math.max(0, retryPausesSec) + 12 /* GAP marker retry (dormant) */ + 5 /* Airtable */;
server.close();

// ---------------------------------------------------------------------------
// C. Page behaviour: the real main-chat code from app.html
// ---------------------------------------------------------------------------
const html = fs.readFileSync(appHtmlPath, "utf8");
const startIdx = (() => {
  const a = html.indexOf("// Main chat send + waiting logic");
  return a !== -1 ? html.lastIndexOf("\n", a) : html.indexOf("async function rhSendMessage(text, processSlug) {");
})();
const endIdx = html.indexOf("var RH_THINKING_MESSAGES", startIdx);
assert.ok(startIdx > 0 && endIdx > startIdx, "could not find the main chat send code in app.html");
const pageSrc = html.slice(startIdx, endIdx);
const capMatch = pageSrc.match(/RH_CHAT_CLIENT_TIMEOUT_MS = (\d+)/) || pageSrc.match(/rhAbortController\.abort\(\); \}, (\d+)\)/);
const clientCapSec = capMatch ? Number(capMatch[1]) / 1000 : NaN;
console.log(`\n# C. Page waiting logic (${path.relative(process.cwd(), appHtmlPath)}), timers sped up: 1s -> 2ms`);

const P = 2; // real ms per simulated second
function makePage({ onChat, db = {}, chatsList = null, activeChatId = "recChatA" }) {
  const realSet = setTimeout;
  const log = [];
  let posts = 0;
  let thinking = null;
  const thread = { switchChat() { if (thinking) thinking.isConnected = false; } };
  const t0 = Date.now();
  const at = (sec, fn) => realSet(fn, sec * P);
  const ctx = {
    console, Intl, AbortController, JSON, Promise, DOMException, Date, isNaN,
    window: { __rhActiveChatId: activeChatId },
    document: {
      getElementById: () => ({ value: "x", disabled: false, classList: { contains: () => false, add() {} } }),
      querySelectorAll: () => [],
    },
    localStorage: { setItem() {} },
    setTimeout: (fn, ms) => realSet(fn, (ms / 1000) * P),
    clearTimeout,
    RH_EMAIL: "member@example.com",
    rhFollowReply: true,
    showRhThinking: () => {
      const textEl = { textContent: "Give me a second…" };
      thinking = { isConnected: true, __rhThinkingTimer: null, querySelector: () => textEl, classList: { add() {} }, textEl };
      return thinking;
    },
    removeRhThinking: (el) => { if (el) el.isConnected = false; },
    hideRhWelcome() {}, rhStartFollowingReply() {}, autoGrowChatInput() {},
    rhMaybeRefreshDrawerAfterSend() {}, addRhActivationButton() {}, rhKeepComposerInView() {}, rhUpdateScrollDownBtn() {},
    addRhMessage: (role, text) => { log.push({ kind: role === "assistant" ? "reply" : "user", text, sec: (Date.now() - t0) / P }); return {}; },
    addRhError: (msg) => log.push({ kind: "error", text: msg || "Something glitched on my end. Try that again for me.", sec: (Date.now() - t0) / P }),
    fetch: (url, init = {}) =>
      new Promise((resolve, reject) => {
        const json = (status, body) => resolve({ ok: status >= 200 && status < 300, status, json: async () => body });
        if (init.signal) init.signal.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")));
        if (url === "/api/chat") {
          posts++;
          const body = JSON.parse(init.body);
          return onChat({ body, json, reject, at, db, htmlError: (s) => resolve({ ok: false, status: s, json: async () => { throw new SyntaxError("Unexpected token <"); } }) });
        }
        if (url.startsWith("/api/chats?email=")) return json(200, { chats: (chatsList || Object.keys(db).map((id) => ({ id, createdAt: db[id].createdAt }))) });
        const id = decodeURIComponent(url.split("/api/chats/")[1] || "");
        if (db[id]) return json(200, { chat: { id }, messages: db[id].messages });
        return json(404, { error: "chat not found" });
      }),
  };
  vm.createContext(ctx);
  vm.runInContext(pageSrc + "\n;globalThis.__send = rhSendMessage; globalThis.__retry = rhRetryLastMessage;", ctx);
  return {
    ctx, log, thread,
    get posts() { return posts; },
    get stillWorkingShown() { return !!(thinking && /Still with you/.test(thinking.textEl.textContent)); },
    send: (text) => ctx.__send(text),
    retry: () => ctx.__retry(),
    last: () => log.filter((l) => l.kind !== "user").slice(-1)[0],
    bubbles: () => log.filter((l) => l.kind !== "user"),
  };
}
const nowIso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();
// The server saves the member's message before calling Claude and the reply
// right after answering -- mirror that in the fake DB.
const saveUser = (db, id, text) => { (db[id] ||= { createdAt: nowIso(), messages: [] }).messages.push({ role: "user", text, createdAt: nowIso() }); };
const saveReply = (db, id, text) => db[id].messages.push({ role: "assistant", text, createdAt: nowIso() });

const cases = [
  {
    name: "normal reply (6s): shown, no 'still working', no error",
    run: async () => {
      const p = makePage({ onChat: ({ json, at, db }) => { saveUser(db, "recChatA", "hello"); at(6, () => { saveReply(db, "recChatA", "Hi love"); json(200, { reply: "Hi love", chatId: "recChatA" }); }); } });
      await p.send("hello");
      assert.deepEqual(p.bubbles().map((b) => b.kind), ["reply"]);
      assert.equal(p.stillWorkingShown, false);
    },
  },
  {
    name: "reply that runs past 30s (40s): 'still working' at 30s, then the reply lands normally, NO false error  <-- the bug",
    run: async () => {
      const p = makePage({ onChat: ({ json, at, db }) => { saveUser(db, "recChatA", "hello"); at(40, () => json(200, { reply: "Slow but here", chatId: "recChatA" })); } });
      await p.send("hello");
      assert.deepEqual(p.bubbles().map((b) => `${b.kind}:${b.text}`), ["reply:Slow but here"]);
      assert.equal(p.stillWorkingShown, true, "expected the 'still working' line");
      assert.ok(p.last().sec >= 39, `reply shown at ${p.last().sec}s`);
    },
  },
  {
    name: "very slow reply (150s, near the server's worst case): still shown, no error",
    run: async () => {
      const p = makePage({ onChat: ({ json, at }) => at(150, () => json(200, { reply: "Very slow", chatId: "recChatA" })) });
      await p.send("hello");
      assert.deepEqual(p.bubbles().map((b) => b.kind), ["reply"]);
    },
  },
  {
    name: "real failure: server answers with its error (504 'took too long' at 137s) -> Try Again shown",
    run: async () => {
      const p = makePage({ onChat: ({ json, at, db }) => { saveUser(db, "recChatA", "hello"); at(137, () => json(504, { error: "The response took too long. Please try again." })); } });
      await p.send("hello");
      assert.deepEqual(p.bubbles().map((b) => b.kind), ["error"]);
      assert.equal(p.ctx.window.__rhLastFailedText, "hello", "Try Again armed");
    },
  },
  {
    name: "real failure: server error 500 straight away -> Try Again shown",
    run: async () => {
      const p = makePage({ onChat: ({ json, at }) => at(1, () => json(500, { error: "boom" })) });
      await p.send("hello");
      assert.deepEqual(p.bubbles().map((b) => b.kind), ["error"]);
    },
  },
  {
    name: "connection drops at 40s but the reply WAS generated and saved -> reply recovered from saved messages, no error",
    run: async () => {
      const p = makePage({ onChat: ({ reject, at, db }) => { saveUser(db, "recChatA", "hello"); at(40, () => reject(new TypeError("Failed to fetch"))); at(41, () => saveReply(db, "recChatA", "Saved reply")); } });
      await p.send("hello");
      assert.deepEqual(p.bubbles().map((b) => `${b.kind}:${b.text}`), ["reply:Saved reply"]);
    },
  },
  {
    name: "hosting error page (non-JSON 504) and nothing saved -> Try Again shown",
    run: async () => {
      const p = makePage({ onChat: ({ htmlError, at, db }) => { saveUser(db, "recChatA", "hello"); at(60, () => htmlError(504)); } });
      await p.send("hello");
      assert.deepEqual(p.bubbles().map((b) => b.kind), ["error"]);
    },
  },
  {
    name: "server never answers and nothing saved -> 'taking longer' + Try Again only at the last-resort cap (not 30s)",
    run: async () => {
      const p = makePage({ onChat: ({ db }) => saveUser(db, "recChatA", "hello") });
      await p.send("hello");
      const b = p.last();
      assert.equal(b.kind, "error");
      assert.match(b.text, /taking longer/);
      assert.ok(b.sec >= clientCapSec, `error after ${b.sec.toFixed(0)}s, cap ${clientCapSec}s`);
      console.log(`   error shown after ~${b.sec.toFixed(0)}s (cap ${clientCapSec}s + saved-message re-checks)`);
    },
  },
  {
    name: "brand-new chat (no chat id yet), connection lost, reply saved -> found via the chats list and the thread continues there",
    run: async () => {
      const p = makePage({ activeChatId: null, onChat: ({ reject, at, db }) => { saveUser(db, "recNew1", "first message"); at(35, () => { saveReply(db, "recNew1", "Welcome reply"); reject(new TypeError("Failed to fetch")); }); } });
      await p.send("first message");
      assert.deepEqual(p.bubbles().map((b) => `${b.kind}:${b.text}`), ["reply:Welcome reply"]);
      assert.equal(p.ctx.window.__rhActiveChatId, "recNew1");
    },
  },
  {
    name: "duplicate guard: reply lands AFTER the error was shown -> Try Again shows it and does NOT send the message again",
    run: async () => {
      let late;
      const p = makePage({ onChat: ({ reject, at, db }) => { saveUser(db, "recChatA", "hello"); at(20, () => reject(new TypeError("Failed to fetch"))); late = () => saveReply(db, "recChatA", "Late reply"); } });
      await p.send("hello");
      assert.equal(p.last().kind, "error");
      late();
      await p.retry();
      assert.equal(p.posts, 1, "message must not be re-sent");
      assert.equal(p.last().kind, "reply");
      assert.equal(p.last().text, "Late reply");
    },
  },
  {
    name: "Try Again after a genuine failure re-sends exactly once (double tap ignored)",
    run: async () => {
      let n = 0;
      const p = makePage({ onChat: ({ json, at }) => { n++; at(1, () => (n === 1 ? json(500, { error: "boom" }) : json(200, { reply: "Second time lucky", chatId: "recChatA" }))); } });
      await p.send("hello");
      await Promise.all([p.retry(), p.retry()]);
      await new Promise((r) => setTimeout(r, 20));
      assert.equal(p.posts, 2, `expected 1 original + 1 retry, got ${p.posts}`);
      assert.equal(p.last().text, "Second time lucky");
    },
  },
  {
    name: "same words sent earlier in the chat ('yes' 5 min ago) are NOT mistaken for this message's reply",
    run: async () => {
      const db = { recChatA: { createdAt: nowIso(-600000), messages: [
        { role: "user", text: "yes", createdAt: nowIso(-300000) },
        { role: "assistant", text: "OLD reply to an earlier yes", createdAt: nowIso(-299000) },
      ] } };
      const p = makePage({ db, onChat: ({ reject, at }) => at(5, () => reject(new TypeError("Failed to fetch"))) }); // never reached the server
      await p.send("yes");
      assert.equal(p.last().kind, "error", `got ${p.last().kind}: ${p.last().text}`);
    },
  },
  {
    name: "member opens another chat while waiting -> late reply is not dropped into the other conversation",
    run: async () => {
      let p;
      p = makePage({ onChat: ({ json, at }) => { at(10, () => p.thread.switchChat()); at(40, () => json(200, { reply: "Belongs to chat A", chatId: "recChatA" })); } });
      await p.send("hello");
      assert.deepEqual(p.bubbles(), []);
      assert.equal(p.ctx.window.__rhSending, false, "send button released");
    },
  },
];
for (const c of cases) await test(c.name, c.run);

// ---------------------------------------------------------------------------
// D. Cap ordering
// ---------------------------------------------------------------------------
console.log("\n# D. Limits");
await test("page's last-resort cap > server's own worst case; < Vercel's 300s default function limit", () => {
  console.log(`   server worst case ~${serverWorstSec.toFixed(0)}s (${attemptsOnHang} Claude attempts x 45s + ${retryPausesSec.toFixed(1)}s retry pauses + 12s marker retry + ~5s Airtable) | page cap ${clientCapSec}s | Vercel 300s`);
  assert.ok(clientCapSec > serverWorstSec, "page must wait longer than the server can take");
  assert.ok(clientCapSec < 300);
});
await test("GAP bot routes do not use the new code", () => {
  for (const f of ["app/api/gap-chat-member/route.ts", "app/api/gap-chat/route.ts"]) {
    const src = fs.readFileSync(path.join(appRoot, f), "utf8");
    assert.ok(!/promptCache|cache_control/.test(src), `${f} references the new code`);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
