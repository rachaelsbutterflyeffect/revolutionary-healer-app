import assert from "node:assert/strict";
import { deriveEntitlement, hasSignInAccess } from "../lib/entitlements.js";
import {
    APP_SIGN_IN_URL, FIVE_DAY_PASS_MS, PURCHASE_EMAIL_DRAFT, fiveDayPassState, isFiveDayOffer, planFiveDayPass,
} from "../lib/fiveDayPass.js";

const offerEnv = { RR_FIVE_DAY_OFFER_IDS: "fixture-rr-1550" };
const now = new Date("2026-11-06T15:00:00Z");
const day = 24 * 60 * 60 * 1000;
let passed = 0;

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log("ok - " + name);
    } catch (err) {
        console.error("FAIL - " + name);
        console.error(err);
        process.exitCode = 1;
    }
}

test("the offer is unbound until its id is configured", () => {
    assert.equal(isFiveDayOffer("fixture-rr-1550", {}), false);
    assert.equal(isFiveDayOffer("fixture-rr-1550", offerEnv), true);
    assert.equal(isFiveDayOffer("2151324817", offerEnv), false);
    assert.equal(isFiveDayOffer("", offerEnv), false);
});

test("a new purchase grants five days and does not touch membership flags", () => {
    const plan = planFiveDayPass({ existingFields: null, eventType: "purchase", now });
    assert.deepEqual(Object.keys(plan.patch), ["rr_pass_started_at"]);
    assert.equal(plan.sendEmail, false);
    assert.equal(plan.patch.member_active, undefined);
    assert.equal(plan.patch.tier_active, undefined);
    assert.equal(plan.patch.password_hash, undefined);
    const entitlement = deriveEntitlement({ rr_pass_started_at: now.toISOString() }, now);
    assert.equal(entitlement.onFiveDayPass, true);
    assert.equal(entitlement.canUseBase, true);
    assert.equal(entitlement.canUseTier, true);
    assert.equal(entitlement.unlockedActivationSlugs, "ALL");
    assert.equal(hasSignInAccess(entitlement), true);
    assert.equal(entitlement.fiveDayPassEndsAt, new Date(now.getTime() + FIVE_DAY_PASS_MS).toISOString());
});

test("the pass is active through five days and closed after that", () => {
    const started = now.toISOString();
    const during = deriveEntitlement({ rr_pass_started_at: started }, new Date(now.getTime() + FIVE_DAY_PASS_MS - 1));
    const after = deriveEntitlement({ rr_pass_started_at: started }, new Date(now.getTime() + FIVE_DAY_PASS_MS));
    assert.equal(during.onFiveDayPass, true);
    assert.equal(during.memberActive, false);
    assert.equal(after.onFiveDayPass, false);
    assert.equal(after.fiveDayPassExpired, true);
    assert.equal(after.canUseTier, false);
    assert.equal(hasSignInAccess(after), false);
});

test("an existing membership is not shortened or replaced", () => {
    const existing = {
        member_active: true,
        tier_active: true,
        beta_member_started_at: "2026-08-01T00:00:00Z",
        dlrh_member_started_at: "2026-10-01T00:00:00Z",
        password_hash: "already-set",
    };
    const plan = planFiveDayPass({ existingFields: existing, eventType: "purchase", now });
    assert.equal("member_active" in plan.patch, false);
    assert.equal("tier_active" in plan.patch, false);
    assert.equal("beta_member_started_at" in plan.patch, false);
    assert.equal("dlrh_member_started_at" in plan.patch, false);
    assert.equal("password_hash" in plan.patch, false);
    const entitlement = deriveEntitlement({ ...existing, ...plan.patch }, new Date(now.getTime() + 10 * day));
    assert.equal(entitlement.memberActive, true);
    assert.equal(entitlement.tierActive, true);
    assert.equal(entitlement.canUseTier, true);
    assert.equal(entitlement.onFiveDayPass, false);
});

test("a repeated delivery during the window does not restart the clock", () => {
    const started = new Date(now.getTime() - day).toISOString();
    const plan = planFiveDayPass({ existingFields: { rr_pass_started_at: started }, eventType: "purchase", now });
    assert.deepEqual(plan.patch, {});
    assert.equal(plan.alreadyActive, true);
    assert.equal(fiveDayPassState({ rr_pass_started_at: started }, now).endsAt, new Date(new Date(started).getTime() + FIVE_DAY_PASS_MS).toISOString());
});

test("a refund ends the pass and leaves a paid membership in place", () => {
    const existing = { member_active: true, tier_active: true, rr_pass_started_at: now.toISOString() };
    const plan = planFiveDayPass({ existingFields: existing, eventType: "refund", now: new Date(now.getTime() + day) });
    assert.deepEqual(Object.keys(plan.patch), ["rr_pass_revoked_at"]);
    const entitlement = deriveEntitlement({ ...existing, ...plan.patch }, new Date(now.getTime() + day));
    assert.equal(entitlement.onFiveDayPass, false);
    assert.equal(entitlement.memberActive, true);
    assert.equal(entitlement.tierActive, true);
    assert.equal(entitlement.canUseTier, true);
});

test("an email without this offer does not grant the pass", () => {
    assert.equal(isFiveDayOffer(undefined, offerEnv), false);
    const unrelated = deriveEntitlement({ email: "buyer@example.com" }, now);
    assert.equal(unrelated.onFiveDayPass, false);
    assert.equal(hasSignInAccess(unrelated), false);
});

test("the inactive purchase note tells the truth about sign-in", () => {
    assert.match(PURCHASE_EMAIL_DRAFT, new RegExp(APP_SIGN_IN_URL.replace(/[.]/g, "\\.")));
    assert.match(PURCHASE_EMAIL_DRAFT, /at least 6 characters/);
    assert.match(PURCHASE_EMAIL_DRAFT, /Already have an app password/);
    assert.match(PURCHASE_EMAIL_DRAFT, /does not check a Kajabi password/);
    assert.doesNotMatch(PURCHASE_EMAIL_DRAFT, /use your Kajabi password/i);
    assert.doesNotMatch(PURCHASE_EMAIL_DRAFT, /course/i);
    assert.doesNotMatch(PURCHASE_EMAIL_DRAFT, /\bsend\b/i);
});

if (process.exitCode) console.error("five-day pass tests failed");
else console.log(`\n${passed} passed`);
