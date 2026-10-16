// Per-feature switches for the refreshed app (Oct 15 2026). Each feature has its OWN pair of Vercel env vars:
//   <KEY>            off (default / missing) | list | on
//   <KEY>_ALLOWLIST  comma-separated member emails (exact match, case-insensitive)
// "list" = ONLY the emails on <KEY>_ALLOWLIST (no tester accounts, aliases or other lists).
// "on"   = every signed-in member (any email); the allowlist is ignored (Oct 16 2026 all-member launch).
// Rollback = set <KEY>=list (back to the allowlist) or off (or delete it).
const norm = (e) => String(e || "").trim().toLowerCase();
const list = (s) => String(s || "").split(",").map(norm).filter(Boolean);

// feature name (as the client sees it) -> env key
export const FEATURES = {
  codePull: "CODE_PULL",
  homeCheckin: "HOME_CHECKIN",
  saveSections: "SAVE_SECTIONS", // My Revolution: GAP / Shifting Cards / Codes sections + every code pull saved
  methodTracking: "METHOD_TRACKING", // My Revolution stat row: GAP SCANS / SHIFTS / CODES
  codeShifts: "CODE_SHIFTS", // Shift the codes: save a pulled code as a Code Upgrade Shift
  featuredEvent: "FEATURED_EVENT", // Activations page: this month's Featured Activation event (public/rf-event.js config)
};

export function featureAllowed(key, email, env = process.env) {
  const mode = String(env[key] || "off").trim().toLowerCase();
  if (mode !== "list" && mode !== "on") return false;
  const me = norm(email);
  if (mode === "on") return !!me && me.includes("@");
  return !!me && me.includes("@") && list(env[key + "_ALLOWLIST"]).includes(me);
}

export function featuresFor(email, env = process.env) {
  const out = {};
  for (const [name, key] of Object.entries(FEATURES)) out[name] = featureAllowed(key, email, env);
  return out;
}
