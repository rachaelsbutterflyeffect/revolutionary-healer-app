// Per-feature switches for the refreshed app (Oct 15 2026). Each feature has its OWN pair of Vercel env vars:
//   <KEY>            off (default / missing) | list
//   <KEY>_ALLOWLIST  comma-separated member emails (exact match, case-insensitive)
// "list" = ONLY the emails on <KEY>_ALLOWLIST (no tester accounts, aliases or other lists). There is
// deliberately no "on" mode yet. Rollback = set <KEY>=off (or delete it).
const norm = (e) => String(e || "").trim().toLowerCase();
const list = (s) => String(s || "").split(",").map(norm).filter(Boolean);

// feature name (as the client sees it) -> env key
export const FEATURES = {
  codePull: "CODE_PULL",
  homeCheckin: "HOME_CHECKIN",
};

export function featureAllowed(key, email, env = process.env) {
  const mode = String(env[key] || "off").trim().toLowerCase();
  if (mode !== "list") return false;
  const me = norm(email);
  return !!me && me.includes("@") && list(env[key + "_ALLOWLIST"]).includes(me);
}

export function featuresFor(email, env = process.env) {
  const out = {};
  for (const [name, key] of Object.entries(FEATURES)) out[name] = featureAllowed(key, email, env);
  return out;
}
