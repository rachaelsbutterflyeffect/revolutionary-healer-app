// Move ONE member's email across every Airtable table that is keyed by email,
// in one step, with a dry-run plan first and an undo log.
//
// Oct 8 2026 (Rachael, after Eden Koz's Kajabi email change): Kajabi's
// webhooks only carry purchases/payments, so an email change in Kajabi never
// reaches Airtable on its own. The app matches members purely by email
// (Members.email, then member_email on every per-member table), so an
// un-moved email = "We don't see a purchase for that email" at login and an
// empty chat history. This is the one shared helper for that fix, used by:
//   - scripts/move-member-email.mjs (admin, dry-run by default), and
//   - processKajabiPurchase (lib/airtable.js) when MEMBER_EMAIL_SYNC=auto and
//     a webhook arrives whose STABLE Kajabi member id matches exactly one
//     Members record that still has an older email.
//
// Safety rules (do not loosen without Rachael's OK -- ~45 real paying members):
//   - Never moves anything when the plan is ambiguous: no Members record for
//     the old email, more than one, or the new email already belongs to a
//     Members record or already has rows in any per-member table.
//   - Writes an EmailChanges audit row BEFORE changing anything (if that write
//     fails, nothing is changed), then records every record id it moved, so
//     the change can be undone exactly (run it again with the emails swapped).
//   - WebhookEvents is deliberately NOT touched: it is the historical log of
//     what Kajabi actually sent.
//   - Members is moved LAST, so a failure part-way leaves the member able to
//     sign in with the old email; re-run with { resume: true } to finish.
//
// `base` is injected (the Airtable base function from lib/airtable.js, or a
// test base) so this file never imports lib/airtable.js (no import cycle).

export const EMAIL_KEYED_TABLES = [
  // unique: at most one row per email is expected (a second row = conflict).
  { table: "Chats", field: "email", unique: true },
  { table: "GapMethodResults", field: "email", unique: true },
  { table: "Shifts", field: "member_email" },
  { table: "ChatSessions", field: "member_email" },
  { table: "ChatMessages", field: "member_email" },
  { table: "MemberMemories", field: "member_email" },
  { table: "ActivationCompletions", field: "member_email" },
  { table: "Favorites", field: "member_email" },
  // Members always last (see header).
  { table: "Members", field: "email", unique: true },
];

export const EMAIL_CHANGES_TABLE = "EmailChanges";

const EMAIL_RE = /^[^\s@"'\\]+@[^\s@"'\\]+\.[^\s@"'\\]+$/;

export function normalizeEmailStrict(email) {
  const e = typeof email === "string" ? email.trim().toLowerCase() : "";
  return EMAIL_RE.test(e) ? e : null;
}

async function idsWithEmail(base, table, field, email) {
  const records = await base(table)
    .select({ filterByFormula: `LOWER(TRIM({${field}} & "")) = "${email}"`, fields: [field] })
    .all();
  return records.map((r) => r.id);
}

/**
 * Read-only. Returns { ok, oldEmail, newEmail, tables: [{table, field, moveIds, existingNewIds}],
 * total, blockers: [string], memberRecordId }.
 */
export async function planMemberEmailChange(base, { oldEmail, newEmail, resume = false }) {
  const from = normalizeEmailStrict(oldEmail);
  const to = normalizeEmailStrict(newEmail);
  const blockers = [];
  if (!from) blockers.push(`old email is not a valid email: ${JSON.stringify(oldEmail)}`);
  if (!to) blockers.push(`new email is not a valid email: ${JSON.stringify(newEmail)}`);
  if (from && to && from === to) blockers.push("old and new email are the same");
  if (blockers.length) return { ok: false, oldEmail: from, newEmail: to, tables: [], total: 0, blockers, memberRecordId: null };

  const tables = [];
  for (const { table, field, unique } of EMAIL_KEYED_TABLES) {
    const moveIds = await idsWithEmail(base, table, field, from);
    const existingNewIds = await idsWithEmail(base, table, field, to);
    tables.push({ table, field, unique: !!unique, moveIds, existingNewIds });
  }

  const members = tables.find((t) => t.table === "Members");
  if (members.moveIds.length === 0 && !(resume && members.existingNewIds.length === 1)) {
    blockers.push(`no Members record has ${from}`);
  }
  if (members.moveIds.length > 1) blockers.push(`${members.moveIds.length} Members records have ${from} (ambiguous)`);
  if (members.existingNewIds.length > 0 && !(resume && members.moveIds.length === 0)) {
    blockers.push(`${to} already belongs to Members record ${members.existingNewIds.join(", ")}`);
  }
  for (const t of tables) {
    if (t.table === "Members" || t.existingNewIds.length === 0) continue;
    // resume=true: a previous run moved some rows and then stopped; rows already
    // under the new email are expected. Unique tables still may not end up with two.
    if (!resume) blockers.push(`${t.table} already has ${t.existingNewIds.length} row(s) with ${to}`);
    else if (t.unique && t.moveIds.length > 0) blockers.push(`${t.table} has rows for BOTH emails (would duplicate a one-per-member row)`);
  }

  const total = tables.reduce((n, t) => n + t.moveIds.length, 0);
  return {
    ok: blockers.length === 0,
    oldEmail: from,
    newEmail: to,
    tables,
    total,
    blockers,
    memberRecordId: members.moveIds[0] ?? members.existingNewIds[0] ?? null,
  };
}

export function describePlan(plan) {
  const lines = [`${plan.oldEmail} -> ${plan.newEmail}`];
  for (const t of plan.tables) {
    if (t.moveIds.length || t.existingNewIds.length) {
      lines.push(`  ${t.table}.${t.field}: move ${t.moveIds.length}${t.existingNewIds.length ? ` (already on new email: ${t.existingNewIds.length})` : ""}`);
    }
  }
  lines.push(`  total records to move: ${plan.total}`);
  if (plan.blockers.length) lines.push(`  BLOCKED: ${plan.blockers.join("; ")}`);
  return lines.join("\n");
}

/**
 * Plans (fresh) and, only if the plan is unambiguous, moves every row.
 * Returns { applied, plan, auditRecordId, moved: {table: [ids]} }.
 * Never throws for a blocked plan (returns applied:false); throws only if an
 * Airtable write fails mid-way (the audit row then says "failed" + what moved).
 */
export async function applyMemberEmailChange(base, { oldEmail, newEmail, source = "admin_script", resume = false, note = "" }) {
  const plan = await planMemberEmailChange(base, { oldEmail, newEmail, resume });
  if (!plan.ok) return { applied: false, plan, auditRecordId: null, moved: {} };

  const now = () => new Date().toISOString();
  const recordIdsJson = JSON.stringify(Object.fromEntries(plan.tables.map((t) => [t.table, t.moveIds])));
  // Audit row first: if this fails, nothing has been changed.
  const audit = await base(EMAIL_CHANGES_TABLE).create({
    old_email: plan.oldEmail,
    new_email: plan.newEmail,
    source,
    status: "started",
    member_record_id: plan.memberRecordId ?? "",
    record_ids: recordIdsJson,
    note,
    created_at: now(),
  });

  const moved = {};
  try {
    for (const t of plan.tables) {
      moved[t.table] = [];
      for (let i = 0; i < t.moveIds.length; i += 10) {
        const batch = t.moveIds.slice(i, i + 10);
        await base(t.table).update(batch.map((id) => ({ id, fields: { [t.field]: plan.newEmail } })));
        moved[t.table].push(...batch);
      }
    }
  } catch (err) {
    try {
      await base(EMAIL_CHANGES_TABLE).update(audit.id, {
        status: "failed",
        record_ids: JSON.stringify(moved),
        note: `${note ? note + " | " : ""}stopped part-way: ${String(err?.message ?? err)} -- re-run with resume to finish`,
      });
    } catch (logErr) {
      console.error("EmailChanges failed-status update failed", logErr);
    }
    throw err;
  }

  await base(EMAIL_CHANGES_TABLE).update(audit.id, { status: "applied", record_ids: JSON.stringify(moved) });
  return { applied: true, plan, auditRecordId: audit.id, moved };
}
