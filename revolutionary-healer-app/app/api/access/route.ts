// Email gate: is this member entitled? Spec ref: SPEC.md §7.
import { NextRequest, NextResponse } from "next/server";
import { getEntitlementForEmail } from "@/lib/entitlements";

export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const { entitlement, record } = await getEntitlementForEmail(email.toLowerCase().trim());
  // Aug 14 (Rachael's "Member Since" + cancellation-lockout request): expose the
  // Airtable record's own createdTime as memberSince -- this is the real signup
  // moment (first Kajabi purchase webhook that created the record), no schema
  // change needed since every Airtable record carries this automatically.
  const memberSince = record?._rawJson?.createdTime ?? null;
  return NextResponse.json({ email, memberSince, ...entitlement });
}
