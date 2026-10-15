// Single chat session: fetch its messages (GET), rename/archive (PATCH), or
// delete it entirely (DELETE). Spec ref: Rachael's Aug 13 Chat History +
// Memory Architecture doc, PART 3-5.
import { NextRequest, NextResponse } from "next/server";
import { placeholderChatTitle } from "@/lib/chatTitles";
import {
  getChatSessionById,
  listChatMessagesForView,
  renameChatSession,
  archiveChatSession,
  deleteChatSession,
} from "@/lib/airtable";

export async function GET(
  req: NextRequest,
  { params }: { params: { chatId: string } }
) {
  const { chatId } = params;
  // Chat history speed (Oct 15 2026): the session lookup and the message read
  // used to run one after the other; they're independent, so run them together.
  // Optional ?limit=N (1-99) reads only the newest N messages (+ hasMore);
  // without it every message is returned, exactly as before.
  const limitRaw = parseInt(req.nextUrl.searchParams.get("limit") || "", 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 99) : 0;
  const t0 = Date.now();
  const [session, page] = await Promise.all([
    getChatSessionById(chatId),
    listChatMessagesForView(chatId, { limit }).catch((err: any) => ({ error: err })),
  ]);
  const ms = Date.now() - t0;
  if (!session) {
    return NextResponse.json({ error: "chat not found" }, { status: 404 });
  }
  if ((page as any).error) throw (page as any).error;
  const messages = (page as any).records as any[];
  const res = NextResponse.json({
    ...(limit ? { hasMore: !!(page as any).hasMore } : {}),
    chat: {
      id: session.id,
      title: session.fields.title || placeholderChatTitle(session.fields.created_at || new Date()),
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
  res.headers.set("Server-Timing", `airtable;dur=${ms}`);
  res.headers.set("Cache-Control", "private, no-store");
  return res;
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
