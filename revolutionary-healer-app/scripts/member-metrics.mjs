// Read-only real-member counts. Excludes tester accounts (Rachael, Ray, QA
// aliases) by email, so history is covered even before an is_test checkbox
// exists. This script only selects records. It never creates, updates, or
// deletes. Point AIRTABLE_API_KEY and AIRTABLE_BASE_ID at the base you want
// to count. Do not run it from automated tests against the live member base.
//
//   node scripts/member-metrics.mjs
import Airtable from "airtable";
import { isTester } from "../lib/testers.js";

const apiKey = process.env.AIRTABLE_API_KEY;
const baseId = process.env.AIRTABLE_BASE_ID;
if (!apiKey || !baseId) {
    console.error("Set AIRTABLE_API_KEY and AIRTABLE_BASE_ID. Nothing was read.");
    process.exit(1);
}

const TABLES = [
    { name: "Shifts", emailField: "member_email", methodField: "method_name" },
    { name: "GapMethodResults", emailField: "email" },
    { name: "ChatSessions", emailField: "member_email" },
    { name: "ChatMessages", emailField: "member_email" },
    { name: "MemberMemories", emailField: "member_email" },
    { name: "Members", emailField: "email" },
    { name: "ActivationCompletions", emailField: "member_email" },
    { name: "Favorites", emailField: "member_email" },
];

const base = new Airtable({ apiKey }).base(baseId);

function bucket(email) {
    return isTester(email) ? "tester" : "member";
}

const summary = [];
for (const table of TABLES) {
    const fields = [table.emailField];
    if (table.methodField) fields.push(table.methodField);
    const records = await base(table.name).select({ fields }).all();
    const counts = { total: records.length, tester: 0, member: 0, gapTester: 0, gapMember: 0 };
    const people = { tester: new Set(), member: new Set() };
    for (const record of records) {
        const email = String(record.fields[table.emailField] || "").trim().toLowerCase();
        const side = bucket(email);
        counts[side] += 1;
        if (email) people[side].add(email);
        if (table.methodField && record.fields[table.methodField] === "GAP Method") {
            counts[side === "tester" ? "gapTester" : "gapMember"] += 1;
        }
    }
    const row = {
        table: table.name,
        total: counts.total,
        testerRows: counts.tester,
        realMemberRows: counts.member,
        testerAccounts: people.tester.size,
        realMemberAccounts: people.member.size,
    };
    if (table.methodField) {
        row.gapMethodTester = counts.gapTester;
        row.gapMethodRealMembers = counts.gapMember;
    }
    summary.push(row);
    console.log(`${table.name}: total ${counts.total}, testers ${counts.tester}, real members ${counts.member}` +
        (table.methodField ? ` (GAP Method™ testers ${counts.gapTester}, real members ${counts.gapMember})` : "") +
        `; distinct accounts testers ${people.tester.size}, real members ${people.member.size}`);
}

console.log("\n" + JSON.stringify({ baseId, summary }, null, 2));
