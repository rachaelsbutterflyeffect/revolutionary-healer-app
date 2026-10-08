// Streaming replies for the MAIN chatbot (/api/chat) -- Oct 8 2026.
//
// WHAT THIS DOES: instead of waiting for Claude's whole reply and sending it
// in one go, the server can pass the reply to the page piece by piece as it
// is written, so the member sees words appear after a couple of seconds
// instead of staring at the thinking bubble for 4-8s.
//
// OFF BY DEFAULT. Server switch (Vercel env vars):
//   CHAT_STREAMING            off (default / missing) | allowlist | on
//   CHAT_STREAMING_ALLOWLIST  comma-separated member emails, used only when
//                             CHAT_STREAMING=allowlist
// The page also has to ask for it ({ stream: true } in the request body), and
// a request with a processSlug (the dormant GAP-in-main-chat path, which can
// replace a whole reply after the fact) NEVER streams. Whenever streaming is
// not used, app/api/chat/route.ts runs exactly the code it ran before and
// returns byte-for-byte the same JSON.
//
// SAFETY RULES (see /workspace design notes, enforced by
// scripts/test-chat-streaming.mjs):
//   * Nothing is ever written to Airtable while the reply is still arriving.
//     The route's one shared finishReply() helper (the same code the
//     non-streaming path uses) runs once, on the complete final reply, and
//     does every save: bot message, Shift save/update/Embodied, title,
//     summary, memories, event log.
//   * Hidden markers ([[SAVE_SHIFT: {...}]] etc., always the last line of a
//     reply) never reach the screen: everything from the first "[[" is held
//     back, as is a trailing "[" (it may be the start of "[[") and trailing
//     blank space. The final "done" event carries the real cleaned reply.
//   * The whole job (Claude -> clean-up -> saves) runs inside Vercel's
//     waitUntil, independent of the connection: if the member closes the tab
//     or loses signal, the reply still finishes and is saved exactly once.
//     Writes to a closed connection are ignored.
//   * Our own stall timers: no Claude data for STREAM_IDLE_MS once the reply
//     text has started (never during Claude's hidden thinking, which the API
//     does not send at all), or the whole thing past STREAM_OVERALL_MS -> stop, save
//     nothing, send an error (the page shows Try Again; resending is safe
//     because nothing was saved).
//   * The Anthropic SDK only retries while connecting (before the first
//     word); a failure mid-reply is never retried behind the member's back.

/** No Claude stream data for this long once the reply text has started = stalled. */
export const STREAM_IDLE_MS = 30000;
/** Hard cap for one streamed reply, kept below the page's 180s last resort. */
export const STREAM_OVERALL_MS = 170000;
/** Keep-alive comment so the page can tell "slow" from "connection dead". */
export const STREAM_HEARTBEAT_MS = 10000;
/** Same member-facing wording as the non-streaming 504. */
export const STREAM_ERROR_TEXT = "The response took too long. Please try again.";

const normEmail = (e) => String(e || "").trim().toLowerCase();

/**
 * Should this request get a streamed reply?
 * @param {{ mode?: string, allowlist?: string, email?: string, processSlug?: any, requested?: any }} o
 */
export function chatStreamingAllowed({ mode, allowlist, email, processSlug, requested } = {}) {
  if (requested !== true) return false; // the page must ask for it
  if (processSlug) return false; // never for a guided process
  const m = String(mode || "off").trim().toLowerCase();
  if (m === "on") return true;
  if (m === "allowlist") {
    const me = normEmail(email);
    if (!me) return false;
    return String(allowlist || "")
      .split(",")
      .map(normEmail)
      .filter(Boolean)
      .includes(me);
  }
  return false; // "off", missing, or anything unrecognised
}

/**
 * Turns Claude's raw text pieces into the text that is safe to show.
 * push(piece) returns only the NEW visible text (possibly "").
 */
export function createMarkerHoldback() {
  let raw = "";
  let start = -1; // index of the first non-whitespace character
  let emitted = 0; // raw index up to which text has been sent
  let stopped = false; // a "[[" was seen: send nothing more
  return {
    push(piece) {
      raw += String(piece == null ? "" : piece);
      if (stopped) return "";
      if (start === -1) {
        const s = raw.search(/\S/);
        if (s === -1) return ""; // only leading blank space so far
        start = s;
        emitted = s;
      }
      let limit;
      const marker = raw.indexOf("[[", start);
      if (marker !== -1) {
        limit = marker;
        stopped = true;
      } else {
        limit = raw.length;
        if (raw.endsWith("[")) limit -= 1;
      }
      // never end on blank space (it may be the line break before a marker)
      limit = start + raw.slice(start, limit).replace(/\s+$/, "").length;
      if (limit <= emitted) return "";
      const out = raw.slice(emitted, limit);
      emitted = limit;
      return out;
    },
    get raw() { return raw; },
  };
}

/** One server-sent event: `data: {json}\n\n`. */
export function sseEncode(event) {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * A response body the route can write events into. Writing after the
 * member has gone (or after close) is silently ignored.
 */
export function createSseChannel({ heartbeatMs = STREAM_HEARTBEAT_MS } = {}) {
  const encoder = new TextEncoder();
  let controller = null;
  let closed = false;
  let heartbeat = null;
  const stopHeartbeat = () => { if (heartbeat) { clearInterval(heartbeat); heartbeat = null; } };
  const write = (s) => {
    if (closed || !controller) return false;
    try { controller.enqueue(encoder.encode(s)); return true; } catch (e) { closed = true; stopHeartbeat(); return false; }
  };
  const readable = new ReadableStream({
    start(c) {
      controller = c;
      if (heartbeatMs > 0) heartbeat = setInterval(() => write(": ping\n\n"), heartbeatMs);
    },
    cancel() {
      // The member disconnected. The job keeps running (waitUntil) and saves.
      closed = true;
      stopHeartbeat();
    },
  });
  return {
    readable,
    send: (event) => write(sseEncode(event)),
    close() {
      stopHeartbeat();
      if (closed) return;
      closed = true;
      try { controller && controller.close(); } catch (e) {}
    },
    get closed() { return closed; },
  };
}

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  "X-Accel-Buffering": "no",
};

/**
 * The streamed reply job. Resolves only when EVERYTHING is done, including
 * the background saves, so the route hands this promise to waitUntil.
 *
 * @param {object} o
 * @param {{ send: (e: any) => any, close: () => void }} o.channel
 * @param {string | null} o.chatId  (null for the GAP bot, which has no saved chat)
 * @param {(signal: AbortSignal) => any} o.startStream  returns an Anthropic MessageStream
 * @param {(finalMessage: any, schedule: (p: Promise<any>) => void) => Promise<{replyText: string, openActivationSlug: any}>} o.finishReply
 *        the route's shared post-processing + saves helper
 * @param {number} [o.idleMs]
 * @param {number} [o.overallMs]
 * @param {string} [o.label]  log prefix only ("chat" = main chatbot, "gap-chat-member" = GAP bot)
 * @returns {Promise<{ ok: boolean, stalled?: string | null }>}
 */
export async function runStreamedReply({
  channel,
  chatId,
  startStream,
  finishReply,
  idleMs = STREAM_IDLE_MS,
  overallMs = STREAM_OVERALL_MS,
  label = "chat",
}) {
  const holdback = createMarkerHoldback();
  const ac = new AbortController();
  let stalled = null;
  let idleTimer = null;
  const overallTimer = setTimeout(() => { stalled = "overall"; ac.abort(); }, overallMs);
  // HIDDEN THINKING (Oct 8 2026 fix): Claude Sonnet 5 thinks before it
  // writes, and the API sends NOTHING while it thinks (measured on the TEST
  // previews: up to ~19s of silence before a GAP reply's first word; the
  // ~7,300-token thinking seen on heavy main-chat requests is ~80s). The
  // first version of this file started the idle timer at Claude's very first
  // event, so any thinking longer than STREAM_IDLE_MS was wrongly treated as
  // a stall (error + Try Again, every time). So the idle timer now only runs
  // once the reply TEXT has started; before that the SDK's connection
  // timeout + retries and the overall cap (STREAM_OVERALL_MS) apply, and the
  // page keeps getting the 10s keep-alive meanwhile.
  let textStarted = false;
  const touch = () => {
    if (!textStarted) return;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { stalled = "idle"; ac.abort(); }, idleMs);
  };
  const stopTimers = () => { clearTimeout(overallTimer); if (idleTimer) clearTimeout(idleTimer); };

  channel.send({ type: "meta", chatId });

  let finalMessage;
  // The SDK hands back whatever arrived as the "final" message if Claude's
  // connection closes early without an error. Only a reply that reached
  // Claude's own end-of-message signal counts as complete.
  let sawMessageStop = false;
  // Log-only timing stats (Vercel logs): event kinds, longest silence
  // between Claude events, when the first visible words went out.
  const startedAt = Date.now();
  const stats = { events: {}, maxGapMs: 0, firstEventMs: null, firstVisibleMs: null };
  let lastEventAt = null;
  try {
    const stream = startStream(ac.signal);
    stream.on("streamEvent", (event) => {
      if (!textStarted && event && ((event.type === "content_block_start" && event.content_block && event.content_block.type === "text") ||
          (event.type === "content_block_delta" && event.delta && event.delta.type === "text_delta"))) textStarted = true;
      touch();
      try {
        const now = Date.now();
        if (lastEventAt === null) stats.firstEventMs = now - startedAt;
        else stats.maxGapMs = Math.max(stats.maxGapMs, now - lastEventAt);
        lastEventAt = now;
        const k = event && event.type ? (event.delta && event.delta.type ? `${event.type}:${event.delta.type}` : event.content_block && event.content_block.type ? `${event.type}:${event.content_block.type}` : event.type) : "?";
        stats.events[k] = (stats.events[k] || 0) + 1;
      } catch (e) {}
      if (event && event.type === "message_stop") sawMessageStop = true;
    });
    stream.on("text", (piece) => {
      const visible = holdback.push(piece);
      if (visible) {
        if (stats.firstVisibleMs === null) stats.firstVisibleMs = Date.now() - startedAt;
        channel.send({ type: "delta", text: visible });
      }
    });
    finalMessage = await stream.finalMessage();
    if (stalled) throw new Error(`stream stalled (${stalled})`);
    if (!sawMessageStop || !finalMessage || !finalMessage.stop_reason) {
      throw new Error("stream ended before the reply was complete");
    }
  } catch (err) {
    stopTimers();
    try { console.log(`[${label}] stream stats ` + JSON.stringify({ ok: false, totalMs: Date.now() - startedAt, ...stats })); } catch (e) {}
    console.error(`[${label}] streamed reply failed${stalled ? ` (stalled: ${stalled})` : ""} -- nothing saved`, err);
    channel.send({ type: "error", error: STREAM_ERROR_TEXT });
    channel.close();
    return { ok: false, stalled };
  }
  stopTimers();
  try {
    const u = (finalMessage && finalMessage.usage) || {};
    const thinking = u.output_tokens_details && u.output_tokens_details.thinking_tokens;
    console.log(`[${label}] stream stats ` + JSON.stringify({ ok: true, totalMs: Date.now() - startedAt, ...stats, output_tokens: u.output_tokens, thinking_tokens: typeof thinking === "number" ? thinking : null, stop_reason: finalMessage.stop_reason }));
  } catch (e) {}

  // The complete reply exists. From here on it's the exact same code as the
  // non-streaming path; the background saves are awaited below instead of
  // being handed to waitUntil separately (this whole job already is).
  let bookkeeping = null;
  let result;
  try {
    result = await finishReply(finalMessage, (p) => { bookkeeping = p; });
  } catch (err) {
    console.error(`[${label}] streamed reply: post-processing failed`, err);
    channel.send({ type: "error", error: STREAM_ERROR_TEXT });
    channel.close();
    if (bookkeeping) await bookkeeping;
    return { ok: false, stalled: null };
  }
  channel.send({ type: "done", reply: result.replyText, chatId, openActivationSlug: result.openActivationSlug });
  channel.close();
  if (bookkeeping) await bookkeeping;
  return { ok: true, stalled: null };
}
