// List/create chat sessions for a member. Spec ref: Rachael's Aug 13 Chat
// History + Memory Architecture doc, PART 3-5. Replaces the old single-blob
// Chats table endpoint (lib/airtable.js's getChatsByEmail/upsertChats are
// kept for backward compat but are unused by the frontend as of this
// rewrite -- the ChatSessions/ChatMessages tables are the real store now).
import { NextRequest, NextResponse } from "next/server";
import { createChatSession, listChatSessionsByEmail } from "@/lib/airtable";

function serializeSession(record: any) {
  return {
    id: record.id,
    title: record.fields.title || "New Chat",
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
  const records = await listChatSessionsByEmail(email, { includeArchived });
  return NextResponse.json({ chats: records.map(serializeSession) });
}

export async function POST(req: NextRequest) {
  const { email, title, focusAreaSlug } = await req.json();
  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }
  const record = await createChatSession({
    email,
    title: title || "New Chat",
    focusAreaSlug: focusAreaSlug || "general",
  });
  return NextResponse.json({ chat: serializeSession(record) });
}
