// Public, unauthenticated chat endpoint for the pre-purchase $9 GAP Method
// funnel (public/gap-method.html). Unlike app/api/chat/route.ts, this is NOT
// gated by Airtable entitlement (getEntitlementForEmail) -- per the "TWO GAP
// METHOD BOTS" note in lib/processes.js, GAP_METHOD_SCRIPT_FUNNEL_UPSELL is
// the script for exactly this experience: a prospect who already paid $9 at
// Kajabi checkout before ever reaching this page, with no further login or
// paywall inside the funnel itself. Wired up per Rachael's Aug 12 request to
// replace gap-method.html's static, canned Step 2 script with a real,
// Claude-run conversation. Spec ref: lib/processes.js's
// GAP_METHOD_SCRIPT_FUNNEL_UPSELL + STEP_2_BEHAVIOR_SPEC.
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { buildGapFunnelSystemPrompt } from "@/lib/processes";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5";

export async function POST(req: NextRequest) {
    const { message, history = [], gapContext = null } = await req.json();

  if (!message) {
        return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const systemPrompt = buildGapFunnelSystemPrompt(gapContext);

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

  return NextResponse.json({ reply: replyText });
}
