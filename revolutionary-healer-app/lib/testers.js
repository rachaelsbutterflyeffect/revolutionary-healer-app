// Tester accounts are Rachael, Ray, and the QA aliases. This only separates
// their rows from real-member counts. It does not hide a tester's own chats,
// GAP Method™ runs, or Shift cards from that same login, and it never deletes
// anything.
//
// TESTER_EMAILS (comma-separated) overrides the two named accounts. Leave it
// unset to use the default. QA patterns below always count as testers so old
// +gapqa and claude-qa history is covered even when the env list is short.
//
// TESTER_RECORD_FIELD=is_test opts in to writing the checkbox. Until that is
// set, nothing extra is sent to Airtable, so the live base is safe before the
// column exists. Metrics still exclude testers by email, which covers history.

export const DEFAULT_TESTER_EMAILS = [
    "rachaelsbutterflyeffect@gmail.com",
    "rachael.ball08@gmail.com",
];

export const TESTER_RECORD_FIELD_NAME = "is_test";

export function normalizeTesterEmail(email) {
    return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export function configuredTesterEmails(env = process.env) {
    const raw = env.TESTER_EMAILS;
    if (raw === undefined || String(raw).trim() === "") return DEFAULT_TESTER_EMAILS.slice();
    return String(raw)
        .split(",")
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean);
}

export function isTester(email, env = process.env) {
    const normalized = normalizeTesterEmail(email);
    if (!normalized || !normalized.includes("@")) return false;
    if (configuredTesterEmails(env).includes(normalized)) return true;
    const at = normalized.lastIndexOf("@");
    const local = normalized.slice(0, at);
    const domain = normalized.slice(at + 1);
    if (local.includes("gapqa")) return true;
    if (local.startsWith("claude-qa") && domain === "rachaelsbutterflyeffect.com") return true;
    return false;
}

// Merge onto a create/update only for tester emails, and only when opted in.
export function testerRecordFields(email, env = process.env) {
    if (env.TESTER_RECORD_FIELD !== TESTER_RECORD_FIELD_NAME) return {};
    if (!isTester(email, env)) return {};
    return { [TESTER_RECORD_FIELD_NAME]: true };
}

export function isUnknownAirtableField(err, fieldName) {
    if (!err || !fieldName) return false;
    if (err.error === "UNKNOWN_FIELD_NAME" || err.statusCode === 422) {
        const text = `${err.message || ""} ${err.error || ""}`;
        if (text.toLowerCase().includes(String(fieldName).toLowerCase())) return true;
        // Airtable sometimes returns UNKNOWN_FIELD_NAME with the field only
        // inside error.message. If the name is absent, do not treat every 422
        // as this field.
    }
    return new RegExp(fieldName, "i").test(String(err.message || ""));
}
