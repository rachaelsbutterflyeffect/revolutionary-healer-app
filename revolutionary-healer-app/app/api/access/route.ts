// Email gate: is this member entitled? Spec ref: SPEC.md §7.
import { NextRequest, NextResponse } from "next/server";
import { listPurchaseOfferIdsByEmail } from "@/lib/airtable";
import { getEntitlementForEmail } from "@/lib/entitlements";
import { resolveFiveDayUpgradeBanner } from "@/lib/fiveDayUpgradeBanner";

export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const normalized = email.toLowerCase().trim();
  const { entitlement, record } = await getEntitlementForEmail(normalized);
  // Aug 14 (Rachael's "Member Since" + cancellation-lockout request): expose the
  // Airtable record's own createdTime as memberSince -- this is the real signup
  // moment (first Kajabi purchase webhook that created the record), no schema
  // change needed since every Airtable record carries this automatically.
  const memberSince = record?._rawJson?.createdTime ?? null;
  // Five-day upgrade line. Days 3, 2, and 1 only, and never for a member,
  // Beta, DLRH, or anyone with an RH purchase on record. Lookup trouble hides it.
  let showFiveDayUpgradeBanner = false;
  try {
    const decision = await resolveFiveDayUpgradeBanner({
      entitlement,
      memberFields: record?.fields ?? null,
      loadOfferIds: () => listPurchaseOfferIdsByEmail(normalized),
    });
    showFiveDayUpgradeBanner = decision.show === true;
  } catch (err) {
    console.error("five-day upgrade banner hidden", err);
    showFiveDayUpgradeBanner = false;
  }
  return NextResponse.json({ email, memberSince, ...entitlement, showFiveDayUpgradeBanner });
}
