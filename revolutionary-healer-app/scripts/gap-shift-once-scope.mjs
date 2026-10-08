// Dev-only helper for the scope checks in the older test scripts (Oct 8 2026,
// duplicate-save fix: one GAP run = one Shift). The fix wraps the ONE
// createShiftFromChat call in /api/gap-shift with gapShiftOnce (lib/gapShiftOnce.js)
// and reads the page's optional clientRunId. undoGapShiftOnce() removes exactly
// those hunks and throws if anything else is found, so the older "Shift-saving
// code untouched" checks still prove that NOTHING ELSE in the route changed
// (same createShiftFromChat arguments = same card content). Behaviour is tested
// in scripts/test-gap-shift-once.mjs.
export const GAP_SHIFT_ONCE_HUNKS = {
 "app/api/gap-shift/route.ts": [
  [
   "import { createShiftFromChat } from \"@/lib/airtable\";\nimport { gapShiftOnce } from \"@/lib/gapShiftOnce\"; // one GAP run = one Shift (duplicate-save fix, Oct 8 2026)\n",
   "import { createShiftFromChat } from \"@/lib/airtable\";\n"
  ],
  [
   "    todaysFocus = \"\",\n    clientRunId = \"\",\n  } = await req.json();",
   "    todaysFocus = \"\",\n  } = await req.json();"
  ],
  [
   "  const shift: any = await gapShiftOnce({ email, clientRunId, divineIdentitySlug, gapExplanation, whatWeNoticed, recommendedActivation }, () => createShiftFromChat({\n",
   "  const shift = await createShiftFromChat({\n"
  ],
  [
   "  }));\n\n  return NextResponse.json(shift.deduped ? { shiftId: shift.id, deduped: true } : { shiftId: shift.id });",
   "  });\n\n  return NextResponse.json({ shiftId: shift.id });"
  ]
 ]
};
export function undoGapShiftOnce(file, src) {
  const hunks = GAP_SHIFT_ONCE_HUNKS[file];
  if (!hunks) return src;
  let t = src;
  for (const [now, before] of hunks) {
    if (t.split(now).length !== 2) throw new Error(`${file}: the duplicate-save fix hunk is not exactly as reviewed`);
    t = t.replace(now, before);
  }
  return t;
}
