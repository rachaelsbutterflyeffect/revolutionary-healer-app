// My Revolution sections + method-tracking counts (Oct 15 2026, exact-list gated: SAVE_SECTIONS / METHOD_TRACKING).
// Pure classification, computed at READ time from rows that already exist. Nothing here rewrites a row.
//   GAP section     = completed GAP Method runs: Shifts with method_name "GAP Method" (the app saves one when the
//                     run's Step 3 reveal opens, which needs Steps 1 and 2 done), plus a funnel GAP result that was
//                     completed but never turned into a Shift.
//   Shifting Cards  = every Shift (GAP-born cards included: a completed run creates its Shifting card).
//   Codes           = every code pull (Events rows type "code_pull"), plus older saved Code Upgrade Shifts from
//                     before the first logged pull (so history counts and nothing is counted twice).
const iso = (v) => (v ? String(v) : "");

export function classify({ shifts = [], pulls = [], gapResult = null } = {}) {
  const gap = shifts
    .filter((s) => s.methodName === "GAP Method")
    .map((s) => ({ shiftId: s.id, identity: s.divineIdentityName || "", frequency: s.currentFrequency || "", at: iso(s.createdAt) }));
  if (gapResult && gapResult.completedAt && !gapResult.shiftCreated && !gapResult.linkedShift) {
    gap.push({ shiftId: null, identity: gapResult.identity || "", frequency: gapResult.frequency || "", at: iso(gapResult.completedAt) });
  }
  const firstPull = pulls.reduce((m, p) => (!m || (p.at && p.at < m) ? p.at : m), "");
  const legacy = shifts
    .filter((s) => s.methodName === "Code Upgrade" && (!firstPull || iso(s.createdAt) < firstPull))
    .map((s) => ({ name: s.divineIdentityName || "", card: String(s.focusArea || "").replace(/^code-upgrade:/, ""), at: iso(s.createdAt), from: "saved" }));
  const codes = pulls.map((p) => ({ name: p.name || "", card: p.card || "", code: p.code || "", at: iso(p.at), from: "pull" })).concat(legacy);
  const byNewest = (a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0);
  gap.sort(byNewest); codes.sort(byNewest);
  return { gap, codes, counts: { gapScans: gap.length, shifts: shifts.length, codes: codes.length } };
}
