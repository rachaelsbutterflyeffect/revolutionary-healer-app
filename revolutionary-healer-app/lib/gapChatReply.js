// Reply settings + log-only usage line for the MEMBER GAP Method bot
// (/api/gap-chat-member) -- Oct 8 2026, approved by Rachael as part of the
// "long replies cut off" fix, extended from the main chatbot to the GAP bot.
//
// Used ONLY by app/api/gap-chat-member/route.ts's reply call. The public
// funnel GAP bot (/api/gap-chat), the main chat, the main chat's dormant GAP
// Step 3 marker retry and the background memory/summary/title calls keep
// their own settings.

import { thinkingTokensFromUsage } from "./mainChatReply";

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
