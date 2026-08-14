// Single chat session: fetch its messages (GET), rename/archive (PATCH), or
// delete it entirely (DELETE). Spec ref: Rachael's Aug 13 Chat History +
// Memory Architecture doc, PART 3-5.
import { NextRequest, NextResponse } from "next/server";
import {
  getChatSessionById,
  listMessagesByChatId,
  renameChatSession,
  archiveChatSession,
  deleteChatSession,
} from "@/lib/airtable";

export async function GET(
  req: NextRequest,
  { params }: { params: { chatId: string } }
) {
  const { chatId } = params;
  const session = await getChatSessionById(chatId);
  if (!session) {
    return NextResponse.json({ error: "chat not found" }, { status: 404 });
  }
  const messages = await listMessagesByChatId(chatId);
  return NextResponse.json({
    chat: {
      id: session.id,
      title: session.fields.title || "New Chat",
      archived: !!session.fields.archived,
      focusAreaSlug: session.fields.focus_area_slug || "general",
    },
    messages: messages.map((m: any) => ({
      id: m.id,
      role: m.fields.role === "assistant" ? "assistant" : "user",
      text: m.fields.message_text || "",
      createdAt: m.fields.created_at || null,
      activationRecommended: m.fields.activation_recommended || null,
    })),
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { chatId: string } }
) {
  const { chatId } = params;
  const body = await req.json();
  const session = await getChatSessionById(chatId);
  if (!session) {
    return NextResponse.json({ error: "chat not found" }, { status: 404 });
  }
  if (typeof body.title === "string" && body.title.trim()) {
    await renameChatSession(chatId, body.title.trim());
  }
  if (typeof body.archived === "boolean") {
    await archiveChatSession(chatId, body.archived);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { chatId: string } }
) {
  const { chatId } = params;
  const session = await getChatSessionById(chatId);
  if (!session) {
    return NextResponse.json({ error: "chat not found" }, { status: 404 });
  }
  await deleteChatSession(chatId);
  return NextResponse.json({ ok: true });
}
