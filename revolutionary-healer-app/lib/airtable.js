// Airtable client + typed accessors.
// Spec ref: SPEC.md §7 (lib/airtable.js) and §8 (data model).

import Airtable from "airtable";

// `base` is called as a function (base(TableName)) everywhere in this file
// and in app/api/webhooks/route.ts. Lazily instantiate the real Airtable
// client on first actual use instead of at import time (fix, Aug 12): Next.js
// imports API route modules during "next build" to collect page data, which
// was executing this top-level `new Airtable(...)` and crashing the whole
// Vercel build with "Error: An API key is required to connect to Airtable"
// -- even though no request had reached the route yet, simply because
// AIRTABLE_API_KEY isn't set in Vercel's Environment Variables (Rachael
// still needs to add the real key there; see SPEC.md §9).
let _base;
function getBase() {
    if (!_base) {
          _base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(
                  process.env.AIRTABLE_BASE_ID
                );
    }
    return _base;
}
const base = (...args) => getBase()(...args);

export const Tables = {
  Members: "Members",
  Chats: "Chats",
  FocusAreas: "FocusAreas",
  Transcripts: "Transcripts",
  Healings: "Healings",
  Practices: "Practices",
  Events: "Events",
};

/** Find a single record by an exact field match. Returns null if not found. */
export async function findOneByField(table, field, value) {
  const records = await base(table)
    .select({
      filterByFormula: `{${field}} = "${value}"`,
      maxRecords: 1,
    })
    .firstPage();
  return records[0] ?? null;
}

export async function getMemberByEmail(email) {
  return findOneByField(Tables.Members, "email", email);
}

export async function getChatsByEmail(email) {
  return findOneByField(Tables.Chats, "email", email);
}

export async function upsertChats(email, convos) {
  const existing = await getChatsByEmail(email);
  const fields = { convos: JSON.stringify(convos), updated: new Date().toISOString() };
  if (existing) {
    return base(Tables.Chats).update(existing.id, fields);
  }
  return base(Tables.Chats).create({ email, ...fields });
}

export async function listActiveFocusAreas() {
  const records = await base(Tables.FocusAreas)
    .select({ filterByFormula: "{active} = 1", sort: [{ field: "display_order", direction: "asc" }] })
    .all();
  return records.map((r) => r.fields);
}

export async function logEvent(type, meta, memberRecordId) {
  return base(Tables.Events).create({
    type,
    meta: typeof meta === "string" ? meta : JSON.stringify(meta ?? {}),
    created_at: new Date().toISOString(),
    ...(memberRecordId ? { member: [memberRecordId] } : {}),
  });
}

export default base;
