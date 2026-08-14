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
import {
  logEvent,
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

  let session = chatIdInput ? await getChatSessionById(chatIdInput) : null;
  if (!session) {
    session = await createChatSession({ email, focusAreaSlug });
  }
  const chatId = session.id;

  const priorMessages = await listMessagesByChatId(chatId, { limit: RECENT_MESSAGE_LIMIT });
  const priorMessageCount = priorMessages.length;

  const [retrievedContext, memberMemories] = await Promise.all([
    retrieveContextForFocusArea(focusAreaSlug, message),
    getRelevantMemoriesForPrompt(email),
  ]);

  const chatSummary = session.fields.summary || "";
  const systemPrompt = buildSystemPrompt(focusArea, {
    retrievedContext,
    process,
    gapMethodResult,
    chatSummary,
    memberMemories,
  });

  const historyForClaude = priorMessages.map((m: any) => ({
    role: m.fields.role === "assistant" ? "assistant" : "user",
    content: m.fields.message_text || "",
  }));

  // Persist the member's message before calling Claude so it's never lost
  // even if the model call itself fails.
  await createMessage({ chatId, email, role: "user", text: message });

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [...historyForClaude, { role: "user", content: message }],
  });

  const replyText = response.content
    .filter((block: any) => block.type === "text")
    .map((block: any) => block.text)
    .join("\n");

  await createMessage({ chatId, email, role: "assistant", text: replyText });

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

  return NextResponse.json({ reply: replyText, chatId });
}
