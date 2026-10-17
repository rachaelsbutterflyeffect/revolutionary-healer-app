// Tests for lib/memberVoice.js (Shift card speaks to the member as "you").
// Run: node scripts/test-member-voice.mjs   (no network, no Airtable)
import assert from "node:assert/strict";
import { ensureMemberVoice, toSecondPersonRule, needsMemberVoiceFix, __clearMemberVoiceMemo } from "../lib/memberVoice.js";

let n = 0;
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };
const BANNED = /\b(she|her|hers|herself|woman|women)\b|\bshe['’]/i;

// Word rewrite (fallback): examples shaped like the Oct 16 cards (made-up text).
const cases = [
  ["She wants to trust her own discernment, but she never lets an unclear signal finish.", "You want to trust your own discernment, but you never let an unclear signal finish."],
  ["She feels energy in her body and trusts it, then questions it and carries on.", "You feel energy in your body and trust it, then question it and carry on."],
  ["This means she never collects the evidence that would let her trust herself more.", "This means you never collect the evidence that would let you trust yourself more."],
  ["She is consciously aligned, yet subconsciously guards and contracts against it.", "You are consciously aligned, yet subconsciously guard and contract against it."],
  ["She feels safe being seen with her gifts but does not feel safe using them.", "You feel safe being seen with your gifts but do not feel safe using them."],
  ["Her body pulled inward when she read it. The thought stops her.", "Your body pulled inward when you read it. The thought stops you."],
  ["She's been doubting her work, and she's afraid it's wrong.", "You've been doubting your work, and you're afraid it's wrong."],
  ["She doesn't post, she isn't sure, she hasn't shared it and she wasn't ready.", "You don't post, you aren't sure, you haven't shared it and you weren't ready."],
  ["As a woman in business, she pushes. Women's circles help her.", "As a person in business, you push. People's circles help you."],
  ["Gifts are meant for God's role for her.", "Gifts are meant for God's role for you."],
  ["What would it take for her to share it?", "What would it take for you to share it?"],
];
for (const [a, b] of cases) eq(toSecondPersonRule(a), b, a);

// Quotes are never changed.
eq(toSecondPersonRule("Her mom said \"she never listens\" and she's tired."), "Your mom said \"she never listens\" and you're tired.");
eq(toSecondPersonRule("The thought 'what if her idea isn't right' stops her."), "The thought 'what if her idea isn't right' stops you.");
eq(toSecondPersonRule("She said “her voice matters” today."), "You said “her voice matters” today.");
eq(needsMemberVoiceFix("You said \"she knows\"."), false, "quoted she alone is fine");
eq(needsMemberVoiceFix("You want this; it's yours."), false);
eq(needsMemberVoiceFix("There, here, other, heart, sheer"), false, "no false word hits");

// Text with nothing to fix comes back identical, with no AI call.
{
  let calls = 0;
  const fields = { gap: "You want to be seen, and you pull back.", howItShowsUp: "" };
  const r = await ensureMemberVoice(fields, { create: async () => { calls++; return {}; }, log: false });
  eq(r.changed, false); eq(calls, 0); eq(r.fields.gap, fields.gap); eq(r.fields.howItShowsUp, "");
}

// AI edit used when it passes the checks.
{
  __clearMemberVoiceMemo();
  const gap = "She receives clear insight, but the thought 'what if it isn't right' stops her.";
  const good = "You receive clear insight, but the thought 'what if it isn't right' stops you.";
  const r = await ensureMemberVoice({ gap }, { create: async () => ({ content: [{ type: "text", text: JSON.stringify({ gap: good }) }] }), log: false });
  eq(r.how.gap, "ai"); eq(r.fields.gap, good);
}
// AI edit that changes a quote, leaves "her", or rewrites too much -> word rewrite.
for (const bad of [
  "You receive clear insight, but the thought 'what if you aren't right' stops you.",
  "You receive clear insight, but the thought 'what if it isn't right' stops her.",
  "You get insight. 'what if it isn't right'",
]) {
  __clearMemberVoiceMemo();
  const gap = "She receives clear insight, but the thought 'what if it isn't right' stops her.";
  const r = await ensureMemberVoice({ gap }, { create: async () => ({ content: [{ type: "text", text: JSON.stringify({ gap: bad }) }] }), log: false });
  eq(r.how.gap, "rule", bad);
  eq(r.fields.gap, "You receive clear insight, but the thought 'what if it isn't right' stops you.");
}
// AI error -> word rewrite, never throws.
{
  __clearMemberVoiceMemo();
  const r = await ensureMemberVoice({ a: "She hides her gifts." }, { create: async () => { throw new Error("timeout"); }, log: false });
  eq(r.how.a, "rule"); eq(r.fields.a, "You hide your gifts.");
}
// No API key and no client -> word rewrite.
{
  const saved = process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_API_KEY;
  const r = await ensureMemberVoice({ a: "She doubts herself.", b: "You already sound fine." }, { log: false });
  eq(r.fields.a, "You doubt yourself."); eq(r.how.b, "unchanged");
  if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
}
// Every word-rewrite output above is free of banned words outside quotes.
for (const [a] of cases) eq(needsMemberVoiceFix(toSecondPersonRule(a)), false, a);
// Line breaks kept.
eq(toSecondPersonRule("She stops.\n\nPrimary Shift: let her speak."), "You stop.\n\nPrimary Shift: let you speak.");

console.log(`member-voice: ${n} checks passed`);
