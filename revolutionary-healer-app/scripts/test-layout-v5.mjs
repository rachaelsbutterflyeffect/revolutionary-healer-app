// Layout v5 is markup, CSS, and mount wiring. The chat, code deck, finder, and GAP Method stay as they are.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { validateActivityEvent } from "../lib/activity.js";

const root = new URL("../", import.meta.url);
const require = createRequire(import.meta.url);
const { createClient } = require("../public/rh-activity.js");
function read(rel) { return fs.readFileSync(new URL(rel, root), "utf8"); }

const page = read("public/app-refresh.html");
const css = read("public/layout-v5.css");
const js = read("public/layout-v5.js");
const refresh = read("scripts/ui-refresh/refresh.js");
const codes = read("public/rf-codes.js");
const checkin = read("public/rf-checkin.js");
const bf = read("public/bf26.js");

assert.match(page, /data-mlv5-open-chat="1" data-rf-go="chat"/);
assert.match(page, /Hey, what are we looking at today\?/);
assert.match(page, /Open chat →/);
assert.equal(page.includes("Tell Rachael in your own words"), false);
assert.equal(page.includes('id="mlv5-chips"'), false);
assert.match(page, /data-rf-lane="gifts"/);
assert.match(page, /Five days to come back to yourself\./);
assert.match(page, /class="mlv5-pill">Start here</);
assert.match(page, /reset-and-restore-banner\.jpg/);
assert.match(page, /data-mlv5-track="rr-library"/);
assert.match(page, /id="mlv5-act-top"[^>]*hidden/);
assert.match(page, /class="mlv5-hero mlv5-only" hidden/);
assert.match(page, /data-rf-nav="focus"/);
assert.equal(page.includes("memberLayoutV5: 'layout-v5'"), true);
assert.match(page, /id="mlv5-gate"/);
assert.match(page, /html\.mlv5-hold body\{visibility:hidden!important\}/);
assert.match(page, /if \(f && f\.memberLayoutV5 === true\) paint\(\)/);
assert.match(page, /else \{ clearTimeout\(timer\); reveal\(\); \}/);
assert.match(page, /function deckHome\(\)/);
assert.match(page, /codePull === true && !deckHome\(\)/);
assert.match(page, /slot\.contains\(codes\)/);
assert.match(page, /id="mlv5-lib-new"/);
assert.match(page, /id="mlv5-lib-new-grid"/);
assert.match(page, /function rhFillLibraryNew/);
assert.match(page, /#activation-library-grid/);
assert.match(page, /\.rr-new/);
assert.match(page, /reset-and-restore/);
assert.match(page, /b\.rank - a\.rank/);
assert.match(page, /data-new-added/);
assert.match(page, /data-new-until="2026-12-31"/);
assert.match(page, /Activation\$/);
assert.match(page, /host\.hidden = grid\.children\.length === 0/);
assert.match(css, /scroll-snap-type: x mandatory/);
assert.match(css, /flex: 0 0 78%/);
assert.match(page, /rhNoteLibraryNew/);
assert.match(page, /libNewTap/);
assert.match(page, /data-lib-new/);
assert.equal(page.includes('id="mlv5-lib-new" class="mlv5-lib-new" hidden'), true);
assert.match(page, /id="bf26-bar"/);
assert.match(page, /\.bf26-banner a\.bf26-btn\{[^}]*text-decoration:none/);
assert.match(page, /k === 'memberLayoutV5' && window\.__layoutGate/);
assert.match(refresh, /k === 'memberLayoutV5' && window\.__layoutGate/);
assert.equal(refresh.includes("memberLayoutV5: 'layout-v5'"), true);
assert.equal(page.split("window.rhActivity.chatCard(label)").length - 1, 1);
assert.match(refresh, /function startLane\(lane\)/);
assert.equal(refresh.includes("layoutTap"), false);
assert.equal(refresh.includes("mlv5"), false);

assert.match(js, /slot\.appendChild\(codes\)/);
assert.match(js, /data-rf-go', 'lib'/);
assert.equal(js.includes("rhStartNewChat"), false);
assert.match(js, /chatCard\('Open chat'\)/);
assert.equal(js.includes("rfGo('chat')"), false);
assert.match(refresh, /g === 'chat'\) \{ showMain\(\); rfGo\('chat'\); toBottom\(\); \}/);
assert.match(css, /body\.mlv5\[data-rf="chat"\]/);
assert.match(page, /offers\/tcwMWNz4/);
assert.match(page, /data-program-source="go_deeper"/);
assert.match(page, /https:\/\/activation-quiz-mockup\.vercel\.app\//);
assert.match(page, /Find Your Next Step/);
assert.match(read("public/rh-activity.js"), /data-program-source/);
assert.equal(page.includes("$285"), false);
assert.match(js, /goDeeperBook\('revolution-go-deeper'\)/);
assert.match(js, /chatGuardUntil/);
assert.match(js, /My GAPs/);
assert.match(js, /My Codes/);
assert.match(js, /function capRecent\(\)/);
assert.match(js, /shifts\.slice\(0, 3\)/);
assert.match(js, /el\.classList\.toggle\('rf-xhide'/);
assert.match(css, /\[data-rf-filter="recent"\] \.rf-sbub\.rf-xhide \{ display: none !important; \}/);
assert.match(read("lib/activity.js"), /go_deeper_book_tap/);
assert.match(read("lib/activity.js"), /program_finder_tap/);
assert.match(read("lib/activity.js"), /my_gaps_open/);
assert.match(read("lib/activity.js"), /my_codes_open/);
assert.match(read("public/rh-activity.js"), /programFinder/);
assert.equal(css.includes("#chat-input"), false);
assert.equal(css.includes(".rf-chip"), false);
assert.equal(css.includes(".rh-chat"), false);
assert.equal(js.includes("appendChild(tile)"), false);
assert.match(css, /#rf-lsecs \.rf-favtile \{ display: none !important/);
assert.match(css, /#rf-fit-door \.rf-door \.txt/);
assert.match(css, /-webkit-text-fill-color: #fdfbf5/);
assert.match(js, /layoutTap/);
assert.equal(js.includes("function pull"), false);
assert.equal(js.includes("/api/chat"), false);
assert.equal(js.includes("/api/code-pulls"), false);

assert.match(css, /body\.mlv5 #rf-nav \[data-rf-nav="focus"\]/);
assert.match(css, /height: 80px !important/);
assert.match(css, /width: 56px/);
assert.match(css, /body\.mlv5 \.rf-sec-new \{ display: none/);
assert.match(css, /body\.mlv5 \.rh-lib-tools \{ display: none/);
assert.match(css, /body\.mlv5 #rr-lib-sec \{ display: none/);
assert.match(css, /padding-top: 12px !important/);
assert.match(css, /#activations-page > \.wrap > \.page-back/);
assert.match(css, /#mlv5-fit \{ margin: 0 0 20px/);
assert.equal(css.includes("purple"), false);

for (const file of [
  "public/rf-codes.js", "public/rf-checkin.js", "public/bf26.js", "public/bf26.css",
  "lib/codeChat.js", "lib/gapChatReply.js", "lib/gapReading.js", "lib/mainChatReply.js",
  "app/api/chat/route.ts", "app/api/code-pulls/route.ts",
]) {
  const text = read(file);
  assert.equal(text.includes("mlv5"), false, file);
  assert.equal(text.includes("MEMBER_LAYOUT"), false, file);
  assert.equal(text.includes("layout_tap"), false, file);
}
assert.match(bf, /BF26_KILL = false/);
assert.match(bf, /2027-01-01T04:59:00Z/);
assert.match(codes, /function pull\(c\)/);
assert.match(checkin, /finderStart/);
assert.match(page, /id="bf26-early"/);

const device = "00000000-0000-4000-8000-000000000001";
const eventId = "00000000-0000-4000-8000-000000000002";
const parsed = validateActivityEvent({ eventId, deviceId: device, event: "layout_tap", target: "  rr-home  " });
assert.equal(parsed.error, undefined);
assert.equal(parsed.value.target, "rr-home");
const blank = validateActivityEvent({ eventId, deviceId: device, event: "layout_tap", target: " " });
assert.equal(blank.error, "Invalid target.");
const seen = validateActivityEvent({ eventId, deviceId: device, event: "lib_new_view" });
assert.equal(seen.error, undefined);
assert.equal(seen.value.event, "lib_new_view");
const tapped = validateActivityEvent({ eventId, deviceId: device, event: "lib_new_tap", slug: "worthiness" });
assert.equal(tapped.value.slug, "worthiness");
const bare = validateActivityEvent({ eventId, deviceId: device, event: "lib_new_tap", slug: "" });
assert.equal(bare.error, "Invalid activation.");

const sent = [];
const clock = { t: 3_000_000 };
const api = createClient({
  deviceId: device,
  now: () => clock.t,
  schedule: () => 1,
  send: async (batch) => { sent.push(batch.map((row) => row.target)); return { ok: true }; },
});
await api.layoutTap("gap-door");
await api.layoutTap("gap-door");
clock.t += 400;
await api.layoutTap("nav-rev");
assert.deepEqual(sent.flat(), ["gap-door", "nav-rev"]);

const newRows = [];
const newer = createClient({
  deviceId: device,
  now: () => clock.t,
  schedule: () => 1,
  send: async (batch) => { newRows.push(...batch); return { ok: true }; },
});
clock.t += 400;
await newer.libNewView();
await newer.libNewTap("worthiness");
clock.t += 400;
await newer.libNewTap("nervous-system-expansion");
assert.deepEqual(newRows.map((row) => row.event + (row.slug ? ":" + row.slug : "")), ["lib_new_view", "lib_new_tap:worthiness", "lib_new_tap:nervous-system-expansion"]);

console.log("layout v5 ok");
