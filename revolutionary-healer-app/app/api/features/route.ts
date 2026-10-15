// GET /api/features?email=  ->  { codePull: boolean, ... }   Read-only. See lib/features.js.
import { NextRequest, NextResponse } from "next/server";
import { featuresFor } from "@/lib/features";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email") || "";
  return NextResponse.json(featuresFor(email), { headers: { "Cache-Control": "no-store" } });
}
