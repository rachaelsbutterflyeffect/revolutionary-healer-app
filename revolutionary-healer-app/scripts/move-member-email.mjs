// Admin tool: move ONE member's email across every email-keyed Airtable table
// in one step (Members, Chats, GapMethodResults, Shifts, ChatSessions,
// ChatMessages, MemberMemories, ActivationCompletions, Favorites).
// Oct 8 2026, after Eden Koz's Kajabi email change. NOT part of the app.
//
// DRY RUN by default -- prints what would move and anything that blocks it:
//   AIRTABLE_API_KEY=... AIRTABLE_BASE_ID=app... \
//     node scripts/move-member-email.mjs --old old@example.com --new new@example.com
// Then, if the plan looks right, add --apply. Add --resume only to finish a
// move that stopped part-way (see the EmailChanges row).
// Every applied move writes an EmailChanges row (audit + exact record ids).
// UNDO: run it again with --old and --new swapped.
import Airtable from "airtable";
import { applyMemberEmailChange, planMemberEmailChange, describePlan } from "../lib/memberEmailChange.js";

const args = process.argv.slice(2);
const get = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const oldEmail = get("--old");
const newEmail = get("--new");
const apply = args.includes("--apply");
const resume = args.includes("--resume");
const note = get("--note") ?? "";

if (!oldEmail || !newEmail) {
  console.error("usage: node scripts/move-member-email.mjs --old <email> --new <email> [--apply] [--resume] [--note text]");
  process.exit(2);
}
if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
  console.error("Set AIRTABLE_API_KEY and AIRTABLE_BASE_ID (never commit them).");
  process.exit(2);
}

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
console.log(`Airtable base: ${process.env.AIRTABLE_BASE_ID}  mode: ${apply ? "APPLY" : "dry run"}${resume ? " (resume)" : ""}`);

if (!apply) {
  const plan = await planMemberEmailChange(base, { oldEmail, newEmail, resume });
  console.log(describePlan(plan));
  console.log(plan.ok ? "\nDry run only -- nothing changed. Re-run with --apply to move it." : "\nBlocked -- nothing changed.");
  process.exit(plan.ok ? 0 : 1);
}

const res = await applyMemberEmailChange(base, { oldEmail, newEmail, source: "admin_script", resume, note });
console.log(describePlan(res.plan));
if (!res.applied) {
  console.log("\nBlocked -- nothing changed.");
  process.exit(1);
}
console.log(`\nDone. EmailChanges audit row: ${res.auditRecordId}`);
console.log(`Undo: node scripts/move-member-email.mjs --old ${res.plan.newEmail} --new ${res.plan.oldEmail} --apply`);
