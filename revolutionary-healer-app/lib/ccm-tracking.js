// Clear Channel Method (CCM) tracking: member status, impressions log, funnel,
// and the pure gating rules the chatbot and the CCM card will call later.
//
// FEATURE FLAG: everything that touches Airtable is a no-op unless
// CCM_TRACKING=on (or "1"/"true"). Default OFF, so live behaviour is unchanged
// even if this is merged. Not wired into the chatbot prompt yet (chatbot first,
// card last, in a later change).
//
// Tables (create them in a base before turning the flag on):
//   "CCM Member Status"  one row per member, keyed by member_email (normalized)
//   "CCM Impressions"    one row per time CCM is shown
//
// ACTIVITY DAY: the app has no existing definition, so it is defined here.
// An activity day is a distinct calendar day (America/Toronto) on which the
// member did at least one of: created a Shift (Shifting card), ran the GAP
// Method (GapMethodResults), completed/listened to an activation
// (ActivationCompletions), or sent a chat message (ChatMessages, role=user).
// Logins never count. countActivityDays() returns the running total; the
// rules compare totals ("3 activity days since X" = count now - count at X).

import Airtable from "airtable";

export const CCM_TABLES = { Status: "CCM Member Status", Impressions: "CCM Impressions" };
export const DEFAULT_CCM_OFFER_IDS = ["2150837446", "2151448276"]; // full (HRs2J6Ja), plan (R3gfeowS)
export const CCM_PLAN_OFFER_ID = "2151448276";
export const DAY_MS = 24 * 60 * 60 * 1000;
export const RULES = {
    minDaysBetweenSuggestions: 15,
    declineCooldownDays: 182, // ~6 months
    ignoredMinDays: 7,
    ignoredMinActivityDays: 3,
    twoIgnoredActivityDays: 15,
    cardCooldownActivityDays: 3,
    followupAfterActivityDays: 3,
};

export function ccmTrackingEnabled(env = process.env) {
    return ["on", "1", "true"].includes(String(env.CCM_TRACKING || "").toLowerCase());
}

export function ccmOfferIds(env = process.env) {
    const raw = env.CCM_OFFER_IDS;
    if (!raw || !String(raw).trim()) return DEFAULT_CCM_OFFER_IDS.slice();
    return String(raw).split(",").map((s) => s.trim()).filter(Boolean);
}

export function isCcmOffer(offerId, env = process.env) {
    return offerId != null && ccmOfferIds(env).includes(String(offerId));
}

const norm = (e) => (typeof e === "string" ? e.trim().toLowerCase() : "");
const ts = (v) => (v ? new Date(v).getTime() : NaN);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

// ---------------------------------------------------------------- pure rules

// record: CCM Member Status fields (or {} / null for a new member)
// ctx: { now, activityDayCount, conversationId, fit, midShift, questionResolved }
// Returns { allowed, reason, followup }. Direct asks never go through this:
// the bot always answers them and they are not suggestions.
export function canSuggestCCM(record, ctx = {}) {
    const r = record || {};
    const now = ctx.now != null ? ts(ctx.now) : Date.now();
    const days = (iso) => (now - ts(iso)) / DAY_MS;
    const ad = num(ctx.activityDayCount);
    const sinceAD = (at) => (ad != null && num(at) != null ? ad - at : null);
    const no = (reason) => ({ allowed: false, reason });

    // a. purchased: never
    if (r.purchased || r.ccm_status === "purchased") return no("purchased");
    // b. declined within 6 months
    if (r.declined_at && days(r.declined_at) < RULES.declineCooldownDays) return no("declined_recently");
    // c. already suggested in this conversation
    if (ctx.conversationId && r.last_suggestion_conversation_id === ctx.conversationId) return no("already_this_conversation");
    // d. under 15 days since last suggestion
    if (r.last_suggestion_at && days(r.last_suggestion_at) < RULES.minDaysBetweenSuggestions) return no("min_gap_15_days");
    const ignored = num(r.consecutive_non_engagements) || 0;
    const sinceSuggestionAD = sinceAD(r.last_suggestion_activity_day_count);
    // f. two consecutive ignored mentions: 15 activity days
    if (ignored >= 2) {
        if (sinceSuggestionAD == null || sinceSuggestionAD < RULES.twoIgnoredActivityDays) return no("two_ignored_15_activity_days");
    } else if (ignored === 1) {
        // e. one ignored mention: 7 days AND 3 activity days
        if (r.last_suggestion_at && days(r.last_suggestion_at) < RULES.ignoredMinDays) return no("ignored_7_days");
        if (sinceSuggestionAD == null || sinceSuggestionAD < RULES.ignoredMinActivityDays) return no("ignored_3_activity_days");
    }
    // g. card shown within the last 3 activity days
    const sinceCard = sinceAD(r.last_card_shown_activity_day_count);
    if (sinceCard != null && sinceCard < RULES.cardCooldownActivityDays) return no("card_recent");
    // h. fit, not mid-Shift, question resolved
    if (ctx.fit !== true) return no("no_fit");
    if (ctx.midShift !== false) return no("mid_shift");
    if (ctx.questionResolved !== true) return no("question_unresolved");
    // i. engaged but not bought: one gentle follow-up after 3 activity days
    if (r.ccm_status === "interested") {
        if (r.followup_used) return no("followup_used");
        const due = num(r.followup_due_after_activity_day);
        if (due != null && (ad == null || ad < due)) return no("followup_not_due");
        return { allowed: true, reason: "followup", followup: true };
    }
    return { allowed: true, reason: "ok", followup: false };
}

// Purchase is checked first. The six-activity-day unlock and dismiss rules
// live with the card; pass them in ctx.
export function canShowCard(record, ctx = {}) {
    const r = record || {};
    if (r.purchased || r.ccm_status === "purchased") return { allowed: false, reason: "purchased" };
    const ad = num(ctx.activityDayCount);
    if (ctx.minActivityDays != null && (ad == null || ad < ctx.minActivityDays)) return { allowed: false, reason: "not_enough_activity_days" };
    const last = num(r.last_card_shown_activity_day_count);
    if (last != null && ad != null && ad - last < RULES.cardCooldownActivityDays) return { allowed: false, reason: "card_recent" };
    return { allowed: true, reason: "ok" };
}

// Pure: status-record changes after a proactive mention gets an outcome.
export function statusUpdateForOutcome(record, outcome, ctx = {}) {
    const r = record || {};
    const now = new Date(ctx.now != null ? ts(ctx.now) : Date.now()).toISOString();
    const ad = num(ctx.activityDayCount);
    const f = {};
    if (outcome === "purchased") return { purchased: true, ccm_status: "purchased", last_engagement_at: now };
    if (outcome === "engaged") {
        f.last_engagement_at = now;
        f.consecutive_non_engagements = 0;
        if (r.ccm_status !== "interested") {
            f.ccm_status = "interested";
            f.followup_used = false;
            if (ad != null) f.followup_due_after_activity_day = ad + RULES.followupAfterActivityDays;
        }
    } else if (outcome === "ignored") {
        f.consecutive_non_engagements = (num(r.consecutive_non_engagements) || 0) + 1;
    } else if (outcome === "declined") {
        f.ccm_status = "declined";
        f.declined_at = now;
    }
    return f;
}

// Pure funnel from impression rows (fields objects).
export function computeFunnel(rows) {
    const out = { shown: 0, asked: 0, link_sent: 0, bought: 0, declined: 0, engaged: 0, ignored: 0,
        by_source: { card: 0, chat_recommendation: 0, checkout_link: 0, direct_ask_answer: 0 },
        links_by_type: { plan: 0, full: 0 }, members: { shown: 0, bought: 0 } };
    const shownM = new Set(), boughtM = new Set();
    for (const f of rows || []) {
        const m = norm(f.member);
        if (f.source in out.by_source) out.by_source[f.source]++;
        if (f.source === "card" || f.source === "chat_recommendation") { out.shown++; shownM.add(m); }
        if (f.source === "direct_ask_answer") out.asked++;
        if (f.source === "checkout_link") { out.link_sent++; if (f.checkout_type in out.links_by_type) out.links_by_type[f.checkout_type]++; }
        if (f.outcome === "purchased") { out.bought++; boughtM.add(m); }
        if (f.outcome === "declined") out.declined++;
        if (f.outcome === "engaged") out.engaged++;
        if (f.outcome === "ignored") out.ignored++;
    }
    out.members = { shown: shownM.size, bought: boughtM.size };
    out.conversion = out.members.shown ? +(out.members.bought / out.members.shown).toFixed(4) : 0;
    return out;
}

// Pure: distinct Toronto calendar days from a list of ISO timestamps.
export function activityDayCountFromTimestamps(list, timeZone = "America/Toronto") {
    const fmt = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    const set = new Set();
    for (const t of list || []) { const d = ts(t); if (Number.isFinite(d)) set.add(fmt.format(d)); }
    return set.size;
}

// ---------------------------------------------------------------- Airtable I/O

let _base;
function base(table) {
    if (!_base) _base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
    return _base(table);
}
export function _setBaseForTests(fn) { _base = fn; }

async function selectAll(table, opts) {
    return base(table).select(opts).all();
}

export async function getCcmStatus(email) {
    if (!ccmTrackingEnabled()) return null;
    const e = norm(email);
    const rows = await base(CCM_TABLES.Status).select({ filterByFormula: `{member_email} = "${e.replace(/"/g, "")}"`, maxRecords: 1 }).firstPage();
    return rows[0] || null;
}

export async function upsertCcmStatus(email, fields) {
    if (!ccmTrackingEnabled()) return null;
    const e = norm(email);
    const existing = await getCcmStatus(e);
    if (existing) return base(CCM_TABLES.Status).update(existing.id, fields, { typecast: true });
    return base(CCM_TABLES.Status).create({ member_email: e, ccm_status: "none", consecutive_non_engagements: 0, ...fields }, { typecast: true });
}

// source: card | chat_recommendation | checkout_link | direct_ask_answer
export async function logImpression({ email, source, checkoutType = "none", outcome = "pending", conversationId = "", now, isTest = false }) {
    if (!ccmTrackingEnabled()) return null;
    return base(CCM_TABLES.Impressions).create({
        member: norm(email), timestamp: new Date(now || Date.now()).toISOString(), source,
        checkout_type: checkoutType, outcome, conversation_id: conversationId || "", ...(isTest ? { is_test: true } : {}),
    }, { typecast: true });
}

export async function setImpressionOutcome(impressionId, outcome) {
    if (!ccmTrackingEnabled()) return null;
    return base(CCM_TABLES.Impressions).update(impressionId, { outcome });
}

// Call when the bot makes a proactive suggestion (not for direct asks).
export async function recordSuggestion(email, { conversationId, activityDayCount, followup = false, now } = {}) {
    if (!ccmTrackingEnabled()) return null;
    const at = new Date(now || Date.now()).toISOString();
    const rec = await getCcmStatus(email);
    const f = { last_suggestion_at: at, last_suggestion_conversation_id: conversationId || "" };
    if (num(activityDayCount) != null) f.last_suggestion_activity_day_count = activityDayCount;
    if (followup) f.followup_used = true;
    if (!rec || !rec.fields.ccm_status || rec.fields.ccm_status === "none") f.ccm_status = "recommended";
    await upsertCcmStatus(email, f);
    return logImpression({ email, source: "chat_recommendation", conversationId, now: at });
}

export async function recordCardShown(email, { activityDayCount, now } = {}) {
    if (!ccmTrackingEnabled()) return null;
    const at = new Date(now || Date.now()).toISOString();
    const f = { last_card_shown_at: at };
    if (num(activityDayCount) != null) f.last_card_shown_activity_day_count = activityDayCount;
    await upsertCcmStatus(email, f);
    return logImpression({ email, source: "card", now: at });
}

// After each mention: outcome engaged | ignored | declined | purchased.
export async function recordOutcome(email, outcome, { impressionId, activityDayCount, now } = {}) {
    if (!ccmTrackingEnabled()) return null;
    const rec = await getCcmStatus(email);
    if (impressionId) await setImpressionOutcome(impressionId, outcome);
    return upsertCcmStatus(email, statusUpdateForOutcome(rec?.fields, outcome, { activityDayCount, now }));
}

// Kajabi purchase of a CCM offer (first plan payment counts).
export async function markCcmPurchased(email, { offerId, now, isTest = false } = {}) {
    if (!ccmTrackingEnabled()) return null;
    const rec = await getCcmStatus(email);
    if (rec?.fields?.purchased) return { already: true, id: rec.id };
    await upsertCcmStatus(email, { purchased: true, ccm_status: "purchased", ...(isTest ? { is_test: true } : {}) });
    await logImpression({ email, source: "checkout_link", checkoutType: String(offerId) === CCM_PLAN_OFFER_ID ? "plan" : "full", outcome: "purchased", now, isTest });
    return { already: false };
}

export async function countActivityDays(email) {
    const e = norm(email).replace(/"/g, "");
    const f = `{member_email} = "${e}"`;
    const grab = async (table, field, extra) => {
        try {
            const rows = await selectAll(table, { filterByFormula: extra ? `AND(${f}, ${extra})` : f, fields: [field] });
            return rows.map((r) => r.fields[field]).filter(Boolean);
        } catch (err) { console.warn(`countActivityDays: ${table} skipped`, err?.message); return []; }
    };
    const gapRows = await (async () => { try { return (await selectAll("GapMethodResults", { filterByFormula: `{email} = "${e}"` })).map((r) => r.fields.diagnostic_completed_at || r.fields.created_at).filter(Boolean); } catch { return []; } })();
    const all = [
        ...(await grab("Shifts", "created_at")),
        ...(await grab("ActivationCompletions", "completed_at")),
        ...(await grab("ChatMessages", "created_at", `{role} = "user"`)),
        ...gapRows,
    ];
    return activityDayCountFromTimestamps(all);
}

export async function getFunnel({ includeTest = false } = {}) {
    const rows = await selectAll(CCM_TABLES.Impressions, includeTest ? {} : { filterByFormula: "NOT({is_test})" });
    return computeFunnel(rows.map((r) => r.fields));
}
