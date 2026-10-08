// Smarter chat titles (Oct 7 2026, James's approved design -- see
// "Smarter chat titles" on the chatbot upgrades master list).
//
// - A brand-new chat is named with a dated placeholder, e.g. "New Chat · Oct 7",
//   so it's still easy to find in the drawer before it has a real theme.
// - On the member's 1st and 2nd messages, a title is set only if the content
//   already has a clear theme (a plain "hi" keeps the placeholder).
// - After the member's 3rd message, one final 3-6 word title is generated from
//   the conversation so far (both sides). No re-titling after that.
// - A manual rename always wins (title_is_auto === false is never touched).
//
// Pure helpers only (no SDK / Airtable imports) so they're safe to use from
// any route and easy to unit test.

export const DEFAULT_TITLE_TIME_ZONE = "America/Toronto";
export const PLACEHOLDER_BASE = "New Chat";
// Member message number after which the final title is generated.
export const FINAL_TITLE_AT_MEMBER_MESSAGE = 3;

function safeTimeZone(tz) {
  if (typeof tz !== "string" || !tz || tz.length > 64) return DEFAULT_TITLE_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return tz;
  } catch (err) {
    return DEFAULT_TITLE_TIME_ZONE;
  }
}

/** "New Chat · Oct 7" in the member's time zone (falls back to America/Toronto). */
export function placeholderChatTitle(date = new Date(), timeZone) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return PLACEHOLDER_BASE;
  const label = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: safeTimeZone(timeZone),
  }).format(d);
  return `${PLACEHOLDER_BASE} · ${label}`;
}

/** True for an empty title, the legacy "New Chat", or a dated "New Chat · ..." placeholder. */
export function isPlaceholderTitle(title) {
  const t = String(title || "").trim();
  return !t || t === PLACEHOLDER_BASE || t.startsWith(`${PLACEHOLDER_BASE} · `);
}

/**
 * Decide what (if anything) to do with the title for this member message.
 * Returns "final" | "provisional" | null.
 */
export function titleActionForMessage({ titleIsAuto, currentTitle, memberMessageNumber }) {
  if (titleIsAuto === false) return null; // manual rename always wins
  if (memberMessageNumber === FINAL_TITLE_AT_MEMBER_MESSAGE) return "final";
  if (memberMessageNumber < FINAL_TITLE_AT_MEMBER_MESSAGE && isPlaceholderTitle(currentTitle)) {
    return "provisional";
  }
  return null; // never re-title after the final title
}

/** Clean a model-produced title; returns null for NONE / empty. */
export function cleanGeneratedTitle(raw) {
  let t = String(raw || "").split("\n")[0].trim();
  t = t.replace(/^title\s*:\s*/i, "");
  t = t.replace(/^["'“”‘’*_`]+|["'“”‘’*_`]+$/g, "").trim();
  t = t.replace(/[.!?,;:]+$/, "").trim();
  if (!t || /^none$/i.test(t)) return null;
  if (t.length > 60) t = t.slice(0, 60).replace(/\s+\S*$/, "").trim() || t.slice(0, 60);
  return t;
}
