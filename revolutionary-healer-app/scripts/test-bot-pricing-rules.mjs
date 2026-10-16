// Bot pricing rules (Oct 15 2026).
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
const { BOT_PRICING_RULES: P, withPricingRules } = await import(L("bot-pricing-rules.js"));
const { CCM_CHATBOT_INSTRUCTIONS: C, withCcmInstructions } = await import(L("ccm-chatbot-instructions.js"));
const { buildSystemPrompt } = await import(L("prompts.js"));
const { toCachedSystemBlocks } = await import(L("promptCache.js"));
const { FOCUS_AREAS } = await import(L("focusAreas.js"));
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log("ok - " + n); } catch (e) { fail++; console.log("FAIL - " + n + "\n   " + e.message); } };
const base = buildSystemPrompt(FOCUS_AREAS[0], { retrievedContext: "CTX", memberMemories: "MEM" });
const full = withPricingRules(withCcmInstructions(base));
t("inserted once, after CCM, before UPSELL", () => {
  assert.equal(full.split(P).length, 2);
  assert.ok(full.indexOf(C) < full.indexOf(P) && full.indexOf(P) < full.indexOf("UPSELL (rate-limited"));
});
t("inside the cached first piece", () => {
  const b = toCachedSystemBlocks(full);
  assert.ok(Array.isArray(b) && b[0].cache_control && b[0].text.includes(P) && !b[1].text.includes(P));
});
t("Rachael's table and rules present; removed lines absent", () => {
  for (const s of ["$30/month, or $347/year", "$582 total", "Regular price: $3,333", "ask what they were hoping to find", "Do not offer the closest program", "Never quote $2,222", "never invent a discount"]) assert.ok(P.includes(s), s);
  for (const s of ["Spookbound", "$22.22", "$9 ", "doorway", "$587", "mentorship", "1,650", "1:1"]) assert.ok(!P.includes(s), s);
});
t("no conflicting prices left in the main chat prompt", () => {
  for (const s of ["$6,000", "$2,222 ", "invite-only", "$1,650", "$587", "$555 "]) assert.ok(!full.replace(P, "").includes(s), s);
});
t("only the main chat route uses it; GAP files untouched", () => {
  assert.ok(fs.readFileSync("app/api/chat/route.ts", "utf8").includes("withPricingRules(systemPrompt)"));
  for (const f of ["app/api/gap-chat/route.ts", "app/api/gap-chat-member/route.ts", "lib/prompts.js", "lib/processes.js"]) assert.ok(!fs.readFileSync(f, "utf8").includes("bot-pricing-rules"), f);
});
t("unknown prompt shape returned unchanged", () => assert.equal(withPricingRules("abc"), "abc"));
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
