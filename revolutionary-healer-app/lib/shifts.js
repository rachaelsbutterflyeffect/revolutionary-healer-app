// My Revolution -- Shifts + Today's Focus derivation. Spec ref: SPEC.md §4.1d.
// Source: Rachael's "My Revolution" doc (Aug 5).
//
// A Shift is a saved transformational milestone created by a guided Method
// (today, only the GAP Method creates them -- see lib/processes.js
// GAP_METHOD_SCRIPT_MEMBER's Step 2 completion, which generates the full
// Personalized Frequency Diagnostic that a Shift record stores). Pure,
// dependency-free functions here, same pattern as lib/entitlements.js and
// lib/quantumDollars.js -- easy to unit test, no I/O.
//
// TODO(build): there is no persistence wired up yet for creating a Shift
// record from a completed GAP Method conversation (the chat API doesn't
// currently parse/save structured diagnostic output anywhere -- see
// app/api/chat/route.ts). This module defines the shape and the pure
// derivation logic member-facing UI needs; the write path (Airtable Shifts
// table + an endpoint that saves a completed diagnostic) is a separate,
// not-yet-built piece of work.

// Progress reflects INTEGRATION, not completion -- never use "Completed,"
// "Finished," or "Done" for a Shift's progress. (Listening status on an
// Activation itself is a different concept and CAN say "Completed" -- that's
// about whether they've listened, not about whether the pattern has
// integrated. Don't confuse the two.)
export const SHIFT_PROGRESS = {
  SHIFTING: "shifting",
  EMBODIED: "embodied",
};

export const SHIFT_PROGRESS_LABELS = {
  [SHIFT_PROGRESS.SHIFTING]: "🟡 Shifting",
  [SHIFT_PROGRESS.EMBODIED]: "🟢 Embodied",
};

// Listening status for an Activation (My Activations / Favorites cards) --
// a completely separate axis from Shift progress above.
export const LISTENING_STATUS = {
  NOT_STARTED: "not_started",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
};

// Progress check-in: the AI occasionally invites the member to reflect on a
// Shift ("looking back over the last several days, how does this pattern
// feel now?"). Maps their reply to a suggested status -- the AI must never
// apply this automatically; always get the member's confirmation first (see
// lib/processes.js GAP_METHOD_SCRIPT_MEMBER if/when check-ins are wired into
// it).
export const PROGRESS_CHECK_IN_OPTIONS = [
  { text: "It still feels very active.", suggestedStatus: SHIFT_PROGRESS.SHIFTING },
  { text: "I can feel it beginning to shift.", suggestedStatus: SHIFT_PROGRESS.SHIFTING },
  { text: "I feel significantly different.", suggestedStatus: SHIFT_PROGRESS.EMBODIED },
  { text: "I feel this has become embodied.", suggestedStatus: SHIFT_PROGRESS.EMBODIED },
];

export function suggestProgressFromCheckIn(responseText) {
  const match = PROGRESS_CHECK_IN_OPTIONS.find(
    (opt) => opt.text.toLowerCase() === String(responseText ?? "").trim().toLowerCase()
  );
  return match?.suggestedStatus ?? null;
}

/**
 * A Shift record's expected shape (see SPEC.md §8 Shifts table):
 * {
 *   id, memberEmail, methodName ("3 Step GAP Method"),
 *   divineIdentitySlug, divineIdentityName, currentFrequency,
 *   gapExplanation, maintainingPattern, highestLeverageShift,
 *   recommendedActivationName, progressStatus (SHIFT_PROGRESS.*),
 *   undercurrent, nextSuggestedActivation, readyForEmbodied,
 *   createdAt, updatedAt,
 * }
 *
 * undercurrent / nextSuggestedActivation (Aug 11, "Go Deeper Into This Gap"
 * feature -- see GAP_METHOD_DEEPER_EXPLORATION in lib/processes.js for the
 * full behavior spec this data model serves):
 *
 * undercurrent: null, or a single object once confirmed --
 *   { frequency, howItShowsUp, suggestedActivationName, confirmedAt }
 *   SHIFT CARD DEPTH RULE: a Shift may hold AT MOST ONE undercurrent, ever.
 *   Never stack a second one onto the same record. The AI must never write
 *   this field unless (1) it gathered evidence across at least 3 different
 *   areas (repeated thought, emotional response, observable behavior,
 *   avoidance, repeated real-life situation, contradiction with desired
 *   reality) AND (2) the member explicitly confirmed the interpretation felt
 *   accurate. `frequency` must be one of the 7 approved Current Frequencies
 *   from lib/divineIdentities.js -- never an invented distortion name.
 *
 * nextSuggestedActivation: null, or a lightweight, NON-formal suggestion --
 *   { activationName, reason }
 *   Used when deeper conversation surfaces a possibly-relevant pattern AFTER
 *   a Primary Frequency and one confirmed Undercurrent already exist. This is
 *   deliberately NOT a second undercurrent -- it's just an activation
 *   pointer with a reason, shown on the card as "Next Suggested Activation" /
 *   "What I'd Work With Next." Overwritten (not appended) each time a new
 *   suggestion surfaces -- this field holds one suggestion, not a list.
 *
 * readyForEmbodied: boolean, default false. Set true by the AI mid-
 *   conversation the moment it observes real evidence the GAP has meaningfully
 *   changed (see GAP_METHOD_DEEPER_EXPLORATION's EMBODIED STATUS section in
 *   lib/processes.js). This only controls whether the My Revolution Shift
 *   card shows the "✨ This Gap may be ready to mark as Embodied" teaser and
 *   button -- it does NOT change progressStatus by itself. The AI must still
 *   ask the member directly ("Do you feel like this shift is complete?") and
 *   get an explicit yes before writing progressStatus = SHIFT_PROGRESS.EMBODIED.
 *   Only meaningful while progressStatus is still SHIFTING; ignored/irrelevant
 *   once a Shift is EMBODIED.
 *
 * SHIFT CARD CREATION RULE: one Shift per distinct GAP (a specific
 * contradiction in a specific life/business/money/spiritual-gifts/focus
 * area), not one per Divine Identity or per conversation. Reuse the same
 * Shift record while the member is still working the same contradiction
 * (including all "Go Deeper" follow-ups); only create a new Shift when the
 * issue, focus area, or desired reality is meaningfully different -- even if
 * two Shifts happen to share a Divine Identity or a similar frequency.
 */

/**
 * Today's Focus derivation (pure): the most recent Shift still in the
 * SHIFTING status, i.e. the most recent unfinished result -- never an
 * Embodied one. Only one Today's Focus exists at a time. If the member has
 * manually pinned a different Shift as their focus, that pin wins over the
 * "most recent" default. Returns null if there is no Shifting result (e.g.
 * everything's Embodied, or the member has no Shifts yet).
 */
export function deriveTodaysFocus(shifts, { manualFocusId = null } = {}) {
  if (!Array.isArray(shifts) || shifts.length === 0) return null;

  if (manualFocusId) {
    const pinned = shifts.find((s) => s.id === manualFocusId);
    if (pinned) return pinned;
  }

  const shifting = shifts.filter((s) => s.progressStatus === SHIFT_PROGRESS.SHIFTING);
  if (shifting.length === 0) return null;

  return shifting.reduce((newest, s) => {
    const sTime = new Date(s.updatedAt ?? s.createdAt).getTime();
    const newestTime = new Date(newest.updatedAt ?? newest.createdAt).getTime();
    return sTime > newestTime ? s : newest;
  });
}

/**
 * Sort helper for the "My Shifts" list -- newest first.
 */
export function sortShiftsNewestFirst(shifts) {
  return [...(shifts ?? [])].sort(
    (a, b) => new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime()
  );
}

/**
 * SHIFT CARD DEPTH RULE guard (Aug 11, "Go Deeper Into This Gap" feature) --
 * a Shift may hold at most one Undercurrent, ever. Call this before writing
 * a newly-confirmed undercurrent; if it returns false, the API layer must
 * route the finding to `nextSuggestedActivation` instead (see the field
 * documentation above) rather than overwriting or stacking a second
 * undercurrent onto the record.
 */
export function canAddUndercurrent(shift) {
  return Boolean(shift) && !shift.undercurrent;
}
