// Reply settings + log-only usage line for the MEMBER GAP Method bot
// (/api/gap-chat-member) -- Oct 8 2026, approved by Rachael as part of the
// "long replies cut off" fix, extended from the main chatbot to the GAP bot.
//
// Used ONLY by app/api/gap-chat-member/route.ts's reply call. The public
// funnel GAP bot (/api/gap-chat), the main chat, the main chat's dormant GAP
// Step 3 marker retry and the background memory/summary/title calls keep
// their own settings.

import { thinkingTokensFromUsage } from "./mainChatReply";

// THE RISK (same as the main chat's bug): the GAP reply call used
// max_tokens 4096, and on Claude Sonnet 5 that ceiling covers the hidden
// thinking PLUS the visible reply PLUS the hidden markers the page needs to
// save the Shift ([[SAVE_SHIFT: {...}]] etc. come LAST, so they are the
// first thing lost if a reply is cut off -- the Shift card would then be
// saved with "This reflection wasn't captured this time").
// Measured on the TEST preview (Oct 8, 6 GAP flows / 24 replies, all with
// the 4096 ceiling): normal turns used 265-1,553 tokens (thinking 0-1,438);
// Step 2 completion messages carrying the Shift markers 424-1,423; when the
// member asked for a long, thorough reflection 2,613-3,213 (thinking up to
// 2,432) -- one completion message WITH the Shift markers used 3,107 of the
// 4,096 (76%). None was cut off in these runs, but the margin is thin: the
// main chat has shown thinking alone at ~7,300 on heavy requests.
//
// THE FIX (setting only -- model, prompt, thinking and effort unchanged):
// the same 10,000 ceiling as the main chat. It is only a ceiling: billing is
// for what is actually written, so normal GAP replies cost and take exactly
// the same. No timeout change: this call has never had the main chat's 45s
// per-attempt limit (it uses the SDK default), so long GAP replies were
// never cut off by time; 10,000 tokens at the measured ~80-90 tokens/s is
// ~2 minutes, inside Vercel's 300s limit.
export const GAP_CHAT_MAX_TOKENS = 10000;

/**
 * Log-only: one line in the Vercel logs per GAP reply with timing, token
 * counts (incl. hidden thinking) and whether the hidden markers the page
 * needs for Shift saving were present. Never logs reply text or marker
 * contents, never throws, never changes anything.
 * @param {any} response  the Anthropic message
 * @param {number} ms     how long Claude took
 * @param {number} maxTokens  the ceiling the call used
 */
export function logGapChatUsage(response, ms, maxTokens) {
  try {
    const u = (response && response.usage) || {};
    const text = ((response && response.content) || [])
      .filter((b) => b && b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const line = {
      ms,
      max_tokens: maxTokens,
      input_tokens: u.input_tokens,
      output_tokens: u.output_tokens,
      thinking_tokens: thinkingTokensFromUsage(u),
      stop_reason: response && response.stop_reason,
      reply_chars: text.length,
      save_shift: /\[\[SAVE_SHIFT:/i.test(text),
      final_identity: /\[\[FINAL_IDENTITY:/i.test(text),
      distortions: /\[\[DISTORTIONS:/i.test(text),
    };
    if (line.stop_reason === "max_tokens") console.warn("[gap-chat-member] reply hit max_tokens (cut off) " + JSON.stringify(line));
    else console.log("[gap-chat-member] claude usage " + JSON.stringify(line));
    return line;
  } catch (err) {
    return null;
  }
}
