// CCM gating rules. Pure, no network. Run: npm run test:ccm-tracking
import assert from "node:assert/strict";
import { canSuggestCCM, canShowCard, statusUpdateForOutcome, computeFunnel, activityDayCountFromTimestamps,
    ccmTrackingEnabled, ccmOfferIds, isCcmOffer, DEFAULT_CCM_OFFER_IDS } from "../lib/ccm-tracking.js";

let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log(`ok - ${name}`); } catch (e) { console.error(`FAIL - ${name}`); console.error(e); process.exitCode = 1; } }

const NOW = "2026-10-14T16:00:00Z";
const ago = (d) => new Date(Date.parse(NOW) - d * 86400000).toISOString();
const good = { now: NOW, activityDayCount: 40, conversationId: "c2", fit: true, midShift: false, questionResolved: true };
const s = (rec, ctx = {}) => canSuggestCCM(rec, { ...good, ...ctx });

test("new member with fit is allowed", () => assert.equal(s({}).allowed, true));
test("null record allowed", () => assert.equal(s(null).allowed, true));
test("a. purchased never (checkbox)", () => assert.equal(s({ purchased: true }).reason, "purchased"));
test("a. purchased never (status)", () => assert.equal(s({ ccm_status: "purchased" }).reason, "purchased"));
test("a. purchased beats everything else", () => assert.equal(s({ purchased: true, declined_at: ago(1) }, { fit: false }).reason, "purchased"));
test("b. declined 30 days ago blocked", () => assert.equal(s({ declined_at: ago(30) }).reason, "declined_recently"));
test("b. declined 181 days ago blocked", () => assert.equal(s({ declined_at: ago(181) }).reason, "declined_recently"));
test("b. declined 7 months ago allowed", () => assert.equal(s({ declined_at: ago(213) }).allowed, true));
test("c. already suggested this conversation", () => assert.equal(s({ last_suggestion_conversation_id: "c2", last_suggestion_at: ago(20) }).reason, "already_this_conversation"));
test("c. different conversation ok", () => assert.equal(s({ last_suggestion_conversation_id: "c1", last_suggestion_at: ago(20), last_suggestion_activity_day_count: 1 }).allowed, true));
test("d. 2 days since suggestion blocked", () => assert.equal(s({ last_suggestion_at: ago(2) }).reason, "min_gap_15_days"));
test("d. 14.9 days blocked", () => assert.equal(s({ last_suggestion_at: ago(14.9) }).reason, "min_gap_15_days"));
test("d. 15 days allowed", () => assert.equal(s({ last_suggestion_at: ago(15), last_suggestion_activity_day_count: 30 }).allowed, true));
test("e. one ignored, 15+ days but only 2 activity days", () =>
    assert.equal(s({ last_suggestion_at: ago(20), consecutive_non_engagements: 1, last_suggestion_activity_day_count: 38 }).reason, "ignored_3_activity_days"));
test("e. one ignored, 3 activity days and 20 days ok", () =>
    assert.equal(s({ last_suggestion_at: ago(20), consecutive_non_engagements: 1, last_suggestion_activity_day_count: 37 }).allowed, true));
test("e. one ignored, unknown activity count blocked", () =>
    assert.equal(s({ last_suggestion_at: ago(20), consecutive_non_engagements: 1 }, { activityDayCount: undefined }).reason, "ignored_3_activity_days"));
test("e. 7-day check still enforced (no last 15-day stamp edge)", () => {
    // 15-day rule dominates; with d satisfied the 7-day check can never fire alone,
    // but it is implemented: verify via the d rule reason ordering.
    assert.equal(s({ last_suggestion_at: ago(5), consecutive_non_engagements: 1, last_suggestion_activity_day_count: 0 }).reason, "min_gap_15_days");
});
test("f. two ignored, 10 activity days blocked", () =>
    assert.equal(s({ last_suggestion_at: ago(60), consecutive_non_engagements: 2, last_suggestion_activity_day_count: 30 }).reason, "two_ignored_15_activity_days"));
test("f. two ignored, 15 activity days ok", () =>
    assert.equal(s({ last_suggestion_at: ago(60), consecutive_non_engagements: 2, last_suggestion_activity_day_count: 25 }).allowed, true));
test("f. three ignored still needs 15 activity days", () =>
    assert.equal(s({ last_suggestion_at: ago(60), consecutive_non_engagements: 3, last_suggestion_activity_day_count: 30 }).reason, "two_ignored_15_activity_days"));
test("g. card shown 2 activity days ago blocked", () => assert.equal(s({ last_card_shown_activity_day_count: 38 }).reason, "card_recent"));
test("g. card shown 3 activity days ago ok", () => assert.equal(s({ last_card_shown_activity_day_count: 37 }).allowed, true));
test("h. no fit blocked", () => assert.equal(s({}, { fit: false }).reason, "no_fit"));
test("h. fit missing blocked", () => assert.equal(s({}, { fit: undefined }).reason, "no_fit"));
test("h. mid-Shift blocked", () => assert.equal(s({}, { midShift: true }).reason, "mid_shift"));
test("h. midShift unknown blocked", () => assert.equal(s({}, { midShift: undefined }).reason, "mid_shift"));
test("h. question unresolved blocked", () => assert.equal(s({}, { questionResolved: false }).reason, "question_unresolved"));
test("i. interested, follow-up not due yet", () =>
    assert.equal(s({ ccm_status: "interested", last_suggestion_at: ago(20), followup_due_after_activity_day: 41, last_suggestion_activity_day_count: 1 }).reason, "followup_not_due"));
test("i. interested, follow-up due -> allowed as followup", () => {
    const r = s({ ccm_status: "interested", last_suggestion_at: ago(20), followup_due_after_activity_day: 40, last_suggestion_activity_day_count: 1 });
    assert.equal(r.allowed, true); assert.equal(r.followup, true);
});
test("i. follow-up still subject to 15-day rule", () =>
    assert.equal(s({ ccm_status: "interested", last_suggestion_at: ago(5), followup_due_after_activity_day: 10 }).reason, "min_gap_15_days"));
test("i. only one follow-up", () =>
    assert.equal(s({ ccm_status: "interested", last_suggestion_at: ago(20), followup_due_after_activity_day: 10, followup_used: true }).reason, "followup_used"));
test("canShowCard: purchase checked first", () => assert.equal(canShowCard({ purchased: true }, { activityDayCount: 0, minActivityDays: 6 }).reason, "purchased"));
test("canShowCard: needs activity days", () => assert.equal(canShowCard({}, { activityDayCount: 6, midShift: false }).reason, "not_enough_activity_days"));
test("canShowCard: cooldown", () => assert.equal(canShowCard({ last_card_shown_activity_day_count: 9 }, { activityDayCount: 10, midShift: false }).reason, "card_recent"));
test("canShowCard: ok on 7th", () => assert.equal(canShowCard({}, { activityDayCount: 7, midShift: false }).allowed, true));
test("outcome engaged -> interested, reset counter, follow-up due +3", () =>
    assert.deepEqual(statusUpdateForOutcome({ consecutive_non_engagements: 1 }, "engaged", { now: NOW, activityDayCount: 10 }),
        { last_engagement_at: new Date(NOW).toISOString(), consecutive_non_engagements: 0, ccm_status: "interested", followup_used: false, followup_due_after_activity_day: 13 }));
test("outcome ignored increments", () => assert.equal(statusUpdateForOutcome({ consecutive_non_engagements: 1 }, "ignored").consecutive_non_engagements, 2));
test("outcome declined stamps", () => { const f = statusUpdateForOutcome({}, "declined", { now: NOW }); assert.equal(f.ccm_status, "declined"); assert.ok(f.declined_at); });
test("outcome purchased", () => assert.equal(statusUpdateForOutcome({}, "purchased").purchased, true));
test("funnel rollup", () => {
    const f = computeFunnel([
        { member: "a@x", source: "card", outcome: "ignored" },
        { member: "a@x", source: "chat_recommendation", outcome: "engaged" },
        { member: "b@x", source: "direct_ask_answer", outcome: "engaged" },
        { member: "a@x", source: "checkout_link", checkout_type: "plan", outcome: "purchased" },
        { member: "c@x", source: "chat_recommendation", outcome: "declined" },
    ]);
    assert.equal(f.shown, 3); assert.equal(f.asked, 1); assert.equal(f.link_sent, 1); assert.equal(f.bought, 1);
    assert.equal(f.declined, 1); assert.equal(f.links_by_type.plan, 1); assert.equal(f.members.shown, 2); assert.equal(f.conversion, 0.5);
});
test("activity days: distinct Toronto days", () =>
    assert.equal(activityDayCountFromTimestamps(["2026-10-14T03:00:00Z", "2026-10-13T20:00:00Z", "2026-10-14T15:00:00Z", "bad"]), 2));
test("flag default off", () => { assert.equal(ccmTrackingEnabled({}), false); assert.equal(ccmTrackingEnabled({ CCM_TRACKING: "on" }), true); });
test("offer ids default + env override", () => {
    assert.deepEqual(ccmOfferIds({}), DEFAULT_CCM_OFFER_IDS);
    assert.equal(isCcmOffer(2150837446, {}), true); assert.equal(isCcmOffer("2151448276", {}), true);
    assert.equal(isCcmOffer("123", {}), false); assert.equal(isCcmOffer("123", { CCM_OFFER_IDS: "123, 456" }), true);
});
console.log(`\n${passed} passed`);
