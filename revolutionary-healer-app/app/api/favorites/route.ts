import { NextRequest, NextResponse } from "next/server";
import {
  addFavoriteActivation,
  removeFavoriteActivation,
  getFavoriteActivationSlugsByEmail,
} from "@/lib/airtable";

// Sept 29 (Rachael's deep-audit P0 -- favorites never persisted, only a
// visual heart-class toggle with no backend at all). Mirrors
// /api/activation-completions.
// GET returns the slugs a member has favorited (home Favorites row,
// dedicated Favorites page, and heart state on every library card).
// POST favorites an activation. DELETE un-favorites it.

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  if (!email) {
    return NextResponse.json({ error: "Missing email" }, { status: 400 });
  }
  try {
    const slugs = await getFavoriteActivationSlugsByEmail(email);
    return NextResponse.json({ slugs });
  } catch (err) {
    console.error("GET /api/favorites failed", err);
    return NextResponse.json({ error: "Failed to load favorites" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { email, activationSlug } = await req.json();
  if (!email || !activationSlug) {
    return NextResponse.json({ error: "Missing email or activationSlug" }, { status: 400 });
  }
  try {
    await addFavoriteActivation(email, activationSlug);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("POST /api/favorites failed", err);
    return NextResponse.json({ error: "Failed to save favorite" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { email, activationSlug } = await req.json();
  if (!email || !activationSlug) {
    return NextResponse.json({ error: "Missing email or activationSlug" }, { status: 400 });
  }
  try {
    await removeFavoriteActivation(email, activationSlug);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/favorites failed", err);
    return NextResponse.json({ error: "Failed to remove favorite" }, { status: 500 });
  }
}
