import { NextRequest, NextResponse } from "next/server";
import { getMemberByEmail, setMemberPassword, normalizeEmail } from "@/lib/airtable";
import { deriveEntitlement } from "@/lib/entitlements";
import { hashPassword, verifyPassword } from "@/lib/auth";

// Aug 13 (Rachael's Kajabi-linked landing page request): Kajabi doesn't
// expose an API to verify a member's real Kajabi password, so this is a
// "bootstrap on first use" login -- the very first time a paying member
// signs in, whatever password they type (the same one they use in Kajabi)
// becomes their app password from then on. Only an email with real, paid
// access (member_active / tier_active / an active Beta grant) can ever
// bootstrap a password here -- see SPEC note in lib/entitlements.js.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = normalizeEmail(String(body?.email ?? ""));
    const password = String(body?.password ?? "");

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    const member = await getMemberByEmail(email);
    if (!member) {
      return NextResponse.json(
        { error: "We couldn't find access for that email. Use the same email you purchased with." },
        { status: 401 }
      );
    }

    const entitlement = deriveEntitlement(member.fields as any);
    const isPaying = entitlement.memberActive || entitlement.tierActive || entitlement.onBetaMembership;
    if (!isPaying) {
      return NextResponse.json(
        { error: "This email doesn't have active access yet. If you just purchased, please try again in a few minutes." },
        { status: 403 }
      );
    }

    const stored = (member.fields as any).password_hash as string | undefined;

    if (!stored) {
      if (password.length < 6) {
        return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
      }
      await setMemberPassword(member.id, hashPassword(password));
    } else if (!verifyPassword(password, stored)) {
      return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
    }

    return NextResponse.json({ ok: true, email });
  } catch (err) {
    console.error("POST /api/auth/login failed", err);
    return NextResponse.json({ error: "Something went wrong signing you in." }, { status: 500 });
  }
}
