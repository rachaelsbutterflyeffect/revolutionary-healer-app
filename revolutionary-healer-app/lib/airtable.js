// Airtable client + typed accessors.
// Spec ref: SPEC.md §7 (lib/airtable.js) and §8 (data model).

import Airtable from "airtable";
import crypto from "crypto";
import { sendGapMethodMagicLink, sendOpsAlert } from "./email";
import { applyMemberEmailChange, describePlan } from "./memberEmailChange";
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
    ActivationCompletions: "ActivationCompletions",
    Favorites: "Favorites",
    ChatSessions: "ChatSessions",
    ChatMessages: "ChatMessages",
    MemberMemories: "MemberMemories",
    WebhookEvents: "WebhookEvents",
};

export function normalizeEmail(email) {
    return typeof email === "string" ? email.trim().toLowerCase() : email;
}

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

export async function getGapMethodResultByEmail(email) {
    return findOneByField(Tables.GapMethodResults, "email", normalizeEmail(email));
}

export async function upsertGapMethodResultOnPurchase({ email, offerId, firstName }) {
    const normalized = normalizeEmail(email);
    const existing = await getGapMethodResultByEmail(normalized);
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
    if (existing.fields.divine_identity && !existing.fields.shift_created) {
        await createGapMethodShift(existing, memberRecordId);
    }
    return updated;
}

export async function createGapMethodShift(gapMethodResultRecord, memberRecordId) {
    const f = gapMethodResultRecord.fields;
    const identity = DIVINE_IDENTITIES.find((d) => d.displayName === f.divine_identity);
    const now = new Date().toISOString();
    await base(Tables.Shifts).create({
        member_email: f.email,
        member: [memberRecordId],
        gap_method_result: [gapMethodResultRecord.id],
        method_name: "GAP Method",
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

export async function getShiftsByEmail(email) {
    const normalized = normalizeEmail(email);
    const records = await base(Tables.Shifts)
    .select({
        filterByFormula: `{member_email} = "${normalized}"`,
        sort: [{ field: "created_at", direction: "desc" }],
    })
    .all();
    return records;
}

export async function createShiftFromChat({
    email,
    memberRecordId,
    chatId,
    methodName = "Revolutionary Healer AI Chat",
    divineIdentitySlug = "",
    divineIdentityName = "",
    currentFrequency = "",
    focusArea = "",
    gapExplanation = "",
    whatWeNoticed = "",
    recommendedActivation = "",
}) {
    const normalized = normalizeEmail(email);
    const now = new Date().toISOString();
    const created = await base(Tables.Shifts).create({
        member_email: normalized,
        ...(memberRecordId ? { member: [memberRecordId] } : {}),
        method_name: methodName,
        divine_identity_slug: divineIdentitySlug,
        divine_identity_name: divineIdentityName,
        current_frequency: currentFrequency,
        focus_area: focusArea,
        gap_explanation: gapExplanation,
        what_we_noticed: whatWeNoticed,
        recommended_activation: recommendedActivation,
        progress_status: "shifting",
        ready_for_embodied: false,
        created_at: now,
        updated_at: now,
    });
    if (chatId) {
        try {
            await base(Tables.ChatSessions).update(chatId, { linked_shift_id: created.id });
        } catch (err) {
            console.error("Failed to link chat session to new chat-created Shift", err);
        }
    }
    return created;
}

export async function logActivationCompleted(email, activationSlug) {
    const normalized = normalizeEmail(email);
    return base(Tables.ActivationCompletions).create({
        member_email: normalized,
        activation_slug: activationSlug,
        completed_at: new Date().toISOString(),
    });
}

export async function getCompletedActivationSlugsByEmail(email) {
    const normalized = normalizeEmail(email);
    const records = await base(Tables.ActivationCompletions)
    .select({
        filterByFormula: `{member_email} = "${normalized}"`,
        sort: [{ field: "completed_at", direction: "desc" }],
    })
    .all();
    const slugs = records.map((r) => r.fields.activation_slug).filter(Boolean);
    return Array.from(new Set(slugs));
}

// Sept 29 (Rachael's deep-audit P0 -- favorites never persisted, only a
// visual heart-class toggle with no backend at all). Mirrors the
// ActivationCompletions pattern above.
export async function addFavoriteActivation(email, activationSlug) {
    const normalized = normalizeEmail(email);
    return base(Tables.Favorites).create({
        member_email: normalized,
        activation_slug: activationSlug,
        favorited_at: new Date().toISOString(),
    });
}

export async function removeFavoriteActivation(email, activationSlug) {
    const normalized = normalizeEmail(email);
    const records = await base(Tables.Favorites)
    .select({
        filterByFormula: `AND({member_email} = "${normalized}", {activation_slug} = "${activationSlug}")`,
    })
    .all();
    if (records.length) {
        await base(Tables.Favorites).destroy(records.map((r) => r.id));
    }
}

export async function getFavoriteActivationSlugsByEmail(email) {
    const normalized = normalizeEmail(email);
    const records = await base(Tables.Favorites)
    .select({
        filterByFormula: `{member_email} = "${normalized}"`,
    })
    .all();
    const slugs = records.map((r) => r.fields.activation_slug).filter(Boolean);
    return Array.from(new Set(slugs));
}

export async function getShiftById(shiftId) {
    if (!shiftId) return null;
    try {
        return await base(Tables.Shifts).find(shiftId);
    } catch (err) {
        return null;
    }
}

export async function updateShiftFields(shiftId, fields) {
    return base(Tables.Shifts).update(shiftId, {
        ...fields,
        updated_at: new Date().toISOString(),
    });
}

// Hard-delete a Shift record (QA fix, Sep 2026: "My Revolution" Shift detail
// view had no delete/archive option). The Shifts table's progress_status
// singleSelect only has "shifting"/"embodied" options -- no "archived" --
// so this deletes the record outright rather than flipping a status field.
// Ownership (member_email match) is verified by the caller before this runs.
export async function deleteShift(shiftId) {
    return base(Tables.Shifts).destroy(shiftId);
}

export async function setMemberPassword(recordId, passwordHash) {
    return base(Tables.Members).update(recordId, {
        password_hash: passwordHash,
        reset_token: "",
        reset_token_expires_at: null,
    });
}

export async function createMemberResetToken(recordId, token, expiresAtISO) {
    return base(Tables.Members).update(recordId, {
        reset_token: token,
        reset_token_expires_at: expiresAtISO,
    });
}

export async function getMemberByResetToken(token) {
    if (!token) return null;
    return findOneByField(Tables.Members, "reset_token", token);
}

export async function clearMemberResetToken(recordId) {
    return base(Tables.Members).update(recordId, {
        reset_token: "",
        reset_token_expires_at: null,
    });
}

export async function createChatSession({ email, title = "New Chat", focusAreaSlug = "general" }) {
    const now = new Date().toISOString();
    const record = await base(Tables.ChatSessions).create({
        title,
        member_email: normalizeEmail(email),
        created_at: now,
        updated_at: now,
        last_message_at: now,
        archived: false,
        title_is_auto: true,
        focus_area_slug: focusAreaSlug,
    });
    return record;
}

export async function getChatSessionById(chatId) {
    if (!chatId) return null;
    try {
        return await base(Tables.ChatSessions).find(chatId);
    } catch (err) {
        return null;
    }
}

export async function listChatSessionsByEmail(email, { includeArchived = false } = {}) {
    const normalized = normalizeEmail(email);
    const formula = includeArchived
        ? `{member_email} = "${normalized}"`
        : `AND({member_email} = "${normalized}", {archived} != 1)`;
    const records = await base(Tables.ChatSessions)
    .select({ filterByFormula: formula, sort: [{ field: "last_message_at", direction: "desc" }] })
    .all();
    return records;
}

export async function updateChatSession(chatId, fields) {
    return base(Tables.ChatSessions).update(chatId, fields);
}

export async function renameChatSession(chatId, title) {
    return base(Tables.ChatSessions).update(chatId, { title, title_is_auto: false });
}

export async function archiveChatSession(chatId, archived = true) {
    return base(Tables.ChatSessions).update(chatId, { archived });
}

export async function deleteChatSession(chatId) {
    const messages = await listMessagesByChatId(chatId);
    const ids = messages.map((m) => m.id);
    for (let i = 0; i < ids.length; i += 50) {
        const batch = ids.slice(i, i + 50);
        if (batch.length) await base(Tables.ChatMessages).destroy(batch);
    }
    return base(Tables.ChatSessions).destroy(chatId);
}

export async function createMessage({ chatId, email, role, text, activationRecommended = "" }) {
    const record = await base(Tables.ChatMessages).create({
        chat_session_id: chatId,
        member_email: normalizeEmail(email),
        role,
        message_text: text,
        created_at: new Date().toISOString(),
        activation_recommended: activationRecommended,
    });
    return record;
}

export async function listMessagesByChatId(chatId, options = {}) {
    const limit = options.limit;
    if (!chatId) return [];
    const records = await base(Tables.ChatMessages)
    .select({
        filterByFormula: `{chat_session_id} = "${chatId}"`,
        sort: [{ field: "created_at", direction: "asc" }],
    })
    .all();
    if (limit && records.length > limit) {
        return records.slice(records.length - limit);
    }
    return records;
}

export async function createMemory({ email, type, topic, statement, status = "hypothesis", sourceChatId = "" }) {
    const now = new Date().toISOString();
    return base(Tables.MemberMemories).create({
        member_email: normalizeEmail(email),
        type,
        topic,
        statement,
        status,
        source_chat_id: sourceChatId,
        created_at: now,
        updated_at: now,
        active: true,
    });
}

export async function updateMemory(memoryId, fields) {
    return base(Tables.MemberMemories).update(memoryId, {
        ...fields,
        updated_at: new Date().toISOString(),
    });
}

export async function listActiveMemoriesByEmail(email) {
    const normalized = normalizeEmail(email);
    const records = await base(Tables.MemberMemories)
    .select({
        filterByFormula: `AND({member_email} = "${normalized}", {active} = 1)`,
        sort: [{ field: "updated_at", direction: "desc" }],
    })
    .all();
    return records;
}

const MEMBER_OFFER_IDS = (process.env.MEMBER_OFFER_IDS ?? "").split(",").filter(Boolean);
const TIER_OFFER_IDS = (process.env.TIER_OFFER_IDS ?? "").split(",").filter(Boolean);
const GAP_METHOD_OFFER_IDS = (process.env.GAP_METHOD_OFFER_IDS ?? "2151330100").split(",").filter(Boolean);

export async function getWebhookEventByPurchaseId(purchaseId) {
    return findOneByField(Tables.WebhookEvents, "purchase_id", purchaseId);
}

export async function createWebhookEvent({
    purchaseId,
    email,
    offerId,
    eventType,
    outcome,
    attemptCount = 1,
    errorMessage = "",
    memberRecordId = "",
    rawPayload = "",
}) {
    const now = new Date().toISOString();
    const fields = {
        purchase_id: purchaseId,
        email: email ?? "",
        offer_id: offerId ?? "",
        event_type: eventType ?? "",
        outcome,
        attempt_count: attemptCount,
        error_message: errorMessage,
        member_record_id: memberRecordId,
        raw_payload: rawPayload,
        received_at: now,
        last_attempt_at: now,
    };
    if (outcome === "failed") {
        fields.next_retry_at = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    }
    return base(Tables.WebhookEvents).create(fields);
}

export async function updateWebhookEvent(recordId, fields) {
    return base(Tables.WebhookEvents).update(recordId, {
        ...fields,
        last_attempt_at: new Date().toISOString(),
    });
}

export async function listWebhookEventsDueForRetry() {
    return base(Tables.WebhookEvents)
    .select({
        filterByFormula: `AND({outcome} = "failed", {attempt_count} < 3, IS_BEFORE({next_retry_at}, NOW()))`,
    })
    .all();
}

// ---------------------------------------------------------------------------
// Oct 8 2026 (Rachael, after Eden Koz's Kajabi email change): member email
// changes. Kajabi has no "contact updated" webhook, but every purchase /
// payment.succeeded webhook carries a STABLE Kajabi member id (member.id) next
// to the member's CURRENT email. We capture that id on the Members record
// (kajabi_member_id), so a later webhook whose email isn't in Members but
// whose member id IS can be recognised as the same person with a new email.
//
// MEMBER_EMAIL_SYNC (Vercel env var) -- default "off":
//   off   : exactly the old behaviour (an unknown email gets a new Members
//           record). Only the id capture below runs, and only once the
//           kajabi_member_id field exists in Airtable.
//   alert : a stable-id match with a different email emails Rachael (ops
//           alert) with the exact one-step fix; the purchase's access flags go
//           on the member's EXISTING record (same Kajabi person) instead of
//           creating a duplicate. Nothing is renamed automatically.
//   auto  : same detection, then lib/memberEmailChange.js moves the email
//           across every email-keyed table (audit row in EmailChanges first),
//           and Rachael gets an FYI email with the undo command. If the move is
//           blocked (ambiguous) it falls back to "alert".
// A match is only used when EXACTLY ONE Members record has that Kajabi id.
// Any error in this block is caught -- it can never fail the purchase itself.
// ---------------------------------------------------------------------------
export function memberEmailSyncMode(raw = process.env.MEMBER_EMAIL_SYNC) {
    const v = String(raw ?? "").trim().toLowerCase();
    return v === "alert" || v === "auto" ? v : "off";
}

export function cleanKajabiId(id) {
    const s = id == null ? "" : String(id).trim();
    return /^[A-Za-z0-9_-]{1,64}$/.test(s) ? s : null;
}

export async function findMembersByKajabiId(kajabiMemberId) {
    const id = cleanKajabiId(kajabiMemberId);
    if (!id) return [];
    return base(Tables.Members)
    .select({ filterByFormula: `{kajabi_member_id} = "${id}"`, maxRecords: 3 })
    .firstPage();
}

async function safeOpsAlert(alertFn, subject, message) {
    try {
        await alertFn({ subject, message });
    } catch (err) {
        console.error("member email sync: ops alert failed", err);
    }
}

// Best-effort: never throws. Only fills an EMPTY kajabi_member_id; never
// overwrites a different id (that would be a data problem worth a human look).
export async function captureKajabiMemberId(record, kajabiMemberId) {
    const id = cleanKajabiId(kajabiMemberId);
    if (!id || !record?.id) return "skipped";
    const current = record.fields?.kajabi_member_id;
    if (current === id) return "unchanged";
    if (current) {
        console.warn(`kajabi_member_id mismatch on ${record.id}: has ${current}, webhook sent ${id} -- left as is`);
        return "mismatch";
    }
    try {
        await base(Tables.Members).update(record.id, { kajabi_member_id: id });
        return "captured";
    } catch (err) {
        // e.g. the field hasn't been added to this Airtable base yet.
        console.warn("kajabi_member_id capture skipped:", String(err?.message ?? err));
        return "failed";
    }
}

async function handleKajabiEmailChange({ newEmail, kajabiMemberId, offerId, mode, alertFn }) {
    const matches = await findMembersByKajabiId(kajabiMemberId);
    if (matches.length === 0) return null;
    if (matches.length > 1) {
        await safeOpsAlert(alertFn, "Member email change needs a look (ambiguous)",
            `A Kajabi payment arrived for ${newEmail} (Kajabi member id ${kajabiMemberId}, offer ${offerId ?? "?"}).\n\n` +
            `That email is not in the app, and ${matches.length} Members records share that Kajabi id ` +
            `(${matches.map((m) => `${m.id} ${m.fields?.email ?? ""}`).join(", ")}), so nothing was changed automatically. ` +
            `The app created a new record for ${newEmail} as usual.`);
        return { action: "ambiguous", record: null };
    }
    const match = matches[0];
    const oldEmail = normalizeEmail(match.fields?.email);
    if (!oldEmail || oldEmail === newEmail) return null;

    const fixCommand = `node scripts/move-member-email.mjs --old ${oldEmail} --new ${newEmail}`;
    if (mode === "auto") {
        try {
            const res = await applyMemberEmailChange(base, {
                oldEmail,
                newEmail,
                source: "kajabi_webhook",
                note: `Kajabi member id ${kajabiMemberId}, offer ${offerId ?? "?"}`,
            });
            if (res.applied) {
                await safeOpsAlert(alertFn, `Member email updated: ${oldEmail} -> ${newEmail}`,
                    `Kajabi now has a new email for one of your members (Kajabi member id ${kajabiMemberId}).\n\n` +
                    `The app moved her account automatically, so she keeps her access, chats and history:\n${describePlan(res.plan)}\n\n` +
                    `Audit row: EmailChanges ${res.auditRecordId}. To undo: node scripts/move-member-email.mjs --old ${newEmail} --new ${oldEmail} --apply`);
                const fresh = await base(Tables.Members).find(match.id);
                return { action: "moved", record: fresh };
            }
            await safeOpsAlert(alertFn, `Member email change blocked: ${oldEmail} -> ${newEmail}`,
                `Kajabi sent a payment for ${newEmail} with the same Kajabi member id (${kajabiMemberId}) as ${oldEmail}, ` +
                `but the automatic move was blocked, so nothing was renamed:\n${describePlan(res.plan)}\n\n` +
                `Her access was applied to her existing record (${match.id}); she can still sign in with ${oldEmail}. ` +
                `Review, then run: ${fixCommand}`);
            return { action: "blocked", record: match };
        } catch (err) {
            await safeOpsAlert(alertFn, `Member email move stopped part-way: ${oldEmail} -> ${newEmail}`,
                `Error: ${String(err?.message ?? err)}\n\nThe Members record was not renamed, so she can still sign in with ${oldEmail}. ` +
                `See the EmailChanges table for what moved, then finish with: ${fixCommand} --resume`);
            return { action: "failed", record: match };
        }
    }
    await safeOpsAlert(alertFn, `Member changed email in Kajabi: ${oldEmail} -> ${newEmail}`,
        `Kajabi sent a payment for ${newEmail} (Kajabi member id ${kajabiMemberId}, offer ${offerId ?? "?"}). ` +
        `In the app she is still ${oldEmail} (Members ${match.id}).\n\n` +
        `Her access was applied to that existing record (no duplicate created). Until her email is moved she must sign in with ${oldEmail}.\n\n` +
        `To move her email across every table in one step (dry run first, then add --apply): ${fixCommand}`);
    return { action: "alerted", record: match };
}

/**
 * @param {{ email: string, firstName: string | undefined, offerId: string | undefined, eventType: string | undefined, kajabiMemberId?: string }} args
 * @param {{ mode?: string, sendOpsAlert?: (a: { subject: string, message: string }) => Promise<any> }} [deps]
 */
export async function processKajabiPurchase({ email, firstName, offerId, eventType, kajabiMemberId }, deps = {}) {
    const normalizedEmail = normalizeEmail(email);
    const isMemberOffer = offerId ? MEMBER_OFFER_IDS.includes(offerId) : true;
    const isTierOffer = offerId ? TIER_OFFER_IDS.includes(offerId) : false;
    const isGapMethodOffer = offerId ? GAP_METHOD_OFFER_IDS.includes(offerId) : false;
    const isCancellation = eventType === "cancellation" || eventType === "refund";

    let existing = await getMemberByEmail(normalizedEmail);

    let emailSync = null;
    const syncMode = memberEmailSyncMode(deps.mode);
    if (!existing && syncMode !== "off" && cleanKajabiId(kajabiMemberId)) {
        try {
            emailSync = await handleKajabiEmailChange({
                newEmail: normalizedEmail,
                kajabiMemberId: cleanKajabiId(kajabiMemberId),
                offerId,
                mode: syncMode,
                alertFn: deps.sendOpsAlert ?? sendOpsAlert,
            });
        } catch (err) {
            // e.g. kajabi_member_id field missing -> behave exactly as before.
            console.error("member email sync check failed (ignored)", String(err?.message ?? err));
            emailSync = null;
        }
        if (emailSync?.record) existing = emailSync.record;
    }

    const fields = {};
    if (isMemberOffer) fields.member_active = !isCancellation;
    if (isTierOffer) fields.tier_active = !isCancellation;

    let memberRecordId;
    let outcome;
    let memberRecord;
    if (existing) {
        await base(Tables.Members).update(existing.id, fields);
        memberRecordId = existing.id;
        memberRecord = existing;
        outcome = "already_existed";
    } else {
        const created = await base(Tables.Members).create({ email: normalizedEmail, member_active: !isCancellation, ...fields });
        memberRecordId = created.id;
        memberRecord = created;
        outcome = "created";
    }

    if (kajabiMemberId != null) await captureKajabiMemberId(memberRecord, kajabiMemberId);

    if (isGapMethodOffer && !isCancellation) {
        const { sessionToken } = await upsertGapMethodResultOnPurchase({ email: normalizedEmail, offerId, firstName });
        sendGapMethodMagicLink({ email: normalizedEmail, firstName, sessionToken }).catch((err) => {
            console.error("sendGapMethodMagicLink failed", err);
        });
    }

    if ((isMemberOffer || isTierOffer) && !isCancellation) {
        await linkGapMethodResultToMember(normalizedEmail, memberRecordId);
    }

    return { memberRecordId, outcome, ...(emailSync ? { emailSync: emailSync.action } : {}) };
}

export default base;
