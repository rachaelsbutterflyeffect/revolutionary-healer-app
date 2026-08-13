import { NextRequest, NextResponse } from "next/server";
import { getMemberByEmail, createMemberResetToken, normalizeEmail } from "@/lib/airtable";
import { deriveEntitlement } from "@/lib/entitlements";
import { generateToken } from "@/lib/auth";
import { sendPasswordResetEmail } from "@/lib/email";

// Always returns a generic success message (never reveals whether an email
// has an account) to avoid leaking who is/isn't a member -- but only
// actually issues a token + sends an email when the member exists and has
// real paid access.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = normalizeEmail(String(body?.email ?? ""));
    const generic = {
      ok: true,
      message: "If that email has an active account, we've sent a password reset link.",
    };

    if (!email) return NextResponse.json(generic);

    const member = await getMemberByEmail(email);
    if (member) {
      const entitlement = deriveEntitlement(member.fields as any);
      const isPaying = entitlement.memberActive || entitlement.tierActive || entitlement.onBetaMembership;
      if (isPaying) {
        const token = generateToken();
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        await createMemberResetToken(member.id, token, expiresAt);
        await sendPasswordResetEmail({ email, firstName: "", resetToken: token }).catch((e) =>
          console.error("sendPasswordResetEmail failed", e)
        );
      }
    }

    return NextResponse.json(generic);
  } catch (err) {
    console.error("POST /api/auth/forgot-password failed", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
