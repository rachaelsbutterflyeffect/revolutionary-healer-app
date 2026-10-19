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
//   * A final tidy-up runs on either result (Oct 19): reflexives agree with
//     their subject ("a good parent doesn't take time for themselves"), no
//     doubled role words, "You" capitalised at a sentence start.
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
const BANNED_RE = /\b(she|her|hers|herself|woman|women|girl|girls|lady|ladies|female|females)\b|\b(she)['’](s|d|ll|ve)\b/i;
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
const IRREGULAR = { focuses: "focus", focusses: "focus", is: "are", was: "were", has: "have", does: "do", goes: "go", "isn't": "aren't", "wasn't": "weren't", "hasn't": "haven't", "doesn't": "don't", "isn’t": "aren’t", "wasn’t": "weren’t", "hasn’t": "haven’t", "doesn’t": "don’t" };
// Common verbs, so a verb with no "she" right before it ("She feels it and
// trusts it") is still matched, without turning nouns into verbs.
const COMMON_VERBS = new Set("abandon allow apologize apply ask avoid back become believe block brush build buy cancel care carry change cringe delete earn forget forgive hear hit raise record silence update censor charge chase check choose claim close coach come commit compare contract crave create decide defend deflect delay depend dim dismiss doubt drop edit explain express fail fear feel filter find finish focus follow freeze get give go guard hand help hide hope ignore judge keep know launch lead learn leave let listen long look lose love make market mentor miss move mute need notice offer open overthink override own pause permit plan play polish post price procrastinate protect prove publish pull push put question reach read realize receive redirect refuse rely reply rest retreat return run rush say second-guess see seek sell sense serve settle share show shrink shut sit soften speak start step stop struggle take teach tell think trust try turn undercharge use wait want watch withdraw wish wonder work worry write".split(" "));

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

// Instructions to the member where "her" means "yourself".
const IMPERATIVE_SELF = new Set("let allow give help remind tell ask trust forgive grant offer gift permit encourage invite".split(" "));
// Words that can be a noun or a verb; "Let her work be seen" is "your work".
const AMBIG_NOUN = new Set("work post plan love price play guard hand market back fear doubt rest step turn sense return offer question hope wish need share start voice".split(" "));
const AFTER_NOUN = new Set("be is was count counts matter matters speak show lead shine land stand go take come guide".split(" "));
const GIVE_LIKE = new Set("give grant offer gift allow permit".split(" "));
const SELF_GIFT_NEXT = new Set("permission time space grace credit room rest a an the one some more".split(" "));
const ROLE_NOUN_RE = /^(healers?|coach(es)?|creators?|entrepreneurs?|founders?|leaders?|mentors?|teachers?|practitioners?|owners?|business(es)?|bosses?|writers?|artists?|therapists?|clients?|colleagues?|friends?|peers?|members?|parents?|professionals?|experts?|speakers?|authors?|students?)$/i;
const ROLES = "healers?|coach(?:es)?|creators?|parents?|mentors?|leaders?|teachers?|partners?|entrepreneurs?|founders?|practitioners?|persons?|people|someone|anyone|everyone|no one|nobody|moms?|mothers?";

// The n-th word before token i ("" if a sentence break comes first).
function wordBefore(toks, i, n) {
  for (let j = i - 1; j >= 0; j--) {
    if (/^[A-Za-z]/.test(toks[j])) { if (--n === 0) return toks[j].toLowerCase(); continue; }
    if (/[.!?;:\n]/.test(toks[j])) return "";
  }
  return "";
}
// The word right after token j in the same clause ("" if none).
function wordAfter(toks, j) {
  for (let k = j + 1; k < toks.length; k++) { if (/^[A-Za-z]/.test(toks[k])) return toks[k].toLowerCase(); if (/[.!?;:,()\n—–]/.test(toks[k])) return ""; }
  return "";
}
// Word right before token i, skipping up to two adjectives ("a good mom").
function articleBefore(toks, i) {
  let seen = 0;
  for (let j = i - 1; j >= 0; j--) {
    if (/^[A-Za-z]/.test(toks[j])) { const w = toks[j].toLowerCase(); if (w === "a" || w === "an") return w; if (++seen > 2 || /^(your|her|my|his|their|our|the)$/.test(w)) return ""; continue; }
    if (!/^ +$/.test(toks[j])) return "";
  }
  return "";
}
// Token i's verb (the word before it) starts a sentence, a line, or follows
// a colon or a short lead-in like "Today," / "This week,".
function clauseInitial(toks, i) {
  let j = i - 1;
  while (j >= 0 && !/^[A-Za-z]/.test(toks[j])) j--; // the verb
  let k = j - 1;
  while (k >= 0 && /^ +$/.test(toks[k])) k--;
  if (k < 0 || /[.!?:\n]\s*$/.test(toks[k])) return true;
  if (/,\s*$/.test(toks[k])) {
    let m = k - 1, words = 0;
    while (m >= 0 && /^[A-Za-z]|^ +$/.test(toks[m])) { if (/^[A-Za-z]/.test(toks[m])) words++; m--; }
    return words <= 2 && (m < 0 || /[.!?:\n]\s*$/.test(toks[m]));
  }
  return false;
}

function rewriteSegment(seg) {
  const toks = seg.match(/[A-Za-z]+(?:[-'’][A-Za-z]+)*|[^A-Za-z]+/g) || [];
  const isWord = (t) => /^[A-Za-z]/.test(t);
  const nextWordIdx = (i) => { for (let j = i + 1; j < toks.length; j++) { if (isWord(toks[j])) return j; if (/[.!?;:,()\n—–]/.test(toks[j])) return -1; } return -1; };
  const prevWord = (i) => { for (let j = i - 1; j >= 0; j--) { if (isWord(toks[j])) return toks[j].toLowerCase(); if (/[.!?;:\n]/.test(toks[j])) return ""; } return ""; };
  let subjectInSentence = false;
  const conjVerbAt = (i) => {
    // optional adverbs (and "herself": "she herself knows"), then the verb
    let j = nextWordIdx(i);
    // a short aside right after the subject: "she, too, is" / "she, as a woman, gives"
    if (j < 0 && i + 1 < toks.length && /^\s*,\s*$/.test(toks[i + 1])) {
      for (let k = i + 2, words = 0; k < toks.length && words <= 5; k++) {
        if (isWord(toks[k])) { words++; continue; }
        if (/^\s*,\s*$/.test(toks[k])) { j = isWord(toks[k + 1] || "") ? k + 1 : -1; break; }
        if (/[.!?;:()\n—–]/.test(toks[k])) break;
      }
    }
    while (j > 0 && (ADVERBS.has(toks[j].toLowerCase()) || toks[j].toLowerCase() === "herself")) j = nextWordIdx(j);
    return j;
  };
  // "She tries, fails and tries again": verbs in a comma list after a converted verb.
  const convertListAfter = (j) => {
    let k = j;
    while (k + 2 < toks.length && /^,\s+$/.test(toks[k + 1]) && isWord(toks[k + 2])) {
      const w = toks[k + 2]; const base = thirdToBase(w).toLowerCase();
      if (base === w.toLowerCase() || !(COMMON_VERBS.has(base) || IRREGULAR[w.toLowerCase()])) break;
      toks[k + 2] = thirdToBase(w); k += 2;
    }
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
        if (j > 0) { toks[j] = thirdToBase(toks[j]); convertListAfter(j); }
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
      const pv = prevWord(i);
      // An instruction to the member ("Let her speak", "Give her permission",
      // "Today, allow her to rest"): the member is the one doing it, so "yourself".
      if (IMPERATIVE_SELF.has(pv) && clauseInitial(toks, i) &&
          (j < 0 || HER_OBJECT_NEXT.has(nx) || (GIVE_LIKE.has(pv) && SELF_GIFT_NEXT.has(nx)) ||
           (COMMON_VERBS.has(nx) && !AMBIG_NOUN.has(nx)))) {
        toks[i] = matchCase(t, "yourself");
        continue;
      }
      // "Founders like her rush": a comparison ("like her" + a verb), not "like your".
      const likeCompare = pv === "like" && COMMON_VERBS.has(nx) && !AMBIG_NOUN.has(nx) && !/^(you|i|we|they|don't|doesn't|didn't|do|does|would|really|also|still|she|he|not)$/.test(wordBefore(toks, i, 2));
      const obj = j < 0 || likeCompare || HER_OBJECT_NEXT.has(nx) || (HER_OBJECT_PREV.has(pv) && COMMON_VERBS.has(nx) && !(AMBIG_NOUN.has(nx) && AFTER_NOUN.has(wordAfter(toks, j))));
      toks[i] = matchCase(t, obj ? "you" : "your");
      continue;
    }
    // "woman healer", "women entrepreneurs", "female founders": the role word
    // is already there, so the gendered word is simply dropped (no "healer healer").
    if (/^(woman|women|girl|girls|lady|ladies|female|females)$/.test(lt)) {
      const j = nextWordIdx(i);
      if (j === i + 2 && /^ +$/.test(toks[i + 1]) && ROLE_NOUN_RE.test(toks[j])) {
        if (/^[A-Z]/.test(t)) toks[j] = toks[j][0].toUpperCase() + toks[j].slice(1);
        toks[i] = ""; toks[i + 1] = "";
        continue;
      }
    }
    // A gendered word for the member herself, after "a"/"as a" ("as a mother
    // of three", "a good mom"), becomes the role word; "your mom" stays.
    if (/^(mother|mom|mum|mama|wife)$/.test(lt) && /^(a|an)$/.test(articleBefore(toks, i))) {
      toks[i] = matchCase(t, lt === "wife" ? "partner" : "parent");
      continue;
    }
    // Rachael (Oct 17): gendered nouns become "healer" here ("As a healer in
    // business"); the AI edit picks a role from the card's own context instead.
    if (/^(woman|girl|lady|female)$/.test(lt)) { toks[i] = matchCase(t, "healer"); continue; }
    if (/^(women|girls|ladies|females)$/.test(lt)) { toks[i] = matchCase(t, "healers"); continue; }
    if (/^(woman|girl|lady)'s$/.test(lt)) { toks[i] = matchCase(t, "healer's"); continue; }
    if (/^(women|girls|ladies)'s$/.test(lt) || /^(girls|ladies)'$/.test(lt)) { toks[i] = matchCase(t, "healers'"); continue; }
    // "You feel energy and trusts it" -> "and trust it" (only common verbs).
    if (subjectInSentence && /^(and|but|or|then|yet)$/.test(lt)) {
      const j = conjVerbAt(i);
      if (j > 0) {
        const base = thirdToBase(toks[j]).toLowerCase();
        if (base !== toks[j].toLowerCase() && (COMMON_VERBS.has(base) || IRREGULAR[toks[j].toLowerCase()])) { toks[j] = thirdToBase(toks[j]); convertListAfter(j); }
      }
    }
  }
  return toks.join("");
}

export function toSecondPersonRule(text) {
  if (typeof text !== "string" || !text) return text;
  return polishMemberVoice(splitQuotes(text).map((p) => (p.q ? p.t : rewriteSegment(p.t))).join(""));
}

// ---------------------------------------------------------------------------
// Final tidy-up, run on both the AI edit and the word rewrite (outside quotes
// only), so the card reads naturally:
//   * a general statement keeps its own reflexive: "a good parent doesn't take
//     time for yourself" -> "...for themselves" ("you" sentences keep "yourself")
//   * no doubled role words: "a healer in business who is a healer" -> "a healer
//     in business"; "As a healer, you, as a healer, give" -> "As a healer, you give";
//     "healer healer" -> "healer"
//   * "you"/"your" at the start of a sentence is capitalised.
// ---------------------------------------------------------------------------
const REFLEXIVE_RE = new RegExp(`(?<![-'’])\\b((?:(?:a|an|every|each|any|no)\\s+(?:[A-Za-z-]+\\s+){0,2}?)?(?:${ROLES}))\\b(?![-'’])(\\s+(?:who|that)\\s+you\\s+[A-Za-z-]+)?((?:(?!\\byou(?:r|rs|['’]re|['’]ve|['’]ll|['’]d)?\\b|--)[^.!?;:,—–()\\n])*?)\\byourself\\b`, "gi");
function polishSegment(seg, atSentenceStart) {
  let s = seg;
  // reflexive agreement with a third-person subject ("a good parent ... themselves",
  // "your mom ... themselves"; leave "you ... yourself" alone). Only inside one
  // clause: a comma or dash ends it ("before anyone hears them -- silencing yourself").
  s = s.replace(REFLEXIVE_RE, (m, subj, rel, mid) => `${subj}${rel || ""}${mid}themselves`);
  s = s.replace(new RegExp(`\\b(your\\s+(?:${ROLES}))\\b((?:(?!\\byou(?:r|rs|['’]re|['’]ve|['’]ll|['’]d)?\\b|--)[^.!?;:,—–()\\n])*?)\\byourself\\b`, "gi"),
    (m, subj, mid) => `${subj}${mid}themselves`);
  // doubled role words
  s = s.replace(new RegExp(`\\b(an?\\s+)(${ROLES})(\\s+[^,.;:!?\\n]{1,40}?)?,?\\s+who\\s+(?:is|are)\\s+an?\\s+\\2\\b`, "gi"), (m, a, r, mid) => `${a}${r}${mid || ""}`);
  s = s.replace(new RegExp(`(\\bas\\s+an?\\s+(${ROLES})\\b[^.!?;\\n]*?)(?:,\\s*as\\s+an?\\s+\\2\\s*,|\\s+as\\s+an?\\s+\\2\\b)`, "gi"), (m, head) => head);
  s = s.replace(new RegExp(`\\b(${ROLES})(\\s+)\\1\\b`, "gi"), "$1");
  // capitalise you/your at a sentence start
  s = s.replace(/(^|[.!?]\s+|\n\s*)(you|your|yours|yourself)\b/g, (m, pre, w, off) => (off === 0 && !atSentenceStart ? m : pre + w[0].toUpperCase() + w.slice(1)));
  return s;
}
export function polishMemberVoice(text) {
  if (typeof text !== "string" || !text) return text;
  let prevEnd = "";
  return splitQuotes(text).map((p) => {
    const start = prevEnd === "" || /[.!?]\s*$|\n\s*$/.test(prevEnd);
    prevEnd = p.t;
    return p.q ? p.t : polishSegment(p.t, start);
  }).join("");
}

// ---------------------------------------------------------------------------
// AI edit (primary when a fix is needed).
// ---------------------------------------------------------------------------
const AI_SYSTEM = `You copy-edit short notes on a coaching member's Shift card so they speak straight to the member as "you" (you, your, yours, yourself). Make the smallest edit that reads naturally.

1. The member becomes "you". Words for the member (she, her, hers, herself, he, him, his, himself, "the member", "this member", "the healer") become you / your / yours / yourself, and the verbs agree: she is -> you are, she was -> you were, she has -> you have, she doesn't -> you don't, she feels and trusts -> you feel and trust. An instruction to the member uses "yourself": "Let her speak" -> "Let yourself speak", "Give her permission" -> "Give yourself permission". Capitalize "You"/"Your" at the start of a sentence.
2. Keep every sentence's grammar right after the swap. A general statement keeps its own subject and reflexive: "She believes a good mom doesn't take time for herself" -> "You believe a good parent doesn't take time for themselves" (never "a good parent ... yourself"). Words about other people stay about them ("her sister says she is too much" -> "your sister says she is too much").
3. No gendered nouns for the member (woman, women, girl, lady, female, mother, mom, wife). Use one role word that fits THIS card, from its own words: "healer in business", "healer", "coach", "creator", "parent", "mentor", "leader", "teacher", "partner". If nothing fits, use "healer". Never "person". If a role word is already next to the gendered word, just drop the gendered word ("a woman healer" -> "a healer", "women entrepreneurs" -> "entrepreneurs"). Never repeat a role word in the same sentence ("as a healer, you, as a healer" or "a healer in business who is a healer" are wrong). Gendered words for other people in the member's life ("your mom said", "your sister") stay as they are.
4. Change nothing else: no added, removed or reordered ideas, every line break kept, and everything inside quotation marks copied character for character.

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
      const edited = aiOut && typeof aiOut[k] === "string" ? polishMemberVoice(aiOut[k]) : null;
      if (edited && aiResultOk(v, edited)) { out[k] = edited; how[k] = "ai"; continue; }
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
