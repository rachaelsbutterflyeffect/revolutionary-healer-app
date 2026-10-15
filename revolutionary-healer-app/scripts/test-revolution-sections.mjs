// node scripts/test-revolution-sections.mjs -- My Revolution sections + stat-row counts (lib/revolutionSections.js).
import assert from "node:assert/strict";
import { classify } from "../lib/revolutionSections.js";
let n = 0; const t = (name, fn) => { fn(); n++; console.log("ok", name); };
const S = (id, m, at, extra = {}) => ({ id, methodName: m, divineIdentityName: "N" + id, currentFrequency: "F", focusArea: "", createdAt: at, ...extra });
t("empty member", () => assert.deepEqual(classify({}).counts, { gapScans: 0, shifts: 0, codes: 0 }));
t("history counts: 5 GAP + 1 Code Upgrade, no pulls", () => {
  const shifts = [1, 2, 3, 4, 5].map((i) => S("g" + i, "GAP Method", "2026-10-0" + i)).concat([S("c1", "Code Upgrade", "2026-10-09", { focusArea: "code-upgrade:grounding-97531" })]);
  const c = classify({ shifts }); assert.deepEqual(c.counts, { gapScans: 5, shifts: 6, codes: 1 }); assert.equal(c.codes[0].card, "grounding-97531"); assert.equal(c.codes[0].from, "saved");
});
t("pulls + older saved codes, no double count", () => {
  const shifts = [S("c1", "Code Upgrade", "2026-10-01T00:00:00Z"), S("c2", "Code Upgrade", "2026-10-20T00:00:00Z")];
  const pulls = [{ name: "Power", card: "power-55673", code: "55673", at: "2026-10-15T00:00:00Z" }, { name: "Clear", card: "clear-7112", code: "7112", at: "2026-10-20T00:00:00Z" }];
  const c = classify({ shifts, pulls }); assert.equal(c.counts.codes, 3); assert.equal(c.codes[0].name, "Clear");
});
t("funnel GAP result counts once, only if it never became a Shift", () => {
  assert.equal(classify({ gapResult: { completedAt: "2026-09-01", shiftCreated: false, linkedShift: false } }).counts.gapScans, 1);
  assert.equal(classify({ gapResult: { completedAt: "2026-09-01", shiftCreated: true } }).counts.gapScans, 0);
  assert.equal(classify({ gapResult: { completedAt: "" } }).counts.gapScans, 0);
});
t("chat Shifts are Shifting cards, not GAP runs", () => { const c = classify({ shifts: [S("x", "Revolutionary Healer AI Chat", "2026-10-01")] }); assert.deepEqual(c.counts, { gapScans: 0, shifts: 1, codes: 0 }); });
console.log(n, "passed");
