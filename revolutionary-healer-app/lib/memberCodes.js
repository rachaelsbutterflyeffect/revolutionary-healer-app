// A member's Recode Deck codes: pulls plus older saved Code Upgrade shifts.
// Same rows My Revolution already uses. Record ids stay on the server.

import { getShiftsByEmail, listCodePullEvents } from "./airtable.js";
import { classify } from "./revolutionSections.js";
import { cardByCode, loadRecodeDeck } from "./recodeDeck.js";
import { codeFacts } from "./codeChat.js";

export function heldFromSources({ pulls = [], shifts = [] } = {}) {
  const classified = classify({ shifts, pulls });
  const seen = new Set();
  const held = [];
  for (const row of classified.codes) {
    const code = String(row.code || "");
    if (!code || seen.has(code)) continue;
    seen.add(code);
    held.push({ name: row.name || "", code, card: row.card || "", at: row.at || "" });
  }
  return held;
}

export async function loadHeldCodes(email) {
  const [events, shiftRows] = await Promise.all([
    listCodePullEvents(email),
    getShiftsByEmail(email),
  ]);
  const pulls = (events || []).map((r) => {
    let meta = {};
    try { meta = JSON.parse(r.fields?.meta || "{}"); } catch { meta = {}; }
    return { name: meta.name, card: meta.card, code: meta.code, at: r.fields?.created_at || "" };
  });
  const shifts = (shiftRows || []).map((r) => ({
    id: r.id,
    methodName: r.fields?.method_name ?? "",
    divineIdentityName: r.fields?.divine_identity_name ?? "",
    focusArea: r.fields?.focus_area ?? "",
    createdAt: r.fields?.created_at ?? "",
  }));
  return heldFromSources({ pulls, shifts });
}

export function publicCard(card, facts) {
  if (!card) return null;
  return {
    name: card.name,
    code: card.code,
    inclusion: facts ? facts.inclusion : card.paid ? "paid-unlock" : "included-with-membership",
    memberStatus: facts ? facts.memberStatus : null,
    activationTitle: card.activationTitle || "",
    activationSlug: card.activationSlug || "",
    reading: card.reading || "",
  };
}

export function cardsForMember({ held, entitlement, codePull, focusCode }) {
  const deck = loadRecodeDeck();
  const list = held
    .map((row) => {
      const card = cardByCode(deck, row.code);
      if (!card) return null;
      return publicCard(card, codeFacts(card, { held, entitlement, codePull }));
    })
    .filter(Boolean);
  let focus = null;
  if (focusCode) {
    const card = cardByCode(deck, focusCode);
    if (card) focus = publicCard(card, codeFacts(card, { held, entitlement, codePull }));
  }
  return { held: list, focus };
}
