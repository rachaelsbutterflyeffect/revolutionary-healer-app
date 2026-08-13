// Resolves a Gap Method magic-link session token (from the purchase
// confirmation email) into the buyer's email, server-side only. Aug 13, per
// Rachael's Kajabi Purchase Webhook architecture: the token is the only
// thing that ever appears in the public gap-method.html URL -- never the
// buyer's email or any Airtable credentials. The client calls this once on
// load with the token from its own URL and gets back just the email/first
// name it needs to attach the diagnostic to the right purchaser record.
import { NextRequest, NextResponse } from "next/server";
import { getGapMethodResultByToken, markGapMethodTokenUsed } from "@/lib/airtable";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t");
  if (!token) {
    return NextResponse.json({ error: "missing token" }, { status: 400 });
  }

  const record = await getGapMethodResultByToken(token);
  if (!record) {
    return NextResponse.json({ error: "invalid or expired link" }, { status: 404 });
  }

  // Best-effort marker only -- a token stays valid for repeat visits within
  // the same purchase (e.g. the buyer closes the tab and reopens the
  // email); this just lets us see in Airtable whether a link was ever
  // opened. Never blocks the response on this.
  if (!record.fields.token_used) {
    markGapMethodTokenUsed(record.id).catch(() => {});
  }

  return NextResponse.json({
    email: record.fields.email,
    firstName: record.fields.first_name || null,
  });
}
