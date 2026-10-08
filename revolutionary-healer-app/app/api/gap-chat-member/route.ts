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
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { buildGapMemberSystemPrompt } from "@/lib/processes";
import { getEntitlementForEmail } from "@/lib/entitlements";
import { logGapChatUsage } from "@/lib/gapChatReply";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5";

export async function POST(req: NextRequest) {
  const { email, message, history = [], gapContext = null } = await req.json();

  if (!email || !message) {
    return NextResponse.json({ error: "email and message are required" }, { status: 400 });
  }

  const { entitlement } = await getEntitlementForEmail(email);
  if (!entitlement.canUseBase) {
    return NextResponse.json({ error: "not entitled", entitlement }, { status: 403 });
  }

  const systemPrompt = buildGapMemberSystemPrompt(gapContext);

  const claudeStartedAt = Date.now();
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [...history, { role: "user", content: message }],
  });

  logGapChatUsage(response, Date.now() - claudeStartedAt, 4096); // log-only (Vercel logs)

  const replyText = response.content
    .filter((block: any) => block.type === "text")
    .map((block: any) => block.text)
    .join("\n");

  return NextResponse.json({ reply: replyText });
}
