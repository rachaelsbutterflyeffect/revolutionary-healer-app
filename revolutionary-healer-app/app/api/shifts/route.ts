import { NextRequest, NextResponse } from "next/server";
import { getShiftsByEmail } from "@/lib/airtable";

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  if (!email) {
    return NextResponse.json({ error: "Missing email" }, { status: 400 });
  }
  try {
    const records = await getShiftsByEmail(email);
    const shifts = records.map((r: any) => ({
      id: r.id,
      divineIdentityName: r.fields.divine_identity_name ?? "",
      currentFrequency: r.fields.current_frequency ?? "",
      focusArea: r.fields.focus_area ?? "",
      gapExplanation: r.fields.gap_explanation ?? "",
      whatWeNoticed: r.fields.what_we_noticed ?? "",
      recommendedActivation: r.fields.recommended_activation ?? "",
      progressStatus: r.fields.progress_status ?? "shifting",
      createdAt: r.fields.created_at ?? "",
      methodName: r.fields.method_name ?? "",
      undercurrent: r.fields.undercurrent ?? "",
      nextSuggestedActivation: r.fields.next_suggested_activation ?? "",
      readyForEmbodied: !!r.fields.ready_for_embodied,
    }));
    return NextResponse.json({ shifts });
  } catch (err) {
    console.error("GET /api/shifts failed", err);
    return NextResponse.json({ error: "Something went wrong loading your Shifts." }, { status: 500 });
  }
}
