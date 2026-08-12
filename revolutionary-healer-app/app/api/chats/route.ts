// Per-member chat history (cross-device sync, by email). Spec ref: SPEC.md §7.
import { NextRequest, NextResponse } from "next/server";
import { getChatsByEmail, upsertChats } from "@/lib/airtable";

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }
  const record = await getChatsByEmail(email);
  const convos = record?.fields?.convos ? JSON.parse(record.fields.convos as string) : [];
  return NextResponse.json({ email, convos });
}

export async function POST(req: NextRequest) {
  const { email, convos } = await req.json();
  if (!email || !Array.isArray(convos)) {
    return NextResponse.json({ error: "email and convos[] are required" }, { status: 400 });
  }
  await upsertChats(email, convos);
  return NextResponse.json({ ok: true });
}
