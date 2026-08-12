// Claude call: system prompt + (RAG) + history + memory. Spec ref: SPEC.md §7.
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getFocusAreaBySlug } from "@/lib/focusAreas";
import { getProcessBySlug } from "@/lib/processes";
import { buildSystemPrompt } from "@/lib/prompts";
import { retrieveContextForFocusArea } from "@/lib/retrieval";
import { getEntitlementForEmail } from "@/lib/entitlements";
import { getChatsByEmail, logEvent } from "@/lib/airtable";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5";

export async function POST(req: NextRequest) {
  // gapMethodResult (added Aug 10, widened same day): optional structured
  // output from the 3 Step GAP Method -- Step 1's Divine Identity + confirmed
  // distortion/frequency/domain, Step 2's discoveries, and (once assigned)
  // Step 3's activation. Started as a narrower `step1Result` and was renamed
  // once Rachael asked for Revolutionary Healer AI to have the full Gap
  // context (Steps 1-3), not just Step 1, everywhere a member chats after
  // completing the Gap Method -- see the-3-step-shifting-method.html's
  // DIVINE_REVEAL-shaped results object for the Step 1/3 shape. The client
  // should pass this through on every message once Step 1 completes, so the
  // model never has to re-derive or re-ask for what it already knows. See
  // lib/processes.js's GAP_METHOD_RESULT_NOTE for how the prompt uses it.
  const {
    email,
    focusAreaSlug,
    message,
    history = [],
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

  const retrievedContext = await retrieveContextForFocusArea(focusAreaSlug, message);
  const systemPrompt = buildSystemPrompt(focusArea, { retrievedContext, process, gapMethodResult });

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [...history, { role: "user", content: message }],
  });

  const replyText = response.content
    .filter((block: any) => block.type === "text")
    .map((block: any) => block.text)
    .join("\n");

  await logEvent("chat_message", { focusAreaSlug, processSlug: process?.slug ?? null }, record?.id);

  return NextResponse.json({ reply: replyText });
}
