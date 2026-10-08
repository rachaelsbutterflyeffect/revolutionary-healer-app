// GAP Method "one deep reading" helpers (Oct 8 2026, Rachael's reading-
// mechanism restructure -- TEST PREVIEW, not live). Used ONLY by
// app/api/gap-chat-member/route.ts, and only when the switch below is on.
//
// WHAT CHANGES (reading mechanism only):
//   * Step 2 chat turns: same model, same system prompt text, same messages,
//     plus output_config.effort = "low" so the light chat answers fast.
//   * The end of Step 2 ("I'm ready" / "Continue to step 3"): ONE deep
//     reading at the default (high) effort, sent exactly once by the page
//     while the Step 3 "analyzing" animation runs. Its message is today's
//     hidden completion request, word for word, followed by an APPENDED
//     block (below) that adds the member's Step 1 answers, asks for the
//     activation title exactly as it appears in her library, and asks for
//     two extra hidden markers: [[ACTIVATION_WHY: ...]] and
//     [[TODAYS_FOCUS: ...]].
//
// WHAT DOES NOT CHANGE: GAP's instructions (lib/processes.js), the
// activation knowledge (lib/activationGuide.js, lib/activations.js), the
// divine identities, distortion routing and every word of the education in
// the system prompt. Nothing here edits that text; the new instructions
// live only in the appended block of the hidden completion message.
//
// SWITCH (server env, default OFF = byte-for-byte today's requests):
//   GAP_FAST_READING            off (default / missing) | allowlist | on
//   GAP_FAST_READING_ALLOWLIST  optional; if not set, CHAT_STREAMING_ALLOWLIST

import { chatStreamingAllowed } from "./chatStreaming";

// Today's hidden completion request (public/app.html skipToReveal), verbatim.
export const GAP_READING_KICKOFF =
  "(The member is ready to move forward. Give your Step 2 completion summary now, in the style already described, then stop.)";

export const GAP_CHAT_TURN_EFFORT = "low";
export const GAP_ACTIVATION_RETRY_MAX_TOKENS = 2000;

export function gapFastReadingSwitch(env = process.env) {
  return {
    mode: env.GAP_FAST_READING,
    allowlist: env.GAP_FAST_READING_ALLOWLIST || env.CHAT_STREAMING_ALLOWLIST,
  };
}

/** True when the restructure is on for this member (same switch rules as streaming). */
export function gapFastReadingEnabled({ mode, allowlist, email } = {}) {
  return chatStreamingAllowed({ mode, allowlist, email, requested: true });
}

const clip = (s, n) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, n);
const noMarkers = (s) => s.replace(/\[\[|\]\]/g, "");

/** Step 1 answers from the page: [{question, answer}] (max 3, short strings). */
export function sanitizeStep1(step1) {
  if (!Array.isArray(step1)) return [];
  return step1
    .slice(0, 3)
    .map((x) => ({ question: noMarkers(clip(x && x.question, 200)), answer: noMarkers(clip(x && x.answer, 200)) }))
    .filter((x) => x.question && x.answer);
}

/** The member's activation library titles, as the page lists them. */
export function sanitizeLibrary(titles) {
  if (!Array.isArray(titles)) return [];
  const out = [];
  for (const t of titles.slice(0, 150)) {
    const c = noMarkers(clip(t, 140));
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

/**
 * The appended block of the reading message. New instructions only; it
 * never repeats, edits or overrides the education in GAP's instructions.
 */
export function buildReadingBlock({ step1 = [], library = [], identityName = "" } = {}) {
  const lines = [];
  lines.push("(Private notes for this one reading -- never mention or quote these notes to the member.");
  lines.push("");
  lines.push("This is the single deep reading for this member. Use the whole conversation above -- above all the member's own words -- together with the Step 1 answers below. This one reading produces the member's Step 3 diagnostic, Shift card and Today's Focus, so all three must come from the same understanding of this member.");
  if (step1.length) {
    lines.push("");
    lines.push("The member's Step 1 answers:");
    step1.forEach((x, i) => lines.push(`${i + 1}. ${x.question} -> "${x.answer}"`));
  }
  if (library.length) {
    lines.push("");
    lines.push("In SAVE_SHIFT, recommendedActivation must be copied exactly, character for character, from this list of the activation titles in the member's library. Choose the one that fits what THIS member actually said -- her own words and situation -- not just her Divine Identity:");
    lines.push(library.join(" | "));
  }
  lines.push("");
  lines.push("After the TOPIC marker, add these two hidden markers, each on its own line:");
  lines.push("[[ACTIVATION_WHY: two to three sentences, in your own words, on why this activation meets the specific pattern that surfaced for this member]]");
  lines.push(`[[TODAYS_FOCUS: two to four short sentences, never more, spoken to the member as "you", woven from the member's own words (echo or quote their phrases), naming their Divine Identity${identityName ? ` (${identityName})` : ""}, covering the core of their gap and the transformation they are moving into. Plain sentences only -- no list, no heading, no long paragraph.]])`);
  return lines.join("\n");
}

export function buildReadingMessage(message, opts) {
  return `${message}\n\n${buildReadingBlock(opts)}`;
}

/** One-line follow-up when a Healer reading came back without a valid activation title. */
export function buildActivationRetryMessage(library = []) {
  return (
    "(Private note -- never shown to the member. The recommendedActivation in your SAVE_SHIFT was missing or was not an exact title from the member's library. " +
    "Reply with ONLY this one line and nothing else: [[ACTIVATION_PICK: exact title]] -- the title copied character for character from this list, chosen for what this member actually said: " +
    library.join(" | ") +
    ")"
  );
}

function markerText(reply, name) {
  const m = String(reply || "").match(new RegExp("\\[\\[" + name + ":\\s*([\\s\\S]*?)\\]\\]", "i"));
  return m ? m[1].trim() : "";
}

/** Reads the deep reading's hidden markers (never shown on screen). */
export function parseReadingReply(reply) {
  const out = { saveShift: null, activationPick: "", activationWhy: "", todaysFocus: "" };
  const raw = markerText(reply, "SAVE_SHIFT");
  if (raw) {
    try { out.saveShift = JSON.parse(raw); } catch (e) { out.saveShift = null; }
  }
  if (out.saveShift && typeof out.saveShift.recommendedActivation === "string") out.activationPick = out.saveShift.recommendedActivation.trim();
  out.activationWhy = markerText(reply, "ACTIVATION_WHY");
  out.todaysFocus = markerText(reply, "TODAYS_FOCUS");
  return out;
}

export function parseActivationRetry(reply) {
  return markerText(reply, "ACTIVATION_PICK") || markerText(reply, "SAVE_SHIFT") || "";
}

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d"'`*_]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[\s.,;:!]+$/, "")
    .trim();

/** Exact library title for the AI's pick, or null. Exact first, then case/space/quote-insensitive. */
export function matchLibraryTitle(pick, library = []) {
  if (!pick || !library.length) return null;
  const p = String(pick).trim();
  if (library.includes(p)) return p;
  const n = norm(p);
  const hits = library.filter((t) => norm(t) === n);
  return hits.length === 1 ? hits[0] : null;
}

function cleanText(s) {
  return String(s || "")
    .replace(/\*\*|__|`/g, "")
    .replace(/^\s*[-*\u2022]\s+/gm, "")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}
export function splitSentences(s) {
  const t = cleanText(s);
  if (!t) return [];
  return t.match(/[^.!?]+(?:[.!?]+["'\u201d\u2019)]*|$)/g).map((x) => x.trim()).filter(Boolean);
}

/** Today's Focus text: 2-4 sentences, plain, max ~700 chars. Notes whether it names the identity. */
export function normalizeTodaysFocus(text, identityName = "") {
  let sentences = splitSentences(text);
  const trimmed = sentences.length > 4;
  if (trimmed) sentences = sentences.slice(0, 4);
  while (sentences.length > 2 && sentences.join(" ").length > 700) sentences.pop();
  const out = sentences.join(" ");
  const core = String(identityName || "").replace(/^the\s+/i, "").trim().toLowerCase();
  return {
    text: out,
    sentences: sentences.length,
    trimmed,
    namesIdentity: !!core && out.toLowerCase().includes(core),
    inRange: sentences.length >= 2 && sentences.length <= 4,
  };
}

export function isHealerContext(gapContext) {
  return /healer/i.test(String((gapContext && gapContext.divineIdentity) || ""));
}

/** Log-only line comparing the AI's activation pick with the old fixed one. */
export function logGapReading(line) {
  try {
    console.log("[gap-reading] " + JSON.stringify(line));
  } catch (e) {}
}
