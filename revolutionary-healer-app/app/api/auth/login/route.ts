import { NextRequest, NextResponse } from "next/server";
import { getMemberByEmail, setMemberPassword, normalizeEmail } from "@/lib/airtable";
import { deriveEntitlement } from "@/lib/entitlements";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { sendOpsAlert } from "@/lib/email";

// Oct 8 2026 (after Eden Koz's Kajabi email change): a member whose email
// changed in Kajabi but not yet in the app lands here with "no member". The
// message now tells her the self-serve way in (her previous email still works
// until her account is moved). Optional heads-up email to Rachael, OFF unless
// LOGIN_MISS_ALERT=on in Vercel (random typos would otherwise email her).
const NOT_FOUND_MESSAGE =
  "We don't see a purchase for that email. Double-check you're using the exact email you purchased with. " +
  "If you recently changed your email in Kajabi, sign in with your previous email for now and contact support so we can update it.";

async function maybeAlertLoginMiss(email: string) {
  if (String(process.env.LOGIN_MISS_ALERT ?? "").trim().toLowerCase() !== "on") return;
  if (!/^[^\s@"'\\]+@[^\s@"'\\]+\.[^\s@"'\\]+$/.test(email)) return;
  try {
    await sendOpsAlert({
      subject: `Sign-in attempt with an unknown email: ${email}`,
      message:
        `Someone tried to sign in to the app as ${email}, but no member has that email.\n\n` +
        `If this is a member who changed her email in Kajabi, move her account in one step ` +
        `(dry run first, then add --apply): node scripts/move-member-email.mjs --old <her previous email> --new ${email}\n\n` +
        `If it's a typo or not a member, you can ignore this.`,
    });
  } catch (err) {
    console.error("login miss alert failed", err);
  }
}

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
      await maybeAlertLoginMiss(email);
      return NextResponse.json({ error: NOT_FOUND_MESSAGE }, { status: 401 });
    }

    const entitlement = deriveEntitlement(member.fields as any);
    const isPaying = entitlement.memberActive || entitlement.tierActive || entitlement.onBetaMembership || entitlement.onDlrhMembership;
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
