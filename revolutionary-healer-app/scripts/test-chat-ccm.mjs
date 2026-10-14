// Clear Channel Method chatbot education (Oct 14 2026).
import { register } from "node:module";
import assert from "node:assert/strict";
import fs from "node:fs";
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

const L = (f) => new URL("../lib/" + f, import.meta.url).href;
const { CCM_CHATBOT_INSTRUCTIONS: C, withCcmInstructions } = await import(L("ccm-chatbot-instructions.js"));
const { buildSystemPrompt } = await import(L("prompts.js"));
const { toCachedSystemBlocks } = await import(L("promptCache.js"));
const { FOCUS_AREAS } = await import(L("focusAreas.js"));
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log("ok - " + n); } catch (e) { fail++; console.log("FAIL - " + n + "\n   " + e.message); } };
const fa = FOCUS_AREAS[0];
const base = buildSystemPrompt(fa, { retrievedContext: "CTX", memberMemories: "MEM" });
const withC = withCcmInstructions(base);
t("block inserted once, before UPSELL; removing it gives the original prompt", () => {
  assert.equal(withC.split(C).length, 2);
  assert.ok(withC.indexOf(C) < withC.indexOf("UPSELL (rate-limited"));
  assert.equal(withC.replace("\n" + C + "\n", ""), base);
});
t("block is inside the cached (first) system piece", () => {
  const b = toCachedSystemBlocks(withC);
  assert.ok(Array.isArray(b) && b[0].cache_control && b[0].text.includes(C) && !b[1].text.includes(C));
});
t("required content present", () => {
  for (const s of ["https://www.rachaelsbutterflyeffect.com/offers/R3gfeowS/checkout", "https://www.rachaelsbutterflyeffect.com/offers/HRs2J6Ja/checkout", "rachaelsbutterflyeffect@gmail.com", "https://t.me/+_fyFJp29V2E5YmZh", "$497", "3,333", "Distortion Decode", "Remembrance", "15 days", "TRACKING IS OFF", "7 days AND 3 activity days", "15 activity days", "last 3 activity days", "One gentle follow-up"]) assert.ok(C.includes(s), s);
});
t("only the main chat route uses it; GAP routes untouched", () => {
  assert.ok(fs.readFileSync("app/api/chat/route.ts", "utf8").includes("withCcmInstructions(systemPrompt)"));
  for (const f of ["app/api/gap-chat/route.ts", "app/api/gap-chat-member/route.ts", "lib/prompts.js"]) assert.ok(!fs.readFileSync(f, "utf8").includes("ccm-chatbot"), f);
});
t("unknown prompt shape is returned unchanged", () => assert.equal(withCcmInstructions("abc"), "abc"));
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
