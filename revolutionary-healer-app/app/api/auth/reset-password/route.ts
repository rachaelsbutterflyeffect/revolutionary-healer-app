import { NextRequest, NextResponse } from "next/server";
import { getMemberByResetToken, setMemberPassword } from "@/lib/airtable";
import { hashPassword } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const token = String(body?.token ?? "");
    const password = String(body?.password ?? "");

    if (!token || !password) {
      return NextResponse.json({ error: "Missing token or password." }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
    }

    const member = await getMemberByResetToken(token);
    if (!member) {
      return NextResponse.json(
        { error: "This reset link is invalid or has already been used." },
        { status: 400 }
      );
    }

    const expiresAt = (member.fields as any).reset_token_expires_at as string | undefined;
    if (!expiresAt || new Date(expiresAt).getTime() < Date.now()) {
      return NextResponse.json(
        { error: "This reset link has expired. Please request a new one." },
        { status: 400 }
      );
    }

    await setMemberPassword(member.id, hashPassword(password));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/auth/reset-password failed", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
