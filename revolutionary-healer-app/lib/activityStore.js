// Activity rows live on the existing Events table as type "activity".
// No columns are added or deleted. A missing secret or a failed write is an error.

import Airtable from "airtable";
import { ACTIVITY_TYPE } from "./activity.js";

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
        async list() { return rows.slice(); },
    };
}

export function createAirtableActivityStore(env = process.env) {
    return {
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
            const existing = await this.findByEventId(row.eventId);
            if (existing) return existing;
            const created = await base(env)("Events").create(activityFields(row));
            return parseActivity(created);
        },
        async list() {
            const records = await base(env)("Events").select({
                filterByFormula: `{type}="${ACTIVITY_TYPE}"`,
                fields: ["type", "meta", "created_at"],
                pageSize: 100,
            }).all();
            return records.map(parseActivity).filter(Boolean);
        },
    };
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
