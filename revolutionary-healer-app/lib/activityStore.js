// Activity rows live on the existing Events table as type "activity".
// No columns are added or deleted. A missing secret or a failed write is an error.

import Airtable from "airtable";
import { ACTIVITY_TYPE, pageActivityRows } from "./activity.js";

export class ActivityStorageError extends Error {
    constructor(message) {
        super(message);
        this.name = "ActivityStorageError";
        this.code = "activity_storage_unavailable";
    }
}

let baseClient;
function base(env) {
    if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) {
        throw new ActivityStorageError("AIRTABLE_API_KEY and AIRTABLE_BASE_ID are required. Nothing was written.");
    }
    if (!baseClient) baseClient = new Airtable({ apiKey: env.AIRTABLE_API_KEY }).base(env.AIRTABLE_BASE_ID);
    return baseClient;
}

export function activityFields(row) {
    return { type: ACTIVITY_TYPE, meta: JSON.stringify(row), created_at: row.at };
}

export function parseActivity(record) {
    if (!record || !record.fields || record.fields.type !== ACTIVITY_TYPE) return null;
    try {
        const meta = JSON.parse(record.fields.meta || "");
        if (!meta || !meta.eventId) return null;
        return meta;
    } catch {
        return null;
    }
}

// Same-process retries share one insert. Two server instances can still both
// insert, because Events has no unique column. Reports count each event id once.
export function createIdempotentWriter({ find, insert }) {
    const inflight = new Map();
    return async function write(row) {
        const pending = inflight.get(row.eventId);
        if (pending) return pending;
        const job = (async () => {
            const existing = await find(row.eventId);
            if (existing) return existing;
            return insert(row);
        })();
        inflight.set(row.eventId, job);
        try {
            return await job;
        } finally {
            inflight.delete(row.eventId);
        }
    };
}

export function createMemoryActivityStore() {
    const rows = [];
    return {
        rows,
        async findByEventId(eventId) {
            return rows.find((row) => row.eventId === eventId) || null;
        },
        async create(row) {
            if (rows.some((item) => item.eventId === row.eventId)) return rows.find((item) => item.eventId === row.eventId);
            rows.push(row);
            return row;
        },
        async latestAtForDevice(deviceId) {
            const times = rows.filter((row) => row.deviceId === deviceId).map((row) => Date.parse(row.at)).filter((time) => !Number.isNaN(time));
            return times.length ? Math.max(...times) : null;
        },
        async listPage({ pageSize = 100, cursor = null } = {}) {
            return pageActivityRows(rows, { pageSize, cursor });
        },
    };
}

export function createAirtableActivityStore(env = process.env) {
    const store = {
        async findByEventId(eventId) {
            if (!/^[0-9a-f-]{36}$/i.test(eventId)) return null;
            const found = await base(env)("Events").select({
                filterByFormula: `AND({type}="${ACTIVITY_TYPE}", FIND("${eventId}", {meta}))`,
                maxRecords: 1,
                fields: ["type", "meta", "created_at"],
            }).firstPage();
            return found[0] ? parseActivity(found[0]) : null;
        },
        async create(row) {
            return store.write(row);
        },
        async latestAtForDevice(deviceId) {
            if (!/^[0-9a-f-]{36}$/i.test(deviceId)) return null;
            const found = await base(env)("Events").select({
                filterByFormula: `AND({type}="${ACTIVITY_TYPE}", FIND("${deviceId}", {meta}))`,
                maxRecords: 1,
                sort: [{ field: "created_at", direction: "desc" }],
                fields: ["type", "meta", "created_at"],
            }).firstPage();
            const row = found[0] ? parseActivity(found[0]) : null;
            return row && row.at ? Date.parse(row.at) : null;
        },
        async listPage({ from = "", to = "", cursor = null, pageSize = 100 } = {}) {
            const size = Math.min(100, Math.max(1, Number(pageSize) || 100));
            if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
                throw new ActivityStorageError("A date range is required before activity rows are read.");
            }
            const start = new Date(Date.parse(`${from}T00:00:00.000Z`) - 2 * 86400000).toISOString();
            const end = new Date(Date.parse(`${to}T00:00:00.000Z`) + 3 * 86400000).toISOString();
            let formula = `AND({type}="${ACTIVITY_TYPE}", IS_AFTER({created_at}, "${start}"), IS_BEFORE({created_at}, "${end}"))`;
            if (cursor && cursor.at && cursor.recordId) {
                if (!/^\d{4}-\d{2}-\d{2}T[0-9:.+-]+Z$/.test(cursor.at) || !/^rec[A-Za-z0-9]+$/.test(cursor.recordId)) {
                    throw new ActivityStorageError("The report continuation is not valid.");
                }
                formula = `AND(${formula}, OR(IS_BEFORE({created_at}, "${cursor.at}"), AND(IS_SAME({created_at}, "${cursor.at}", "seconds"), RECORD_ID() < "${cursor.recordId}")))`;
            }
            const records = await base(env)("Events").select({
                filterByFormula: formula,
                pageSize: size,
                maxRecords: size,
                sort: [{ field: "created_at", direction: "desc" }],
                fields: ["type", "meta", "created_at"],
            }).firstPage();
            const parsed = records.map((record) => {
                const meta = parseActivity(record);
                if (!meta) return null;
                return { ...meta, recordId: record.id, at: meta.at || record.fields.created_at };
            }).filter(Boolean);
            const last = records[records.length - 1];
            const nextCursor = records.length === size && last
                ? { at: last.fields.created_at, recordId: last.id }
                : null;
            return { rows: parsed, nextCursor, pageSize: size };
        },
    };
    store.write = createIdempotentWriter({
        find: (eventId) => store.findByEventId(eventId),
        insert: async (row) => {
            const created = await base(env)("Events").create(activityFields(row));
            return parseActivity(created);
        },
    });
    return store;
}

export async function legacySample(env = process.env) {
    const chats = await base(env)("ChatSessions").select({ fields: ["member_email"], pageSize: 50 }).firstPage();
    const favorites = await base(env)("Favorites").select({ fields: ["member_email", "activation_slug"], pageSize: 50 }).firstPage();
    return {
        label: "Sample of existing content rows. The email on each row was supplied by the browser and is unverified. Message text is not read.",
        chatSessionsSample: chats.length,
        favoritesSample: favorites.length,
    };
}
