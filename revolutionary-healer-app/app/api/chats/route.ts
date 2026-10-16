// List/create chat sessions for a member. Spec ref: Rachael's Aug 13 Chat
// History + Memory Architecture doc, PART 3-5. Replaces the old single-blob
// Chats table endpoint (lib/airtable.js's getChatsByEmail/upsertChats are
// kept for backward compat but are unused by the frontend as of this
// rewrite -- the ChatSessions/ChatMessages tables are the real store now).
import { NextRequest, NextResponse } from "next/server";
import { createChatSession, listChatSessionsForView } from "@/lib/airtable";
import { placeholderChatTitle } from "@/lib/chatTitles";

function serializeSession(record: any) {
  return {
    id: record.id,
    // Smarter chat titles (Oct 7 2026): an untitled chat shows the dated
    // placeholder ("New Chat · Oct 7") instead of a bare "New Chat".
    title: record.fields.title || placeholderChatTitle(record.fields.created_at || new Date()),
    createdAt: record.fields.created_at || null,
    updatedAt: record.fields.updated_at || null,
    lastMessageAt: record.fields.last_message_at || null,
    archived: !!record.fields.archived,
    focusAreaSlug: record.fields.focus_area_slug || "general",
  };
}

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  const includeArchived = req.nextUrl.searchParams.get("includeArchived") === "1";
  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }
  // Optional ?limit=N (1-99): newest N only, plus hasMore. Without it the
  // response is the full list, exactly as before (classic app.html relies on it).
  const limitRaw = parseInt(req.nextUrl.searchParams.get("limit") || "", 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 99) : 0;
  const t0 = Date.now();
  const { records, hasMore } = await listChatSessionsForView(email, { includeArchived, limit });
  const ms = Date.now() - t0;
  const res = NextResponse.json(limit ? { chats: records.map(serializeSession), hasMore } : { chats: records.map(serializeSession) });
  res.headers.set("Server-Timing", `airtable;dur=${ms}`);
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}

export async function POST(req: NextRequest) {
  const { email, title, focusAreaSlug, timeZone } = await req.json();
  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }
  const record = await createChatSession({
    email,
    title: title || placeholderChatTitle(new Date(), timeZone),
    focusAreaSlug: focusAreaSlug || "general",
  });
  return NextResponse.json({ chat: serializeSession(record) });
}
