// Unit tests for entitlement derivation. Spec ref: SPEC.md §6 ("Access logic gets
// its own unit tests, because eligibility is exactly the kind of thing that breaks
// silently.") Run with: npm run test:entitlements
import assert from "node:assert/strict";
import { deriveEntitlement } from "../lib/entitlements.js";

const now = new Date("2026-08-03T12:00:00Z");
let passed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`FAIL - ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

test("no account => no access", () => {
  const e = deriveEntitlement(null, now);
  assert.equal(e.hasAccount, false);
  assert.equal(e.canUseBase, false);
  assert.equal(e.canUseTier, false);
});

test("active member => base access, no tier", () => {
  const e = deriveEntitlement({ member_active: true, tier_active: false }, now);
  assert.equal(e.canUseBase, true);
  assert.equal(e.canUseTier, false);
});

test("active member + tier => both", () => {
  const e = deriveEntitlement({ member_active: true, tier_active: true }, now);
  assert.equal(e.canUseBase, true);
  assert.equal(e.canUseTier, true);
});

test("fresh trial with chats remaining => base access", () => {
  const e = deriveEntitlement(
    { member_active: false, trial_started_at: "2026-08-01", chat_count: 2 },
    now
  );
  assert.equal(e.onTrial, true);
  assert.equal(e.canUseBase, true);
});

test("expired trial => no base access", () => {
  const e = deriveEntitlement(
    { member_active: false, trial_started_at: "2026-07-01", chat_count: 2 },
    now
  );
  assert.equal(e.trialExpired, true);
  assert.equal(e.canUseBase, false);
});

test("trial with chat limit used up => no base access", () => {
  const e = deriveEntitlement(
    { member_active: false, trial_started_at: "2026-08-01", chat_count: 999 },
    now
  );
  assert.equal(e.trialChatsRemaining, 0);
  assert.equal(e.canUseBase, false);
});

test("tier is additive: cancelling base does not imply cancelling tier", () => {
  const e = deriveEntitlement({ member_active: false, tier_active: true }, now);
  assert.equal(e.canUseTier, true);
});

console.log(`\n${passed} passed`);
