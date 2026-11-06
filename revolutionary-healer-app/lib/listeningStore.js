// Events-table adapter for activation listening sessions.
// Creates and updates only type "activation_listen". Never deletes, and never
// writes ActivationCompletions, Favorites, or any other table.

import Airtable from "airtable";
import { LISTEN_EVENT_TYPE, LISTEN_TABLE, pickCanonicalListenRow } from "./listening.js";

export class ListenStorageError extends Error {
    constructor(message, cause) {
        super(message);
        this.name = "ListenStorageError";
        this.code = "listen_storage_unavailable";
        if (cause) this.cause = cause;
    }
}

let baseClient;

function getBase(env = process.env) {
    if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) {
        throw new ListenStorageError("AIRTABLE_API_KEY and AIRTABLE_BASE_ID are required to record listening. Nothing was written.");
    }
    if (!baseClient) {
        baseClient = new Airtable({ apiKey: env.AIRTABLE_API_KEY }).base(env.AIRTABLE_BASE_ID);
    }
    return baseClient;
}

function storedState(state) {
    const { id, ...rest } = state || {};
    return rest;
}

export function listenCreateFields(state) {
    const body = storedState(state);
    return {
        type: LISTEN_EVENT_TYPE,
        meta: JSON.stringify(body),
        created_at: body.startedAt,
    };
}

export function listenUpdateFields(state) {
    return { meta: JSON.stringify(storedState(state)) };
}

export function parseListenRecord(record) {
    if (!record || !record.fields) return null;
    if (record.fields.type !== LISTEN_EVENT_TYPE) return null;
    const raw = record.fields.meta;
    if (typeof raw !== "string" || !raw) return null;
    try {
        const meta = JSON.parse(raw);
        if (!meta || meta.kind !== LISTEN_EVENT_TYPE || !meta.sessionId) return null;
        return { ...meta, id: record.id };
    } catch {
        return null;
    }
}

function wrap(err) {
    if (err instanceof ListenStorageError) return err;
    return new ListenStorageError("Listening storage rejected the write. The play was not recorded.", err);
}

async function findAllRecords(sessionId, env) {
    if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return [];
    try {
        const records = await getBase(env)(LISTEN_TABLE)
            .select({
                filterByFormula: `AND({type}="${LISTEN_EVENT_TYPE}", FIND("${sessionId}", {meta}))`,
                maxRecords: 10,
                fields: ["type", "meta", "created_at"],
            })
            .firstPage();
        return records.map(parseListenRecord).filter(Boolean);
    } catch (err) {
        throw wrap(err);
    }
}

export function createAirtableListenStore(env = process.env) {
    return {
        async findAllBySessionId(sessionId) {
            return findAllRecords(sessionId, env);
        },
        async findBySessionId(sessionId) {
            return pickCanonicalListenRow(await findAllRecords(sessionId, env));
        },
        async create(state) {
            try {
                const created = await getBase(env)(LISTEN_TABLE).create(listenCreateFields(state));
                return parseListenRecord(created);
            } catch (err) {
                throw wrap(err);
            }
        },
        async update(id, state) {
            if (!id || typeof id !== "string") {
                throw new ListenStorageError("Listening session is missing its record id. The play was not recorded.");
            }
            try {
                const updated = await getBase(env)(LISTEN_TABLE).update(id, listenUpdateFields(state));
                return parseListenRecord(updated);
            } catch (err) {
                throw wrap(err);
            }
        },
    };
}

export async function listActivationListens(env = process.env) {
    try {
        const records = await getBase(env)(LISTEN_TABLE)
            .select({
                filterByFormula: `{type}="${LISTEN_EVENT_TYPE}"`,
                fields: ["type", "meta", "created_at"],
            })
            .all();
        return records.map(parseListenRecord).filter(Boolean);
    } catch (err) {
        throw wrap(err);
    }
}

export function createMemoryListenStore() {
    const rows = [];
    return {
        rows,
        async findAllBySessionId(sessionId) {
            return rows.filter((row) => row.sessionId === sessionId).map((row) => ({ ...row }));
        },
        async findBySessionId(sessionId) {
            return pickCanonicalListenRow(rows.filter((row) => row.sessionId === sessionId));
        },
        async create(state) {
            const row = { id: `rec${rows.length + 1}`, ...state };
            rows.push(row);
            return row;
        },
        async update(id, state) {
            const row = rows.find((item) => item.id === id);
            if (!row) throw new ListenStorageError("Listening session disappeared before update. The play was not recorded.");
            Object.assign(row, state);
            return row;
        },
    };
}
