// Five-day upgrade line: two buyers, days 5/4 hidden, 3/2/1 wording, 0 hidden,
// a current member hidden, and a cancelled member with an RH purchase hidden.
import assert from "node:assert/strict";
import fs from "node:fs";
import { deriveEntitlement } from "../lib/entitlements.js";
import {
    FIVE_DAY_UPGRADE_CHECKOUT_URL,
    decideFiveDayUpgradeBanner,
    fiveDayUpgradeBannerCopy,
    resolveFiveDayUpgradeBanner,
} from "../lib/fiveDayUpgradeBanner.js";

const now = new Date("2026-11-07T12:00:00.000Z");
const day = 24 * 60 * 60 * 1000;
const root = new URL("..", import.meta.url);
let passed = 0;
const pending = [];

function test(name, fn) {
    const finish = (err) => {
        if (err) {
            console.error("FAIL - " + name);
            console.error(err);
            process.exitCode = 1;
            return;
        }
        passed++;
        console.log("ok - " + name);
    };
    try {
        const result = fn();
        if (result && typeof result.then === "function") pending.push(result.then(() => finish(), finish));
        else finish();
    } catch (err) {
        finish(err);
    }
}

function endsIn(days) {
    return new Date(now.getTime() + days * day).toISOString();
}

function buyer(endsAt, extra = {}) {
    const fields = { member_active: false, rr_pass_ends_at: endsAt, ...extra };
    return { fields, entitlement: deriveEntitlement(fields, now) };
}

function decide(endsAt, extra = {}, history = {}) {
    const { fields, entitlement } = buyer(endsAt, extra);
    return decideFiveDayUpgradeBanner({
        entitlement,
        memberFields: fields,
        webhookOfferIds: history.webhookOfferIds || ["2151496665"],
        otherOfferIds: history.otherOfferIds || [],
        historyOk: history.historyOk !== false,
        env: history.env || {},
    });
}

test("two buyers with different end times are judged separately", () => {
    const early = buyer(endsIn(5));
    const late = buyer(endsIn(2));
    assert.notEqual(early.fields.rr_pass_ends_at, late.fields.rr_pass_ends_at);
    assert.equal(early.entitlement.fiveDayPassDaysRemaining, 5);
    assert.equal(late.entitlement.fiveDayPassDaysRemaining, 2);
    const earlyDecision = decideFiveDayUpgradeBanner({
        entitlement: early.entitlement, memberFields: early.fields, webhookOfferIds: ["2151496665"], historyOk: true, env: {},
    });
    const lateDecision = decideFiveDayUpgradeBanner({
        entitlement: late.entitlement, memberFields: late.fields, webhookOfferIds: ["2151496665"], historyOk: true, env: {},
    });
    assert.equal(earlyDecision.show, false);
    assert.equal(earlyDecision.reason, "days");
    assert.equal(lateDecision.show, true);
    assert.equal(lateDecision.copy, "Full access, 2 days left · Upgrade today, $30 a month");
    assert.equal(earlyDecision.show, false);
});

test("days 5 and 4 stay hidden", () => {
    assert.equal(decide(endsIn(5)).show, false);
    assert.equal(decide(endsIn(4)).show, false);
    assert.equal(decide(endsIn(4)).daysRemaining, 4);
    assert.equal(fiveDayUpgradeBannerCopy(5), "");
    assert.equal(fiveDayUpgradeBannerCopy(4), "");
});

test("days 3, 2, and 1 use the upgrade line, and 1 is singular", () => {
    const three = decide(endsIn(3));
    const two = decide(endsIn(2));
    const one = decide(endsIn(1));
    assert.equal(three.show, true);
    assert.equal(three.copy, "Full access, 3 days left · Upgrade today, $30 a month");
    assert.equal(two.show, true);
    assert.equal(two.copy, "Full access, 2 days left · Upgrade today, $30 a month");
    assert.equal(one.show, true);
    assert.equal(one.daysRemaining, 1);
    assert.equal(one.copy, "Full access, 1 day left · Upgrade today, $30 a month");
    assert.equal(fiveDayUpgradeBannerCopy(1).includes("1 days"), false);
});

test("day 0 and an ended pass stay hidden", () => {
    const ended = decide(now.toISOString());
    const past = decide(new Date(now.getTime() - day).toISOString());
    assert.equal(ended.daysRemaining, 0);
    assert.equal(ended.show, false);
    assert.equal(past.show, false);
    assert.equal(past.reason, "no_active_pass");
});

test("a current member is hidden even on day 2 of a pass", () => {
    const active = decide(endsIn(2), { member_active: true });
    const tier = decide(endsIn(2), { tier_active: true });
    assert.equal(active.show, false);
    assert.equal(active.reason, "member");
    assert.equal(tier.show, false);
    assert.equal(tier.reason, "member");
});

test("a cancelled member with an RH purchase on record is hidden", () => {
    const decision = decide(endsIn(2), { member_active: false }, { webhookOfferIds: ["2151318869"] });
    assert.equal(decision.show, false);
    assert.equal(decision.reason, "rh_purchase");
    for (const offerId of ["2151318870", "2151324815", "2151324817"]) {
        assert.equal(decide(endsIn(3), {}, { webhookOfferIds: [offerId] }).show, false, offerId);
    }
    const pass = buyer(endsIn(1));
    const envDecision = decideFiveDayUpgradeBanner({
        entitlement: pass.entitlement,
        memberFields: pass.fields,
        webhookOfferIds: ["2151496665"],
        otherOfferIds: ["2151330100"],
        historyOk: true,
        env: { MEMBER_OFFER_IDS: "2151330100" },
    });
    assert.equal(envDecision.show, false);
    assert.equal(envDecision.reason, "rh_purchase");
});

test("beta and DLRH stay hidden, and a gap purchase does not", () => {
    const beta = decide(endsIn(3), { beta_member_started_at: "2020-01-01T00:00:00.000Z" });
    const dlrh = decide(endsIn(2), { dlrh_member_started_at: "2026-10-01T00:00:00.000Z" });
    assert.equal(beta.show, false);
    assert.equal(beta.reason, "beta_or_dlrh");
    assert.equal(dlrh.show, false);
    assert.equal(dlrh.reason, "beta_or_dlrh");
    assert.equal(decide(endsIn(1), {}, { otherOfferIds: ["2151330100"] }).show, true);
    assert.equal(decide(endsIn(1), {}, { webhookOfferIds: ["2151496665", "2150837446"] }).show, true);
});

test("a blank, unknown, or failed purchase lookup hides the line", () => {
    assert.equal(decide(endsIn(2), {}, { webhookOfferIds: [""] }).show, false);
    assert.equal(decide(endsIn(2), {}, { webhookOfferIds: ["999999"] }).show, false);
    assert.equal(decide(endsIn(2), {}, { historyOk: false }).show, false);
    assert.equal(decide(endsIn(2), {}, { historyOk: false }).reason, "history_unavailable");
    const withMonthly = decide(endsIn(2), {}, { webhookOfferIds: ["2151496665", "2151318869"] });
    assert.equal(withMonthly.show, false);
});

test("the purchase lookup is skipped unless the pass would qualify, and a failed lookup hides it", async () => {
    let calls = 0;
    const dayFive = buyer(endsIn(5));
    const skipped = await resolveFiveDayUpgradeBanner({
        entitlement: dayFive.entitlement,
        memberFields: dayFive.fields,
        loadOfferIds: async () => { calls += 1; return { ok: true, webhookOfferIds: [], otherOfferIds: [] }; },
        env: {},
    });
    assert.equal(skipped.show, false);
    assert.equal(calls, 0);
    const dayTwo = buyer(endsIn(2));
    const failed = await resolveFiveDayUpgradeBanner({
        entitlement: dayTwo.entitlement,
        memberFields: dayTwo.fields,
        loadOfferIds: async () => { calls += 1; throw new Error("airtable down"); },
        env: {},
    });
    assert.equal(failed.show, false);
    assert.equal(failed.reason, "history_unavailable");
    const unclear = await resolveFiveDayUpgradeBanner({
        entitlement: dayTwo.entitlement,
        memberFields: dayTwo.fields,
        loadOfferIds: async () => ({ ok: false }),
        env: {},
    });
    assert.equal(unclear.show, false);
    const shown = await resolveFiveDayUpgradeBanner({
        entitlement: dayTwo.entitlement,
        memberFields: dayTwo.fields,
        loadOfferIds: async () => ({ ok: true, webhookOfferIds: ["2151496665"], otherOfferIds: [] }),
        env: {},
    });
    assert.equal(shown.show, true);
    assert.equal(shown.copy, "Full access, 2 days left · Upgrade today, $30 a month");
    assert.equal(calls, 1);
});

test("both home screens carry one hidden gold line to the live monthly checkout", () => {
    const refresh = fs.readFileSync(new URL("./public/app-refresh.html", root), "utf8");
    const classic = fs.readFileSync(new URL("./public/app.html", root), "utf8");
    const banner = /<p class="rf-pass-banner" id="rf-pass-banner" hidden><span class="rf-pass-gold">Full access, <span id="rf-pass-banner-count">3 days left<\/span> · <\/span><a class="rf-pass-link" href="https:\/\/www\.rachaelsbutterflyeffect\.com\/offers\/rkwoQv2s\/checkout"[^>]*>Upgrade today, \$30 a month<\/a><\/p>/;
    assert.match(refresh, banner);
    assert.match(classic, banner);
    assert.equal(refresh.indexOf('id="rf-pass-banner"') < refresh.indexOf('class="rf-top"'), true);
    assert.equal(classic.indexOf('id="rf-pass-banner"') < classic.indexOf("<nav>"), true);
    for (const html of [refresh, classic]) {
        const el = html.match(/<p class="rf-pass-banner"[\s\S]*?<\/p>/)[0];
        assert.equal(el.includes("26bJnuRE"), false);
        assert.equal(el.includes(FIVE_DAY_UPGRADE_CHECKOUT_URL), true);
        assert.match(html, /showFiveDayUpgradeBanner === true/);
        assert.match(html, /fiveDayPassDaysRemaining/);
        assert.match(html, /1 day left/);
        assert.match(html, /#rf-pass-banner[\s\S]*white-space:\s*nowrap/);
        assert.match(html, /#rf-pass-banner[\s\S]*font-size:\s*12px/);
        assert.match(html, /#06080b/);
        assert.match(html, /#e8c873/);
        assert.match(html, /#fff1c4/);
        assert.match(html, /#b8913f/);
        assert.match(html, /text-decoration:\s*underline/);
    }
});

await Promise.all(pending);
if (process.exitCode) console.error("five-day upgrade banner tests failed");
else console.log(`\n${passed} passed`);
