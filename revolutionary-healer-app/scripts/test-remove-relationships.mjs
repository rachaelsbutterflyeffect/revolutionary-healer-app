// Dev-only checks for the Oct 8 2026 removal of the "Relationships" life area from the in-app GAP Method
// (added in PR #28). NOT part of the app: nothing imports this file. No network, no secrets.
//
//   node scripts/test-remove-relationships.mjs
//
//  A. The page: Step 1 offers exactly the four life areas; no Relationships option, opening question or CSS;
//     DOMAINS and STEP2_OPENING_QUESTIONS are byte-identical to before PR #28 (git 3604ae2^).
//  B. The prompt: the Relationships instruction block is gone; for every Divine Identity x the four areas
//     (and no context) the member prompt is byte-identical to main's.
//  C. Tolerance: a stale page still sending "Relationships" gets the general flow (same prompt as no specific
//     area), never an error; /api/gap-method-result saves it as no specific area and still answers ok.
import assert from "node:assert/strict";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
const here = path.dirname(fileURLToPath(import.meta.url)); const root = path.resolve(here, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "norel-"));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log("ok - " + name); } catch (e) { failed++; console.log("FAIL - " + name + "\n   " + (e && e.message)); } }
const git = (rev, file) => execFileSync("git", ["show", `${rev}:./${file}`], { cwd: root, encoding: "utf8", maxBuffer: 64 << 20 });
const html = fs.readFileSync(path.join(root, "public/app.html"), "utf8");
const block = (s, start, end) => { const i = s.indexOf(start); assert.ok(i >= 0, start + " missing"); return s.slice(i, s.indexOf(end, i) + end.length); };

await test("A. Step 1 offers exactly the four life areas (no Relationships)", () => {
  const d = block(html, "var DOMAINS = [", "];");
  const keys = [...d.matchAll(/key:\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(keys, ["business", "money", "gifts", "energy"]);
  assert.ok(!/relationships/i.test(d));
});
await test("A. no Relationships option, opening question or CSS anywhere on the page", () => {
  assert.ok(!/"relationships"|relationships:|Relationships"|\(Relationships\)/.test(html), "a Relationships reference is still on the page");
  assert.ok(!html.includes(".domain-chip:last-child:nth-child(odd)"), "the 5th-option CSS is still there");
});
await test("A. DOMAINS and STEP2_OPENING_QUESTIONS are byte-identical to before PR #28 (3604ae2^)", () => {
  const pre = git("3604ae2^", "public/app.html");
  assert.equal(block(html, "var DOMAINS = [", "];"), block(pre, "var DOMAINS = [", "];"));
  assert.equal(block(html, "var STEP2_OPENING_QUESTIONS = {", "};"), block(pre, "var STEP2_OPENING_QUESTIONS = {", "};"));
});
const P = await import(pathToFileURL(path.join(root, "lib/processes.js")).href);
const mainSrc = git("origin/main", "lib/processes.js").replace(/from "\.\/divineIdentities\.js"/, `from "${pathToFileURL(path.join(root, "lib/divineIdentities.js")).href}"`);
fs.writeFileSync(path.join(tmp, "main-processes.mjs"), mainSrc);
const M = await import(pathToFileURL(path.join(tmp, "main-processes.mjs")).href);
const IDS = [["The Guardian","Over-Responsibility"],["The Wayshower","Doubt"],["The Leader","Fear of Being Seen"],["The Messenger","Channel Interference"],["The Creator","Control"],["The Healer","Disconnection"],["The Expander","Restriction"]];
const AREAS = ["Business + Visibility", "Money", "Spiritual Gifts", "Energy + Frequency"];
const ctx = (n, f, a) => ({ divineIdentity: n, currentFrequency: f, focusArea: a, gapSummary: "x", gapExample: "y", gapRestated: "z", identityBelief: "b", distortionLabel: f });
await test("B. Relationships instruction block removed from lib/processes.js", () => {
  const src = fs.readFileSync(path.join(root, "lib/processes.js"), "utf8");
  assert.ok(!src.includes("GAP_RELATIONSHIPS_FOCUS_NOTE") && !src.includes("FOCUS AREA: RELATIONSHIPS"));
});
await test("B. member prompt byte-identical to main for 7 identities x 4 areas, '' area, and no context (" + (IDS.length * AREAS.length + IDS.length + 1) + " cases)", () => {
  assert.equal(P.buildGapMemberSystemPrompt(null), M.buildGapMemberSystemPrompt(null));
  for (const [n, f] of IDS) { for (const a of [...AREAS, ""]) assert.equal(P.buildGapMemberSystemPrompt(ctx(n, f, a)), M.buildGapMemberSystemPrompt(ctx(n, f, a)), `${n} / ${a}`); }
  assert.equal(P.buildGapFunnelSystemPrompt(null), M.buildGapFunnelSystemPrompt(null));
});
await test("C. stale 'Relationships' (any casing) -> general flow: same prompt as no specific area, no Relationships text, no error", () => {
  for (const v of ["Relationships", "relationships", " RELATIONSHIPS "]) {
    const p = P.buildGapMemberSystemPrompt(ctx("The Leader", "Fear of Being Seen", v));
    assert.equal(p, P.buildGapMemberSystemPrompt(ctx("The Leader", "Fear of Being Seen", "")));
    assert.ok(!/relationships/i.test(p.slice(p.indexOf("=== GAP METHOD RESULT (STEP 1) ==="))));
  }
});
await test("C. /api/gap-method-result: stale 'Relationships' saves as no specific area and answers ok; other areas unchanged", async () => {
  const fake = path.join(tmp, "fake-airtable.mjs");
  fs.writeFileSync(fake, "export async function saveGapMethodDiagnostic(a) { globalThis.__saved.push(a); }");
  const src = fs.readFileSync(path.join(root, "app/api/gap-method-result/route.ts"), "utf8").replace(/from "@\/lib\/airtable"/, `from "${pathToFileURL(fake).href}"`).replace(/import \{ NextRequest, NextResponse \} from "next\/server";/, 'const NextResponse = { json: (b, i) => new Response(JSON.stringify(b), { status: (i && i.status) || 200, headers: { "content-type": "application/json" } }) };');
  const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
  fs.writeFileSync(path.join(tmp, "gmr.mjs"), out); const R = await import(pathToFileURL(path.join(tmp, "gmr.mjs")).href);
  const post = (b) => R.POST(new Request("http://x/api/gap-method-result", { method: "POST", body: JSON.stringify(b) }));
  for (const [sent, want] of [["Relationships", ""], ["relationships", ""], ["Money", "Money"], ["Business + Visibility", "Business + Visibility"], [undefined, undefined]]) {
    globalThis.__saved = []; const res = await post({ email: "member@example.com", focusArea: sent, divineIdentity: "The Leader" });
    assert.equal(res.status, 200); assert.deepEqual(await res.json(), { ok: true, saved: true }); assert.equal(globalThis.__saved[0].focusArea, want);
  }
});
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
