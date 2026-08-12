// Healing metadata + media URLs. Spec ref: SPEC.md §4.3 and §7.
// The model only ever sees this metadata, never media bytes (Phase 1: URL references).
import { NextRequest, NextResponse } from "next/server";
import base, { Tables } from "@/lib/airtable";

export async function GET(req: NextRequest) {
  // TODO(Phase 4): filter by the requested focusArea slug once FocusAreas <-> Healings
  // linked-record resolution is wired up. Phase 1 returns the full active library.
  const focusAreaSlug = req.nextUrl.searchParams.get("focusArea");
  const records = await base(Tables.Healings)
    .select({ filterByFormula: "{active} = 1" })
    .all();

  const healings = records.map((r) => r.fields);
  return NextResponse.json({ healings, focusAreaSlug });
}
