// One activity row per assistant reply. No message text is copied.

import crypto from "crypto";
import { stampActivity, validateActivityEvent } from "./activity.js";
import { createAirtableActivityStore } from "./activityStore.js";
import { ACCESS_COOKIE, readCookie, verifyAccessToken } from "./sessions.js";

export async function recordChatTurn({ cookie, deviceId, chatId, processSlug, env = process.env, now = Date.now(), store = undefined }) {
    const access = verifyAccessToken(readCookie(cookie, ACCESS_COOKIE), env, now);
    const id = String(deviceId || access?.sessionId || "");
    const parsed = validateActivityEvent({
        eventId: crypto.randomUUID(),
        deviceId: id,
        event: "chat_turn",
        chatId,
        processSlug,
    });
    if (parsed.error) return { stored: false, reason: parsed.error };
    const row = stampActivity(parsed.value, { now, email: access?.email, verified: !!access });
    await (store || createAirtableActivityStore(env)).create(row);
    return { stored: true, verified: row.verified === true };
}
