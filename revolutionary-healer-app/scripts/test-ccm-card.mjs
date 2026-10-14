// CCM card release: return clocks, chat decline, webhook guard. Pure / mocked, no network.
// Run: npm run test:ccm-card
import assert from "node:assert/strict";
import { canShowCard, cardStatusUpdate, statusUpdateForOutcome, isChatCcmDecline, ccmStatusPromptNote, CARD_RULES, RULES, ccmCardEnabled } from "../lib/ccm-tracking.js";

let passed = 0;
const test = (n, f) => { try { f(); passed++; console.log("ok - " + n); } catch (e) { console.error("FAIL - " + n); console.error(e); process.exitCode = 1; } };
const NOW = Date.parse("2026-10-14T17:00:00Z");
const ago = (d) => new Date(NOW - d * 86400000).toISOString();
const show = (rec, ad, extra = {}) => canShowCard(rec, { activityDayCount: ad, midShift: false, now: NOW, ...extra });
// simulate: card shown at activity day `at`, member acts, then check later days
const after = (rec, action, at) => { const r = { ...rec, last_card_shown_activity_day_count: at }; return { ...r, ...cardStatusUpdate(r, action, { activityDayCount: at }) }; };
const firstDayBack = (rec, from) => { for (let d = from; d < from + 400; d++) if (show(rec, d).allowed) return d; return null; };

test("constants match the locked table", () => assert.deepEqual(
  [CARD_RULES.firstShowActivityDay, CARD_RULES.chatDeclineCooldownDays, CARD_RULES.notNowActivityDays, CARD_RULES.tellMeMoreActivityDays, CARD_RULES.closeXActivityDays, CARD_RULES.closedTwiceActivityDays, CARD_RULES.minActivityDaysSinceShown],
  [7, 182, 15, 3, 3, 15, 3]));
test("6-month clock is one constant shared by bot + card", () => assert.equal(CARD_RULES.chatDeclineCooldownDays, RULES.declineCooldownDays));
test("new member at 6 activity days: no", () => assert.equal(show(null, 6).reason, "not_enough_activity_days"));
test("new member at 7 activity days: yes", () => assert.equal(show(null, 7).allowed, true));
test("existing member at 10, never shown: yes immediately", () => assert.equal(show(null, 10).allowed, true));
test("existing member at 200, never shown: yes", () => assert.equal(show({}, 200).allowed, true));
test("buyer: never, checked first (even mid-Shift / 6 days)", () => assert.equal(canShowCard({ purchased: true }, { activityDayCount: 3, midShift: true }).reason, "purchased"));
test("buyer via ccm_status", () => assert.equal(show({ ccm_status: "purchased" }, 50).reason, "purchased"));
test("mid-Shift: no", () => assert.equal(show(null, 10, { midShift: true }).reason, "mid_shift"));
test("unknown mid-Shift treated as mid-Shift", () => assert.equal(canShowCard(null, { activityDayCount: 10 }).reason, "mid_shift"));
test("X: back on 3rd activity day", () => assert.equal(firstDayBack(after({}, "x", 10), 10), 13));
test("X: not on day 12", () => assert.equal(show(after({}, "x", 10), 12).allowed, false));
test("Not now: back after 15 activity days", () => assert.equal(firstDayBack(after({}, "not_now", 10), 10), 25));
test("Not now: does not count as a close", () => assert.equal(after({}, "not_now", 10).card_close_count, undefined));
test("Tell me more (no buy): back on 3rd activity day", () => assert.equal(firstDayBack(after({}, "tell_me_more", 10), 10), 13));
test("Tell me more marks interested", () => assert.equal(after({}, "tell_me_more", 10).ccm_status, "interested"));
test("closed twice (X, X): 15 activity days", () => { const a = after({}, "x", 10); const b = after(a, "x", 13); assert.equal(firstDayBack(b, 13), 28); });
test("closed twice (Tell me more, X): 15", () => { const a = after({}, "tell_me_more", 10); const b = after(a, "x", 13); assert.equal(firstDayBack(b, 13), 28); });
test("after the 15-day wait, counter resets: next X = 3", () => { const b = after(after({}, "x", 10), "x", 13); const c = after(b, "x", 28); assert.equal(firstDayBack(c, 28), 31); });
test("never within 3 activity days of last showing", () => assert.equal(show({ last_card_shown_activity_day_count: 20 }, 22).reason, "card_recent"));
test("closed then reopened (new app open, day 13 after X on 10): shows", () => assert.equal(show(after({}, "x", 10), 13).allowed, true));
test("chat decline writes declined_at", () => assert.ok(statusUpdateForOutcome({}, "declined", { now: NOW }).declined_at));
test("chat decline blocks card for 6 months", () => { const r = { ...statusUpdateForOutcome({}, "declined", { now: NOW - 100 * 86400000 }) }; assert.equal(show(r, 50).reason, "declined_in_chat"); });
test("chat decline expires after 182 days", () => assert.equal(show({ declined_at: ago(183), ccm_status: "declined" }, 50).allowed, true));
test("Tell me more then chat decline -> 6 months beats 3 days", () => { const r = { ...after({}, "tell_me_more", 10), ...statusUpdateForOutcome({}, "declined", { now: NOW }) }; assert.equal(show(r, 40).reason, "declined_in_chat"); });
test("Tell me more then buy -> never", () => { const r = { ...after({}, "tell_me_more", 10), purchased: true }; assert.equal(show(r, 99).reason, "purchased"); });
test("decline detector: bot offered CCM, member says not interested", () => assert.equal(isChatCcmDecline("I'm not interested, thanks", { previousAssistant: "Clear Channel Method could help..." }), true));
test("decline detector: member names CCM", () => assert.equal(isChatCcmDecline("I don't want the Clear Channel Method"), true));
test("decline detector: from card opener", () => assert.equal(isChatCcmDecline("no thanks", { fromCard: true }), true));
test("decline detector: unrelated 'not interested' is ignored", () => assert.equal(isChatCcmDecline("I'm not interested in dating right now", { previousAssistant: "What feels heavy today?" }), false));
test("decline detector: curiosity is not a decline", () => assert.equal(isChatCcmDecline("what is clear channel method?"), false));
test("prompt note on decline", () => assert.match(ccmStatusPromptNote({ declined_at: ago(2) }, NOW), /not interested/));
test("prompt note on purchase", () => assert.match(ccmStatusPromptNote({ purchased: true }, NOW), /already bought/));
test("flag: card off unless tracking on", () => { assert.equal(ccmCardEnabled({}), false); assert.equal(ccmCardEnabled({ CCM_CARD: "on" }), false); assert.equal(ccmCardEnabled({ CCM_TRACKING: "on" }), true); assert.equal(ccmCardEnabled({ CCM_TRACKING: "on", CCM_CARD: "off" }), false); });

console.log(`\n${passed} passed`);
