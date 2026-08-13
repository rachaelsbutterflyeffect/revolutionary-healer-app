// Save endpoint for the GAP Method funnel's Step 3 diagnostic result. Spec
// ref: Rachael's Aug 12 "GAP METHOD -- STEP 2, STEP 3, AND REVOLUTIONARY
// HEALER HANDOFF" persistence instruction.
//
// Public, unauthenticated (same trust model as app/api/gap-chat/route.ts --
// the anonymous funnel session has no login). Only writes to Airtable when an
// email is present (see public/gap-method.html's buyerEmail / ?e= handling);
// if no email is known for this session, this is a no-op that still returns
// ok so the funnel itself never breaks or blocks on this call.
import { NextRequest, NextResponse } from "next/server";
import { saveGapMethodDiagnostic } from "@/lib/airtable";

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const email = typeof body?.email === "string" ? body.email.trim() : "";

  if (!email) {
    // No identified purchaser for this anonymous session yet -- nothing to
    // link. Not an error: Steps 1-3 work fully without email capture.
    return NextResponse.json({ ok: true, saved: false });
  }

  try {
    await saveGapMethodDiagnostic({
      email,
      divineIdentity: body.divineIdentity,
      primaryFrequency: body.primaryFrequency,
      focusArea: body.focusArea,
      refinedGap: body.refinedGap,
      step1Answers: body.step1Answers,
      step2Summary: body.step2Summary,
      recommendedActivation: body.recommendedActivation,
      activationWhy: body.activationWhy,
    });
    return NextResponse.json({ ok: true, saved: true });
  } catch (err) {
    console.error("gap-method-result save failed", err);
    return NextResponse.json({ ok: false, error: "save failed" }, { status: 500 });
  }
}
