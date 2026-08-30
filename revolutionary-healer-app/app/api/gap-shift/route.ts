// Deterministic Shift creation for the in-app "3 Step GAP Method" (Aug 30
// rebuild): Step 3 in public/app.html is now a fully deterministic reveal
// (same ARCHETYPES/DIVINE_REVEAL-style data as the funnel's
// public/gap-method.html) instead of an AI chat turn, so there is no
// [[SAVE_SHIFT: ...]] marker to detect -- the client calls this endpoint the
// moment the member lands on Step 3 to create their Shift card automatically,
// with no confirmation step required. See lib/airtable.js's
// createShiftFromChat for the underlying Airtable write, and
// app/api/chat/route.ts for the general (non-GAP-Method) marker-based
// version of this same write used elsewhere in the app.
import { NextRequest, NextResponse } from "next/server";
import { getEntitlementForEmail } from "@/lib/entitlements";
import { createShiftFromChat } from "@/lib/airtable";

export async function POST(req: NextRequest) {
  const {
    email,
    divineIdentitySlug = "",
    divineIdentityName = "",
    currentFrequency = "",
    focusArea = "",
    gapExplanation = "",
    whatWeNoticed = "",
    recommendedActivation = "",
    chatId = null,
  } = await req.json();

  if (!email || !divineIdentitySlug) {
    return NextResponse.json(
      { error: "email and divineIdentitySlug are required" },
      { status: 400 }
    );
  }

  const { record, entitlement } = await getEntitlementForEmail(email);
  if (!entitlement.canUseBase) {
    return NextResponse.json({ error: "not entitled", entitlement }, { status: 403 });
  }

  const shift = await createShiftFromChat({
    email,
    memberRecordId: record?.id,
    chatId,
    methodName: "3 Step GAP Method",
    divineIdentitySlug,
    divineIdentityName,
    currentFrequency,
    focusArea,
    gapExplanation,
    whatWeNoticed,
    recommendedActivation,
  });

  return NextResponse.json({ shiftId: shift.id });
}
