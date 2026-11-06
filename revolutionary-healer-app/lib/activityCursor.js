import crypto from "crypto";
import { REPORT_CURSOR_BYTES } from "./activity.js";

export function signReportCursor(payload, secret) {
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
    const token = `${body}.${sig}`;
    if (Buffer.byteLength(token) > REPORT_CURSOR_BYTES) {
        const err = new Error("cursor_limit");
        err.code = "report_cursor_limit";
        throw err;
    }
    return token;
}

export function readReportCursor(token, secret) {
    const parts = String(token || "").split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    const expected = crypto.createHmac("sha256", secret).update(parts[0]).digest("base64url");
    const left = Buffer.from(parts[1]);
    const right = Buffer.from(expected);
    if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
    try {
        const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
        if (!payload || payload.v !== 1 || !Array.isArray(payload.rows)) return null;
        return payload;
    } catch {
        return null;
    }
}
