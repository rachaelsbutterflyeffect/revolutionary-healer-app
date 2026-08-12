// Healer Calibration flow (stateful Q&A + synthesis). Spec ref: SPEC.md §4.4.
// Phase 5 in the roadmap (§10) -- this is a placeholder so the route exists
// and the front end can be wired against a stable contract early.
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { email, step, answer } = await req.json();
  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  // TODO(Phase 5): persist step answers, run the multi-step self-assessment across
  // focus areas, and synthesize a personalized read-out + higher-tier invite.
  return NextResponse.json({
    ok: true,
    message: "Healer Calibration is not built yet (Phase 5).",
    received: { step: step ?? null, answer: answer ?? null },
  });
}
