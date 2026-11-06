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

function productlessPurchase(purchaseId, purchasedAt) {
    return readKajabiWebhook({
        id: purchaseId,
        event: "purchase.created",
        created_at: purchasedAt,
        payload: {
            member_email: "fixture-buyer@example.com",
            offer_id: 2151496665,
            amount_paid: 1550,
            currency: "USD",
        },
    });
}

const tests = [];
const it = (name, fn) => tests.push(test(name, fn));

it("a productless purchase, duplicate, extension, refund, and retry do not grant permanent access", async () => {
    const store = memoryStore();
    const first = productlessPurchase("txn-1", start.toISOString());
    const created = await processKajabiPurchase({
        email: first.email, offerId: first.offerId, eventType: first.eventType, purchaseId: first.purchaseId, purchasedAt: first.purchasedAt, env, store,
    });
    assert.equal(created.outcome, "created");
    assert.equal(created.sendEmail, false);
    const member = store.members.get(first.email);
    assert.equal(member.fields.member_active, false);
    assert.equal(member.fields.tier_active, undefined);
    assert.equal(member.fields.rr_pass_purchase_ids, "txn-1");
    const firstEnd = member.fields.rr_pass_ends_at;
    const duplicate = await processKajabiPurchase({
        email: first.email, offerId: first.offerId, eventType: "purchase", purchaseId: "txn-1",
        purchasedAt: new Date(start.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString(), env, store,
    });
    assert.equal(duplicate.outcome, "already_existed");
    assert.equal(store.members.get(first.email).fields.rr_pass_ends_at, firstEnd);
    const extended = await processKajabiPurchase({
        email: first.email, offerId: first.offerId, eventType: "purchase.created", purchaseId: "txn-2",
        now: new Date(start.getTime() + 24 * 60 * 60 * 1000), env, store,
    });
    assert.equal(extended.outcome, "already_existed");
    assert.equal(
        store.members.get(first.email).fields.rr_pass_ends_at,
        new Date(new Date(firstEnd).getTime() + FIVE_DAY_PASS_MS).toISOString()
    );
    await processKajabiPurchase({
        email: first.email, offerId: first.offerId, eventType: "refund", purchaseId: "txn-2",
        now: new Date(start.getTime() + 2 * 24 * 60 * 60 * 1000), env, store,
    });
    const retry = await processKajabiPurchase({
        email: first.email, offerId: first.offerId, eventType: "purchase", purchaseId: "txn-2",
        now: new Date(start.getTime() + 3 * 24 * 60 * 60 * 1000), env, store,
    });
    assert.equal(retry.sendEmail, false);
    const afterRetry = deriveEntitlement(store.members.get(first.email).fields, new Date(start.getTime() + 3 * 24 * 60 * 60 * 1000));
    assert.equal(afterRetry.onFiveDayPass, true);
    assert.equal(store.members.get(first.email).fields.rr_pass_ends_at, firstEnd);
    assert.equal(store.members.get(first.email).fields.member_active, false);
});

it("missing id, unknown offer, and the monthly offer do not cross wires", async () => {
    const store = memoryStore();
    const missing = await processKajabiPurchase({
        email: "fixture-buyer@example.com", offerId: "2151496665", eventType: "purchase", env, store,
    });
    assert.equal(missing.outcome, "missing_transaction_id");
    const unknown = await processKajabiPurchase({
        email: "fixture-buyer@example.com", offerId: "999", eventType: "purchase", purchaseId: "txn-x", env, store,
    });
    assert.equal(unknown.outcome, "ignored_offer");
    const noOffer = await processKajabiPurchase({
        email: "fixture-buyer@example.com", eventType: "purchase", purchaseId: "txn-y", env, store,
    });
    assert.equal(noOffer.outcome, "ignored_offer");
    assert.equal(store.members.size, 0);
    const monthly = await processKajabiPurchase({
        email: "member@example.com", offerId: "2151330620", eventType: "purchase", purchaseId: "txn-month", env, store,
    });
    assert.equal(monthly.outcome, "created");
    assert.equal(store.members.get("member@example.com").fields.member_active, true);
    assert.equal(store.members.get("member@example.com").fields.rr_pass_ends_at, undefined);
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
    assert.match(REFUND_PAYLOAD_NOTE, /has not been confirmed/);
    assert.match(REFUND_PAYLOAD_NOTE, /manual revoke/);
});

await tests.reduce((chain, next) => chain.then(() => next), Promise.resolve());
if (process.exitCode) console.error("kajabi purchase tests failed");
else console.log(`\n${passed} passed`);
