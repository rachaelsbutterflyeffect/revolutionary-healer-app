// GET /api/recode-codes?email=&focus=
// The member's held Recode Deck codes, plus one deck card when a chat link
// asks for it. No Airtable record ids.
import { NextRequest, NextResponse } from "next/server";
import { normalizeEmail } from "@/lib/airtable";
import { getEntitlementForEmail } from "@/lib/entitlements";
import { featureAllowed } from "@/lib/features";
import { cardsForMember, loadHeldCodes } from "@/lib/memberCodes";
import { CODES_LIST_PATH, DAILY_CODE_PATH, loadRecodeDeck } from "@/lib/recodeDeck";
import { LOOKUP_UNAVAILABLE } from "@/lib/codeChat";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const email = normalizeEmail(req.nextUrl.searchParams.get("email") || "");
  const focus = String(req.nextUrl.searchParams.get("focus") || "").replace(/\D/g, "");
  try {
    loadRecodeDeck();
  } catch (err) {
    console.error("recode deck unreadable", err);
    return NextResponse.json({ unavailable: true, message: LOOKUP_UNAVAILABLE, held: [], focus: null, path: CODES_LIST_PATH, dailyPath: DAILY_CODE_PATH });
  }
  if (!email) {
    return NextResponse.json({ held: [], focus: null, path: CODES_LIST_PATH, dailyPath: DAILY_CODE_PATH });
  }
  try {
    const { entitlement } = await getEntitlementForEmail(email);
    if (!entitlement.canUseBase) return NextResponse.json({ error: "not entitled" }, { status: 403 });
    const held = await loadHeldCodes(email);
    const codePull = featureAllowed("CODE_PULL", email);
    const view = cardsForMember({ held, entitlement, codePull, focusCode: focus });
    return NextResponse.json(
      { ...view, path: CODES_LIST_PATH, dailyPath: DAILY_CODE_PATH },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("GET /api/recode-codes failed", err);
    return NextResponse.json({ unavailable: true, message: LOOKUP_UNAVAILABLE, held: [], focus: null, path: CODES_LIST_PATH, dailyPath: DAILY_CODE_PATH });
  }
}
