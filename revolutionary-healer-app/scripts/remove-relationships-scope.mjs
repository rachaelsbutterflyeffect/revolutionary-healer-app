// Dev-only helper for the scope checks in the older test scripts (Oct 8 2026,
// "Remove Relationships option from GAP Step 1" -- TEST preview first).
// Rachael asked for the Relationships focus area (added Oct 7, PR #28) to be
// removed. That fix intentionally changes exactly these hunks: it deletes the
// Relationships instruction block from the member GAP prompt, and makes the
// prompt builder and the gap-method-result route treat a stale "Relationships"
// as no specific area. undo() swaps back exactly those reviewed hunks and
// throws if anything else is found, so the older "GAP prompt / Shift-saving
// code untouched" checks still prove that NOTHING ELSE in these files changed
// (the protected GAP teaching/activation text included). Behaviour is tested
// in scripts/test-remove-relationships.mjs.
export const REMOVE_RELATIONSHIPS_HUNKS = {
 "lib/processes.js": [
  [
   "// Oct 8: the \"Relationships\" focus area was removed from the in-app GAP Method (Rachael). A page that was\n// already open before the update may still send it; treat it as no specific area (the general flow), never\n// an error. Every other context produces exactly the same prompt as before.\nfunction withoutRemovedGapFocusArea(gapContext) {\n  if (!gapContext || String(gapContext.focusArea || \"\").trim().toLowerCase() !== \"relationships\") return gapContext;\n  return { ...gapContext, focusArea: \"\" };\n}\n\nexport function buildGapMemberSystemPrompt(gapContext) {\n  const ctx = withoutRemovedGapFocusArea(gapContext);\n  return `${GAP_METHOD_SCRIPT_MEMBER}${\n    ctx\n      ? `\\n\\n${GAP_METHOD_RESULT_NOTE}\\n\\n=== GAP METHOD RESULT (STEP 1) ===\\n${JSON.stringify(ctx, null, 2)}`\n      : \"\"\n  }`;\n",
   "// Oct 7: \"Relationships\" focus area added to the in-app GAP Method's\n// \"Where are you feeling the gap the most right now?\" question (public/app.html\n// DOMAINS). Only appended when the member actually picked it, so every other\n// focus area's prompt is byte-for-byte unchanged.\nconst GAP_RELATIONSHIPS_FOCUS_NOTE = `=== FOCUS AREA: RELATIONSHIPS ===\nThe member chose Relationships as where they are feeling the gap most. This can be\na partner, a family member (parent, sibling, child), a friend, or anyone close to\nthem. Explore the GAP through how THE MEMBER shows up in that relationship -- what they\nhold back, over-give, tolerate, control, wait for, or can't say -- and what\ntheir own pattern is protecting, never through diagnosing, blaming, or speaking\nfor the other person (you only know their side). Keep the same one-question-at-a-\ntime Step 2 rhythm. The Divine Identity and 16-pattern detection work exactly\nthe same way for relationships. Use [[TOPIC: general]] unless the conversation\nwas substantively about money or business. In the SAVE_SHIFT JSON, set\n\"focusArea\" to \"Relationships\".`;\n\nexport function buildGapMemberSystemPrompt(gapContext) {\n  const isRelationships = !!gapContext && String(gapContext.focusArea || \"\").trim().toLowerCase() === \"relationships\";\n  return `${GAP_METHOD_SCRIPT_MEMBER}${\n    gapContext\n      ? `\\n\\n${GAP_METHOD_RESULT_NOTE}\\n\\n=== GAP METHOD RESULT (STEP 1) ===\\n${JSON.stringify(gapContext, null, 2)}`\n      : \"\"\n  }${isRelationships ? `\\n\\n${GAP_RELATIONSHIPS_FOCUS_NOTE}` : \"\"}`;\n"
  ]
 ],
 "app/api/gap-method-result/route.ts": [
  [
   "      // Oct 8: \"Relationships\" was removed from the GAP Method; a stale page sending it saves as no specific area.\n      focusArea: typeof body.focusArea === \"string\" && body.focusArea.trim().toLowerCase() === \"relationships\" ? \"\" : body.focusArea,\n",
   "      focusArea: body.focusArea,\n"
  ]
 ]
};
export function undoRemoveRelationships(file, src) {
  const hunks = REMOVE_RELATIONSHIPS_HUNKS[file];
  if (!hunks) return src;
  let t = src;
  for (const [now, before] of hunks) {
    if (t.split(now).length !== 2) throw new Error(`${file}: the Remove Relationships hunk is not exactly as reviewed`);
    t = t.replace(now, before);
  }
  return t;
}
