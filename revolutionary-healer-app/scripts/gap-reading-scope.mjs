// Dev-only helper for the scope checks in the older test scripts (Oct 8 2026,
// GAP reading restructure -- TEST preview). The restructure makes exactly
// these small, additive changes to the Shift-saving files (an OPTIONAL
// todaysFocus / todays_focus field, written only when present). undo()
// removes exactly those hunks and throws if anything else is found, so the
// older "Shift-saving code untouched" checks still prove that NOTHING ELSE in
// these files changed. Behaviour (same Airtable fields when no Today's Focus
// text is sent) is tested in scripts/test-gap-reading.mjs.
export const GAP_READING_RESTRUCTURE_HUNKS = {
 "app/api/gap-shift/route.ts": [
  [
   "    chatId = null,\n    todaysFocus = \"\",\n  } = await req.json();",
   "    chatId = null,\n  } = await req.json();"
  ],
  [
   "    recommendedActivation,\n    // GAP reading restructure (Oct 8 2026): optional, only when the page sends it.\n    ...(typeof todaysFocus === \"string\" && todaysFocus.trim() ? { todaysFocus: todaysFocus.trim().slice(0, 1500) } : {}),\n  });",
   "    recommendedActivation,\n  });"
  ]
 ],
 "app/api/shifts/route.ts": [
  [
   "      readyForEmbodied: !!r.fields.ready_for_embodied,\n      todaysFocus: r.fields.todays_focus ?? \"\", // GAP reading restructure (Oct 8 2026); \"\" for older Shifts\n",
   "      readyForEmbodied: !!r.fields.ready_for_embodied,\n"
  ],
  [
   "import { getShiftsByEmail, getShiftById, updateShiftFields, deleteShift, normalizeEmail } from \"@/lib/airtable\";\nimport { gapFastReadingEnabled, gapFastReadingSwitch, GAP_FAST_READING_HEADER } from \"@/lib/gapReading\"; // GAP reading restructure (Oct 8 2026)\n",
   "import { getShiftsByEmail, getShiftById, updateShiftFields, deleteShift, normalizeEmail } from \"@/lib/airtable\";\n"
  ],
  [
   "    if (gapFastReadingEnabled({ ...gapFastReadingSwitch(), email })) return NextResponse.json({ shifts }, { headers: GAP_FAST_READING_HEADER }); // switch on only: page uses the unified Shift card labels\n    return NextResponse.json({ shifts });\n",
   "    return NextResponse.json({ shifts });\n"
  ]
 ],
 "lib/airtable.js": [
  [
   "    recommendedActivation = \"\",\n    todaysFocus = \"\",\n}) {\n    const normalized = normalizeEmail(email);\n    const now = new Date().toISOString();\n    const fields = {\n        member_email: normalized,\n        ...(memberRecordId ? { member: [memberRecordId] } : {}),\n        method_name: methodName,\n        divine_identity_slug: divineIdentitySlug,\n        divine_identity_name: divineIdentityName,\n        current_frequency: currentFrequency,\n        focus_area: focusArea,\n        gap_explanation: gapExplanation,\n        what_we_noticed: whatWeNoticed,\n        recommended_activation: recommendedActivation,\n        progress_status: \"shifting\",\n        ready_for_embodied: false,\n        created_at: now,\n        updated_at: now,\n    };\n    // GAP reading restructure (Oct 8 2026, TEST preview): optional Today's\n    // Focus text from the deep reading, written ONLY when present. If the\n    // Shifts table doesn't have the todays_focus field yet (e.g. the live\n    // base before Rachael adds it), the Shift is saved exactly as before\n    // without it -- the save itself must never fail because of this field.\n    let created;\n    if (todaysFocus) {\n        try {\n            created = await base(Tables.Shifts).create({ ...fields, todays_focus: todaysFocus });\n        } catch (err) {\n            if (!(err && (err.error === \"UNKNOWN_FIELD_NAME\" || /todays_focus/i.test(String(err.message || \"\"))))) throw err;\n            console.warn(\"createShiftFromChat: todays_focus field missing on Shifts; saved without it\");\n            created = await base(Tables.Shifts).create(fields);\n        }\n    } else {\n        created = await base(Tables.Shifts).create(fields);\n    }\n",
   "    recommendedActivation = \"\",\n}) {\n    const normalized = normalizeEmail(email);\n    const now = new Date().toISOString();\n    const created = await base(Tables.Shifts).create({\n        member_email: normalized,\n        ...(memberRecordId ? { member: [memberRecordId] } : {}),\n        method_name: methodName,\n        divine_identity_slug: divineIdentitySlug,\n        divine_identity_name: divineIdentityName,\n        current_frequency: currentFrequency,\n        focus_area: focusArea,\n        gap_explanation: gapExplanation,\n        what_we_noticed: whatWeNoticed,\n        recommended_activation: recommendedActivation,\n        progress_status: \"shifting\",\n        ready_for_embodied: false,\n        created_at: now,\n        updated_at: now,\n    });\n"
  ]
 ]
};
export function undoGapReadingRestructure(file, src) {
  const hunks = GAP_READING_RESTRUCTURE_HUNKS[file];
  if (!hunks) return src;
  let t = src;
  for (const [now, before] of hunks) {
    if (t.split(now).length !== 2) throw new Error(`${file}: the GAP reading restructure hunk is not exactly as reviewed`);
    t = t.replace(now, before);
  }
  return t;
}
