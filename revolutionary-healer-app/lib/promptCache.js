// Prompt caching for the MAIN chatbot (/api/chat) -- Oct 8 2026.
//
// WHAT THIS DOES: Anthropic can reuse ("cache") the start of a prompt it has
// seen in the last 5 minutes, so it doesn't have to re-read ~14k tokens of
// fixed coaching instructions on every single message. The cache only works
// on an IDENTICAL prefix, so we send the exact same system prompt text as
// before, just cut into two pieces at one fixed point:
//
//   piece 1 (cached):     everything from "You are Rachael's healing
//                          companion..." through the UPSELL paragraph. This is
//                          the same for every member (it only depends on the
//                          focus area, and members always chat in "general").
//   piece 2 (not cached): everything after that -- approved FAQ answers,
//                          guided process, GAP result, the member's Shifts,
//                          memories, chat summary, retrieved context, and the
//                          Update Progress addendum -- all per member/message.
//
// Nothing is reordered, added or removed: piece1 + piece2 === the original
// string, byte for byte (proved by scripts/test-chat-speed.mjs). Only the
// cache_control marker is new. Prompt caching does not change what the model
// writes -- Anthropic: "The response you receive is identical to what you
// would get if prompt caching were not used."
//
// Notes:
// - Cache lifetime is 5 minutes, refreshed (free) each time it's used, so it
//   helps whenever any member sent a message in the last 5 minutes.
// - Minimum cacheable length is 1,024 tokens for Claude Sonnet 5 (512 for some
//   newer models); piece 1 is ~14k tokens, comfortably above it.
// - A cache write costs 1.25x normal input price once; each hit costs 0.1x.
// - If the cut point text below is ever edited in lib/prompts.js, this falls
//   back to sending the plain string exactly as before (no caching, no harm),
//   and logs a warning. scripts/test-chat-speed.mjs also fails loudly.
//
// Deliberately NOT applied to the GAP bots (gap-chat-member / gap-chat).

// The last line of the UPSELL paragraph in buildSystemPrompt (lib/prompts.js).
// Everything up to and including it is fixed text.
export const SYSTEM_PROMPT_CACHE_CUT_AFTER = "mention the higher\ntier as the next level.\n";

let warnedMissingCut = false;

/**
 * Turn the main chatbot's system prompt string into the value for the
 * Messages API `system` field: two text blocks (same text, same order) with a
 * cache breakpoint on the first, or the unchanged string if the cut point
 * isn't found.
 * @param {string} systemPrompt
 * @returns {string | Array<{type: "text", text: string, cache_control?: {type: "ephemeral"}}>}
 */
export function toCachedSystemBlocks(systemPrompt) {
  if (typeof systemPrompt !== "string") return systemPrompt;
  const i = systemPrompt.indexOf(SYSTEM_PROMPT_CACHE_CUT_AFTER);
  if (i === -1) {
    if (!warnedMissingCut) {
      warnedMissingCut = true;
      console.warn("[promptCache] cut point not found in system prompt -- sending it uncached, exactly as before");
    }
    return systemPrompt;
  }
  const cut = i + SYSTEM_PROMPT_CACHE_CUT_AFTER.length;
  const stable = systemPrompt.slice(0, cut);
  const rest = systemPrompt.slice(cut);
  // The API rejects empty / whitespace-only text blocks, so only split when
  // the second piece has real content (in practice it always does: it
  // contains at least the "--- RETRIEVED CONTEXT ---" section).
  if (!rest.trim()) {
    return [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }];
  }
  return [
    { type: "text", text: stable, cache_control: { type: "ephemeral" } },
    { type: "text", text: rest },
  ];
}
