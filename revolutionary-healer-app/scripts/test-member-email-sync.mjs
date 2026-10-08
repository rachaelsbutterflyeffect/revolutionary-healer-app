// Dev-only tests for member email changes (Oct 8 2026):
//   lib/memberEmailChange.js (one-step move across every email-keyed table)
//   lib/airtable.js processKajabiPurchase + MEMBER_EMAIL_SYNC (off/alert/auto)
// NOT part of the app.
//
//   npm run test:member-email-sync
//
// Part A runs on an in-memory fake Airtable (no secrets).
// Part B runs against the TEST Airtable base ONLY (app25z8YN3rgFr8Zl), using
// AIRTABLE_TEST_API_KEY. It creates throwaway records with
// "rh-emailtest-<run>" emails and deletes every one of them at the end. It
// refuses to run against any other base.
import { register } from "node:module";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const libUrl = pathToFileURL(path.join(appRoot, "lib") + "/").href;
// Fake "airtable" package for the PRODUCTION-TODAY simulation: the real base
// does not have Members.kajabi_member_id yet, so any formula or write that
// mentions it fails with UNKNOWN_FIELD_NAME, exactly like Airtable does.
const SIM_AIRTABLE = `
let n = 0;
const unknown = () => Object.assign(new Error('Unknown field name: "kajabi_member_id"'), { error: "UNKNOWN_FIELD_NAME", statusCode: 422 });
const t = (name) => ((globalThis.__simStore ??= {})[name] ??= []);
function matcher(f) {
  if (!f) return () => true;
  if (f.includes("kajabi_member_id")) throw unknown();
  const m = f.match(/^\\{(\\w+)\\} = "(.*)"$/);
  if (!m) throw new Error("sim: unsupported formula " + f);
  return (r) => String(r.fields[m[1]] ?? "") === m[2];
}
export default class Airtable {
  constructor() {}
  base() {
    return (name) => ({
      select: (o = {}) => { const ok = matcher(o.filterByFormula); const rows = () => t(name).filter(ok).map((r) => ({ id: r.id, fields: { ...r.fields } })); return { all: async () => rows(), firstPage: async () => rows().slice(0, o.maxRecords ?? 100) }; },
      find: async (id) => { const r = t(name).find((x) => x.id === id); if (!r) throw new Error("NOT_FOUND"); return { id: r.id, fields: { ...r.fields } }; },
      create: async (fields) => { if ("kajabi_member_id" in fields) throw unknown(); const r = { id: "recSim" + (++n), fields: { ...fields } }; t(name).push(r); return { id: r.id, fields: { ...r.fields } }; },
      update: async (id, fields) => { if ("kajabi_member_id" in fields) throw unknown(); const r = t(name).find((x) => x.id === id); Object.assign(r.fields, fields); return { id, fields: { ...r.fields } }; },
    });
  }
}`;
// lib/*.js uses extensionless relative imports (Next resolves them); add ".js".
register(
  "data:text/javascript," +
    encodeURIComponent(`
const LIB = ${JSON.stringify(libUrl)};
const SIM = ${JSON.stringify("data:text/javascript," + encodeURIComponent(SIM_AIRTABLE))};
export async function resolve(spec, ctx, next) {
  if (spec === "airtable" && ctx.parentURL && ctx.parentURL.endsWith("?sim")) return { url: SIM, shortCircuit: true, format: "module" };
  try { return await next(spec, ctx); }
  catch (e) { if (spec.startsWith(".") && !/\\.[cm]?js$/.test(spec)) return next(spec + ".js", ctx); throw e; }
}
export async function load(url, ctx, next) {
  if (url.startsWith(LIB) && url.endsWith(".js")) return next(url, { ...ctx, format: "module" });
  return next(url, ctx);
}`),
  import.meta.url
);

const TEST_BASE = "app25z8YN3rgFr8Zl";
const REAL_BASE = "app34uRhAclIR32IU";

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL - ${name}\n   ${err && err.stack ? err.stack.split("\n").slice(0, 5).join("\n   ") : err}`);
  }
}

const mec = await import(pathToFileURL(path.join(appRoot, "lib", "memberEmailChange.js")).href);
const { planMemberEmailChange, applyMemberEmailChange, EMAIL_KEYED_TABLES, normalizeEmailStrict } = mec;

// ---------------------------------------------------------------------------
// Fake Airtable base (only what memberEmailChange.js uses).
// ---------------------------------------------------------------------------
function fakeBase(seed = {}, { failUpdateOn = null, failCreateOn = null } = {}) {
  const tables = {};
  let n = 0;
  const log = [];
  for (const [t, rows] of Object.entries(seed)) tables[t] = rows.map((f) => ({ id: `rec${t}${++n}`, fields: { ...f } }));
  const get = (t) => (tables[t] ??= []);
  function match(formula, rec) {
    let m = formula.match(/^LOWER\(TRIM\(\{(\w+)\} & ""\)\) = "(.*)"$/);
    if (m) return String(rec.fields[m[1]] ?? "").trim().toLowerCase() === m[2];
    m = formula.match(/^\{(\w+)\} = "(.*)"$/);
    if (m) return String(rec.fields[m[1]] ?? "") === m[2];
    throw new Error("fake base: unsupported formula " + formula);
  }
  const base = (t) => ({
    select: ({ filterByFormula }) => ({
      all: async () => get(t).filter((r) => match(filterByFormula, r)).map((r) => ({ id: r.id, fields: { ...r.fields } })),
    }),
    create: async (fields) => {
      if (failCreateOn === t) throw new Error(`fake create failure on ${t}`);
      const r = { id: `rec${t}${++n}`, fields: { ...fields } };
      get(t).push(r);
      log.push(["create", t, r.id]);
      return { id: r.id, fields: { ...r.fields } };
    },
    update: async (idOrList, fields) => {
      if (failUpdateOn === t) throw new Error(`fake update failure on ${t}`);
      const list = Array.isArray(idOrList) ? idOrList : [{ id: idOrList, fields }];
      if (list.length > 10) throw new Error("fake base: more than 10 records per update");
      for (const u of list) {
        const r = get(t).find((x) => x.id === u.id);
        if (!r) throw new Error("fake base: no record " + u.id);
        Object.assign(r.fields, u.fields);
        log.push(["update", t, u.id]);
      }
      return list;
    },
  });
  return { base, tables, log };
}

const OLD = "eden.old@example.com";
const NEW = "eden.new@example.com";
function seedFor(email, extra = {}) {
  return {
    Members: [{ email, member_active: true }],
    ChatSessions: [{ member_email: email, title: "a" }],
    ChatMessages: Array.from({ length: 23 }, (_, i) => ({ member_email: email, message_text: "m" + i })),
    MemberMemories: [{ member_email: email }, { member_email: email.toUpperCase() }],
    Shifts: [{ member_email: email }],
    Favorites: [{ member_email: email }],
    ActivationCompletions: [{ member_email: email }],
    GapMethodResults: [{ email }],
    Chats: [{ email }],
    WebhookEvents: [{ email }],
    ...extra,
  };
}
const countWith = (tables, email) =>
  Object.fromEntries(Object.entries(tables).map(([t, rows]) => [t, rows.filter((r) => String(r.fields.email ?? r.fields.member_email ?? "").toLowerCase() === email).length]));

console.log("\n# A. lib/memberEmailChange.js on a fake base");

await test("covers every email-keyed table, Members last, WebhookEvents never", () => {
  const names = EMAIL_KEYED_TABLES.map((t) => t.table);
  for (const t of ["Members", "Chats", "GapMethodResults", "Shifts", "ChatSessions", "ChatMessages", "MemberMemories", "ActivationCompletions", "Favorites"]) assert.ok(names.includes(t), t);
  assert.equal(names.at(-1), "Members");
  assert.ok(!names.includes("WebhookEvents"));
});

await test("email validation rejects junk and formula-breaking characters", () => {
  assert.equal(normalizeEmailStrict("  A@B.com "), "a@b.com");
  for (const bad of ["", "nope", 'a"@b.com', "a@b", "a b@c.com", "a\\@b.com", null]) assert.equal(normalizeEmailStrict(bad), null, String(bad));
});

await test("dry-run plan changes nothing and lists every row (any casing)", async () => {
  const fx = fakeBase(seedFor(OLD));
  const plan = await planMemberEmailChange(fx.base, { oldEmail: " Eden.Old@Example.com ", newEmail: NEW });
  assert.equal(plan.ok, true, plan.blockers.join("; "));
  assert.equal(plan.total, 1 + 1 + 23 + 2 + 1 + 1 + 1 + 1 + 1);
  assert.equal(fx.log.length, 0);
});

await test("apply moves every row in batches of <=10, Members last, writes audit row first, leaves WebhookEvents alone", async () => {
  const fx = fakeBase(seedFor(OLD));
  const res = await applyMemberEmailChange(fx.base, { oldEmail: OLD, newEmail: NEW, source: "test" });
  assert.equal(res.applied, true);
  const after = countWith(fx.tables, OLD);
  for (const [t, c] of Object.entries(after)) if (t !== "WebhookEvents" && t !== "EmailChanges") assert.equal(c, 0, t);
  assert.equal(after.WebhookEvents, 1);
  assert.deepEqual(fx.log[0], ["create", "EmailChanges", res.auditRecordId]);
  const lastMove = fx.log.filter((l) => l[0] === "update" && l[1] !== "EmailChanges").at(-1);
  assert.equal(lastMove[1], "Members");
  const audit = fx.tables.EmailChanges[0].fields;
  assert.equal(audit.status, "applied");
  assert.equal(audit.old_email, OLD);
  assert.equal(audit.new_email, NEW);
  assert.equal(JSON.parse(audit.record_ids).ChatMessages.length, 23);
});

await test("undo = same tool with emails swapped restores everything", async () => {
  const fx = fakeBase(seedFor(OLD));
  await applyMemberEmailChange(fx.base, { oldEmail: OLD, newEmail: NEW });
  const back = await applyMemberEmailChange(fx.base, { oldEmail: NEW, newEmail: OLD });
  assert.equal(back.applied, true, back.plan.blockers.join("; "));
  const c = countWith(fx.tables, OLD);
  assert.equal(c.ChatMessages, 23);
  assert.equal(c.Members, 1);
});

for (const [label, seed, expect] of [
  ["no Members record for the old email", { ChatMessages: [{ member_email: OLD }] }, /no Members record/],
  ["two Members records for the old email", { Members: [{ email: OLD }, { email: OLD }] }, /2 Members records/],
  ["new email already a member", { ...seedFor(OLD), Members: [{ email: OLD }, { email: NEW }] }, /already belongs to Members/],
  ["new email already has chat rows", { ...seedFor(OLD), ChatSessions: [{ member_email: OLD }, { member_email: NEW }] }, /ChatSessions already has 1/],
]) {
  await test(`blocked, nothing written: ${label}`, async () => {
    const fx = fakeBase(seed);
    const res = await applyMemberEmailChange(fx.base, { oldEmail: OLD, newEmail: NEW });
    assert.equal(res.applied, false);
    assert.match(res.plan.blockers.join("; "), expect);
    assert.equal(fx.log.length, 0);
  });
}

await test("audit row can't be written -> nothing changes", async () => {
  const fx = fakeBase(seedFor(OLD), { failCreateOn: "EmailChanges" });
  await assert.rejects(applyMemberEmailChange(fx.base, { oldEmail: OLD, newEmail: NEW }));
  assert.equal(fx.log.length, 0);
});

await test("failure part-way: Members untouched (old login still works), audit says failed; --resume finishes it", async () => {
  const fx = fakeBase(seedFor(OLD), { failUpdateOn: "MemberMemories" });
  await assert.rejects(applyMemberEmailChange(fx.base, { oldEmail: OLD, newEmail: NEW }));
  assert.equal(countWith(fx.tables, OLD).Members, 1);
  assert.equal(fx.tables.EmailChanges[0].fields.status, "failed");
  const fx2 = { base: fakeBase().base };
  void fx2;
  // same data, failure gone:
  const healed = fakeBase();
  Object.assign(healed.tables, fx.tables);
  const blockedWithoutResume = await planMemberEmailChange(healed.base, { oldEmail: OLD, newEmail: NEW });
  assert.equal(blockedWithoutResume.ok, false);
  const res = await applyMemberEmailChange(healed.base, { oldEmail: OLD, newEmail: NEW, resume: true });
  assert.equal(res.applied, true, res.plan.blockers.join("; "));
  const c = countWith(healed.tables, OLD);
  for (const [t, v] of Object.entries(c)) if (t !== "WebhookEvents" && t !== "EmailChanges") assert.equal(v, 0, t);
});

// ---------------------------------------------------------------------------
// A2. Production today: Members.kajabi_member_id does NOT exist in the real
// base yet. The purchase webhook must behave exactly as before in every mode.
// ---------------------------------------------------------------------------
console.log("\n# A2. Real base before the new field is added (simulated): purchases unaffected");
{
  const saved = { ...process.env };
  process.env.AIRTABLE_API_KEY = "sim";
  process.env.AIRTABLE_BASE_ID = "appSIMULATED00000";
  process.env.MEMBER_OFFER_IDS = "9990001";
  process.env.GAP_METHOD_OFFER_IDS = "9990009";
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM_EMAIL;
  const sim = await import(pathToFileURL(path.join(appRoot, "lib", "airtable.js")).href + "?sim");
  const simAlerts = [];
  const alertFn = async (x) => { simAlerts.push(x); };
  for (const mode of ["off", "alert", "auto"]) {
    await test(`missing field, mode ${mode}: new buyer still gets a Members record, existing buyer still updated, no alert`, async () => {
      globalThis.__simStore = { Members: [{ id: "recOld1", fields: { email: "old@example.com", member_active: false } }] };
      const quiet = console.warn; const quietErr = console.error; console.warn = () => {}; console.error = () => {};
      try {
        const a = await sim.processKajabiPurchase({ email: "brand.new@example.com", firstName: "N", offerId: "9990001", eventType: undefined, kajabiMemberId: "123" }, { sendOpsAlert: alertFn, mode });
        assert.equal(a.outcome, "created");
        const b = await sim.processKajabiPurchase({ email: "old@example.com", firstName: "O", offerId: "9990001", eventType: undefined, kajabiMemberId: "456" }, { sendOpsAlert: alertFn, mode });
        assert.equal(b.outcome, "already_existed");
        assert.equal(b.memberRecordId, "recOld1");
      } finally { console.warn = quiet; console.error = quietErr; }
      assert.equal(globalThis.__simStore.Members.length, 2);
      assert.equal(globalThis.__simStore.Members[0].fields.member_active, true);
      assert.equal(simAlerts.length, 0);
    });
  }
  await test("MEMBER_EMAIL_SYNC env: anything except alert/auto means off", () => {
    for (const [v, want] of [[undefined, "off"], ["", "off"], ["on", "off"], ["true", "off"], [" Alert ", "alert"], ["AUTO", "auto"]]) assert.equal(sim.memberEmailSyncMode(v), want, String(v));
  });
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
}

// ---------------------------------------------------------------------------
// B. TEST Airtable base (real API)
// ---------------------------------------------------------------------------
const testKey = process.env.AIRTABLE_TEST_API_KEY;
if (!testKey) {
  console.log("\n# B. skipped (AIRTABLE_TEST_API_KEY not set)");
} else {
  console.log("\n# B. TEST Airtable base " + TEST_BASE);
  process.env.AIRTABLE_API_KEY = testKey;
  process.env.AIRTABLE_BASE_ID = TEST_BASE;
  process.env.MEMBER_OFFER_IDS = "9990001";
  process.env.TIER_OFFER_IDS = "";
  process.env.GAP_METHOD_OFFER_IDS = "9990009";
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM_EMAIL;
  delete process.env.MEMBER_EMAIL_SYNC;
  assert.notEqual(process.env.AIRTABLE_BASE_ID, REAL_BASE);

  const Airtable = (await import("airtable")).default;
  const tbase = new Airtable({ apiKey: testKey }).base(TEST_BASE);
  const lib = await import(pathToFileURL(path.join(appRoot, "lib", "airtable.js")).href);

  const run = `${Date.now()}`;
  const em = (s) => `rh-emailtest-${run}-${s}@example.com`;
  const created = []; // [table, id]
  const mk = async (table, fields) => {
    const r = await tbase(table).create(fields);
    created.push([table, r.id]);
    return r;
  };
  const alerts = [];
  const alertFn = async (a) => { alerts.push(a); return { skipped: true }; };
  const kid = (s) => `99${run.slice(-8)}${s}`;

  try {
    await test("TEST: dry run then apply moves a member + chats + memories; re-read verifies; undo restores", async () => {
      const A = em("a"), A2 = em("a2");
      const m = await mk("Members", { email: A, member_active: true });
      const cs = await mk("ChatSessions", { member_email: A, title: "test chat" });
      for (let i = 0; i < 12; i++) await mk("ChatMessages", { member_email: A, chat_session_id: cs.id, message_text: "t" + i });
      await mk("MemberMemories", { member_email: A, statement: "test memory" });
      await mk("Favorites", { member_email: A, activation_slug: "test" });
      const plan = await planMemberEmailChange(tbase, { oldEmail: A, newEmail: A2 });
      assert.equal(plan.ok, true, plan.blockers.join("; "));
      assert.equal(plan.total, 16);
      const res = await applyMemberEmailChange(tbase, { oldEmail: A, newEmail: A2, source: "test" });
      assert.equal(res.applied, true);
      created.push(["EmailChanges", res.auditRecordId]);
      assert.equal((await tbase("Members").find(m.id)).fields.email, A2);
      const left = await planMemberEmailChange(tbase, { oldEmail: A, newEmail: em("zz") });
      assert.equal(left.total, 0);
      const audit = await tbase("EmailChanges").find(res.auditRecordId);
      assert.equal(audit.fields.status, "applied");
      const undo = await applyMemberEmailChange(tbase, { oldEmail: A2, newEmail: A, source: "test-undo" });
      assert.equal(undo.applied, true);
      created.push(["EmailChanges", undo.auditRecordId]);
      assert.equal((await tbase("Members").find(m.id)).fields.email, A);
    });

    await test("TEST: blocked when the new email already has a Members record (nothing written)", async () => {
      const B = em("b"), B2 = em("b2");
      await mk("Members", { email: B });
      await mk("Members", { email: B2 });
      const res = await applyMemberEmailChange(tbase, { oldEmail: B, newEmail: B2 });
      assert.equal(res.applied, false);
      assert.equal(res.auditRecordId, null);
    });

    await test("TEST webhook, MEMBER_EMAIL_SYNC off (default): old behaviour (new record) + Kajabi id captured", async () => {
      const C = em("c"), C2 = em("c2");
      const m = await mk("Members", { email: C, member_active: true, kajabi_member_id: kid("1") });
      const r = await lib.processKajabiPurchase({ email: C2, firstName: "T", offerId: "9990001", eventType: undefined, kajabiMemberId: kid("1") }, { sendOpsAlert: alertFn });
      created.push(["Members", r.memberRecordId]);
      assert.equal(r.outcome, "created");
      assert.notEqual(r.memberRecordId, m.id);
      assert.equal(r.emailSync, undefined);
      assert.equal(alerts.length, 0);
      const n = await tbase("Members").find(r.memberRecordId);
      assert.equal(n.fields.kajabi_member_id, kid("1")); // captured on the record it touched
    });

    await test("TEST webhook: existing member gets kajabi_member_id captured; never overwritten", async () => {
      const D = em("d");
      const m = await mk("Members", { email: D, member_active: true });
      await lib.processKajabiPurchase({ email: D, firstName: "T", offerId: "9990001", eventType: undefined, kajabiMemberId: kid("2") }, { sendOpsAlert: alertFn });
      assert.equal((await tbase("Members").find(m.id)).fields.kajabi_member_id, kid("2"));
      await lib.processKajabiPurchase({ email: D, firstName: "T", offerId: "9990001", eventType: undefined, kajabiMemberId: kid("3") }, { sendOpsAlert: alertFn });
      assert.equal((await tbase("Members").find(m.id)).fields.kajabi_member_id, kid("2"));
    });

    await test("TEST webhook, alert mode: no duplicate, access on existing record, one alert, nothing renamed", async () => {
      const E = em("e"), E2 = em("e2");
      const m = await mk("Members", { email: E, member_active: false, kajabi_member_id: kid("4") });
      await mk("ChatSessions", { member_email: E, title: "x" });
      const before = alerts.length;
      const r = await lib.processKajabiPurchase({ email: E2, firstName: "T", offerId: "9990001", eventType: undefined, kajabiMemberId: kid("4") }, { sendOpsAlert: alertFn, mode: "alert" });
      assert.equal(r.memberRecordId, m.id);
      assert.equal(r.outcome, "already_existed");
      assert.equal(r.emailSync, "alerted");
      const rec = await tbase("Members").find(m.id);
      assert.equal(rec.fields.email, E);
      assert.equal(rec.fields.member_active, true);
      assert.equal(alerts.length, before + 1);
      assert.match(alerts.at(-1).message, /move-member-email\.mjs --old .*--new /);
      const dup = await tbase("Members").select({ filterByFormula: `{email} = "${E2}"` }).all();
      assert.equal(dup.length, 0);
    });

    await test("TEST webhook, auto mode: email moved across tables, audit row, FYI alert with undo", async () => {
      const F = em("f"), F2 = em("f2");
      const m = await mk("Members", { email: F, member_active: true, kajabi_member_id: kid("5") });
      const cs = await mk("ChatSessions", { member_email: F, title: "y" });
      await mk("MemberMemories", { member_email: F, statement: "z" });
      const r = await lib.processKajabiPurchase({ email: F2, firstName: "T", offerId: "9990001", eventType: undefined, kajabiMemberId: kid("5") }, { sendOpsAlert: alertFn, mode: "auto" });
      assert.equal(r.emailSync, "moved");
      assert.equal(r.memberRecordId, m.id);
      assert.equal((await tbase("Members").find(m.id)).fields.email, F2);
      assert.equal((await tbase("ChatSessions").find(cs.id)).fields.member_email, F2);
      assert.match(alerts.at(-1).message, /To undo/);
      const audits = await tbase("EmailChanges").select({ filterByFormula: `{new_email} = "${F2}"` }).all();
      assert.equal(audits.length, 1);
      assert.equal(audits[0].fields.source, "kajabi_webhook");
      created.push(["EmailChanges", audits[0].id]);
    });

    await test("TEST webhook, auto mode: two records share the Kajabi id -> ambiguous, nothing renamed, old behaviour", async () => {
      const G = em("g"), G1 = em("g1"), G2 = em("g2");
      const a = await mk("Members", { email: G, kajabi_member_id: kid("6") });
      const b = await mk("Members", { email: G1, kajabi_member_id: kid("6") });
      const r = await lib.processKajabiPurchase({ email: G2, firstName: "T", offerId: "9990001", eventType: undefined, kajabiMemberId: kid("6") }, { sendOpsAlert: alertFn, mode: "auto" });
      created.push(["Members", r.memberRecordId]);
      assert.equal(r.emailSync, "ambiguous");
      assert.equal(r.outcome, "created");
      assert.equal((await tbase("Members").find(a.id)).fields.email, G);
      assert.equal((await tbase("Members").find(b.id)).fields.email, G1);
      assert.match(alerts.at(-1).subject, /ambiguous/);
    });

    await test("TEST webhook, auto mode: move blocked (new email already has chat rows) -> falls back to alert", async () => {
      const H = em("h"), H2 = em("h2");
      const m = await mk("Members", { email: H, kajabi_member_id: kid("7") });
      await mk("ChatSessions", { member_email: H2, title: "stray" });
      const r = await lib.processKajabiPurchase({ email: H2, firstName: "T", offerId: "9990001", eventType: undefined, kajabiMemberId: kid("7") }, { sendOpsAlert: alertFn, mode: "auto" });
      assert.equal(r.emailSync, "blocked");
      assert.equal(r.memberRecordId, m.id);
      assert.equal((await tbase("Members").find(m.id)).fields.email, H);
      assert.match(alerts.at(-1).subject, /blocked/);
    });
  } finally {
    // Clean up: everything we created, plus anything carrying this run's emails.
    const sweepTables = ["Members", "ChatSessions", "ChatMessages", "MemberMemories", "Favorites", "Shifts", "ActivationCompletions", "GapMethodResults", "Chats", "EmailChanges"];
    const fieldOf = { Members: "email", Chats: "email", GapMethodResults: "email", EmailChanges: "new_email" };
    const ids = new Map();
    for (const [t, id] of created) if (id) (ids.get(t) ?? ids.set(t, new Set()).get(t)).add(id);
    for (const t of sweepTables) {
      const f = fieldOf[t] ?? "member_email";
      const extra = await tbase(t).select({ filterByFormula: `FIND("rh-emailtest-${run}-", {${f}} & "")` }).all();
      for (const r of extra) (ids.get(t) ?? ids.set(t, new Set()).get(t)).add(r.id);
      if (t === "EmailChanges") {
        const extra2 = await tbase(t).select({ filterByFormula: `FIND("rh-emailtest-${run}-", {old_email} & "")` }).all();
        for (const r of extra2) ids.get(t)?.add(r.id) ?? ids.set(t, new Set([r.id]));
      }
    }
    let removed = 0;
    for (const [t, set] of ids) {
      const list = [...set];
      for (let i = 0; i < list.length; i += 10) {
        await tbase(t).destroy(list.slice(i, i + 10));
        removed += list.slice(i, i + 10).length;
      }
    }
    let leftover = 0;
    for (const t of sweepTables) {
      const f = fieldOf[t] ?? "member_email";
      leftover += (await tbase(t).select({ filterByFormula: `FIND("rh-emailtest-${run}-", {${f}} & "")` }).all()).length;
    }
    console.log(`cleanup: removed ${removed} TEST record(s), leftover ${leftover}`);
    if (leftover) failed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
