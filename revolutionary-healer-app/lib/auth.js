// Password hashing for member sign-in. Aug 13 (Rachael's Kajabi-linked
// landing page request): Kajabi does not expose any API to verify a
// member's actual Kajabi password, so this app maintains its own
// password, scoped to a member's email, stored as salt:hash in the
// Members table's password_hash field (see lib/airtable.js).
//
// Uses Node's built-in crypto.scryptSync -- no extra dependency, no
// network call, safe default cost factor. Never store or log plaintext.

import crypto from "crypto";

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored || typeof stored !== "string" || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(String(password), salt, 64).toString("hex");
  const a = Buffer.from(candidate, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function generateToken() {
  return crypto.randomBytes(24).toString("hex");
}
