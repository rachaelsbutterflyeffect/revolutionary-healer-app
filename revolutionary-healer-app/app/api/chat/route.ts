// Claude call: system prompt + (RAG) + persisted chat history + persistent
// member memory. Spec ref: SPEC.md §7 and Rachael's Aug 13 Chat History +
// Memory Architecture doc (rewrite of the previous stateless version, which
// always sent history: [] and never persisted a single message anywhere).
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getFocusAreaBySlug } from "@/lib/focusAreas";
import { getProcessBySlug } from "@/lib/processes";
import { buildSystemPrompt } from "@/lib/prompts";
import { retrieveContextForFocusArea } from "@/lib/retrieval";
import { getEntitlementForEmail } from "@/lib/entitlements";
import { getDivineIdentityBySlug } from "@/lib/divineIdentities";
import { DIVINE_IDENTITIES } from "@/lib/divineIdentities";
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

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5";

// How many of the most recent stored messages to send to Claude verbatim --
// older context lives in the chat's rolling `summary` field instead (PART 7).
const RECENT_MESSAGE_LIMIT = 20;
// Once a chat is about to have at least this many stored messages, start
// (and keep) maintaining a rolling summary so very long threads don't blow
// the context window.
const SUMMARY_TRIGGER_COUNT = 12;

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
    session = await createChatSession({ email, focusAreaSlug });
  }
  const chatId = session.id;

  const priorMessages = await listMessagesByChatId(chatId, { limit: RECENT_MESSAGE_LIMIT });
  const priorMessageCount = priorMessages.length;

  const [retrievedContext, memberMemories, existingShiftRecords] = await Promise.all([
      retrieveContextForFocusArea(focusAreaSlug, message),
      getRelevantMemoriesForPrompt(email),
      getShiftsByEmail(email),
    
  ]);

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

  const chatSummary = session.fields.summary || "";
  let systemPrompt = buildSystemPrompt(focusArea, {
    retrievedContext,
    process,
    gapMethodResult,
    chatSummary,
    memberMemories,
    existingShifts,
  });
  if (embodimentShift) {
    const f = embodimentShift.fields;
    systemPrompt += `\n\n=== SHIFT PROGRESS CHECK-IN (Update Progress button) ===\nThe member clicked "Update Progress" on this Shift: ${f.divine_identity_name || "their Shift"} / ${f.current_frequency || ""}. GAP: ${f.gap_explanation || ""}. Recommended Activation: ${f.recommended_activation || ""}.\n\nThey were just greeted with: "You're ready to make this shift embodied \u2014 tell me, what's your main shift, and what's making you feel like this is fully embodied?" Continue that conversation.\n\nNever mark a Shift Embodied simply because the member listened to an activation. Watch for meaningful evidence the contradiction is no longer driving the same behavior -- e.g. responding differently to the old trigger, taking the action they previously avoided, no longer reopening the same decision, speaking or showing up differently, a change in the repeated pattern, or feeling the old thought/emotion without automatically following the old behavior.\n\nThen ask them directly: "Do you feel like this shift is complete?"\n\nIf they say yes: tell them plainly, using almost exactly this phrase -- "I've updated your card to mark this as Embodied" -- and then celebrate them thoroughly, reflecting back where they started and how far they've come.\n\nIf they say no, or the pattern still feels active: don't say anything about updating their card -- keep supporting them, and let them know it's okay to keep working with this Shift.`;
  }

  const historyForClaude = priorMessages.map((m: any) => ({
    role: m.fields.role === "assistant" ? "assistant" : "user",
    content: m.fields.message_text || "",
  }));

  // Persist the member's message before calling Claude so it's never lost
  // even if the model call itself fails.
  await createMessage({ chatId, email, role: "user", text: message });

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [...historyForClaude, { role: "user", content: message }],
  });

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
let replyText = rawReplyText;
  const markerLineRegex = /\n?\[\[([A-Z_]+):\s*([\s\S]*?)\]\]\s*$/;
  const markers: Record<string, string> = {};
  let strippedText = rawReplyText;
  let markerMatch = strippedText.match(markerLineRegex);
  while (markerMatch) { const markerName = markerMatch[1]; const markerPayload = markerMatch[2]; if (!(markerName in markers)) markers[markerName] = markerPayload.trim(); strippedText = strippedText.slice(0, markerMatch.index).replace(/\s+$/, ""); markerMatch = strippedText.match(markerLineRegex); }
  replyText = strippedText.trim();
  const saveShiftMatch = markers.SAVE_SHIFT ? [rawReplyText, markers.SAVE_SHIFT] : null;
  const updateShiftMatch = markers.UPDATE_SHIFT ? [rawReplyText, markers.UPDATE_SHIFT] : null;
  const openActivationSlug = markers.OPEN_ACTIVATION ? markers.OPEN_ACTIVATION.trim() : null;

let shiftCreatedViaMarker = false;
  if (saveShiftMatch) {
      try {
            const payload = JSON.parse(saveShiftMatch[1]);
            const identity = payload.divineIdentitySlug ? getDivineIdentityBySlug(payload.divineIdentitySlug) : null;
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
                    recommendedActivation: payload.recommendedActivation || "",
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
  

  // DETERMINISTIC STEP 3 FALLBACK (Aug 27, Rachael's requirement that every completed embedded GAP Method walkthrough produces a Shift card + instant activation access, and that this must not depend on the AI reliably emitting the invisible [[SAVE_SHIFT]]/[[OPEN_ACTIVATION]] markers -- proven unreliable across repeated testing this session, 0 successful marker emissions across 5+ clean end-to-end tests even after two separate prompt-engineering fixes). The AI's VISIBLE Step 3 reply text has been 100% consistent across every test, so parse that directly instead: find which Divine Identity's personalizedActivation.name was recommended (the AI is instructed to quote it verbatim from DIVINE_IDENTITY_RECOMMENDATION_TABLE in lib/processes.js), then pull every other field (Current Frequency, GAP explanation, slug) from the known DIVINE_IDENTITIES registry rather than regexing free-text out of the reply.
  let deterministicActivationSlug: string | null = null;
  if (!shiftCreatedViaMarker && process?.slug === "3-step-gap-method" && /Step 3: Your Recommended Activation/i.test(rawReplyText)) {
    try {
      const matchedIdentity = DIVINE_IDENTITIES.find((d) => d.personalizedActivation && d.personalizedActivation.name && rawReplyText.includes(d.personalizedActivation.name));
      if (matchedIdentity) {
        await createShiftFromChat({
          email,
          memberRecordId: record?.id,
          chatId,
          divineIdentitySlug: matchedIdentity.slug,
          divineIdentityName: matchedIdentity.displayName,
          currentFrequency: matchedIdentity.currentFrequency,
          focusArea: focusArea.name,
          gapExplanation: matchedIdentity.gapExplanation,
          recommendedActivation: matchedIdentity.personalizedActivation.name,
        });
        deterministicActivationSlug = `gap-method-${matchedIdentity.slug}`;
      }
    } catch (err) {
      console.error("Failed to create deterministic Step 3 Shift", err);
    }
  }
  
  await createMessage({ chatId, email, role: "assistant", text: replyText });

  if (embodimentShift && /updated your card[\s\S]{0,60}embodied/i.test(replyText)) {
    try {
      await updateShiftFields(embodimentShift.id, { progress_status: "embodied", ready_for_embodied: true });
    } catch (err) {
      console.error("Failed to auto-update Shift to Embodied", err);
    }
  }

  const now = new Date().toISOString();
  const sessionUpdates: Record<string, any> = { updated_at: now, last_message_at: now };

  // Auto-title after the first full exchange -- never overwrites a manual
  // rename (title_is_auto flips to false the moment a member renames a chat,
  // see lib/airtable.js's renameChatSession).
  if (session.fields.title_is_auto !== false && priorMessageCount === 0) {
    sessionUpdates.title = await generateChatTitle(message);
  }

  await updateChatSession(chatId, sessionUpdates);

  // Rolling summary for long threads (PART 7) and member-memory extraction
  // (PART 9-13). Both are best-effort and swallow their own errors -- Vercel
  // serverless has no reliable fire-and-forget without extra infra, so these
  // are awaited inline rather than risking losing them.
  if (priorMessageCount + 2 >= SUMMARY_TRIGGER_COUNT) {
    const newSummary = await updateRollingSummary({
      previousSummary: chatSummary,
      userText: message,
      assistantText: replyText,
    });
    if (newSummary) {
      await updateChatSession(chatId, { summary: newSummary });
    }
  }
  await extractMemoriesFromExchange({ email, chatId, userText: message, assistantText: replyText });

  await logEvent(
    "chat_message",
    { focusAreaSlug, processSlug: process?.slug ?? null, chatId },
    record?.id
  );

  return NextResponse.json({ reply: replyText, chatId, openActivationSlug: openActivationSlug || deterministicActivationSlug });
}
