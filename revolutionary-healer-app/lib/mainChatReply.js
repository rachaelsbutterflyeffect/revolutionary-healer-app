// Reply-length settings for the MAIN chatbot's reply call (/api/chat) --
// Oct 8 2026 "long replies cut off mid-sentence" fix.
//
// THE BUG: the reply call used max_tokens 4096. On Claude Sonnet 5 that cap
// covers EVERYTHING the model writes for the turn: its hidden thinking
// (adaptive thinking is on by default) PLUS the visible reply. On a request
// that needs a long answer, thinking could use a big share of the 4096 and
// the visible reply simply stopped wherever the cap was hit
// (stop_reason "max_tokens"), mid-sentence. The 45s per-attempt timeout was
// also shorter than a ~4k-token reply takes to write (~80 tokens/s), so a
// very long reply could time out and be retried instead of finishing.
//
// THE FIX (settings only -- the model, prompt, thinking and effort are all
// unchanged, so normal replies are written exactly as before):
//   * MAIN_CHAT_MAX_TOKENS: room for thinking + a long reply. max_tokens is
//     only a ceiling -- you're billed for what's actually written, so short
//     replies cost the same as before. Thinking is NOT given more room on
//     purpose: the thinking setting/effort isn't touched (adaptive thinking
//     decides its own length from the request, not from this ceiling).
//   * MAIN_CHAT_REPLY_DEADLINE_MS: the reply call gets enough time to finish
//     writing a reply that long, under ONE overall deadline that also covers
//     the SDK's automatic retries. Worst case stays below the page's own
//     180s last-resort cap (public/app.html) and well under Vercel's 300s
//     function limit, and matches the streaming branch's overall cap.
//   * noteMainChatReplyStop(): server log only (Vercel logs) when a reply
//     still hits the ceiling, so it's visible if it ever happens again.
//     It does not change the reply, how it's saved, memory, or Shifts.
//
// Used ONLY by app/api/chat/route.ts's main reply call. The GAP bots
// (gap-chat-member / gap-chat), the GAP Step 3 marker retry and the
// background memory/summary/title calls keep their own settings.

// Ceiling for hidden thinking + visible reply, in tokens. ~8k leaves room
// for a reply of roughly 4,000+ words even after a long think, and is still
// fast enough to finish inside the deadline below (8,000 tokens at a slow
// ~60 tokens/s is ~135s; at the measured ~80-90 tokens/s it's ~95s).
export const MAIN_CHAT_MAX_TOKENS = 8000;

// One overall deadline for the reply call, including SDK retries.
// 160s + the dormant GAP marker retry (12s) + Airtable (~5s) = ~177s, still
// under the page's 180s cap; Vercel's limit is 300s.
export const MAIN_CHAT_REPLY_DEADLINE_MS = 160000;

/**
 * Request options for the main reply call: the per-attempt timeout is the
 * full deadline (a non-streamed reply only arrives once it's fully written),
 * and an abort signal enforces the same deadline across retries, so quick
 * failures (e.g. "overloaded") are still retried but the total never runs
 * past MAIN_CHAT_REPLY_DEADLINE_MS.
 * @returns {{ timeout: number, signal: AbortSignal }}
 */
export function mainChatReplyRequestOptions() {
  return {
    timeout: MAIN_CHAT_REPLY_DEADLINE_MS,
    signal: AbortSignal.timeout(MAIN_CHAT_REPLY_DEADLINE_MS),
  };
}

/**
 * Hidden-thinking token count from the API's usage breakdown, if present.
 * @param {any} usage
 * @returns {number | null}
 */
export function thinkingTokensFromUsage(usage) {
  const n = usage && usage.output_tokens_details && usage.output_tokens_details.thinking_tokens;
  return typeof n === "number" ? n : null;
}

/**
 * Log-only: warn in the server logs if a main-chat reply still hit the
 * token ceiling. Never throws and never changes anything.
 * @param {any} response
 * @returns {boolean} true if the reply was cut off by the ceiling
 */
export function noteMainChatReplyStop(response) {
  try {
    if (!response || response.stop_reason !== "max_tokens") return false;
    const u = response.usage || {};
    console.warn(
      "[chat] reply hit max_tokens (cut off) " +
        JSON.stringify({
          max_tokens: MAIN_CHAT_MAX_TOKENS,
          output_tokens: u.output_tokens,
          thinking_tokens: thinkingTokensFromUsage(u),
        })
    );
    return true;
  } catch (err) {
    return false;
  }
}
