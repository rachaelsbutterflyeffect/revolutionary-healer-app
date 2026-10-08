// Authenticated chat endpoint for the in-app "3 Step GAP Method" (Step 2
// only -- Steps 1 and 3 are fully deterministic, driven entirely by client-side
// data/logic in public/app.html, matching public/gap-method.html's funnel
// design). Mirrors app/api/gap-chat/route.ts's request/response contract
// ({message, history, gapContext} -> {reply}) but is gated by entitlement like
// app/api/chat/route.ts, and uses buildGapMemberSystemPrompt
// (GAP_METHOD_SCRIPT_MEMBER) instead of the funnel's
// GAP_METHOD_SCRIPT_FUNNEL_UPSELL -- see the "TWO GAP METHOD BOTS" note in
// lib/processes.js. Added per Rachael's Aug 30 request to rebuild the in-app
// GAP Method to visually and functionally match public/gap-method.html.
//
// STREAMING (Oct 8 2026, approved by Rachael; same design as the main chat,
// see lib/chatStreaming.js). OFF BY DEFAULT and switched separately from the
// main chat, so either can be turned off on its own:
//   GAP_STREAMING            off (default / missing) | allowlist | on
//   GAP_STREAMING_ALLOWLIST  optional; if not set, CHAT_STREAMING_ALLOWLIST
//                            (the main chat's list) is used
// The page must also ask ({ stream: true }). When streaming is not used this
// route sends exactly the same Claude request and returns exactly the same
// JSON as before. When it is used:
//   * words go to the page as they're written; everything from the first
//     "[[" (the hidden FINAL_IDENTITY / SUB_ACTIVATION / SAVE_SHIFT /
//     DISTORTIONS / TOPIC markers, always at the end) is held back, so no
//     marker ever reaches the screen while the reply is arriving;
//   * the final "done" event carries `reply` = exactly the text the JSON path
//     returns (markers included, because the page reads them to save the
//     Shift and deal the card), and the page runs the SAME code on it as on a
//     JSON reply;
//   * a reply that breaks part-way sends "error" and never "done": the page
//     removes the half reply and shows Try Again. This route saves nothing
//     (the GAP conversation lives in the page; the Shift is only created
//     later by /api/gap-shift from a COMPLETE reply), so a partial can never
//     be saved.
//
// READING RESTRUCTURE (Oct 8 2026, TEST PREVIEW for Rachael -- see
// lib/gapReading.js). OFF BY DEFAULT (GAP_FAST_READING); when off, every
// request below is exactly what it was before. When on for this member:
//   * Step 2 chat turns ({phase: "chat"}, the default) add only
//     output_config.effort "low" -- same model, prompt and messages.
//   * The one deep reading ({phase: "reading"}, sent once by the page while
//     the Step 3 animation runs) keeps the default (high) effort, is never
//     streamed, and its message is the page's hidden completion request with
//     an appended block (Step 1 answers, exact activation titles, and the
//     ACTIVATION_WHY / TODAYS_FOCUS markers). The JSON reply carries the same
//     `reply` text plus `reading` (validated activation pick, Today's Focus).
//   * GAP's instruction text (system prompt) is never touched.
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { waitUntil } from "@vercel/functions";
import { buildGapMemberSystemPrompt } from "@/lib/processes";
import { getEntitlementForEmail } from "@/lib/entitlements";
import { GAP_CHAT_MAX_TOKENS, logGapChatUsage } from "@/lib/gapChatReply";
import {
  chatStreamingAllowed,
  createSseChannel,
  runStreamedReply,
  SSE_HEADERS,
} from "@/lib/chatStreaming";
import {
  GAP_CHAT_TURN_EFFORT,
  GAP_ACTIVATION_RETRY_MAX_TOKENS,
  gapFastReadingSwitch,
  gapFastReadingEnabled,
  sanitizeStep1,
  sanitizeLibrary,
  buildReadingMessage,
  buildActivationRetryMessage,
  parseReadingReply,
  parseActivationRetry,
  matchLibraryTitle,
  normalizeTodaysFocus,
  isHealerContext,
  logGapReading,
} from "@/lib/gapReading";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5";
// Streaming only: same API, key and model; Node's own fetch instead of the
// SDK 0.32 default transport (which can throw a false "Premature close" at
// the end of a streamed reply) -- same as app/api/chat/route.ts.
const streamingAnthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  fetch: ((url: any, init?: any) => fetch(url, { ...init, cache: "no-store" })) as any,
});
// Streaming only: time allowed to CONNECT to Claude (per attempt, until the
// stream opens). Once words flow, lib/chatStreaming.js's idle/overall
// timers apply instead.
const GAP_STREAM_CONNECT_TIMEOUT_MS = 45000;

function gapStreamingSwitch() {
  return {
    mode: process.env.GAP_STREAMING,
    allowlist: process.env.GAP_STREAMING_ALLOWLIST || process.env.CHAT_STREAMING_ALLOWLIST,
  };
}

// The reply text, exactly as the JSON path builds it (markers included).
function replyTextOf(message: any): string {
  return message.content
    .filter((block: any) => block.type === "text")
    .map((block: any) => block.text)
    .join("\n");
}

export async function POST(req: NextRequest) {
  const {
    email,
    message,
    history = [],
    gapContext = null,
    stream: streamRequested = false,
    phase = "chat",
    step1 = null,
    activationLibrary = null,
    fixedActivation = "",
  } = await req.json();

  if (!email || !message) {
    return NextResponse.json({ error: "email and message are required" }, { status: 400 });
  }

  const { entitlement } = await getEntitlementForEmail(email);
  if (!entitlement.canUseBase) {
    return NextResponse.json({ error: "not entitled", entitlement }, { status: 403 });
  }

  const systemPrompt = buildGapMemberSystemPrompt(gapContext);

  // Long-reply fix (Oct 8 2026, see lib/gapChatReply.js): 4096 had to hold
  // hidden thinking + reply + the Shift-saving markers; now 10,000. Same
  // ceiling for the streamed and JSON paths.
  const fast = gapFastReadingEnabled({ ...gapFastReadingSwitch(), email });
  const isReading = fast && phase === "reading";
  const library = isReading ? sanitizeLibrary(activationLibrary) : [];
  const identityName = String((gapContext && gapContext.divineIdentity) || "");
  const claudeParams: any = {
    model: MODEL,
    max_tokens: GAP_CHAT_MAX_TOKENS,
    system: systemPrompt,
    messages: [
      ...history,
      {
        role: "user",
        content: isReading ? buildReadingMessage(message, { step1: sanitizeStep1(step1), library, identityName }) : message,
      },
    ],
  };
  // Light Step 2 chat (restructure on): lowest-latency thinking setting.
  if (fast && !isReading) claudeParams.output_config = { effort: GAP_CHAT_TURN_EFFORT };
  const logExtra = fast ? { phase: isReading ? "reading" : "chat", effort: isReading ? "default" : GAP_CHAT_TURN_EFFORT } : undefined;

  const claudeStartedAt = Date.now();
  if (isReading) {
    // The ONE deep reading: never streamed (nothing shows until it's complete).
    const response = await anthropic.messages.create(claudeParams as any);
    logGapChatUsage(response, Date.now() - claudeStartedAt, GAP_CHAT_MAX_TOKENS, logExtra); // log-only
    const replyText = replyTextOf(response);
    const parsed = parseReadingReply(replyText);
    let pick = matchLibraryTitle(parsed.activationPick, library);
    let source = pick ? "ai" : "fallback";
    let healerRetry = false;
    // Healer only (Rachael, Oct 8): no fixed Remembrance -- ask once more for a valid pick.
    if (!pick && library.length && isHealerContext(gapContext)) {
      healerRetry = true;
      try {
        const retry = await anthropic.messages.create({
          model: MODEL,
          max_tokens: GAP_ACTIVATION_RETRY_MAX_TOKENS,
          system: systemPrompt,
          messages: [
            ...claudeParams.messages,
            { role: "assistant", content: replyText.trim() || "(reading)" },
            { role: "user", content: buildActivationRetryMessage(library) },
          ],
          output_config: { effort: GAP_CHAT_TURN_EFFORT },
        } as any);
        pick = matchLibraryTitle(parseActivationRetry(replyTextOf(retry)), library);
        if (pick) source = "ai-retry";
      } catch (err) {
        console.error("[gap-reading] healer activation retry failed", err);
      }
    }
    const focus = normalizeTodaysFocus(parsed.todaysFocus, identityName);
    logGapReading({
      identity: identityName,
      save_shift: !!parsed.saveShift,
      ai_pick: parsed.activationPick || null,
      ai_pick_valid: !!matchLibraryTitle(parsed.activationPick, library),
      used: pick || fixedActivation || null,
      source,
      old_fixed: fixedActivation || null,
      same_as_old: !!pick && !!fixedActivation && pick === fixedActivation,
      healer_retry: healerRetry,
      healer_fallback_needs_rachael: source === "fallback" && isHealerContext(gapContext),
      todays_focus_sentences: focus.sentences,
      todays_focus_names_identity: focus.namesIdentity,
      todays_focus_trimmed: focus.trimmed,
      library_titles: library.length,
      ms: Date.now() - claudeStartedAt,
    });
    return NextResponse.json({
      reply: replyText,
      reading: {
        activation: { title: pick, source, aiPick: parsed.activationPick || null, oldFixed: fixedActivation || null, healerRetry },
        activationWhy: parsed.activationWhy ? parsed.activationWhy.replace(/\s+/g, " ").trim() : null,
        todaysFocus: focus.text || null,
        todaysFocusCheck: { sentences: focus.sentences, inRange: focus.inRange, namesIdentity: focus.namesIdentity, trimmed: focus.trimmed },
      },
    });
  }
  if (chatStreamingAllowed({ ...gapStreamingSwitch(), email, requested: streamRequested })) {
    const channel = createSseChannel();
    waitUntil(
      runStreamedReply({
        channel,
        chatId: null,
        label: "gap-chat-member",
        startStream: (signal: AbortSignal) =>
          streamingAnthropic.messages.stream(claudeParams as any, { timeout: GAP_STREAM_CONNECT_TIMEOUT_MS, signal }),
        // Nothing to save here: hand back the complete reply, same text as JSON.
        finishReply: async (finalMessage: any) => {
          logGapChatUsage(finalMessage, Date.now() - claudeStartedAt, GAP_CHAT_MAX_TOKENS, logExtra); // log-only (Vercel logs)
          return { replyText: replyTextOf(finalMessage), openActivationSlug: null };
        },
      })
    );
    return new Response(channel.readable, { headers: SSE_HEADERS });
  }

  const response = await anthropic.messages.create(claudeParams as any);

  logGapChatUsage(response, Date.now() - claudeStartedAt, GAP_CHAT_MAX_TOKENS, logExtra); // log-only (Vercel logs)

  const replyText = replyTextOf(response);

  return NextResponse.json({ reply: replyText });
}
