// processKajabiPurchase against a fake member store. No Airtable and no email.
import assert from "node:assert/strict";
import { processKajabiPurchase } from "../lib/airtable.js";
import { decideAppLogin, hashPassword } from "../lib/auth.js";
import { deriveEntitlement, hasSignInAccess } from "../lib/entitlements.js";
import { FIVE_DAY_PASS_MS, REFUND_PAYLOAD_NOTE, readKajabiWebhook } from "../lib/fiveDayPass.js";

const env = { MEMBER_OFFER_IDS: "2151330620", RR_FIVE_DAY_OFFER_IDS: "" };
const start = new Date("2026-11-06T15:00:00Z");
let passed = 0;

function test(name, fn) {
    return Promise.resolve().then(fn).then(() => {
        passed++;
        console.log("ok - " + name);
    }, (err) => {
        console.error("FAIL - " + name);
        console.error(err);
        process.exitCode = 1;
    });
}

function memoryStore() {
    const members = new Map();
    let seq = 1;
    return {
        members,
        async getMemberByEmail(email) {
            return members.get(email) || null;
        },
        async writeRow(action, _table, id, fields) {
            if (action === "create") {
                const record = { id: `rec${seq++}`, fields: { ...fields } };
                members.set(fields.email, record);
                return record;
            }
            const record = [...members.values()].find((item) => item.id === id);
            record.fields = { ...record.fields, ...fields };
            return record;
        },
    };
}

function paymentSucceeded({ eventId, transactionId, purchasedAt, eventAt, offerId }) {
    return readKajabiWebhook({
        id: eventId,
        event: "payment.succeeded",
        created_at: eventAt,
        offer: { id: offerId, title: "Fixture offer", type: "one-time" },
        member: { email: "fixture-buyer@example.com", first_name: "Fixture" },
        payment_transaction: { id: transactionId, created_at: purchasedAt, currency: "USD", amount_paid: 1550 },
    });
}

const tests = [];
const it = (name, fn) => tests.push(test(name, fn));

it("a productless payment.succeeded grants five days from the transaction, and a new event uuid does not extend it", async () => {
    const store = memoryStore();
    const first = paymentSucceeded({
        eventId: "11111111-1111-4111-8111-111111111111",
        transactionId: 55555,
        purchasedAt: start.toISOString(),
        eventAt: "2026-11-06T18:00:00.000Z",
        offerId: 2151496665,
    });
    const created = await processKajabiPurchase({
        email: first.email, offerId: first.offerId, eventType: first.eventType, purchaseId: first.purchaseId, purchasedAt: first.purchasedAt, env, store,
    });
    assert.equal(created.outcome, "created");
    assert.equal(created.sendEmail, false);
    const member = store.members.get(first.email);
    assert.equal(member.fields.member_active, false);
    assert.equal(member.fields.tier_active, undefined);
    assert.equal(member.fields.rr_pass_purchase_ids, "55555");
    assert.equal(member.fields.rr_pass_ends_at, new Date(start.getTime() + FIVE_DAY_PASS_MS).toISOString());
    const firstEnd = member.fields.rr_pass_ends_at;
    const duplicateDelivery = paymentSucceeded({
        eventId: "22222222-2222-4222-8222-222222222222",
        transactionId: "55555",
        purchasedAt: start.toISOString(),
        eventAt: "2026-11-08T18:00:00.000Z",
        offerId: 2151496665,
    });
    const duplicate = await processKajabiPurchase({
        email: duplicateDelivery.email, offerId: duplicateDelivery.offerId, eventType: duplicateDelivery.eventType, purchaseId: duplicateDelivery.purchaseId,
        purchasedAt: duplicateDelivery.purchasedAt, env, store,
    });
    assert.equal(duplicate.outcome, "already_existed");
    assert.equal(store.members.get(first.email).fields.rr_pass_ends_at, firstEnd);
    const second = paymentSucceeded({
        eventId: "33333333-3333-4333-8333-333333333333",
        transactionId: 66666,
        purchasedAt: new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        eventAt: new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        offerId: 2151496665,
    });
    const extended = await processKajabiPurchase({
        email: second.email, offerId: second.offerId, eventType: second.eventType, purchaseId: second.purchaseId,
        purchasedAt: second.purchasedAt, env, store,
    });
    assert.equal(extended.outcome, "already_existed");
    assert.equal(
        store.members.get(first.email).fields.rr_pass_ends_at,
        new Date(new Date(firstEnd).getTime() + FIVE_DAY_PASS_MS).toISOString()
    );
    const beforeRefund = store.members.get(first.email).fields.rr_pass_ends_at;
    const refund = await processKajabiPurchase({
        email: first.email, offerId: first.offerId, eventType: "refund", purchaseId: "55555",
        now: new Date(start.getTime() + 2 * 24 * 60 * 60 * 1000), env, store,
    });
    assert.equal(refund.outcome, "already_existed");
    assert.equal(store.members.get(first.email).fields.rr_pass_ends_at, beforeRefund);
    assert.equal(store.members.get(first.email).fields.member_active, false);
});

it("an expired purchase refund does not shorten the next pass, and legacy offers still fulfill", async () => {
    const store = memoryStore();
    const older = paymentSucceeded({
        eventId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        transactionId: "txn-a",
        purchasedAt: start.toISOString(),
        eventAt: start.toISOString(),
        offerId: 2151496665,
    });
    await processKajabiPurchase({
        email: older.email, offerId: older.offerId, eventType: older.eventType, purchaseId: older.purchaseId, purchasedAt: older.purchasedAt, env, store,
    });
    const later = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
    const newer = paymentSucceeded({
        eventId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        transactionId: "txn-b",
        purchasedAt: later.toISOString(),
        eventAt: later.toISOString(),
        offerId: 2151496665,
    });
    await processKajabiPurchase({
        email: newer.email, offerId: newer.offerId, eventType: newer.eventType, purchaseId: newer.purchaseId, purchasedAt: newer.purchasedAt, env, store,
    });
    const paidEnd = store.members.get(older.email).fields.rr_pass_ends_at;
    await processKajabiPurchase({
        email: older.email, offerId: older.offerId, eventType: "refund", purchaseId: "txn-a", now: new Date(later.getTime() + 24 * 60 * 60 * 1000), env, store,
    });
    assert.equal(store.members.get(older.email).fields.rr_pass_ends_at, paidEnd);
    assert.equal(paidEnd, new Date(later.getTime() + FIVE_DAY_PASS_MS).toISOString());
    const missing = await processKajabiPurchase({
        email: "fixture-buyer@example.com", offerId: "2151496665", eventType: "payment.succeeded", env, store,
    });
    assert.equal(missing.outcome, "missing_transaction_id");
    const noOffer = await processKajabiPurchase({
        email: "other@example.com", eventType: "payment.succeeded", purchaseId: "txn-y", env, store,
    });
    assert.equal(noOffer.outcome, "ignored_offer");
    assert.equal(store.members.has("other@example.com"), false);
    const monthly = await processKajabiPurchase({
        email: "member@example.com", offerId: "2151330620", eventType: "payment.succeeded", purchaseId: "txn-month", env, store,
    });
    assert.equal(monthly.outcome, "created");
    assert.equal(store.members.get("member@example.com").fields.member_active, true);
    assert.equal(store.members.get("member@example.com").fields.rr_pass_ends_at, undefined);
    const legacy = await processKajabiPurchase({
        email: "mentorship@example.com", offerId: "2148880001", eventType: "payment.succeeded", purchaseId: "txn-legacy", env, store,
    });
    assert.equal(legacy.outcome, "created");
    assert.equal(store.members.get("mentorship@example.com").fields.member_active, true);
    assert.equal(store.members.get("mentorship@example.com").fields.rr_pass_ends_at, undefined);
});

it("an existing member keeps membership and password when buying the pass", async () => {
    const store = memoryStore();
    store.members.set("member@example.com", {
        id: "rec-existing",
        fields: { email: "member@example.com", member_active: true, tier_active: true, password_hash: "kept" },
    });
    await processKajabiPurchase({
        email: "member@example.com", offerId: "2151496665", eventType: "purchase", purchaseId: "txn-9",
        purchasedAt: start.toISOString(), env, store,
    });
    const fields = store.members.get("member@example.com").fields;
    assert.equal(fields.member_active, true);
    assert.equal(fields.tier_active, true);
    assert.equal(fields.password_hash, "kept");
    assert.ok(fields.rr_pass_ends_at);
});

it("first sign-in, the saved app password, and expiry follow the pass", () => {
    const fields = {
        member_active: false,
        rr_pass_ends_at: new Date(start.getTime() + FIVE_DAY_PASS_MS).toISOString(),
        rr_pass_purchase_ids: "txn-1",
    };
    const active = deriveEntitlement(fields, start);
    assert.equal(hasSignInAccess(active), true);
    assert.equal(decideAppLogin({ entitlement: active, passwordHash: "", password: "short" }).code, "short_password");
    const created = decideAppLogin({ entitlement: active, passwordHash: "", password: "chosen-pass" });
    assert.equal(created.setPassword, true);
    const hash = hashPassword("chosen-pass");
    assert.equal(decideAppLogin({ entitlement: active, passwordHash: hash, password: "other-pass" }).code, "incorrect_password");
    assert.equal(decideAppLogin({ entitlement: active, passwordHash: hash, password: "chosen-pass" }).ok, true);
    const expired = deriveEntitlement(fields, new Date(start.getTime() + FIVE_DAY_PASS_MS));
    assert.equal(expired.onFiveDayPass, false);
    assert.equal(hasSignInAccess(expired), false);
    assert.equal(decideAppLogin({ entitlement: expired, passwordHash: hash, password: "chosen-pass" }).code, "inactive");
    const dlrh = deriveEntitlement({ dlrh_member_started_at: "2026-10-01T00:00:00Z" }, start);
    assert.equal(hasSignInAccess(dlrh), true);
    assert.match(REFUND_PAYLOAD_NOTE, /has not been verified/);
    assert.match(REFUND_PAYLOAD_NOTE, /manual revoke/);
});

await tests.reduce((chain, next) => chain.then(() => next), Promise.resolve());
if (process.exitCode) console.error("kajabi purchase tests failed");
else console.log(`\n${passed} passed`);
