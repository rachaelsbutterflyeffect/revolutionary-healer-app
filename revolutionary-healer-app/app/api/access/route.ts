// Email gate: is this member entitled? Spec ref: SPEC.md §7.
import { NextRequest, NextResponse } from "next/server";
import { getEntitlementForEmail } from "@/lib/entitlements";

export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const { entitlement } = await getEntitlementForEmail(email.toLowerCase().trim());
  return NextResponse.json({ email, ...entitlement });
}
