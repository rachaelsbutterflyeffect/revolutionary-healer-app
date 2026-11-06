// Read-only top 5 activation plays for the coordinator.
// Selects Events rows of type activation_listen and prints aggregate counts.
// It never creates, updates, or deletes. Tester and owner rows stay in
// Airtable and are left out of the ranking.
//
//   node scripts/listening-top.mjs
//
// Requires AIRTABLE_API_KEY and AIRTABLE_BASE_ID. Do not point automated
// tests at the live member base.

import { rankListeningSessions, METRIC_DEFINITIONS, LISTEN_STORAGE } from "../lib/listening.js";
import { listActivationListens } from "../lib/listeningStore.js";

const apiKey = process.env.AIRTABLE_API_KEY;
const baseId = process.env.AIRTABLE_BASE_ID;
if (!apiKey || !baseId) {
    console.error("Set AIRTABLE_API_KEY and AIRTABLE_BASE_ID. Nothing was read.");
    process.exit(1);
}

const rows = await listActivationListens(process.env);
const ranked = rankListeningSessions(rows, { limit: 5, env: process.env });
console.log(JSON.stringify({
    storage: LISTEN_STORAGE,
    definitions: METRIC_DEFINITIONS,
    baseId,
    rawSessions: ranked.rawSessions,
    excludedSessions: ranked.excludedSessions,
    rankedSessions: ranked.rankedSessions,
    top5: ranked.top,
}, null, 2));
