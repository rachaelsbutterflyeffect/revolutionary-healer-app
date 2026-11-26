// Date gate for the Black Friday home banner.
// Before 2026-12-01T04:59:00Z the banner is on and the home greeting is hidden.
// At and after that instant the banner is absent and the greeting is present.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const js = fs.readFileSync(path.join(root, "public/bf26.js"), "utf8");
const css = fs.readFileSync(path.join(root, "public/bf26.css"), "utf8");
const refresh = fs.readFileSync(path.join(root, "public/app-refresh.html"), "utf8");
const classic = fs.readFileSync(path.join(root, "public/app.html"), "utf8");

const context = { console, Date, URLSearchParams, setTimeout, clearTimeout };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(js, context, { filename: "bf26.js" });
const BF = context.BF26;
assert.ok(BF, "bf26.js exports BF26 before touching the DOM");
assert.equal(typeof context.document, "undefined");

const UNTIL = Date.parse("2026-12-01T04:59:00Z");
assert.equal(BF.UNTIL, UNTIL);
assert.equal(BF.UNTIL_ISO, "2026-12-01T04:59:00Z");
assert.equal(BF.KILL, false);
assert.equal(BF.QUIZ, "https://activation-quiz-mockup.vercel.app");

const before = Date.parse("2026-11-30T23:58:59-05:00");
const atCutoff = Date.parse("2026-11-30T23:59:00-05:00");
assert.equal(before, UNTIL - 1000);
assert.equal(atCutoff, UNTIL);

assert.equal(BF.bannerOn(before, false), true, "before cutoff: banner on");
assert.equal(BF.bannerOn(UNTIL - 1, false), true, "1ms before cutoff: banner on");
assert.equal(BF.bannerOn(UNTIL, false), false, "at cutoff: banner off");
assert.equal(BF.bannerOn(Date.parse("2026-12-01T05:00:00Z"), false), false, "after cutoff: banner off");
assert.equal(BF.bannerOn(before, true), false, "kill switch hides the banner before the cutoff");

assert.equal(BF.productionHost("www.therevolutionaryhealer.com"), true);
assert.equal(BF.productionHost("therevolutionaryhealer.com"), true);
assert.equal(BF.productionHost("revolutionary-healer-app-7jzf.vercel.app"), true);
assert.equal(BF.productionHost("localhost"), false);
assert.equal(BF.productionHost("revolutionary-healer-app-7jzf-git-cursor-bf26.vercel.app"), false);

const realNow = Date.parse("2026-11-25T20:00:00Z");
const after = Date.parse("2026-12-02T00:00:00Z");
assert.equal(
  BF.resolveNow(realNow, "www.therevolutionaryhealer.com", "?bfnow=2026-12-02T00:00:00Z"),
  realNow,
  "production ignores ?bfnow="
);
assert.equal(BF.resolveNow(realNow, "localhost", "?bfnow=2026-12-02T00:00:00Z"), after);
assert.equal(BF.resolveNow(realNow, "127.0.0.1", "?bfnow=off"), UNTIL);
assert.equal(BF.resolveNow(after, "localhost", "?bfnow=on"), UNTIL - 1);
assert.equal(BF.bannerOn(BF.resolveNow(realNow, "localhost", "?bfnow=2026-11-25T12:00:00Z"), false), true);
assert.equal(BF.bannerOn(BF.resolveNow(realNow, "localhost", "?bfnow=2026-12-01T04:59:00Z"), false), false);
assert.equal(BF.bannerOn(BF.resolveNow(realNow, "www.therevolutionaryhealer.com", "?bfnow=2026-12-02T00:00:00Z"), false), true);

for (const html of [refresh, classic]) {
  assert.equal(html.split('src="/bf26.js"').length - 1, 1);
}
assert.ok(refresh.indexOf('id="rf-home"') < refresh.indexOf('src="/bf26.js"'));
assert.match(js, /getElementById\("rf-home"\)/);
assert.match(js, /classList\.contains\("rf"\)/);
assert.match(js, /querySelector\(":scope > \.rf-top"\)/);
assert.match(css, /html\.bf26-on #rf-home > \.rf-hero/);
assert.match(css, /html\.bf26-on #rf-home > \.rf-welcome/);
for (const html of [refresh, classic]) {
  assert.match(html, /id="bf26-early"/);
  assert.match(html, /Date\.parse\("2026-12-01T04:59:00Z"\)/);
  assert.match(html, /var KILL = false/);
}
assert.equal(js.includes("Available until"), false);
assert.equal(js.includes("November 30"), false);
assert.equal(js.includes("bf26-fine"), false);
assert.match(js, /Two-minute quiz, hundreds in savings/);
assert.match(js, /Skip the random discounts/);
assert.equal(js.includes("target="), false, "quiz link stays in the same window so a webview can open it");
assert.equal(js.includes("rh-chat"), false);
assert.equal(js.includes("chat-input"), false);
assert.equal(js.includes("scrollTop"), false);
assert.equal(css.includes("rh-chat"), false);
assert.equal(css.includes("#hero-section"), false);
assert.equal(css.includes(".rf-door"), false);
assert.equal(css.includes("#rf-nav"), false);

const selectors = [];
const noComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
for (const block of noComments.split("}")) {
  const head = block.split("{")[0];
  if (!head || !head.trim()) continue;
  for (const raw of head.split(",")) {
    const sel = raw.trim();
    if (!sel) continue;
    if (sel.startsWith("@")) continue;
    if (/^(\d|from|to)/.test(sel)) continue;
    selectors.push(sel);
    assert.ok(
      sel.startsWith(".bf26") || sel.startsWith("html.bf26-on") || sel.startsWith("body.bf26-on") || sel.startsWith("body:not(.rf) .bf26") || sel.startsWith("body.rf .bf26"),
      "unscoped selector: " + sel
    );
  }
}
assert.ok(selectors.length > 10);

console.log("bf26 banner gate ok", selectors.length, "scoped selectors");
