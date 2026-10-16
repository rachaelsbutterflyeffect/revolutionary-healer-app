// One-off: mark CCM buyers from a Kajabi CSV export as purchased.
// TEST BASE ONLY: refuses to run against any base but app25z8YN3rgFr8Zl.
// Usage: AIRTABLE_TEST_API_KEY=... node scripts/ccm-backfill-purchases.mjs buyers.csv [--dry-run] [--offer=2151448276]
// The CSV needs an "email" column (any case); other columns are ignored.
import fs from "node:fs";
const TEST_BASE = "app25z8YN3rgFr8Zl";
const base = process.env.CCM_BACKFILL_BASE_ID || TEST_BASE;
if (base !== TEST_BASE) { console.error("Refusing: backfill only runs against the TEST base."); process.exit(1); }
const key = process.env.AIRTABLE_TEST_API_KEY;
const file = process.argv[2];
const dry = process.argv.includes("--dry-run");
const offer = (process.argv.find((a) => a.startsWith("--offer=")) || "").slice(8);
if (!file || (!key && !dry)) { console.error("usage: node scripts/ccm-backfill-purchases.mjs <csv> [--dry-run]"); process.exit(1); }

const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter((l) => l.trim());
const head = lines.shift().split(",").map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase());
const col = head.findIndex((h) => h === "email" || h.includes("email"));
if (col < 0) { console.error("No email column"); process.exit(1); }
const emails = [...new Set(lines.map((l) => (l.split(",")[col] || "").trim().replace(/^"|"$/g, "").toLowerCase()).filter((e) => e.includes("@")))];
console.log(`${emails.length} unique emails`);
if (dry) process.exit(0);

const api = (path, opts = {}) => fetch(`https://api.airtable.com/v0/${base}/${path}`, { ...opts, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" } }).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(JSON.stringify(j)); return j; });
const T = encodeURIComponent("CCM Member Status"), I = encodeURIComponent("CCM Impressions");
let created = 0, updated = 0, skipped = 0;
for (const e of emails) {
    const q = await api(`${T}?maxRecords=1&filterByFormula=${encodeURIComponent(`{member_email} = "${e.replace(/"/g, "")}"`)}`);
    const rec = q.records[0];
    if (rec?.fields?.purchased) { skipped++; continue; }
    const fields = { purchased: true, ccm_status: "purchased" };
    if (rec) { await api(`${T}/${rec.id}`, { method: "PATCH", body: JSON.stringify({ fields }) }); updated++; }
    else { await api(T, { method: "POST", body: JSON.stringify({ fields: { member_email: e, consecutive_non_engagements: 0, ...fields } }) }); created++; }
    await api(I, { method: "POST", body: JSON.stringify({ typecast: true, fields: { member: e, timestamp: new Date().toISOString(), source: "checkout_link", checkout_type: offer === "2151448276" ? "plan" : offer ? "full" : "none", outcome: "purchased", conversation_id: "backfill" } }) });
    await new Promise((r) => setTimeout(r, 250));
}
console.log(`created ${created}, updated ${updated}, already purchased ${skipped}`);
