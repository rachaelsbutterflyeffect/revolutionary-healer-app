// Claude call: system prompt + (RAG) + persisted chat history + persistent
// member memory. Spec ref: SPEC.md §7 and Rachael's Aug 13 Chat History +
// Memory Architecture doc (rewrite of the previous stateless version, which
// always sent history: [] and never persisted a single message anywhere).
import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import Anthropic from "@anthropic-ai/sdk";
import { getFocusAreaBySlug } from "@/lib/focusAreas";
import { getProcessBySlug } from "@/lib/processes";
import { buildSystemPrompt, detectFaqTopics } from "@/lib/prompts";
import { retrieveContextForFocusArea } from "@/lib/retrieval";
import { getEntitlementForEmail } from "@/lib/entitlements";
import { getDivineIdentityBySlug } from "@/lib/divineIdentities";
import {
  DISTORTION_REGISTRY,
  validateDistortionList,
  validateTopic,
  pickActivations,
  getActivationTitleForSlug,
} from "@/lib/gapDistortions";
import {
  logEvent,
  getShiftById,
  getShiftsByEmail,
  updateShiftFields,
  createShiftFromChat,
  normalizeEmail,
  createChatSession,
  getChatSessionById,
  listMessagesByChatId,
  createMessage,
  updateChatSession,
} from "@/lib/airtable";
import {
  getRelevantMemoriesForPrompt,
  extractMemoriesFromExchange,
  updateRollingSummary,
  generateChatTitle,
} from "@/lib/memory";
import { placeholderChatTitle, titleActionForMessage } from "@/lib/chatTitles";
import { toCachedSystemBlocks } from "@/lib/promptCache";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5";

// How many of the most recent stored messages to send to Claude verbatim --
// older context lives in the chat's rolling `summary` field instead (PART 7).
const RECENT_MESSAGE_LIMIT = 20;
// Once a chat is about to have at least this many stored messages, start
// (and keep) maintaining a rolling summary so very long threads don't blow
// the context window.
const SUMMARY_TRIGGER_COUNT = 12;

// Bug fix (Sept): none of the calls in this route had a timeout, so a hang
// anywhere in the chain blocked the member's "thinking" indicator forever
// with no client-visible error. The Claude call itself gets a bound via the
// SDK's own per-request timeout option (see below); everything after the
// reply is already generated is non-critical persistence/bookkeeping, so
// it's bounded individually with this helper -- a timeout there just skips
// that one side effect instead of blocking or failing the member's response.
const CHAT_TIMEOUT_MS = 45000;
const BOOKKEEPING_TIMEOUT_MS = 10000;
// Small, focused call used only to re-prompt the model for a corrected
// [[DISTORTIONS: ...]] / [[TOPIC: ...]] marker pair when its first attempt
// failed validation (see GAP METHOD DISTORTION ROUTING below). Kept short so
// a hung retry can't meaningfully delay the member's already-delivered reply.
const DISTORTION_RETRY_TIMEOUT_MS = 12000;

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T | null> {
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
      ),
    ]);
  } catch (err) {
    console.error(`Bookkeeping step "${label}" failed or timed out`, err);
    return null;
  }
}

// Honest, non-technical, member-facing copy for the rare case where the GAP
// Method's Step 3 distortion marker fails validation twice in a row (see
// GAP METHOD DISTORTION ROUTING below). Per Rachael's explicit "never
// silently default" rule, this replaces the reply outright rather than
// guessing an activation -- the member is told plainly and invited to
// continue, never shown a broken or generic result.
const DISTORTION_VALIDATION_ERROR_COPY =
  "Something didn't come through clearly on my end just now -- let's try that last part again. Can you tell me a little more about what's been going on for you here? I want to make sure I reflect this back to you accurately before we move on.";

export async function POST(req: NextRequest) {
  // gapMethodResult (added Aug 10, widened same day): optional structured
  // output from the 3 Step GAP Method -- Step 1's Divine Identity + confirmed
  // distortion/frequency/domain, Step 2's discoveries, and (once assigned)
  // Step 3's activation. See lib/processes.js's GAP_METHOD_RESULT_NOTE for
  // how the prompt uses it.
  //
  // chatId (added Aug 13, Chat History + Memory Architecture rewrite):
  // identifies which persisted ChatSessions/ChatMessages thread this message
  // belongs to. Optional for backward compatibility with older callers (e.g.
  // public/app.html's sendHeroChat before it's updated) -- if omitted, a new
  // chat session is created automatically and its id is returned so the
  // caller can persist it for subsequent messages.
  const {
    email,
    focusAreaSlug,
    message,
    chatId: chatIdInput = null,
    processSlug = null,
    gapMethodResult = null,
    shiftId = null,
    // Member's IANA time zone (from the browser), used only for the dated
    // "New Chat · Oct 7" placeholder title. Falls back to America/Toronto.
    timeZone = null,
  } = await req.json();

  if (!email || !focusAreaSlug || !message) {
    return NextResponse.json(
      { error: "email, focusAreaSlug, and message are required" },
      { status: 400 }
    );
  }

  const focusArea = getFocusAreaBySlug(focusAreaSlug);
  if (!focusArea) {
    return NextResponse.json({ error: "unknown focus area" }, { status: 404 });
  }

  // A guided Process (SPEC.md §4.x) overrides freeform focus-area coaching for
  // this conversation when the member picked one from the quick-start chips or
  // the "Go deeper" cards -- see lib/processes.js.
  const process = processSlug ? getProcessBySlug(processSlug) : null;

  const { record, entitlement } = await getEntitlementForEmail(email);
  if (!entitlement.canUseBase) {
    return NextResponse.json({ error: "not entitled", entitlement }, { status: 403 });
  }

  // Shift Progress Check-In (Aug 15, Rachael's "Update Progress" button):
  // when present, this message belongs to a conversation specifically about
  // whether a Shift is ready to be marked Embodied -- see lib/shifts.js's
  // EMBODIED STATUS rules. Verify the shift actually belongs to this member
  // before trusting it for anything.
  let embodimentShift: any = null;
  if (shiftId) {
    const s = await getShiftById(shiftId);
    if (s && normalizeEmail(s.fields.member_email) === normalizeEmail(email)) {
      embodimentShift = s;
    }
  }

  let session = chatIdInput ? await getChatSessionById(chatIdInput) : null;
  if (!session) {
    session = await createChatSession({ email, focusAreaSlug, title: placeholderChatTitle(new Date(), timeZone) });
  }
  const chatId = session.id;

  const priorMessages = await listMessagesByChatId(chatId, { limit: RECENT_MESSAGE_LIMIT });
  const priorMessageCount = priorMessages.length;

  const [retrievedContext, rawMemberMemories, existingShiftRecords] = await Promise.all([
      retrieveContextForFocusArea(focusAreaSlug, message),
      getRelevantMemoriesForPrompt(email),
      getShiftsByEmail(email),
    
  ]);
  const isGapMethodProcess = process?.slug === "3-step-gap-method";
  // GAP Method Step 2/3 narrative must be grounded only in the current,
  // just-completed exchange -- not cross-chat memory or an older rolling
  // summary from earlier in this same thread (QA, Sept 2026: the narrative
  // was describing an unrelated background conversation while the
  // deterministic header/activation, which don't depend on this, stayed correct).
  const memberMemories = isGapMethodProcess ? "" : rawMemberMemories;

  // SHIFT + ACTIVATION FOLLOW-THROUGH (Aug 20, Rachael's spec): give the AI
  // visibility into the member's existing Shifts so it can check whether a
  // new discovery continues one of them (see lib/prompts.js) instead of
  // creating a duplicate card for the same contradiction. Each line's id is
  // what the AI must copy exactly into an [[UPDATE_SHIFT: ...]] marker.
  const existingShifts = (existingShiftRecords || [])
    .map((s: any) => {
          const f = s.fields || {};
          const gapPreview = (f.gap_explanation || "").slice(0, 300);
          return `- id: ${s.id} | focus: ${f.focus_area || "(none)"} | Divine Identity: ${f.divine_identity_name || "(none)"} | Current Frequency: ${f.current_frequency || "(none)"} | status: ${f.progress_status || "shifting"} | Gap: ${gapPreview}`;
    })
    .join("\n");

  const chatSummary = isGapMethodProcess ? "" : (session.fields.summary || "");
  let systemPrompt = buildSystemPrompt(focusArea, {
    retrievedContext,
    process,
    gapMethodResult,
    chatSummary,
    memberMemories,
    existingShifts,
    // Approved FAQ answers are only added when this message looks like one of
    // those questions (see lib/prompts.js detectFaqTopics) -- otherwise the
    // prompt is identical to before this change.
    faqTopics: isGapMethodProcess ? [] : detectFaqTopics(message),
  });
  if (embodimentShift) {
    const f = embodimentShift.fields;
    systemPrompt += `\n\n=== SHIFT PROGRESS CHECK-IN (Update Progress button) ===\nThe member clicked "Update Progress" on this Shift: ${f.divine_identity_name || "their Shift"} / ${f.current_frequency || ""}. GAP: ${f.gap_explanation || ""}. Recommended Activation: ${f.recommended_activation || ""}.\n\nThey were just greeted with: "You're ready to make this shift embodied — tell me, what's your main shift, and what's making you feel like this is fully embodied?" Continue that conversation.\n\nNever mark a Shift Embodied simply because the member listened to an activation. Watch for meaningful evidence the contradiction is no longer driving the same behavior -- e.g. responding differently to the old trigger, taking the action they previously avoided, no longer reopening the same decision, speaking or showing up differently, a change in the repeated pattern, or feeling the old thought/emotion without automatically following the old behavior.\n\nThen ask them directly: "Do you feel like this shift is complete?"\n\nIf they say yes: tell them plainly, using almost exactly this phrase -- "I've updated your card to mark this as Embodied" -- and then celebrate them thoroughly, reflecting back where they started and how far they've come.\n\nIf they say no, or the pattern still feels active: don't say anything about updating their card -- keep supporting them, and let them know it's okay to keep working with this Shift.`;
  }

  const historyForClaude = priorMessages.map((m: any) => ({
    role: m.fields.role === "assistant" ? "assistant" : "user",
    content: m.fields.message_text || "",
  }));

  // Persist the member's message before calling Claude so it's never lost
  // even if the model call itself fails.
  await createMessage({ chatId, email, role: "user", text: message });

  // Prompt caching (Oct 8 2026, see lib/promptCache.js): same model,
  // max_tokens, messages, timeout and system prompt TEXT as before. The only
  // difference is that `system` is sent as two text blocks (same text, same
  // order) with a cache breakpoint after the fixed instructions, so Anthropic
  // can reuse them instead of re-reading ~14k tokens on every message.
  const claudeParams = {
    model: MODEL,
    max_tokens: 4096,
    system: toCachedSystemBlocks(systemPrompt),
    messages: [...historyForClaude, { role: "user", content: message }],
  };
  const claudeStartedAt = Date.now();

  // ===========================================================================
  // finishReply: everything that happens once Claude's COMPLETE reply exists
  // -- usage log, hidden-marker strip, GAP Step 3 routing, Shift save/update/
  // Embodied, then the background saves (bot message, title, session,
  // summary, memories, event log) handed to `schedule`. Shared by BOTH the
  // normal path (schedule = waitUntil, exactly as before) and the streaming
  // path added next (which will only call it after a stream has fully
  // finished). Nothing in here ever sees partial text.
  // (Oct 8 2026: moved into this helper unchanged apart from indentation and
  // `waitUntil(` -> `schedule(`.)
  // ===========================================================================
  const finishReply = async (
    response: any,
    schedule: (p: Promise<unknown>) => void
  ): Promise<{ replyText: string; openActivationSlug: string | null }> => {
    // Vercel logs: how long Claude took and whether the prompt cache was used
    // (cache_read_input_tokens > 0 = fixed instructions reused;
    // cache_creation_input_tokens > 0 = (re)stored for the next 5 minutes).
    try {
      const u: any = response.usage || {};
      console.log(
        "[chat] claude usage " +
          JSON.stringify({
            ms: Date.now() - claudeStartedAt,
            input_tokens: u.input_tokens,
            cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
            cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
            output_tokens: u.output_tokens,
            stop_reason: response.stop_reason,
          })
      );
    } catch (logErr) {
      // logging must never affect the reply
    }

    const rawReplyText = response.content
      .filter((block: any) => block.type === "text")
      .map((block: any) => block.text)
      .join("\n");
    // SHIFT + ACTIVATION FOLLOW-THROUGH (Aug 20, Rachael's spec): detect the
    // AI's invisible [[SAVE_SHIFT: ...]] / [[UPDATE_SHIFT: ...]] confirmation
    // markers -- see lib/prompts.js for exactly when the model is allowed to
    // emit these (only on the turn right after the member gives explicit
    // permission to save a newly-named Gap). Strip the marker out of what the
    // member actually sees and what gets persisted -- it must never be visible.
    //
    // GENERALIZED (Sept, GAP Method distortion/routing upgrade): this same
    // loop now also strips the GAP Method's [[DISTORTIONS: ...]] / [[TOPIC: ...]]
    // markers (see GAP METHOD DISTORTION ROUTING below) -- it was already
    // generic over any `[[NAME: payload]]` trailing marker, so no regex change
    // was needed, just new marker names for it to catch.
    let replyText = rawReplyText;
    const markerLineRegex = /\n?\[\[([A-Z_]+):\s*([\s\S]*?)\]\]\s*$/;
    const markers: Record<string, string> = {};
    let strippedText = rawReplyText;
    let markerMatch = strippedText.match(markerLineRegex);
    while (markerMatch) { const markerName = markerMatch[1]; const markerPayload = markerMatch[2]; if (!(markerName in markers)) markers[markerName] = markerPayload.trim(); strippedText = strippedText.slice(0, markerMatch.index).replace(/\s+$/, ""); markerMatch = strippedText.match(markerLineRegex); }
    replyText = strippedText.trim();
    const saveShiftMatch = markers.SAVE_SHIFT ? [rawReplyText, markers.SAVE_SHIFT] : null;
    const updateShiftMatch = markers.UPDATE_SHIFT ? [rawReplyText, markers.UPDATE_SHIFT] : null;

    // ===========================================================================
    // GAP METHOD DISTORTION ROUTING (Sept, replaces the old fixed
    // identity->activation table + fragile "does the visible reply text contain
    // this exact activation name string" fallback).
    //
    // WHY: the old system looked up a Step 3 activation from a per-identity
    // fixed table (DIVINE_IDENTITY_RECOMMENDATION_TABLE in lib/processes.js),
    // so two members with the same Divine Identity always got routed toward
    // the same activation regardless of what Step 2 actually surfaced. It also
    // depended on the model's [[OPEN_ACTIVATION]] marker, which proved
    // unreliable in testing (0 successful emissions across 5+ clean
    // end-to-end tests), with a fallback that string-matched the visible Step
    // 3 reply text against DIVINE_IDENTITIES[].personalizedActivation.name --
    // impossible for Healer, whose activation was never a single fixed name.
    //
    // NEW DESIGN: lib/processes.js's GAP_METHOD_SCRIPT_MEMBER now instructs the
    // model to privately detect 2-4 distortions from the fixed 16-item
    // registry (lib/gapDistortions.js) actually evidenced in the Step 1/Step 2
    // conversation, plus a coarse topic signal, and emit them as
    // [[DISTORTIONS: Name One, Name Two]] / [[TOPIC: money_business|general]]
    // on the same Step 3 message. CODE (not the model) then validates those
    // names against the registry and looks up the actual activation via
    // lib/gapDistortions.js's DISTORTION_ROUTING table + topic-gating rules --
    // this is what actually decides `openActivationSlug`, never a trusted
    // free-text activation name from the model. Per Rachael's explicit "never
    // silently default" requirement: a missing/malformed/invalid marker gets
    // exactly one automatic re-prompt, and if that also fails, the member sees
    // an honest, visible "let's try that again" message instead of a guessed
    // or generic activation.
    let deterministicActivationSlug: string | null = null;
    let distortionRoutingErrorOccurred = false;
    const isStep3Reveal = isGapMethodProcess && /Step 3: Your Recommended Activation/i.test(rawReplyText);

    if (isStep3Reveal) {
      let distortionsCheck = validateDistortionList(markers.DISTORTIONS || "");
      let topicCheck = validateTopic(markers.TOPIC || "");

      if (!distortionsCheck.valid || !topicCheck.valid) {
        // Exactly one automatic re-prompt, per spec -- a short, isolated
        // follow-up call asking ONLY for the corrected markers, not a full
        // re-run of the Step 3 narrative the member already received.
        try {
          const retryResponse = await anthropic.messages.create(
            {
              model: MODEL,
              max_tokens: 200,
              system: systemPrompt,
              messages: [
                ...historyForClaude,
                { role: "user", content: message },
                { role: "assistant", content: rawReplyText },
                {
                  role: "user",
                  content: `Your previous message did not include a valid distortion marker. Reply with ONLY the two markers below, nothing else -- no other text:\n[[DISTORTIONS: Name One, Name Two]]\n[[TOPIC: money_business or general]]\n\nYou must pick 2 to 4 names, most-evidenced first, EXACTLY as spelled from this fixed list (do not invent or reword any name): ${DISTORTION_REGISTRY.join(", ")}.`,
                },
              ],
            },
            { timeout: DISTORTION_RETRY_TIMEOUT_MS }
          );
          const retryRawText = retryResponse.content
            .filter((block: any) => block.type === "text")
            .map((block: any) => block.text)
            .join("\n");
          const retryMarkers: Record<string, string> = {};
          let retryRemaining = retryRawText;
          let retryMatch = retryRemaining.match(markerLineRegex);
          while (retryMatch) {
            if (!(retryMatch[1] in retryMarkers)) retryMarkers[retryMatch[1]] = retryMatch[2].trim();
            retryRemaining = retryRemaining.slice(0, retryMatch.index).replace(/\s+$/, "");
            retryMatch = retryRemaining.match(markerLineRegex);
          }
          distortionsCheck = validateDistortionList(retryMarkers.DISTORTIONS || "");
          topicCheck = validateTopic(retryMarkers.TOPIC || "");
        } catch (err) {
          console.error("GAP Method distortion marker retry failed", err);
        }
      }

      if (!distortionsCheck.valid || !topicCheck.valid) {
        distortionRoutingErrorOccurred = true;
        console.error("GAP Method distortion marker validation failed twice", {
          distortionsRaw: markers.DISTORTIONS,
          topicRaw: markers.TOPIC,
        });
        replyText = DISTORTION_VALIDATION_ERROR_COPY;
      } else {
        const routing = pickActivations(distortionsCheck.distortions, topicCheck.topic);
        if (!routing) {
          // Every entry in DISTORTION_ROUTING always has at least one
          // topic-eligible candidate today, so this should be unreachable --
          // but per the "never silently default" rule, treat it the same as
          // a validation failure rather than guessing, in case the routing
          // table and the model's registry ever drift apart.
          distortionRoutingErrorOccurred = true;
          console.error("GAP Method distortion routing produced no eligible activation", {
            distortions: distortionsCheck.distortions,
            topic: topicCheck.topic,
          });
          replyText = DISTORTION_VALIDATION_ERROR_COPY;
        } else {
          deterministicActivationSlug = routing.primarySlug;
        }
      }
    }

    const openActivationSlug = distortionRoutingErrorOccurred ? null : deterministicActivationSlug;

  let shiftCreatedViaMarker = false;
    if (saveShiftMatch && !distortionRoutingErrorOccurred) {
        try {
              const payload = JSON.parse(saveShiftMatch[1]);
              const identity = payload.divineIdentitySlug ? getDivineIdentityBySlug(payload.divineIdentitySlug) : null;
              // Identity is a starting frame, not the verdict: divineIdentityName/
              // currentFrequency/gap/howItShowsUp still come from the model's own
              // account of THIS conversation. The recommended activation, however,
              // is never trusted from the model's free text -- when the code-side
              // distortion routing above succeeded, its resolved title always
              // overrides whatever the model put in this JSON payload.
              const resolvedActivationTitle = deterministicActivationSlug
                ? getActivationTitleForSlug(deterministicActivationSlug)
                : null;
              await createShiftFromChat({
                      email,
                      memberRecordId: record?.id,
                      chatId,
                      divineIdentitySlug: identity ? identity.slug : "",
                      divineIdentityName: identity ? identity.displayName : (payload.divineIdentityName || ""),
                      currentFrequency: payload.currentFrequency || "",
                      focusArea: payload.focusArea || focusArea.name,
                      gapExplanation: payload.gap || "",
                      whatWeNoticed: [payload.howItShowsUp, payload.primaryShift ? `Primary Shift: ${payload.primaryShift}` : ""]
                                .filter(Boolean)
                                .join("\n\n"),
                      recommendedActivation: resolvedActivationTitle || payload.recommendedActivation || "",
              });
          shiftCreatedViaMarker = true;
        } catch (err) {
              console.error("Failed to parse/save SAVE_SHIFT marker", err);
        }
    } else if (updateShiftMatch) {
        try {
              const payload = JSON.parse(updateShiftMatch[1]);
              const belongsToMember = (existingShiftRecords || []).some((s: any) => s.id === payload.shiftId);
              if (payload.shiftId && belongsToMember) {
                      const fields: Record<string, any> = {};
                      if (payload.gap) fields.gap_explanation = payload.gap;
                      if (payload.howItShowsUp || payload.primaryShift) {
                                fields.what_we_noticed = [payload.howItShowsUp, payload.primaryShift ? `Primary Shift: ${payload.primaryShift}` : ""]
                                  .filter(Boolean)
                                  .join("\n\n");
                      }
                      if (payload.currentFrequency) fields.current_frequency = payload.currentFrequency;
                      if (payload.recommendedActivation) fields.recommended_activation = payload.recommendedActivation;
                      if (Object.keys(fields).length) {
                                await updateShiftFields(payload.shiftId, fields);
                      }
              }
        } catch (err) {
              console.error("Failed to parse/save UPDATE_SHIFT marker", err);
        }
    }

    if (embodimentShift && /updated your card[\s\S]{0,60}embodied/i.test(replyText)) {
      try {
        await updateShiftFields(embodimentShift.id, { progress_status: "embodied", ready_for_embodied: true });
      } catch (err) {
        console.error("Failed to auto-update Shift to Embodied", err);
      }
    }
    // Bug fix (Sept): everything below persists non-critical bookkeeping that
    // the RESPONSE PAYLOAD below does not depend on (reply text, chatId, and
    // openActivationSlug are all already finalized above). None of it should
    // ever be able to block or delay the member's response, so it now runs in
    // a Vercel `waitUntil` background task -- the response is returned to the
    // member first, and this continues executing after the function would
    // otherwise have ended. Each step keeps its own individual timeout/try-
    // catch exactly as before, so one failure still can't take down another.
    const now = new Date().toISOString();
    const sessionUpdates: Record<string, any> = { updated_at: now, last_message_at: now };
    // Smarter chat titles (Oct 7 2026, see lib/chatTitles.js): count the
    // member's messages in this chat (this one included) to decide whether to
    // try a provisional title (1st/2nd message, only if there's a clear theme),
    // the one final title (3rd message, from the conversation so far, both
    // sides), or nothing at all (4th+ message, or the member renamed the chat).
    const memberMessageNumber =
      priorMessages.filter((m: any) => m.fields.role !== "assistant").length + 1;
    const titleAction = titleActionForMessage({
      titleIsAuto: session.fields.title_is_auto,
      currentTitle: session.fields.title,
      memberMessageNumber,
    });

    schedule(
      (async () => {
        await withTimeout(
          createMessage({ chatId, email, role: "assistant", text: replyText }),
          BOOKKEEPING_TIMEOUT_MS,
          "createMessage(assistant)"
        );

        // Auto-title (see titleAction above) -- never overwrites a manual
        // rename (title_is_auto flips to false the moment a member renames a
        // chat, see lib/airtable.js's renameChatSession). Runs only here in the
        // background with its own timeout, so it can never delay the reply.
        // generateChatTitle returns null for "no clear theme yet" or on any
        // failure, which keeps the existing (dated placeholder) title.
        if (titleAction) {
          const transcript = [
            ...priorMessages.map((m: any) => ({
              role: m.fields.role === "assistant" ? "assistant" : "user",
              text: m.fields.message_text || "",
            })),
            { role: "user", text: message },
            ...(titleAction === "final" ? [{ role: "assistant", text: replyText }] : []),
          ];
          const title = await withTimeout(
            generateChatTitle({ transcript, mode: titleAction }),
            BOOKKEEPING_TIMEOUT_MS,
            "generateChatTitle"
          );
          if (title) {
            // Re-check right before writing in case the member renamed the
            // chat while this reply was being generated.
            const fresh = await withTimeout(getChatSessionById(chatId), BOOKKEEPING_TIMEOUT_MS, "getChatSessionById(title)");
            if (fresh && fresh.fields.title_is_auto === true) sessionUpdates.title = title;
          }
        }

        await withTimeout(updateChatSession(chatId, sessionUpdates), BOOKKEEPING_TIMEOUT_MS, "updateChatSession");

        // Rolling summary for long threads (PART 7) and member-memory extraction
        // (PART 9-13). Both are best-effort and swallow their own errors.
        if (priorMessageCount + 2 >= SUMMARY_TRIGGER_COUNT) {
          const newSummary = await withTimeout(
            updateRollingSummary({ previousSummary: chatSummary, userText: message, assistantText: replyText }),
            BOOKKEEPING_TIMEOUT_MS,
            "updateRollingSummary"
          );
          if (newSummary) {
            await withTimeout(
              updateChatSession(chatId, { summary: newSummary }),
              BOOKKEEPING_TIMEOUT_MS,
              "updateChatSession(summary)"
            );
          }
        }
        await withTimeout(
          extractMemoriesFromExchange({ email, chatId, userText: message, assistantText: replyText }),
          BOOKKEEPING_TIMEOUT_MS,
          "extractMemoriesFromExchange"
        );

        await withTimeout(
          logEvent(
            "chat_message",
            { focusAreaSlug, processSlug: process?.slug ?? null, chatId },
            record?.id
          ),
          BOOKKEEPING_TIMEOUT_MS,
          "logEvent"
        );
      })()
    );

    return { replyText, openActivationSlug };
  };

  let response;
  try {
    response = await anthropic.messages.create(
      claudeParams as any,
      { timeout: CHAT_TIMEOUT_MS }
    );
  } catch (err) {
    return NextResponse.json(
      { error: "The response took too long. Please try again." },
      { status: 504 }
    );
  }

  const { replyText, openActivationSlug } = await finishReply(response, waitUntil);
  return NextResponse.json({ reply: replyText, chatId, openActivationSlug });
}
