// Home-screen upgrade line for an active Reset & Restore five-day pass.
// Shown only with 3, 2, or 1 days left. Hidden for Revolutionary Healer
// members, Beta, DLRH, and anyone with an RH membership purchase on record.
// A failed or unclear purchase lookup hides the line.

import { isCcmOffer } from "./ccm-tracking.js";
import { isFiveDayOffer } from "./fiveDayPass.js";

export const FIVE_DAY_UPGRADE_CHECKOUT_URL = "https://www.rachaelsbutterflyeffect.com/offers/rkwoQv2s/checkout";

// Full Access monthly, annual, lifetime, and Founding Beta. The five-day
// pass is not one of these. MEMBER_OFFER_IDS and TIER_OFFER_IDS count too.
export const RH_MEMBERSHIP_OFFER_IDS = ["2151318869", "2151318870", "2151324815", "2151324817"];

const GAP_METHOD_OFFER_ID = "2151330100";
const VIP_TELEGRAM_OFFER_ID = "2151324816";
const GAP_IDENTITY_OFFER_IDS = ["2151318706", "2151318707", "2151318708", "2151318709", "2151318710", "2151318712"];

function envList(env, name) {
    return String((env && env[name]) || "").split(",").map((id) => id.trim()).filter(Boolean);
}

export function fiveDayUpgradeBannerCopy(days) {
    if (days === 1) return "Full access, 1 day left · Upgrade today, $30 a month";
    if (days === 2 || days === 3) return `Full access, ${days} days left · Upgrade today, $30 a month`;
    return "";
}

export function isRhMembershipOffer(offerId, env = process.env) {
    const id = String(offerId || "").trim();
    if (!id) return false;
    if (RH_MEMBERSHIP_OFFER_IDS.includes(id)) return true;
    return envList(env, "MEMBER_OFFER_IDS").includes(id) || envList(env, "TIER_OFFER_IDS").includes(id);
}

// Purchases that are not Revolutionary Healer membership. Anything else,
// including an offer id we do not recognize, hides the banner.
export function isSafeNonMembershipOffer(offerId, env = process.env) {
    const id = String(offerId || "").trim();
    if (!id) return false;
    if (isFiveDayOffer(id, env)) return true;
    if (isRhMembershipOffer(id, env)) return false;
    if (isCcmOffer(id, env)) return true;
    const gapIds = envList(env, "GAP_METHOD_OFFER_IDS");
    if ((gapIds.length ? gapIds : [GAP_METHOD_OFFER_ID]).includes(id)) return true;
    if (id === VIP_TELEGRAM_OFFER_ID) return true;
    return GAP_IDENTITY_OFFER_IDS.includes(id);
}

function offerIdList(value) {
    if (Array.isArray(value)) return value.flatMap(offerIdList);
    return String(value ?? "").split(",").map((id) => id.trim()).filter(Boolean);
}

export function webhookOfferHidesBanner(value, env = process.env) {
    const ids = offerIdList(value);
    if (!ids.length) return true;
    return ids.some((id) => !isSafeNonMembershipOffer(id, env));
}

export function otherOfferHidesBanner(value, env = process.env) {
    const ids = offerIdList(value);
    if (!ids.length) return false;
    return ids.some((id) => !isSafeNonMembershipOffer(id, env));
}

export function decideFiveDayUpgradeBanner({
    entitlement = null,
    memberFields = null,
    webhookOfferIds = [],
    otherOfferIds = [],
    historyOk = false,
    env = process.env,
} = {}) {
    const days = Number(entitlement && entitlement.fiveDayPassDaysRemaining);
    const daysRemaining = Number.isFinite(days) ? days : 0;
    const hide = (reason) => ({ show: false, daysRemaining, reason, copy: "" });
    if (!entitlement || entitlement.onFiveDayPass !== true) return hide("no_active_pass");
    if (days !== 1 && days !== 2 && days !== 3) return hide("days");
    const fields = memberFields || {};
    if (entitlement.memberActive || entitlement.tierActive || fields.member_active || fields.tier_active) return hide("member");
    if (
        entitlement.onBetaMembership || entitlement.onDlrhMembership
        || fields.beta_member_started_at || fields.dlrh_member_started_at
    ) return hide("beta_or_dlrh");
    if (historyOk !== true) return hide("history_unavailable");
    const hooks = Array.isArray(webhookOfferIds) ? webhookOfferIds : [webhookOfferIds];
    for (const raw of hooks) {
        if (webhookOfferHidesBanner(raw, env)) return hide("rh_purchase");
    }
    const others = Array.isArray(otherOfferIds) ? otherOfferIds : [otherOfferIds];
    for (const raw of others) {
        if (otherOfferHidesBanner(raw, env)) return hide("rh_purchase");
    }
    return { show: true, daysRemaining, reason: "show", copy: fiveDayUpgradeBannerCopy(days) };
}

// Skips the purchase lookup unless the pass itself would qualify. A lookup
// that throws or comes back unclear hides the line.
export async function resolveFiveDayUpgradeBanner({ entitlement, memberFields = null, loadOfferIds, env = process.env }) {
    const pre = decideFiveDayUpgradeBanner({
        entitlement, memberFields, webhookOfferIds: [], otherOfferIds: [], historyOk: true, env,
    });
    if (!pre.show) return pre;
    try {
        const history = await loadOfferIds();
        if (!history || history.ok !== true) {
            return { show: false, daysRemaining: pre.daysRemaining, reason: "history_unavailable", copy: "" };
        }
        return decideFiveDayUpgradeBanner({
            entitlement,
            memberFields,
            webhookOfferIds: history.webhookOfferIds || [],
            otherOfferIds: history.otherOfferIds || [],
            historyOk: true,
            env,
        });
    } catch {
        return { show: false, daysRemaining: pre.daysRemaining, reason: "history_unavailable", copy: "" };
    }
}
