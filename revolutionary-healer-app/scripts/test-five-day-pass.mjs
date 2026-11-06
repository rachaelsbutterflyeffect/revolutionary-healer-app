import assert from "node:assert/strict";
import { deriveEntitlement, hasSignInAccess } from "../lib/entitlements.js";
import {
    APP_SIGN_IN_URL, FIVE_DAY_PASS_MS, PURCHASE_EMAIL_DRAFT, REFUND_PAYLOAD_NOTE, RESET_RESTORE_OFFER_ID, fiveDayPassState, isFiveDayOffer, planFiveDayPass, readKajabiWebhook,
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

test("Reset and Restore 2151496665 is the five-day offer and the monthly offer is not", () => {
    assert.equal(RESET_RESTORE_OFFER_ID, "2151496665");
    assert.equal(isFiveDayOffer(2151496665, {}), true);
    assert.equal(isFiveDayOffer("2151496665", { RR_FIVE_DAY_OFFER_IDS: "something-else" }), true);
    assert.equal(isFiveDayOffer("2151330620", {}), false);
    assert.equal(isFiveDayOffer("fixture-rr-1550", {}), false);
    assert.equal(isFiveDayOffer("fixture-rr-1550", offerEnv), true);
    assert.equal(isFiveDayOffer("", offerEnv), false);
});

test("a productless purchase webhook still maps to the five-day pass", () => {
    const wrapped = readKajabiWebhook({
        id: "fixture-purchase-1",
        event: "purchase.created",
        payload: {
            member_email: "fixture-buyer@example.com",
            member_first_name: "Fixture",
            offer_id: 2151496665,
            offer_title: "Reset and Restore",
            amount_paid: 1550,
            currency: "USD",
        },
    });
    const flat = readKajabiWebhook({
        member: { email: "fixture-buyer@example.com", first_name: "Fixture" },
        offer: { id: 2151496665, title: "Reset and Restore" },
        event_type: "purchase",
    });
    for (const parsed of [wrapped, flat]) {
        assert.equal(parsed.email, "fixture-buyer@example.com");
        assert.equal(parsed.offerId, "2151496665");
        assert.equal(parsed.products, undefined);
        assert.equal(isFiveDayOffer(parsed.offerId, {}), true);
        const plan = planFiveDayPass({ existingFields: null, eventType: parsed.eventType, now, purchaseId: parsed.purchaseId || "flat-txn" });
        assert.equal(plan.patch.member_active, undefined);
        assert.ok(plan.patch.rr_pass_ends_at);
        assert.equal(plan.patch.member_active, undefined);
        assert.equal(plan.sendEmail, false);
    }
    assert.equal(wrapped.eventType, "purchase.created");
    assert.equal(wrapped.purchaseId, "fixture-purchase-1");
});

test("a live payment.succeeded uses the transaction id and purchase time, not the event uuid", () => {
    const first = readKajabiWebhook({
        id: "11111111-1111-4111-8111-111111111111",
        event: "payment.succeeded",
        created_at: "2026-11-06T18:00:00.000Z",
        offer: { id: 2151496665, title: "Reset and Restore", type: "one-time" },
        member: { id: 100, email: "fixture-buyer@example.com", name: "Fixture Buyer", first_name: "Fixture", last_name: "Buyer" },
        payment_transaction: {
            id: 55555,
            created_at: "2026-11-06T15:00:00.000Z",
            currency: "USD",
            amount_paid: 1550,
            payment_processor: "Kajabi Payments",
        },
    });
    const retry = readKajabiWebhook({
        id: "22222222-2222-4222-8222-222222222222",
        event: "payment.succeeded",
        created_at: "2026-11-08T18:00:00.000Z",
        offer: { id: "2151496665", title: "Reset and Restore" },
        member: { email: "fixture-buyer@example.com", first_name: "Fixture" },
        payment_transaction: { id: "55555", created_at: "2026-11-06T15:00:00.000Z" },
    });
    assert.equal(first.purchaseId, "55555");
    assert.equal(first.purchasedAt, "2026-11-06T15:00:00.000Z");
    assert.equal(first.offerId, "2151496665");
    assert.equal(first.eventType, "payment.succeeded");
    assert.notEqual(first.purchaseId, "11111111-1111-4111-8111-111111111111");
    assert.equal(retry.purchaseId, first.purchaseId);
    assert.equal(retry.purchasedAt, first.purchasedAt);
    const missingTransaction = readKajabiWebhook({
        id: "33333333-3333-4333-8333-333333333333",
        event: "payment.succeeded",
        created_at: "2026-11-06T18:00:00.000Z",
        offer: { id: 2151496665 },
        member: { email: "fixture-buyer@example.com" },
    });
    assert.equal(missingTransaction.purchaseId, "");
    const plan = planFiveDayPass({ existingFields: null, eventType: first.eventType, now, purchaseId: first.purchaseId, purchasedAt: first.purchasedAt });
    const duplicate = planFiveDayPass({ existingFields: plan.patch, eventType: retry.eventType, now: new Date("2026-11-08T18:00:00.000Z"), purchaseId: retry.purchaseId, purchasedAt: retry.purchasedAt });
    assert.deepEqual(duplicate.patch, {});
    assert.equal(plan.patch.rr_pass_ends_at, new Date(new Date(first.purchasedAt).getTime() + FIVE_DAY_PASS_MS).toISOString());
});

test("a new purchase grants five days and does not touch membership flags", () => {
    const plan = planFiveDayPass({ existingFields: null, eventType: "purchase", now, purchaseId: "txn-1" });
    assert.equal(plan.sendEmail, false);
    assert.equal(plan.patch.member_active, undefined);
    assert.equal(plan.patch.tier_active, undefined);
    assert.equal(plan.patch.password_hash, undefined);
    assert.equal(plan.patch.rr_pass_purchase_ids, "txn-1");
    const entitlement = deriveEntitlement(plan.patch, now);
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
    const plan = planFiveDayPass({ existingFields: existing, eventType: "purchase", now, purchaseId: "txn-existing" });
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

test("the same transaction does not extend, and a new one extends from the paid end", () => {
    const first = planFiveDayPass({ existingFields: null, eventType: "purchase", now, purchaseId: "txn-1", purchasedAt: now.toISOString() });
    const duplicate = planFiveDayPass({ existingFields: first.patch, eventType: "purchase.created", now: new Date(now.getTime() + day), purchaseId: "txn-1" });
    assert.deepEqual(duplicate.patch, {});
    const second = planFiveDayPass({ existingFields: first.patch, eventType: "purchase", now: new Date(now.getTime() + day), purchaseId: "txn-2" });
    assert.equal(second.patch.rr_pass_ends_at, new Date(new Date(first.patch.rr_pass_ends_at).getTime() + FIVE_DAY_PASS_MS).toISOString());
    assert.equal(fiveDayPassState({ rr_pass_started_at: now.toISOString() }, now).endsAt, new Date(now.getTime() + FIVE_DAY_PASS_MS).toISOString());
});

test("a refund of an expired purchase does not shorten a later purchase", () => {
    const older = planFiveDayPass({ existingFields: null, eventType: "payment.succeeded", now, purchaseId: "txn-a", purchasedAt: now.toISOString() });
    const afterExpiry = new Date(now.getTime() + 6 * day);
    const newer = planFiveDayPass({ existingFields: older.patch, eventType: "payment.succeeded", now: afterExpiry, purchaseId: "txn-b", purchasedAt: afterExpiry.toISOString() });
    const refundOlder = planFiveDayPass({ existingFields: { ...older.patch, ...newer.patch }, eventType: "refund", now: new Date(afterExpiry.getTime() + day), purchaseId: "txn-a" });
    assert.equal(refundOlder.manualRevoke, true);
    assert.deepEqual(refundOlder.patch, {});
    assert.equal(newer.patch.rr_pass_ends_at, new Date(afterExpiry.getTime() + FIVE_DAY_PASS_MS).toISOString());
    assert.match(REFUND_PAYLOAD_NOTE, /has not been verified/);
    assert.match(REFUND_PAYLOAD_NOTE, /manual revoke/);
    assert.match(REFUND_PAYLOAD_NOTE, /must not shorten a later purchase/);
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
