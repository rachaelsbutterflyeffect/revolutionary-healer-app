// Tester flag: who counts as a tester, and when the optional is_test checkbox
// is attached. No network and no Airtable writes. Run: npm run test:testers
import assert from "node:assert/strict";
import {
    DEFAULT_TESTER_EMAILS,
    configuredTesterEmails,
    isTester,
    testerRecordFields,
    isUnknownAirtableField,
} from "../lib/testers.js";

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

const env = {};

test("defaults include Rachael and Ray", () => {
    assert.deepEqual(configuredTesterEmails(env), DEFAULT_TESTER_EMAILS);
    assert.equal(isTester("rachaelsbutterflyeffect@gmail.com", env), true);
    assert.equal(isTester("  Rachael.Ball08@gmail.com ", env), true);
});

test("a real member is not a tester", () => {
    assert.equal(isTester("member@example.com", env), false);
    assert.equal(isTester("", env), false);
    assert.equal(isTester(null, env), false);
});

test("QA aliases are testers even when not listed", () => {
    assert.equal(isTester("rachaelsbutterflyeffect+gapqa@gmail.com", env), true);
    assert.equal(isTester("rachaelsbutterflyeffect+gapqa4@gmail.com", env), true);
    assert.equal(isTester("claude-qa-shiftbug-20260922@rachaelsbutterflyeffect.com", env), true);
    assert.equal(isTester("claude-qa-test-20260922@gmail.com", env), false);
});

test("TESTER_EMAILS overrides the named list but not QA patterns", () => {
    const custom = { TESTER_EMAILS: "extra@example.com" };
    assert.equal(isTester("extra@example.com", custom), true);
    assert.equal(isTester("rachaelsbutterflyeffect@gmail.com", custom), false);
    assert.equal(isTester("someone+gapqa@example.com", custom), true);
});

test("is_test is not sent unless TESTER_RECORD_FIELD=is_test", () => {
    assert.deepEqual(testerRecordFields("rachael.ball08@gmail.com", env), {});
    assert.deepEqual(testerRecordFields("rachael.ball08@gmail.com", { TESTER_RECORD_FIELD: "is_test" }), { is_test: true });
    assert.deepEqual(testerRecordFields("member@example.com", { TESTER_RECORD_FIELD: "is_test" }), {});
});

test("unknown-field detection is specific to the column name", () => {
    assert.equal(isUnknownAirtableField({ error: "UNKNOWN_FIELD_NAME", message: "Unknown field name: is_test" }, "is_test"), true);
    assert.equal(isUnknownAirtableField({ error: "UNKNOWN_FIELD_NAME", message: "Unknown field name: todays_focus" }, "is_test"), false);
    assert.equal(isUnknownAirtableField({ error: "UNKNOWN_FIELD_NAME", message: "Unknown field name: todays_focus" }, "todays_focus"), true);
});

if (process.exitCode) {
    console.error("tester tests failed");
} else {
    console.log(`\n${passed} passed`);
}
