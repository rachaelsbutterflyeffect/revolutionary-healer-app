// Airtable client + typed accessors.
// Spec ref: SPEC.md §7 (lib/airtable.js) and §8 (data model).

import Airtable from "airtable";
import crypto from "crypto";
import { DIVINE_IDENTITIES } from "./divineIdentities";

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
  GapMethodResults: "GapMethodResults",
  Shifts: "Shifts",
};

// Lowercase + trim for consistent matching. Spec (Aug 12, Rachael's GAP
// Method persistence instruction): GAP Method results must be matched on
// normalized email, since the same person's email can arrive from Kajabi
// webhooks, this app's own save calls, and (eventually) member login with
// different casing/whitespace.
export function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : email;
}

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

// =============================================================================
// GAP METHOD RESULTS (Aug 12, Rachael's GAP Method persistence instruction)
// =============================================================================
// Persists the 3-step GAP Method diagnostic, keyed by normalized email, so a
// buyer's Divine Identity / frequency / refined GAP / recommended activation
// survive across the anonymous funnel session and can later link to their
// permanent Revolutionary Healer member record without making them redo
// Steps 1-2. Three write paths into this same table, matched by email:
//   1. upsertGapMethodResultOnPurchase -- called from the Kajabi webhook the
//      moment someone buys the $9 GAP Method offer (backend, zero action).
//   2. saveGapMethodDiagnostic -- called from app/api/gap-method-result/route.ts
//      once the funnel's Step 3 completes and an email is known (see
//      public/gap-method.html's buyerEmail / ?e= handling).
//   3. linkGapMethodResultToMember -- called from the same webhook when a
//      Full Access purchase event arrives for an email that already has a
//      GAP Method Results row, so My Revolution can surface the existing
//      Shift without re-running the diagnostic.

export async function getGapMethodResultByEmail(email) {
  return findOneByField(Tables.GapMethodResults, "email", normalizeEmail(email));
}

export async function upsertGapMethodResultOnPurchase({ email, offerId, firstName }) {
  const normalized = normalizeEmail(email);
  const existing = await getGapMethodResultByEmail(normalized);
  // Fresh single-use magic-link token on every purchase event (Aug 13,
  // Rachael's Kajabi Purchase Webhook architecture request): this token,
  // never the email itself, is what travels in the link we email the buyer.
  // /api/gap-method-session/[token]/route.ts resolves it server-side.
  const sessionToken = crypto.randomBytes(24).toString("hex");
  const fields = {
    email: normalized,
    purchase_offer_id: offerId ?? "",
    purchased_at: new Date().toISOString(),
    source: "kajabi_webhook",
    session_token: sessionToken,
    token_used: false,
  };
  if (firstName) fields.first_name = firstName;
  // Don't clobber a diagnostic that's already complete or linked to a member
  // -- a re-purchase (e.g. a refund + repurchase) should just refresh the
  // purchase timestamp and issue a fresh token, never reset progress that's
  // already saved.
  if (!existing || (existing.fields.status !== "diagnostic_complete" && existing.fields.status !== "linked_to_member")) {
    fields.status = "awaiting_diagnostic";
  }
  if (existing) {
    await base(Tables.GapMethodResults).update(existing.id, fields);
  } else {
    await base(Tables.GapMethodResults).create({ ...fields, status: "awaiting_diagnostic" });
  }
  return { email: normalized, sessionToken };
}

// Resolves a magic-link token (from the purchase confirmation email) back to
// the GapMethodResults record it belongs to, server-side only -- the token is
// opaque and carries no PII, so it's safe to put in a URL. Does not mark it
// used; callers decide when a token has been meaningfully redeemed.
export async function getGapMethodResultByToken(token) {
  if (!token) return null;
  return findOneByField(Tables.GapMethodResults, "session_token", token);
}

export async function markGapMethodTokenUsed(recordId) {
  return base(Tables.GapMethodResults).update(recordId, { token_used: true });
}

export async function saveGapMethodDiagnostic({
  email,
  divineIdentity,
  primaryFrequency,
  focusArea,
  refinedGap,
  step1Answers,
  step2Summary,
  recommendedActivation,
  activationWhy,
}) {
  const normalized = normalizeEmail(email);
  const existing = await getGapMethodResultByEmail(normalized);
  const fields = {
    email: normalized,
    divine_identity: divineIdentity ?? "",
    primary_frequency: primaryFrequency ?? "",
    focus_area: focusArea ?? "",
    refined_gap: refinedGap ?? "",
    step1_answers: typeof step1Answers === "string" ? step1Answers : JSON.stringify(step1Answers ?? {}),
    step2_summary: typeof step2Summary === "string" ? step2Summary : JSON.stringify(step2Summary ?? {}),
    recommended_activation: recommendedActivation ?? "",
    activation_why: activationWhy ?? "",
    diagnostic_completed_at: new Date().toISOString(),
    status: "diagnostic_complete",
  };
  const saved = existing
    ? await base(Tables.GapMethodResults).update(existing.id, fields)
    : await base(Tables.GapMethodResults).create({ ...fields, source: "diagnostic_save" });
  // Aug 13 (Rachael's My Revolution Shift-card build): if this email is
  // ALREADY a real member (e.g. they bought Full Access before ever doing
  // the GAP Method), link + auto-create the Shift card right now instead of
  // waiting for a future Kajabi webhook event that may never come.
  const member = await getMemberByEmail(normalized);
  if (member) {
    await linkGapMethodResultToMember(normalized, member.id);
  }
  return saved;
}

export async function linkGapMethodResultToMember(email, memberRecordId) {
  const normalized = normalizeEmail(email);
  const existing = await getGapMethodResultByEmail(normalized);
  if (!existing) return null;
  const updated = await base(Tables.GapMethodResults).update(existing.id, {
    linked_member: [memberRecordId],
    linked_at: new Date().toISOString(),
    status: "linked_to_member",
  });
  // Aug 13 (Rachael's My Revolution Shift-card build, SPEC.md's Post-Gap
  // Method App Entry Flow point 3): the moment a completed GAP Method
  // diagnostic links to a real member, auto-create the first "Gap Method
  // Shift" card so My Revolution isn't empty the moment they arrive. Only
  // fires once per result (shift_created guard) -- a repeat purchase or
  // webhook replay must never create a second Shift for the same GAP.
  if (existing.fields.divine_identity && !existing.fields.shift_created) {
    await createGapMethodShift(existing, memberRecordId);
  }
  return updated;
}

// Maps a GapMethodResults record's completed diagnostic into the first My
// Revolution "Shift" card (see lib/shifts.js for the card's full pure-logic
// shape). SHIFT CARD CREATION RULE (SPEC.md): one Shift per distinct GAP --
// this only ever runs once per GapMethodResults row, guarded by
// shift_created above, never re-triggered by a later repurchase.
export async function createGapMethodShift(gapMethodResultRecord, memberRecordId) {
  const f = gapMethodResultRecord.fields;
  const identity = DIVINE_IDENTITIES.find((d) => d.displayName === f.divine_identity);
  const now = new Date().toISOString();
  await base(Tables.Shifts).create({
    member_email: f.email,
    member: [memberRecordId],
    gap_method_result: [gapMethodResultRecord.id],
    method_name: "3 Step GAP Method",
    divine_identity_slug: identity?.slug ?? "",
    divine_identity_name: f.divine_identity ?? "",
    current_frequency: f.primary_frequency ?? "",
    focus_area: f.focus_area ?? "",
    gap_explanation: f.refined_gap ?? "",
    what_we_noticed: f.activation_why ?? "",
    recommended_activation: f.recommended_activation ?? "",
    progress_status: "shifting",
    ready_for_embodied: false,
    created_at: now,
    updated_at: now,
  });
  await base(Tables.GapMethodResults).update(gapMethodResultRecord.id, { shift_created: true });
}

export default base;
