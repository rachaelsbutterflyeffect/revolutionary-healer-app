// GET /api/ui-refresh?email=  ->  { refresh: boolean, firstName?: string }
// Read-only. Tells app.html / app-refresh.html which look this member gets (lib/uiRefresh.js).
// When the refresh is on for the member, also returns a first name for the greeting if one is
// on file (GapMethodResults.first_name from the Kajabi purchase webhook); never derived from the email.
import { NextRequest, NextResponse } from "next/server";
import { uiRefreshAllowed } from "@/lib/uiRefresh";
import { getGapMethodResultByEmail } from "@/lib/airtable";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email") || "";
  const refresh = uiRefreshAllowed(email);
  const headers = { "Cache-Control": "no-store" };
  if (!refresh) return NextResponse.json({ refresh: false }, { headers });
  let firstName = "";
  try {
    const rec: any = await getGapMethodResultByEmail(email);
    const fn = rec && rec.fields && typeof rec.fields.first_name === "string" ? rec.fields.first_name.trim() : "";
    if (fn && !/@/.test(fn)) firstName = fn.split(/\s+/)[0];
  } catch (e) {}
  return NextResponse.json({ refresh: true, firstName }, { headers });
}
