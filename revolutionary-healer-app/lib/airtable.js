// Airtable client + typed accessors.
// Spec ref: SPEC.md §7 (lib/airtable.js) and §8 (data model).

import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(
  process.env.AIRTABLE_BASE_ID
);

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
