import { NextRequest, NextResponse } from "next/server";
import { logActivationCompleted, getCompletedActivationSlugsByEmail } from "@/lib/airtable";

// Aug 16, Rachael's request: server-side "Activations Completed" tracking.
// GET returns the slugs a member has completed (Profile stat + card badges).
// POST logs one completion (audio player "ended" event, or "Mark as Listened").

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  if (!email) {
    return NextResponse.json({ error: "Missing email" }, { status: 400 });
  }
  try {
    const slugs = await getCompletedActivationSlugsByEmail(email);
    return NextResponse.json({ slugs });
  } catch (err) {
    console.error("GET /api/activation-completions failed", err);
    return NextResponse.json({ error: "Failed to load activation completions" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { email, activationSlug } = await req.json();
  if (!email || !activationSlug) {
    return NextResponse.json({ error: "Missing email or activationSlug" }, { status: 400 });
  }
  try {
    await logActivationCompleted(email, activationSlug);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("POST /api/activation-completions failed", err);
    return NextResponse.json({ error: "Failed to log activation completion" }, { status: 500 });
  }
}
