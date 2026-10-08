// One-off admin tool (Oct 8 2026): fill Members.kajabi_member_id from the
// Kajabi webhook payloads already stored in WebhookEvents.raw_payload, so the
// email-change detection (MEMBER_EMAIL_SYNC, lib/airtable.js) works for those
// members before their next payment. NOT part of the app.
//
// DRY RUN by default; add --apply to write. Only ever fills an EMPTY
// kajabi_member_id on a Members record whose email EXACTLY matches the
// payload email. Skips (and lists) anything ambiguous: one email seen with two
// Kajabi ids, one Kajabi id seen with two emails, no/multiple Members matches,
// or a record that already has a different id.
//   AIRTABLE_API_KEY=... AIRTABLE_BASE_ID=app... node scripts/backfill-kajabi-member-ids.mjs [--apply]
import Airtable from "airtable";

const apply = process.argv.includes("--apply");
if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
  console.error("Set AIRTABLE_API_KEY and AIRTABLE_BASE_ID (never commit them).");
  process.exit(2);
}
const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
console.log(`Airtable base: ${process.env.AIRTABLE_BASE_ID}  mode: ${apply ? "APPLY" : "dry run"}`);

const norm = (e) => (typeof e === "string" ? e.trim().toLowerCase() : "");
const events = await base("WebhookEvents").select({ fields: ["raw_payload"] }).all();
const idsByEmail = new Map();
const emailsById = new Map();
for (const ev of events) {
  let p;
  try { p = JSON.parse(ev.fields.raw_payload || "{}"); } catch { continue; }
  const email = norm(p?.member?.email ?? p?.member_email ?? p?.email);
  const id = p?.member?.id ?? p?.member_id;
  if (!email || id == null || !/^[A-Za-z0-9_-]{1,64}$/.test(String(id))) continue;
  (idsByEmail.get(email) ?? idsByEmail.set(email, new Set()).get(email)).add(String(id));
  (emailsById.get(String(id)) ?? emailsById.set(String(id), new Set()).get(String(id))).add(email);
}

const members = await base("Members").select({ fields: ["email", "kajabi_member_id"] }).all();
const byEmail = new Map();
for (const m of members) {
  const e = norm(m.fields.email);
  if (e) byEmail.set(e, [...(byEmail.get(e) ?? []), m]);
}

const updates = [];
const skipped = [];
for (const [email, ids] of idsByEmail) {
  if (ids.size > 1) { skipped.push(`${email}: several Kajabi ids (${[...ids].join(", ")})`); continue; }
  const id = [...ids][0];
  if (emailsById.get(id).size > 1) { skipped.push(`${email}: Kajabi id ${id} also seen with ${[...emailsById.get(id)].filter((e) => e !== email).join(", ")}`); continue; }
  const recs = byEmail.get(email) ?? [];
  if (recs.length !== 1) { skipped.push(`${email}: ${recs.length} Members records`); continue; }
  const cur = recs[0].fields.kajabi_member_id;
  if (cur === id) continue;
  if (cur) { skipped.push(`${email}: already has a different id (${cur})`); continue; }
  updates.push({ id: recs[0].id, fields: { kajabi_member_id: id }, email });
}

console.log(`\nWould fill ${updates.length} record(s):`);
for (const u of updates) console.log(`  ${u.id}  ${u.email}  -> ${u.fields.kajabi_member_id}`);
if (skipped.length) console.log(`\nSkipped ${skipped.length}:\n  ${skipped.join("\n  ")}`);
if (!apply) { console.log("\nDry run only -- nothing changed."); process.exit(0); }
for (let i = 0; i < updates.length; i += 10) {
  await base("Members").update(updates.slice(i, i + 10).map(({ id, fields }) => ({ id, fields })));
}
console.log(`\nFilled ${updates.length} record(s).`);
