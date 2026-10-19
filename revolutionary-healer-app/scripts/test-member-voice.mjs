// Tests for lib/memberVoice.js (Shift card speaks to the member as "you").
// Run: node scripts/test-member-voice.mjs   (no network, no Airtable)
import assert from "node:assert/strict";
import { ensureMemberVoice, toSecondPersonRule, needsMemberVoiceFix, polishMemberVoice, __clearMemberVoiceMemo } from "../lib/memberVoice.js";

let n = 0;
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };
const BANNED = /\b(she|her|hers|herself|woman|women|girl|girls|lady|ladies)\b|\bshe['’]/i;

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
  ["As a woman in business, she pushes. Women's circles help her.", "As a healer in business, you push. Healers' circles help you."],
  ["As a woman in business, she doesn't trust herself.", "As a healer in business, you don't trust yourself."],
  ["Being a woman's voice in a room of women matters to her.", "Being a healer's voice in a room of healers matters to you."],
  ["As a girl she learned to stay quiet; now the ladies in her circle look to her.", "As a healer you learned to stay quiet; now the healers in your circle look to you."],
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
eq(toSecondPersonRule("She said \"as a woman I matter\" and she's a woman who leads."), "You said \"as a woman I matter\" and you're a healer who leads.", "woman inside quotes untouched");

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
// AI edit that picks a role word from the card is used.
{
  __clearMemberVoiceMemo();
  const gap = "As a woman who coaches other coaches, she shrinks her prices.";
  const good = "As a coach who coaches other coaches, you shrink your prices.";
  const r = await ensureMemberVoice({ gap }, { create: async () => ({ content: [{ type: "text", text: JSON.stringify({ gap: good }) }] }), log: false });
  eq(r.how.gap, "ai"); eq(r.fields.gap, good);
}
// AI edit that uses "person" as the replacement is refused -> word rewrite ("healer").
{
  __clearMemberVoiceMemo();
  const gap = "As a woman in business, she doesn't trust herself.";
  const r = await ensureMemberVoice({ gap }, { create: async () => ({ content: [{ type: "text", text: JSON.stringify({ gap: "As a person in business, you don't trust yourself." }) }] }), log: false });
  eq(r.how.gap, "rule"); eq(r.fields.gap, "As a healer in business, you don't trust yourself.");
  eq(/\bperson\b/i.test(r.fields.gap), false);
}
// "person" already in the member's text is allowed to stay (not a replacement).
{
  __clearMemberVoiceMemo();
  const gap = "She is the person everyone calls first.";
  const good = "You are the person everyone calls first.";
  const r = await ensureMemberVoice({ gap }, { create: async () => ({ content: [{ type: "text", text: JSON.stringify({ gap: good }) }] }), log: false });
  eq(r.how.gap, "ai");
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
// Every word-rewrite output above is free of banned words outside quotes, and never says "person".
for (const [a] of cases) { eq(needsMemberVoiceFix(toSecondPersonRule(a)), false, a); eq(/\bperson/i.test(toSecondPersonRule(a)), false, a); }
// Line breaks kept.
eq(toSecondPersonRule("She stops.\n\nPrimary Shift: let her speak."), "You stop.\n\nPrimary Shift: let yourself speak.");

// ---- Oct 19 tightening: agreement, doubled role words, instructions, capitals ----
const tight = [
  // reflexive agrees with its own subject (the known slip)
  ["She believes a good mom doesn't take time for herself, so she cancels her own sessions.", "You believe a good parent doesn't take time for themselves, so you cancel your own sessions."],
  ["She believes a woman doesn't take time for herself.", "You believe a healer doesn't take time for themselves."],
  ["Every woman she mentors trusts herself.", "Every healer you mentor trusts themselves."],
  ["Her mom doesn't take time for herself.", "Your mom doesn't take time for themselves."],
  ["As a parent of three, she puts her family first and keeps nothing for herself.", "As a parent of three, you put your family first and keep nothing for yourself."],
  ["As a mother of three, she puts her family first.", "As a parent of three, you put your family first."],
  // doubled role words
  ["As a woman healer, she shrinks.", "As a healer, you shrink."],
  ["Women entrepreneurs like her undercharge.", "Entrepreneurs like you undercharge."],
  ["Female founders rush, and she rushes too.", "Founders rush, and you rush too."],
  ["As a woman in business who is a healer, she waits.", "As a healer in business, you wait."],
  ["As a healer, she, as a woman, gives.", "As a healer, you give."],
  // verb agreement after the swap
  ["She, too, is tired.", "You, too, are tired."],
  ["She herself knows.", "You yourself know."],
  ["She tries, fails and tries again.", "You try, fail and try again."],
  ["She often finishes and then publishes.", "You often finish and then publish."],
  ["She focuses on others and never applies it.", "You focus on others and never apply it."],
  ["She was taught to give; she has given ever since.", "You were taught to give; you have given ever since."],
  // instructions to the member use "yourself"; possessives stay "your"
  ["Primary Shift: Give her permission to rest.", "Primary Shift: Give yourself permission to rest."],
  ["Today, allow her to rest.", "Today, allow yourself to rest."],
  ["Trust her to rest.", "Trust yourself to rest."],
  ["Let her work be seen before it feels finished.", "Let your work be seen before it feels finished."],
  ["Primary Shift: Let her creations be seen.", "Primary Shift: Let your creations be seen."],
  ["Show her work today.", "Show your work today."],
  ["She doesn't like her work.", "You don't like your work."],
  // a reflexive in the next clause belongs to "you" (seen in a real GAP run, Oct 19)
  ["She deletes the episodes before anyone hears them -- silencing herself first.", "You delete the episodes before anyone hears them -- silencing yourself first."],
  ["She waits until everyone is served, then forgets herself.", "You wait until everyone is served, then forget yourself."],
  ["She gives to every client — and keeps nothing for herself.", "You give to every client — and keep nothing for yourself."],
  // capitals at a sentence start
  ["She feels it. her body knows.", "You feel it. Your body knows."],
];
for (const [a, b] of tight) {
  const got = toSecondPersonRule(a);
  eq(got, b, a);
  eq(needsMemberVoiceFix(got), false, "clean: " + a);
  eq(/\bperson\b|\b(\w+) \1\b|for yourself(?=.*\bthemselves)/i.test(got), false, "no person/doubled words: " + a);
}
// A "you" card that still calls the member "a mother" is fixed too; "your mom" is someone else.
eq(needsMemberVoiceFix("You've decided sounding confident as a mother and healer means sounding like 'too much'."), true);
eq(toSecondPersonRule("You've decided sounding confident as a mother and healer means sounding like 'too much'."), "You've decided sounding confident as a parent and healer means sounding like 'too much'.");
eq(toSecondPersonRule("As a wife and a coach, you give first."), "As a partner and a coach, you give first.");
eq(needsMemberVoiceFix("Your mom said you were too much."), false);
eq(needsMemberVoiceFix("You learned it from your mother, a good teacher."), false);
// Quotes stay word for word even with the tidy-up.
eq(toSecondPersonRule("She said \"I'm a woman who gives\" and she gives to herself last."), "You said \"I'm a woman who gives\" and you give to yourself last.");
eq(toSecondPersonRule("She repeats 'a good mom doesn't take time for herself' to herself."), "You repeat 'a good mom doesn't take time for herself' to yourself.");
// The tidy-up also fixes an AI edit that slipped (the Oct 17 example), and is used as "ai".
{
  __clearMemberVoiceMemo();
  const gap = "As a mother of three, she puts her family first. She believes a good mom doesn't take time for herself, so she cancels her own sessions.";
  const slipped = "As a parent of three, you put your family first. You believe a good parent doesn't take time for yourself, so you cancel your own sessions.";
  const r = await ensureMemberVoice({ gap }, { create: async () => ({ content: [{ type: "text", text: JSON.stringify({ gap: slipped }) }] }), log: false });
  eq(r.how.gap, "ai");
  eq(r.fields.gap, "As a parent of three, you put your family first. You believe a good parent doesn't take time for themselves, so you cancel your own sessions.");
}
{
  __clearMemberVoiceMemo();
  const gap = "As a woman healer, she knows it. As a healer, she, as a woman, doubts it.";
  const doubled = "As a healer healer, you know it. As a healer, you, as a healer, doubt it.";
  const r = await ensureMemberVoice({ gap }, { create: async () => ({ content: [{ type: "text", text: JSON.stringify({ gap: doubled }) }] }), log: false });
  eq(r.fields.gap, "As a healer, you know it. As a healer, you doubt it.");
}
// Tidy-up leaves good "you" text alone.
for (const ok of ["You delete the episodes before anyone hears them -- silencing yourself first.", "You believe you don't deserve time for yourself.", "Give yourself one session today.", "Your sister says she is too much.", "You are the person everyone calls first.", "Your people-pleasing keeps you small."]) eq(polishMemberVoice(ok), ok, ok);

console.log(`member-voice: ${n} checks passed`);
