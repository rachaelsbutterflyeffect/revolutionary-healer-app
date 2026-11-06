// Member refresh families stored on the existing Events table, type member_session.
// The raw refresh token is never stored. Mass re-login is not performed here.

import Airtable from "airtable";
import { hashRefreshToken } from "./sessions.js";

const TYPE = "member_session";

export function memberSessionFormula(email) {
    const normalized = String(email || "").trim().toLowerCase();
    if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(normalized)) {
        throw new Error("Refusing a session lookup for an unsafe email.");
    }
    return `AND({type}="${TYPE}", FIND('"memberEmail":"${normalized}"', {meta}))`;
}
let baseClient;

function base(env) {
    if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) {
        const err = new Error("AIRTABLE_API_KEY and AIRTABLE_BASE_ID are required for sessions.");
        err.code = "session_storage_unavailable";
        throw err;
    }
    if (!baseClient) baseClient = new Airtable({ apiKey: env.AIRTABLE_API_KEY }).base(env.AIRTABLE_BASE_ID);
    return baseClient;
}

function parse(record) {
    try {
        const meta = JSON.parse(record.fields.meta || "");
        if (!meta || meta.kind !== TYPE) return null;
        return { ...meta, recordId: record.id };
    } catch {
        return null;
    }
}

function eachPage(query, onPage) {
    return new Promise((resolve, reject) => {
        query.eachPage((records, next) => {
            Promise.resolve(onPage(records)).then(() => next(), reject);
        }, (err) => (err ? reject(err) : resolve()));
    });
}

async function findFormula(env, formula) {
    const records = await base(env)("Events").select({
        filterByFormula: formula,
        maxRecords: 5,
        fields: ["type", "meta", "created_at"],
    }).firstPage();
    return records.map(parse).filter(Boolean);
}

// Pages until the source has no next cursor. A 100-row cap is not a full revoke.
export async function visitAllSessionPages(fetchPage, visit) {
    let cursor = null;
    const seen = new Set();
    do {
        const page = await fetchPage(cursor);
        for (const row of page.rows || []) {
            const id = row && (row.sessionId || row.recordId);
            if (!row || !id || seen.has(id)) continue;
            seen.add(id);
            await visit(row);
        }
        cursor = page.nextCursor || null;
    } while (cursor);
    return seen.size;
}

export function createAirtableSessionStore(env = process.env) {
    return {
        async findByRefreshToken(token) {
            const hash = hashRefreshToken(token);
            const rows = await findFormula(env, `AND({type}="${TYPE}", FIND("${hash}", {meta}))`);
            return rows[0] || null;
        },
        async findBySessionId(sessionId) {
            if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return null;
            const rows = await findFormula(env, `AND({type}="${TYPE}", FIND("${sessionId}", {meta}))`);
            return rows.find((row) => row.sessionId === sessionId) || null;
        },
        async insert(record) {
            const created = await base(env)("Events").create({
                type: TYPE,
                meta: JSON.stringify({ ...record, kind: TYPE }),
                created_at: new Date(record.createdAt).toISOString(),
            });
            return parse(created);
        },
        async save(record) {
            const current = await this.findBySessionId(record.sessionId);
            if (!current || current.version !== record.version - 1) return false;
            await base(env)("Events").update(current.recordId, {
                meta: JSON.stringify({ ...record, kind: TYPE }),
            });
            return true;
        },
        async revokeSession(sessionId, now) {
            const current = await this.findBySessionId(sessionId);
            if (!current) return;
            current.revokedAt = now;
            current.version = (current.version || 1) + 1;
            await base(env)("Events").update(current.recordId, { meta: JSON.stringify({ ...current, kind: TYPE }) });
        },
        async revokeEmail(email, now) {
            const normalized = String(email || "").trim().toLowerCase();
            const formula = memberSessionFormula(normalized);
            await eachPage(base(env)("Events").select({
                filterByFormula: formula,
                pageSize: 100,
                fields: ["type", "meta"],
            }), async (records) => {
                for (const record of records) {
                    const row = parse(record);
                    if (!row || row.memberEmail !== normalized || row.revokedAt) continue;
                    row.revokedAt = now;
                    await base(env)("Events").update(record.id, { meta: JSON.stringify({ ...row, kind: TYPE }) });
                }
            });
        },
    };
}
