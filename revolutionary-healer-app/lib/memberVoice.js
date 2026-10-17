// Member voice guard for saved Shift text (Oct 17 2026, Rachael's rule).
//
// Rachael's hard rule: generated text about a member never uses gendered
// pronouns or "woman/women". A Shift card speaks to the member as "you".
// Since the Oct 16 launch, some AI-written Shifts were saved as "She feels...
// her gifts...", because the GAP Method instructions (which stay untouched)
// and older chat rules never said which voice to write the card in, and most
// of the coaching instructions describe the member as "she".
//
// This guard runs on the Shift text right before it is saved (chat Save
// Shift / Update Shift, GAP Method Shift, Code Upgrade Shift). It never
// touches the GAP instructions or the GAP reveal shown on screen; it only
// changes the wording that is written to the member's Shift card.
//
//   * Text with no she/her/hers/herself/woman/women outside quotation marks
//     is returned exactly as it came in (no AI call, no change at all).
//   * Otherwise one short AI edit turns the member into "you" (pronouns and
//     verb agreement only). The edit is only used if every quoted phrase
//     survives word for word, the length stays about the same, and no
//     she/her/woman/women is left outside quotes.
//   * If that edit fails or doesn't pass, a word-by-word rewrite is used
//     instead (she feels -> you feel, her gifts -> your gifts, herself ->
//     yourself, a woman / girl / lady -> a healer, women / girls / ladies ->
//     healers, woman's -> healer's). The AI edit instead picks a role word
//     from the card itself ("coach", "creator", "parent"...), never "person".
//   * Anything inside quotation marks (the member's own words) is never
//     changed by either step.
//   * Never throws: on any error the word-by-word rewrite (or, failing
//     that, the original text) is saved, so a save can never be lost.
import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5";
const AI_TIMEOUT_MS = 10000; // one attempt only (no SDK retries), then the word rewrite
let anthropic = null;
function client() {
  if (!anthropic) anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return anthropic;
}

// Gendered nouns (woman/women/girl/lady...) count too (Rachael, Oct 17).
const BANNED_RE = /\b(she|her|hers|herself|woman|women|girl|girls|lady|ladies)\b|\b(she)['’](s|d|ll|ve)\b/i;
const PERSON_RE = /\bpersons?\b/gi;

// ---------------------------------------------------------------------------
// Quotes: split text into [{ q: false, t }, { q: true, t: '"..."' }, ...].
// Double quotes (straight or curly) always count as quotes. A single quote
// only counts as an opening quote at the start of a word (after a space,
// bracket or line start) and as a closing quote at the end of one, so
// apostrophes (she's, don't, members') are never mistaken for quotes.
// ---------------------------------------------------------------------------
export function splitQuotes(text) {
  const s = String(text ?? "");
  const out = [];
  let buf = "";
  let i = 0;
  const push = (q, t) => { if (t) out.push({ q, t }); };
  while (i < s.length) {
    const c = s[i];
    let close = -1;
    if (c === '"') close = s.indexOf('"', i + 1);
    else if (c === "“") close = s.indexOf("”", i + 1);
    else if ((c === "'" || c === "‘") && (i === 0 || /[\s(\[—–-]/.test(s[i - 1])) && /\S/.test(s[i + 1] || "")) {
      const closer = c === "‘" ? "’" : "'";
      for (let j = i + 1; j < s.length; j++) {
        if (s[j] === "\n") break;
        if (s[j] === closer && /\S/.test(s[j - 1]) && (j + 1 >= s.length || /[\s.,;:!?)\]—–-]/.test(s[j + 1]))) { close = j; break; }
      }
    }
    if (close > i) {
      push(false, buf); buf = "";
      push(true, s.slice(i, close + 1));
      i = close + 1;
    } else {
      buf += c; i++;
    }
  }
  push(false, buf);
  return out;
}

const outsideQuotes = (text) => splitQuotes(text).filter((p) => !p.q).map((p) => p.t).join(" ");
const quotedParts = (text) => splitQuotes(text).filter((p) => p.q).map((p) => p.t);

export function needsMemberVoiceFix(text) {
  return typeof text === "string" && BANNED_RE.test(outsideQuotes(text));
}

// ---------------------------------------------------------------------------
// Word-by-word rewrite (fallback, and the only step in tests / offline).
// ---------------------------------------------------------------------------
const ADVERBS = new Set(["never", "always", "still", "just", "only", "also", "often", "already", "even", "then", "now", "rarely", "sometimes", "usually", "immediately", "instantly", "quickly", "quietly", "actually", "really", "genuinely", "consciously", "subconsciously", "unconsciously", "automatically", "simply", "truly", "deeply", "fully", "clearly", "consistently", "repeatedly", "constantly", "naturally", "physically", "energetically", "emotionally", "mentally", "intuitively", "deeply", "finally", "first", "no", "longer", "not", "almost", "barely", "hardly", "secretly", "visibly", "openly", "privately", "publicly", "quietly", "suddenly", "eventually", "partly", "mostly", "fully", "very", "so", "too"]);
const IRREGULAR = { is: "are", was: "were", has: "have", does: "do", goes: "go", "isn't": "aren't", "wasn't": "weren't", "hasn't": "haven't", "doesn't": "don't", "isn’t": "aren’t", "wasn’t": "weren’t", "hasn’t": "haven’t", "doesn’t": "don’t" };
// Common verbs, so a verb with no "she" right before it ("She feels it and
// trusts it") is still matched, without turning nouns into verbs.
const COMMON_VERBS = new Set("abandon allow apologize ask avoid back become believe block build carry censor charge chase check choose claim close come commit compare contract crave create decide defend deflect delay depend dim dismiss doubt drop edit explain express fear feel filter find follow freeze get give go guard hand hide hope ignore judge keep know launch lead leave let long look lose love make market move mute need notice offer open overthink override own permit plan play post price procrastinate protect prove pull push put question reach realize receive redirect rely retreat return rush say second-guess see seek sell sense settle share show shrink shut sit soften speak start step stop struggle take tell think trust try turn use wait want withdraw wish wonder work worry write".split(" "));

function matchCase(src, word) {
  if (src === src.toUpperCase() && src.length > 1 && /[A-Z]/.test(src)) return word.toUpperCase();
  return /^[A-Z]/.test(src) ? word[0].toUpperCase() + word.slice(1) : word;
}

export function thirdToBase(w) {
  const lw = w.toLowerCase();
  if (IRREGULAR[lw]) return matchCase(w, IRREGULAR[lw]);
  if (!/^[a-z-]+$/i.test(w) || lw.length < 3 || !lw.endsWith("s") || /(ss|us|is)$/.test(lw)) return w;
  if (/ies$/.test(lw)) return w.slice(0, lw.length <= 4 ? -1 : -3) + (lw.length <= 4 ? "" : "y");
  if (/(sses|shes|ches|xes|zzes|oes)$/.test(lw)) return w.slice(0, -2);
  return w.slice(0, -1);
}

// After these, "her" is "you" (the object), not "your": end of clause,
// prepositions, articles and conjunctions.
const HER_OBJECT_NEXT = new Set("to for from with about at in on into onto and or but nor that the a an back up down out off away more less like as than so this these those it its when if because before after too again through over anything something nothing everything what how why who where while until unless whether feel feeling think realize know be is was".split(" "));
// "let her trust", "makes her doubt", "helps her see": object, but only
// when a verb follows ("helps her work" stays "helps your work" otherwise).
const HER_OBJECT_PREV = new Set("let lets letting make makes made making help helps helped helping".split(" "));

function rewriteSegment(seg) {
  const toks = seg.match(/[A-Za-z]+(?:[-'’][A-Za-z]+)*|[^A-Za-z]+/g) || [];
  const isWord = (t) => /^[A-Za-z]/.test(t);
  const nextWordIdx = (i) => { for (let j = i + 1; j < toks.length; j++) { if (isWord(toks[j])) return j; if (/[.!?;:,()\n—–]/.test(toks[j])) return -1; } return -1; };
  const prevWord = (i) => { for (let j = i - 1; j >= 0; j--) { if (isWord(toks[j])) return toks[j].toLowerCase(); if (/[.!?;:\n]/.test(toks[j])) return ""; } return ""; };
  let subjectInSentence = false;
  const conjVerbAt = (i) => {
    // optional adverbs, then the verb
    let j = nextWordIdx(i);
    while (j > 0 && ADVERBS.has(toks[j].toLowerCase())) j = nextWordIdx(j);
    return j;
  };
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (!isWord(t)) { if (/[.!?\n]/.test(t)) subjectInSentence = false; continue; }
    const lt = t.toLowerCase().replace(/’/g, "'");
    if (lt === "she" || /^she'(s|d|ll|ve)$/.test(lt)) {
      const apos = t.includes("’") ? "’" : "'";
      if (lt === "she") {
        toks[i] = matchCase(t, "you");
        const j = conjVerbAt(i);
        if (j > 0) toks[j] = thirdToBase(toks[j]);
      } else if (lt === "she's") {
        const j = conjVerbAt(i);
        const nx = j > 0 ? toks[j].toLowerCase() : "";
        toks[i] = matchCase(t, /^(been|got|gotten|had|done|seen|felt|made|found|spent|lost|tried|started|stopped|learned|built|come|become)$/.test(nx) ? `you${apos}ve` : `you${apos}re`);
      } else {
        toks[i] = matchCase(t, `you${apos}${lt.split("'")[1]}`);
      }
      subjectInSentence = true;
      continue;
    }
    if (lt === "herself") { toks[i] = matchCase(t, "yourself"); continue; }
    if (lt === "hers") { toks[i] = matchCase(t, "yours"); continue; }
    if (lt === "her") {
      const j = nextWordIdx(i);
      const nx = j > 0 ? toks[j].toLowerCase() : "";
      const obj = j < 0 || HER_OBJECT_NEXT.has(nx) || (HER_OBJECT_PREV.has(prevWord(i)) && COMMON_VERBS.has(nx));
      toks[i] = matchCase(t, obj ? "you" : "your");
      continue;
    }
    // Rachael (Oct 17): gendered nouns become "healer" here ("As a healer in
    // business"); the AI edit picks a role from the card's own context instead.
    if (/^(woman|girl|lady)$/.test(lt)) { toks[i] = matchCase(t, "healer"); continue; }
    if (/^(women|girls|ladies)$/.test(lt)) { toks[i] = matchCase(t, "healers"); continue; }
    if (/^(woman|girl|lady)'s$/.test(lt)) { toks[i] = matchCase(t, "healer's"); continue; }
    if (/^(women|girls|ladies)'s$/.test(lt) || /^(girls|ladies)'$/.test(lt)) { toks[i] = matchCase(t, "healers'"); continue; }
    // "You feel energy and trusts it" -> "and trust it" (only common verbs).
    if (subjectInSentence && /^(and|but|or|then|yet)$/.test(lt)) {
      const j = conjVerbAt(i);
      if (j > 0) {
        const base = thirdToBase(toks[j]).toLowerCase();
        if (base !== toks[j].toLowerCase() && (COMMON_VERBS.has(base) || IRREGULAR[toks[j].toLowerCase()])) toks[j] = thirdToBase(toks[j]);
      }
    }
  }
  return toks.join("");
}

export function toSecondPersonRule(text) {
  if (typeof text !== "string" || !text) return text;
  return splitQuotes(text).map((p) => (p.q ? p.t : rewriteSegment(p.t))).join("");
}

// ---------------------------------------------------------------------------
// AI edit (primary when a fix is needed).
// ---------------------------------------------------------------------------
const AI_SYSTEM = `You copy-edit short notes on a coaching member's Shift card so they speak directly to the member. Rewrite each field so the member is addressed as "you" ("you", "your", "yours", "yourself").

Change ONLY what that requires: words that refer to the member (she, her, hers, herself, he, him, his, himself, "the member", "this member", "the healer") become you/your/yourself, and the verbs that go with them change to match (she feels -> you feel, she is -> you are, she doesn't -> you don't). Gendered nouns (woman, women, girl, girls, lady, ladies, female) never appear: replace each one with a role word that is specific to what THIS card is about, taken from the card's own words and context -- for example "healer" ("As a woman in business" -> "As a healer in business"), "coach", "creator", "parent", "mentor", "leader", "teacher". Keep the grammar right ("a woman" -> "a healer", "women" -> "healers", "woman's" -> "healer's", "women's" -> "healers'"). Never use the word "person" (or "persons"), and never use another gendered word (mom, mother, wife, daughter, sister, girl, lady) as the replacement. If no role is clear from the card, use "healer". Gendered words that describe the member themself (for example "as a mother" or "a good mom" meaning the member, "wife") also become the fitting role word ("as a parent", "a good parent", "partner"); gendered words for other people in the member's life ("your mom said", "your sister") stay as they are. Do not add, remove, reorder or reword anything else, and keep every line break. Copy everything inside quotation marks exactly as written, character for character. Words about someone other than the member (for example the member's mother or client) stay as they are.

Reply with only a JSON object that has exactly the same keys as the one you are given.`;

const memo = new Map(); // raw JSON -> rewritten fields (same text in = same text out on this instance)

function aiResultOk(before, after) {
  if (typeof after !== "string" || !after.trim()) return false;
  if (needsMemberVoiceFix(after)) return false;
  // Never "person" as a replacement: no more "person" outside quotes than before.
  if ((outsideQuotes(after).match(PERSON_RE) || []).length > (outsideQuotes(before).match(PERSON_RE) || []).length) return false;
  const r = after.length / Math.max(1, before.length);
  if (r < 0.85 || r > 1.2) return false;
  for (const q of quotedParts(before)) if (!after.includes(q)) return false;
  if ((before.match(/\n/g) || []).length !== (after.match(/\n/g) || []).length) return false;
  return true;
}

async function aiRewrite(fields, { create } = {}) {
  const key = JSON.stringify(fields);
  if (memo.has(key)) return memo.get(key);
  const call = create || ((params, opts) => client().messages.create(params, opts));
  const resp = await call(
    // Light edit: lowest thinking setting (same as the GAP Step 2 chat turns).
    { model: MODEL, max_tokens: 4000, system: AI_SYSTEM, messages: [{ role: "user", content: key }], output_config: { effort: "low" } },
    { timeout: AI_TIMEOUT_MS, maxRetries: 0 }
  );
  const text = (resp.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  const m = text.match(/\{[\s\S]*\}/);
  const parsed = m ? JSON.parse(m[0]) : null;
  if (memo.size > 200) memo.clear();
  memo.set(key, parsed);
  return parsed;
}

// fields: { name: text }. Returns { fields, changed, how } where how per
// field is "unchanged" | "ai" | "rule". Never throws.
export async function ensureMemberVoice(fields, { ai = true, create, log = true, label = "shift" } = {}) {
  const out = { ...fields };
  const how = {};
  const todo = {};
  for (const [k, v] of Object.entries(fields || {})) {
    if (needsMemberVoiceFix(v)) todo[k] = v;
    else how[k] = "unchanged";
  }
  if (!Object.keys(todo).length) return { fields: out, changed: false, how };
  let aiOut = null;
  if (ai && (create || process.env.ANTHROPIC_API_KEY)) {
    try { aiOut = await aiRewrite(todo, { create }); } catch (err) {
      console.warn("[member-voice] AI edit skipped; using word rewrite", err && err.message ? err.message : err);
    }
  }
  for (const [k, v] of Object.entries(todo)) {
    try {
      if (aiOut && aiResultOk(v, aiOut[k])) { out[k] = aiOut[k]; how[k] = "ai"; continue; }
      out[k] = toSecondPersonRule(v); how[k] = "rule";
    } catch (err) {
      out[k] = v; how[k] = "error";
    }
  }
  if (log) {
    try { console.info("[member-voice] " + JSON.stringify({ label, how })); } catch (e) {}
  }
  return { fields: out, changed: true, how };
}

// Tests only.
export function __clearMemberVoiceMemo() { memo.clear(); }
