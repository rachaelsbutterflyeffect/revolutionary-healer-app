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
import { featureAllowed } from "@/lib/features"; // Shift the codes (Oct 15 2026, exact-list gate)
import { gapShiftOnce } from "@/lib/gapShiftOnce"; // one GAP run = one Shift (duplicate-save fix, Oct 8 2026)
import { ensureMemberVoice } from "@/lib/memberVoice"; // Shift card speaks to the member as "you" (Oct 17 2026)

export async function POST(req: NextRequest) {
  let {
    email,
    divineIdentitySlug = "",
    divineIdentityName = "",
    currentFrequency = "",
    focusArea = "",
    gapExplanation = "",
    whatWeNoticed = "",
    recommendedActivation = "",
    chatId = null,
    todaysFocus = "",
    clientRunId = "",
    source = "",
  } = await req.json();

  // "Shift the codes": save a pulled Code Upgrade card as a Shift. Only for
  // members on CODE_SHIFTS_ALLOWLIST (CODE_SHIFTS=list); everyone else gets
  // a 404 before anything is read or written. The GAP path below is unchanged.
  if (source === "code-upgrade") {
    if (!email || !featureAllowed("CODE_SHIFTS", email)) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const cut = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
    const name = cut(divineIdentityName, 200);
    const focus = cut(focusArea, 200);
    if (!name || !focus.startsWith("code-upgrade:")) {
      return NextResponse.json({ error: "divineIdentityName and a code-upgrade focusArea are required" }, { status: 400 });
    }
    const { record, entitlement } = await getEntitlementForEmail(email);
    if (!entitlement.canUseBase) {
      return NextResponse.json({ error: "not entitled", entitlement }, { status: 403 });
    }
    const voiced = await ensureMemberVoice({ gapExplanation: cut(gapExplanation, 5000) }, { label: "code-upgrade-shift" });
    const shift: any = await createShiftFromChat({
      email,
      memberRecordId: record?.id,
      chatId: null,
      methodName: "Code Upgrade",
      divineIdentitySlug: "",
      divineIdentityName: name,
      currentFrequency: "Code Upgrade",
      focusArea: focus,
      gapExplanation: voiced.fields.gapExplanation,
      whatWeNoticed: "",
      recommendedActivation: cut(recommendedActivation, 500),
    });
    return NextResponse.json({ shiftId: shift.id });
  }

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

  // Rachael's rule (Oct 17 2026): the saved card speaks to the member as "you",
  // never she/her. The GAP Method instructions are not changed; only the text
  // written to the Shift card is. The same rewritten text goes to the
  // duplicate check, so a retried save still finds the card it already made.
  {
    const voice: Record<string, string> = {};
    if (typeof gapExplanation === "string") voice.gapExplanation = gapExplanation;
    if (typeof whatWeNoticed === "string") voice.whatWeNoticed = whatWeNoticed;
    if (typeof todaysFocus === "string") voice.todaysFocus = todaysFocus;
    const v = (await ensureMemberVoice(voice, { label: "gap-shift" })).fields;
    if (typeof v.gapExplanation === "string") gapExplanation = v.gapExplanation;
    if (typeof v.whatWeNoticed === "string") whatWeNoticed = v.whatWeNoticed;
    if (typeof v.todaysFocus === "string") todaysFocus = v.todaysFocus;
  }

  const shift: any = await gapShiftOnce({ email, clientRunId, divineIdentitySlug, gapExplanation, whatWeNoticed, recommendedActivation }, () => createShiftFromChat({
    email,
    memberRecordId: record?.id,
    chatId,
    methodName: "GAP Method",
    divineIdentitySlug,
    divineIdentityName,
    currentFrequency,
    focusArea,
    gapExplanation,
    whatWeNoticed,
    recommendedActivation,
    // GAP reading restructure (Oct 8 2026): optional, only when the page sends it.
    ...(typeof todaysFocus === "string" && todaysFocus.trim() ? { todaysFocus: todaysFocus.trim().slice(0, 1500) } : {}),
  }));

  return NextResponse.json(shift.deduped ? { shiftId: shift.id, deduped: true } : { shiftId: shift.id });
}
