// Payment-only Kajabi offer -> five days of full app access.
// Kajabi does not host Reset & Restore and this offer has no product attached.
// The offer id is recognized even when RR_FIVE_DAY_OFFER_IDS is empty, so it
// cannot fall through to a permanent membership. This module does not send email.

export const FIVE_DAY_PASS_MS = 5 * 24 * 60 * 60 * 1000;
export const RESET_RESTORE_OFFER_ID = "2151496665";
export const APP_SIGN_IN_URL = "https://www.therevolutionaryhealer.com/";

export const PURCHASE_EMAIL_DRAFT = [
    "Your five days of Revolutionary Healer access are ready.",
    "",
    "Open the app: https://www.therevolutionaryhealer.com/",
    "",
    "Sign in with the same email address you used for this purchase.",
    "",
    "First time in the app: on that page, choose a password of at least 6 characters. The app saves it as your app password. It does not check a Kajabi password, and this purchase does not create one.",
    "",
    "Already have an app password: sign in with that password. This purchase does not replace it.",
    "",
    "Access lasts five days from the purchase. Reset & Restore is already inside the app.",
].join("\n");

export function fiveDayOfferIds(env = process.env) {
    const raw = env && (env.RR_FIVE_DAY_OFFER_IDS ?? env.RR_FIVE_DAY_OFFER_ID) || "";
    const extra = String(raw).split(",").map((id) => id.trim()).filter(Boolean);
    return [RESET_RESTORE_OFFER_ID, ...extra.filter((id) => id !== RESET_RESTORE_OFFER_ID)];
}

function firstText(...values) {
    for (const value of values) {
        if (value == null) continue;
        const text = String(value).trim();
        if (text) return text;
    }
    return "";
}

function asObject(value) {
    return value && typeof value === "object" ? value : {};
}

// Live Kajabi deliveries are payment.succeeded. The root id is a new UUID on
// every delivery. The purchase is payment_transaction.id, and its created_at
// is the purchase time. A payment.succeeded body with no transaction id is
// not given the event UUID, because that UUID would grant again on retry.
export function readKajabiWebhook(event) {
    const root = asObject(event);
    const wrapped = asObject(root.payload);
    const member = asObject(root.member || wrapped.member);
    const offer = asObject(root.offer || wrapped.offer);
    const transaction = asObject(root.payment_transaction || wrapped.payment_transaction);
    const eventType = firstText(root.event_type, root.event, wrapped.event_type, wrapped.event);
    const transactionId = firstText(transaction.id, root.purchase && root.purchase.id, wrapped.purchase_id);
    const eventId = firstText(root.id, wrapped.id);
    const paymentSucceeded = /^payment[._]succeeded$/i.test(eventType);
    return {
        email: firstText(member.email, root.member_email, wrapped.member_email),
        firstName: firstText(member.first_name, root.first_name, wrapped.member_first_name),
        offerId: firstText(offer.id, root.offer_id, wrapped.offer_id),
        eventType,
        purchaseId: transactionId || (paymentSucceeded ? "" : eventId),
        purchasedAt: firstText(transaction.created_at, root.purchased_at, wrapped.purchased_at, transactionId ? "" : root.created_at, transactionId ? "" : wrapped.created_at),
    };
}

// Refund bodies have not been verified against a live Kajabi payload.
// payment.succeeded grants. cancellation and refund do not change the pass.
export const KNOWN_REFUND_EVENTS = ["cancellation", "refund"];
export const REFUND_PAYLOAD_NOTE = "Kajabi's refund webhook body has not been verified. payment.succeeded grants the five-day pass. A cancellation or refund event does not change it, and needs a manual revoke. A refund of an older purchase must not shorten a later purchase.";

export function isRefundEvent(eventType) {
    return KNOWN_REFUND_EVENTS.includes(String(eventType || "").trim().toLowerCase());
}

export function webhookIdempotencyKey(transactionId, eventType) {
    if (!transactionId) return "";
    return `${transactionId}:${isRefundEvent(eventType) ? "refund" : "purchase"}`;
}

function idList(value) {
    return String(value || "").split(",").map((id) => id.trim()).filter(Boolean);
}

export function isFiveDayOffer(offerId, env = process.env) {
    const known = fiveDayOfferIds(env);
    return String(offerId || "").split(",").map((id) => id.trim()).some((id) => id && known.includes(id));
}

export function fiveDayPassState(fields, now = new Date()) {
    const record = fields || {};
    const explicitEnd = record.rr_pass_ends_at ? new Date(record.rr_pass_ends_at) : null;
    const startedAt = record.rr_pass_started_at ? new Date(record.rr_pass_started_at) : null;
    const endsMs = explicitEnd && !Number.isNaN(explicitEnd.getTime())
        ? explicitEnd.getTime()
        : (startedAt && !Number.isNaN(startedAt.getTime()) ? startedAt.getTime() + FIVE_DAY_PASS_MS : null);
    if (endsMs == null) {
        return { active: false, expired: false, revoked: false, endsAt: null, daysRemaining: 0 };
    }
    const nowMs = now.getTime();
    const active = nowMs < endsMs;
    return {
        active,
        expired: !active,
        revoked: false,
        endsAt: new Date(endsMs).toISOString(),
        daysRemaining: active ? Math.max(0, Math.ceil((endsMs - nowMs) / (24 * 60 * 60 * 1000))) : 0,
    };
}

// A new transaction extends five days from the current paid end. The same
// transaction never extends. Refunds are not applied here. The patch never
// includes member_active, tier_active, beta, DLRH, or a password.
export function planFiveDayPass({ existingFields = null, eventType, now = new Date(), purchaseId, purchasedAt }) {
    const fields = existingFields || {};
    const applied = idList(fields.rr_pass_purchase_ids);
    const id = String(purchaseId || "").trim();
    if (isRefundEvent(eventType)) {
        return { patch: {}, sendEmail: false, outcome: "manual_revoke", manualRevoke: true };
    }
    if (!id) {
        return { patch: {}, sendEmail: false, outcome: "missing_transaction_id" };
    }
    if (applied.includes(id)) {
        return { patch: {}, sendEmail: false, outcome: "already_existed", duplicate: true };
    }
    const transactionTime = purchasedAt ? new Date(purchasedAt) : now;
    const current = fiveDayPassState(fields, now);
    const base = current.active ? new Date(current.endsAt).getTime() : transactionTime.getTime();
    const patch = {
        rr_pass_ends_at: new Date(base + FIVE_DAY_PASS_MS).toISOString(),
        rr_pass_purchase_ids: [...applied, id].join(","),
    };
    if (!fields.rr_pass_started_at) patch.rr_pass_started_at = transactionTime.toISOString();
    return { patch, sendEmail: false, outcome: applied.length ? "already_existed" : "created" };
}
