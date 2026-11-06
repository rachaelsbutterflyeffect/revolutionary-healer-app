// Payment-only Kajabi offer -> five days of full app access.
// Kajabi does not host Reset & Restore. The app already does.
// The real offer id is not bound until RR_FIVE_DAY_OFFER_IDS is set.
// This module does not send email.

export const FIVE_DAY_PASS_MS = 5 * 24 * 60 * 60 * 1000;
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
    return String(raw).split(",").map((id) => id.trim()).filter(Boolean);
}

export function isFiveDayOffer(offerId, env = process.env) {
    if (offerId == null || String(offerId).trim() === "") return false;
    return fiveDayOfferIds(env).includes(String(offerId));
}

export function fiveDayPassState(fields, now = new Date()) {
    const startedAt = fields && fields.rr_pass_started_at ? new Date(fields.rr_pass_started_at) : null;
    const revokedAt = fields && fields.rr_pass_revoked_at ? new Date(fields.rr_pass_revoked_at) : null;
    const startedMs = startedAt && !Number.isNaN(startedAt.getTime()) ? startedAt.getTime() : null;
    const revokedMs = revokedAt && !Number.isNaN(revokedAt.getTime()) ? revokedAt.getTime() : null;
    if (startedMs == null) {
        return { active: false, expired: false, revoked: false, endsAt: null, daysRemaining: 0 };
    }
    if (revokedMs != null && revokedMs >= startedMs) {
        return { active: false, expired: true, revoked: true, endsAt: null, daysRemaining: 0 };
    }
    const endsMs = startedMs + FIVE_DAY_PASS_MS;
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

// Returns only the Members fields this offer may write. Never member_active,
// tier_active, beta, DLRH, or a password.
export function planFiveDayPass({ existingFields = null, eventType, now = new Date() }) {
    const isCancellation = eventType === "cancellation" || eventType === "refund";
    const current = fiveDayPassState(existingFields || {}, now);
    if (isCancellation) {
        return {
            patch: { rr_pass_revoked_at: now.toISOString() },
            sendEmail: false,
            alreadyActive: false,
        };
    }
    if (current.active) {
        return { patch: {}, sendEmail: false, alreadyActive: true };
    }
    return {
        patch: { rr_pass_started_at: now.toISOString() },
        sendEmail: false,
        alreadyActive: false,
    };
}
