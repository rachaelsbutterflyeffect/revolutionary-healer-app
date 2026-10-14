// CCM funnel rollup: shown / asked / link sent / bought (+ declines).
// Off unless CCM_TRACKING is on. Requires ?secret=CCM_ADMIN_SECRET.
import { NextRequest, NextResponse } from "next/server";
import { ccmTrackingEnabled, getFunnel } from "@/lib/ccm-tracking";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!ccmTrackingEnabled()) return NextResponse.json({ error: "not found" }, { status: 404 });
  const expected = process.env.CCM_ADMIN_SECRET;
  if (!expected || req.nextUrl.searchParams.get("secret") !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const funnel = await getFunnel({ includeTest: req.nextUrl.searchParams.get("include_test") === "1" });
    return NextResponse.json({ funnel });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
}
