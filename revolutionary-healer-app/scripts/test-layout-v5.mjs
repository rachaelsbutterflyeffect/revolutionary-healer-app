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

assert.match(page, /data-mlv5-open-chat="1"/);
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
assert.equal(refresh.includes("memberLayoutV5: 'layout-v5'"), true);
assert.equal(page.split("window.rhActivity.chatCard(label)").length - 1, 1);
assert.match(refresh, /function startLane\(lane\)/);
assert.equal(refresh.includes("layoutTap"), false);
assert.equal(refresh.includes("mlv5"), false);

assert.match(js, /slot\.appendChild\(codes\)/);
assert.match(js, /data-rf-go', 'lib'/);
assert.match(js, /rhStartNewChat/);
assert.match(js, /chatCard\('Open chat'\)/);
assert.match(js, /rfGo\('chat'\)/);
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
assert.match(bf, /2026-12-01T04:59:00Z/);
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

console.log("layout v5 ok");
