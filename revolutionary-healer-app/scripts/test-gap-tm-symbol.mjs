// GAP Method™ (Oct 8 2026, Rachael): the ™ is added to member-visible "GAP Method" copy only.
// Proves: (A) every changed line differs from main ONLY by an added ™ after "GAP Method" (plus the one
// display-only helper for the Shift card label); (B) GAP prompts / activation teaching / Shift-saving code
// are byte-identical to main; (C) stored values code matches on still say "GAP Method" (no ™);
// (D) the card label helper adds exactly one ™ and leaves other names alone; (E) no visible copy left without it.
// No browser, no network. Run: npm run test:gap-tm-symbol
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const TM = "\u2122";
const BASE = process.env.GAP_TM_BASE || "origin/main";
const root = new URL("../", import.meta.url);
const read = (f) => readFileSync(new URL(f, root), "utf8");
const atMain = (f) => execFileSync("git", ["show", `${BASE}:revolutionary-healer-app/${f}`], { encoding: "utf8", maxBuffer: 64 << 20 });
let passed = 0, failed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log("ok - " + name); } catch (e) { failed++; console.log("FAIL - " + name + "\n   " + String(e.message).split("\n").slice(0, 6).join("\n   ")); } };

const COPY_FILES = ["public/app.html", "public/gap-method.html", "app/page.tsx", "app/my-revolution/page.tsx", "lib/email.js"];
const HELPER_RE = /\n  \/\/ Display-only \(Oct 8, Rachael\): show the trademark[\s\S]*?\n  function rhGapMethodTm\(name\) \{\n[\s\S]*?\n  \}\n\n/;
const undo = (src) => src.replace(HELPER_RE, "\n").replace("rhGapMethodTm(s.method)", "s.method");

test("A. each changed file differs from main only by ™ added right after \"GAP Method\" (+ the Shift card label helper)", () => {
  for (const f of COPY_FILES) {
    const now = undo(read(f)), was = atMain(f);
    const a = now.split("\n"), b = was.split("\n");
    assert.equal(a.length, b.length, `${f}: line count`);
    let added = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i] === b[i]) continue;
      const stripped = a[i].replace(/(GAP Method)\u2122/g, "$1");
      const wasStripped = b[i].replace(/(GAP Method)\u2122/g, "$1");
      assert.equal(stripped, wasStripped, `${f}:${i + 1} changed beyond the ™`);
      const n = (a[i].match(/\u2122/g) || []).length - (b[i].match(/\u2122/g) || []).length;
      assert.ok(n >= 1, `${f}:${i + 1} no ™ added`);
      added += n;
    }
    assert.ok(added >= 1, `${f}: nothing added`);
  }
});

test("A. no doubled ™ anywhere, and the header that already had it is unchanged", () => {
  for (const f of COPY_FILES) assert.ok(!/\u2122\s*\u2122|\u2122<span class="tm">/.test(read(f)), f);
  for (const f of ["public/app.html", "public/gap-method.html"]) assert.ok(read(f).includes(`<div class="eyebrow-top">GAP Method<span class="tm">${TM}</span></div>`), f);
});

test("B. GAP prompts, activation teaching, identities, routing and Shift-saving code are byte-identical to main", () => {
  for (const f of ["lib/processes.js", "lib/prompts.js", "lib/gapDistortions.js", "lib/divineIdentities.js", "lib/activations.js",
    "lib/airtable.js", "lib/gapShiftOnce.js", "lib/gapReading.js", "lib/gapChatReply.js", "lib/memory.js", "lib/shifts.js",
    "app/api/chat/route.ts", "app/api/gap-chat/route.ts", "app/api/gap-chat-member/route.ts", "app/api/gap-shift/route.ts",
    "app/api/gap-method-result/route.ts", "app/api/shifts/route.ts", "lib/entitlements.js"]) assert.equal(read(f), atMain(f), f);
});

test("B. the page's GAP data the AI and reading use (DOMAINS, STEP2_OPENING_QUESTIONS, Shift save body) is unchanged", () => {
  const html = read("public/app.html"), main = atMain("public/app.html");
  const between = (s, a, b) => { const i = s.indexOf(a); assert.ok(i >= 0, a); return s.slice(i, s.indexOf(b, i)); };
  assert.equal(between(html, "var DOMAINS = [", "var QUESTION_BANKS"), between(main, "var DOMAINS = [", "var QUESTION_BANKS"));
  assert.equal(between(html, "var STEP2_OPENING_QUESTIONS", "\n  function "), between(main, "var STEP2_OPENING_QUESTIONS", "\n  function "));
  assert.equal(between(html, "window.__gapShiftSavePromise = fetch('/api/gap-shift'", "}).then("), between(main, "window.__gapShiftSavePromise = fetch('/api/gap-shift'", "}).then("));
});

test("C. stored / matched values keep plain \"GAP Method\" (no ™)", () => {
  const html = read("public/app.html");
  assert.ok(html.includes("focusArea: 'GAP Method',"));
  assert.ok(html.includes("method: r.methodName || 'GAP Method',"));
  assert.ok(read("app/api/gap-shift/route.ts").includes('methodName: "GAP Method"'));
  assert.ok(read("lib/airtable.js").includes('method_name: "GAP Method"'));
  assert.ok(read("lib/gapShiftOnce.js").includes('norm(fields.method_name) === "GAP Method"'));
  assert.ok(html.includes('id="gap-method-starter-btn"'), "button id unchanged");
});

test("D. Shift card label: ™ added once at display time, idempotent, other methods untouched", () => {
  const html = read("public/app.html");
  const src = html.match(/function rhGapMethodTm\(name\) \{[\s\S]*?\n  \}/)[0];
  const ctx = {}; vm.runInNewContext(src + "; this.f = rhGapMethodTm;", ctx); const f = ctx.f;
  assert.equal(f("GAP Method"), "GAP Method" + TM);
  assert.equal(f("3 Step GAP Method"), "3 Step GAP Method" + TM);
  assert.equal(f("GAP Method" + TM), "GAP Method" + TM);
  assert.equal(f("Revolutionary Healer AI Chat"), "Revolutionary Healer AI Chat");
  assert.equal(f(undefined), ""); assert.equal(f(""), "");
  assert.ok(html.includes(`'<div class="shift-method">' + rhGapMethodTm(s.method) + '</div>'`));
});

test("E. no member-visible \"GAP Method\" copy left without ™ (comments, aria-labels, stored values and the save body excepted)", () => {
  const allowedPlain = [/^\s*\/\//, /^\s*\/\*/, /^\s*\*/, /aria-label/, /focusArea: 'GAP Method'/, /method: r\.methodName \|\| 'GAP Method'/,
    /replace\(\/GAP Method\(\?!/ /* the helper's own regex */, /reopen a fresh GAP Method walkthrough/ /* save-body placeholder: stored data, identical to main (B) */, /<!--/, /^\s*(#|\.)?[\w-]*\s*\/\*/];
  const bad = [];
  for (const f of COPY_FILES) read(f).split("\n").forEach((line, i) => {
    if (!/GAP Method(?!\u2122)(?!<span class="tm">)/i.test(line)) return;
    if (allowedPlain.some((r) => r.test(line))) return;
    if (f === "lib/email.js" && /console\.warn|"Set both in Vercel/.test(line)) return;
    bad.push(`${f}:${i + 1}: ${line.trim().slice(0, 120)}`);
  });
  // the save-body placeholders are allowed only inside the gap-shift save body
  const html = read("public/app.html");
  const shown = html.split("\n").filter((l) => /reopen a fresh GAP Method(?!\u2122) walkthrough/.test(l));
  assert.equal(shown.length, 2, "only the two save-body placeholders stay plain");
  shown.forEach((l) => assert.ok(/gapExplanation:|return parts\.length/.test(l), l.trim().slice(0, 80)));
  assert.deepEqual(bad, []);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
