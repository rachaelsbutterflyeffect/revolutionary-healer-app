// One GAP run = one Shift card (duplicate-save fix, Oct 8 2026).
//
// /api/gap-shift used to create a new Shift for every POST it received. The
// page only sends one per run, but a repeat can still reach the server: the
// save lands while the phone loses the response (the page then retries the
// same save from "Listen now"), a double tap, two tabs, or an older cached
// page. This helper makes the save idempotent WITHOUT changing what is
// saved and without any new Airtable field:
//
//   1. Same run id: the page sends a random clientRunId per GAP run. A second
//      POST with the same id (in flight or already saved) gets the first
//      save's Shift id back instead of creating another card.
//   2. Same reading: before creating, the member's own GAP Method Shifts from
//      the last 15 minutes are checked. One with the exact same identity, Gap
//      text, "what we noticed" text and activation IS this reading already
//      saved (every reading's text is unique), so its id is returned. The
//      generic "wasn't captured" placeholder text is never matched, so two
//      separate runs that both missed their reflection still get one card each.
//
// The check can never block a save: if the lookup fails, the Shift is created
// exactly as before. The card's content is never changed.
import { getShiftsByEmail, normalizeEmail } from "./airtable";

export const GAP_SHIFT_DEDUPE_WINDOW_MS = 15 * 60 * 1000;
const PLACEHOLDER_PREFIX = "This reflection wasn't captured this time";
const RUN_ID_RE = /^[A-Za-z0-9_-]{8,80}$/;
const runs = new Map(); // "<email>|<clientRunId>" -> { promise, at }

export function gapShiftRunKey(email, clientRunId) {
  if (typeof clientRunId !== "string" || !RUN_ID_RE.test(clientRunId)) return null;
  const e = normalizeEmail(email || "");
  return e ? `${e}|${clientRunId}` : null;
}

const norm = (s) => String(s ?? "").replace(/\r\n/g, "\n").trim();

export function isSameGapReading(fields, a) {
  if (!fields || !a) return false;
  const gap = norm(a.gapExplanation);
  if (!gap || gap.startsWith(PLACEHOLDER_PREFIX)) return false;
  return (
    norm(fields.method_name) === "GAP Method" &&
    norm(fields.divine_identity_slug) === norm(a.divineIdentitySlug) &&
    norm(fields.gap_explanation) === gap &&
    norm(fields.what_we_noticed) === norm(a.whatWeNoticed) &&
    norm(fields.recommended_activation) === norm(a.recommendedActivation)
  );
}

export async function findRecentSameReading(a, { lookup = getShiftsByEmail, now = Date.now } = {}) {
  const gap = norm(a && a.gapExplanation);
  if (!gap || gap.startsWith(PLACEHOLDER_PREFIX)) return null;
  const records = (await lookup(a.email)) || [];
  const since = now() - GAP_SHIFT_DEDUPE_WINDOW_MS;
  for (const r of records) {
    const f = (r && r.fields) || {};
    const t = Date.parse(f.created_at || r.createdTime || "");
    if (!Number.isFinite(t) || t < since) continue;
    if (isSameGapReading(f, a)) return r;
  }
  return null;
}

function prune(now) {
  for (const [k, v] of runs) if (now - v.at > GAP_SHIFT_DEDUPE_WINDOW_MS) runs.delete(k);
}

// create() must return the created Airtable record ({ id }). Resolves to that
// record, or to { id, deduped: true, by } when this run/reading was already saved.
export async function gapShiftOnce(a, create, { lookup = getShiftsByEmail, now = Date.now } = {}) {
  const t = now();
  prune(t);
  const key = gapShiftRunKey(a && a.email, a && a.clientRunId);
  if (key && runs.has(key)) {
    try {
      const prev = await runs.get(key).promise;
      const out = { id: prev.id, deduped: true, by: "run" };
      logOnce(out, a);
      return out;
    } catch (e) {
      if (runs.get(key) && runs.get(key).failed) runs.delete(key); // that attempt failed: this one saves
    }
  }
  const job = (async () => {
    let dup = null;
    try {
      dup = await findRecentSameReading(a, { lookup, now });
    } catch (err) {
      console.warn("[gap-shift] duplicate check skipped (lookup failed); saving as before", err && err.message ? err.message : err);
    }
    if (dup) return { id: dup.id, deduped: true, by: "reading" };
    return create();
  })();
  const entry = { promise: job, at: t, failed: false };
  if (key) runs.set(key, entry);
  try {
    const out = await job;
    logOnce(out, a);
    return out;
  } catch (err) {
    entry.failed = true;
    if (key && runs.get(key) === entry) runs.delete(key);
    throw err;
  }
}

function logOnce(out, a) {
  try {
    console.info("[gap-shift] save " + JSON.stringify({ result: out && out.deduped ? "deduped-" + out.by : "created", shiftId: out && out.id, runId: !!gapShiftRunKey(a && a.email, a && a.clientRunId) }));
  } catch (e) {}
}

// Tests only.
export function __resetGapShiftOnce() { runs.clear(); }
