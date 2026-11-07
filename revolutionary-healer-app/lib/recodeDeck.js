// Canonical Recode Deck. The app's Code Upgrade cards are the array in
// public/rf-codes.js (window.RF_CU_CARDS). Chat reads THAT file. It does not
// keep a second copy of the deck.
//
// Embody rule (Rachael): 98321 is the only current Embody code. 61374 is
// retired and is never a second current Embody code — not in answers, links,
// or status checks.

import fs from "fs";
import path from "path";

export const CURRENT_EMBODY_CODE = "98321";
export const RETIRED_EMBODY_CODE = "61374";

export const RETIRED_CODES = Object.freeze([
  {
    code: RETIRED_EMBODY_CODE,
    name: "Embody",
    replacedBy: CURRENT_EMBODY_CODE,
    retired: true,
  },
]);

export const CODES_LIST_PATH = "My Revolution → Your codes";
export const DAILY_CODE_PATH = "Today's Focus → Your Daily Code";

const DECK_FILE = path.join(process.cwd(), "public", "rf-codes.js");

export function extractCardsArray(source) {
  const marker = "var CU_CARDS = ";
  const start = String(source || "").indexOf(marker);
  if (start < 0) throw new Error("Recode deck marker missing");
  let i = start + marker.length;
  if (source[i] !== "[") throw new Error("Recode deck array missing");
  let depth = 0;
  let inStr = false;
  let quote = "";
  let esc = false;
  for (let j = i; j < source.length; j++) {
    const c = source[j];
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (c === "\\") {
        esc = true;
        continue;
      }
      if (c === quote) inStr = false;
      continue;
    }
    if (c === "'" || c === '"') {
      inStr = true;
      quote = c;
      continue;
    }
    if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) return source.slice(i, j + 1);
    }
  }
  throw new Error("Recode deck array unclosed");
}

export function parseDeckSource(source) {
  const arrayText = extractCardsArray(source);
  const raw = Function(`"use strict"; return (${arrayText});`)();
  if (!Array.isArray(raw) || raw.length < 10) throw new Error("Recode deck unreadable");
  const cards = raw.map((c) => ({
    name: String(c.n || "").trim(),
    code: String(c.c || "").trim(),
    file: String(c.f || "").trim(),
    activationTitle: String(c.a || "").trim(),
    activationSlug: String(c.s || "").trim(),
    missingActivation: !c.s || !!c.missing,
    reading: String(c.r || "").trim(),
    paid: c.paid === true,
  }));
  if (cards.some((c) => c.code === RETIRED_EMBODY_CODE)) {
    throw new Error("Retired Embody code 61374 is in the current deck");
  }
  const embody = cards.filter((c) => c.name.toLowerCase() === "embody");
  if (embody.length !== 1 || embody[0].code !== CURRENT_EMBODY_CODE) {
    throw new Error("Current Embody code must be exactly 98321");
  }
  return cards;
}

let cached = null;
let cachedMtime = 0;

export function loadRecodeDeck(file = DECK_FILE) {
  const stat = fs.statSync(file);
  if (cached && cachedMtime === stat.mtimeMs) return cached;
  const cards = parseDeckSource(fs.readFileSync(file, "utf8"));
  cached = cards;
  cachedMtime = stat.mtimeMs;
  return cards;
}

export function isRetiredEmbodyCode(code) {
  return String(code || "").trim() === RETIRED_EMBODY_CODE;
}

/** True only for the one current Embody card. Never true for 61374. */
export function isCurrentEmbodyCode(code, cards) {
  const n = String(code || "").trim();
  if (n === RETIRED_EMBODY_CODE) return false;
  if (n !== CURRENT_EMBODY_CODE) return false;
  return (cards || []).some((c) => c.code === CURRENT_EMBODY_CODE && c.name.toLowerCase() === "embody");
}

export function currentEmbodyCard(cards) {
  return (cards || []).find((c) => isCurrentEmbodyCode(c.code, cards)) || null;
}

export function retiredRecord(code) {
  return RETIRED_CODES.find((r) => r.code === String(code || "").trim()) || null;
}

export function cardByCode(cards, code) {
  const n = String(code || "").trim();
  if (isRetiredEmbodyCode(n)) return null;
  return (cards || []).find((c) => c.code === n) || null;
}
