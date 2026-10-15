// GET /api/revolution-sections?email= : My Revolution GAP / Codes sections (SAVE_SECTIONS) and the stat-row counts
// (METHOD_TRACKING). Both are exact-list switches; anyone on neither list gets a 404 before anything is read.
// Read-only: computed from existing Shifts, code_pull Events and the member's GAP result.
import { NextRequest, NextResponse } from "next/server";
import { featureAllowed } from "@/lib/features";
import { getShiftsByEmail, getGapMethodResultByEmail, listCodePullEvents, normalizeEmail } from "@/lib/airtable";
import { classify } from "@/lib/revolutionSections";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const email = normalizeEmail(req.nextUrl.searchParams.get("email") || "");
  const sections = featureAllowed("SAVE_SECTIONS", email), tracking = featureAllowed("METHOD_TRACKING", email);
  if (!email || (!sections && !tracking) || /["'\\]/.test(email)) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const [rows, events, gr]: any[] = await Promise.all([
      getShiftsByEmail(email),
      listCodePullEvents(email),
      getGapMethodResultByEmail(email).catch(() => null),
    ]);
    const shifts = rows.map((r: any) => ({ id: r.id, methodName: r.fields.method_name ?? "", divineIdentityName: r.fields.divine_identity_name ?? "", currentFrequency: r.fields.current_frequency ?? "", focusArea: r.fields.focus_area ?? "", createdAt: r.fields.created_at ?? "" }));
    const pulls = events.map((r: any) => { let m: any = {}; try { m = JSON.parse(r.fields.meta || "{}"); } catch {} return { name: m.name, card: m.card, code: m.code, at: r.fields.created_at || "" }; });
    const g = gr?.fields;
    const gapResult = g ? { completedAt: g.diagnostic_completed_at, shiftCreated: !!g.shift_created, linkedShift: Array.isArray(g.Shifts) && g.Shifts.length > 0, identity: g.divine_identity, frequency: g.primary_frequency } : null;
    const c = classify({ shifts, pulls, gapResult });
    const out: any = {};
    if (sections) { out.gap = c.gap; out.codes = c.codes; }
    if (tracking) out.counts = c.counts;
    return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("GET /api/revolution-sections failed", err);
    return NextResponse.json({ error: "Something went wrong loading your Revolution." }, { status: 500 });
  }
}
