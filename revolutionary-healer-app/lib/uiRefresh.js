// Visual refresh switch (Oct 15 2026) -- who sees /app-refresh.html instead of /app.html.
//
// OFF BY DEFAULT. Server switch (Vercel env vars), modelled on CHAT_STREAMING (PR #35):
//   UI_REFRESH            off (default / missing) | list | allowlist | on
//                         list = only the emails on UI_REFRESH_ALLOWLIST (nobody else)
//   UI_REFRESH_ALLOWLIST  optional extra comma-separated member emails
// With UI_REFRESH=allowlist the refresh is shown to: the tester accounts (lib/testers.js:
// Rachael, Ray, +gapqa / claude-qa aliases), everyone on CHAT_STREAMING_ALLOWLIST, and
// anyone on UI_REFRESH_ALLOWLIST. Anything else (missing, "off", unrecognised) = nobody.
// Rollback = set UI_REFRESH=off (or delete it). app.html itself is unchanged for everyone else.
import { isTester } from "./testers.js";

const norm = (e) => String(e || "").trim().toLowerCase();
const list = (s) => String(s || "").split(",").map(norm).filter(Boolean);

export function uiRefreshAllowed(email, env = process.env) {
  const mode = String(env.UI_REFRESH || "off").trim().toLowerCase();
  if (mode === "on") return true;
  if (mode !== "allowlist" && mode !== "list") return false;
  const me = norm(email);
  // "list" (production, Oct 15): EXACTLY the emails on UI_REFRESH_ALLOWLIST -- no tester accounts,
  // aliases or streaming allowlist, so nobody else switches to the new look.
  if (mode === "list") return !!me && list(env.UI_REFRESH_ALLOWLIST).includes(me);
  if (!me || !me.includes("@")) return false;
  if (isTester(me, env)) return true;
  return list(env.CHAT_STREAMING_ALLOWLIST).includes(me) || list(env.UI_REFRESH_ALLOWLIST).includes(me);
}
