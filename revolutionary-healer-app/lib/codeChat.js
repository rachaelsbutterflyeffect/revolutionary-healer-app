// Member-facing answers for Recode Deck codes and activations.
// Codes and activations stay separate: a code link opens the cards view,
// an activation link opens that activation.

import fs from "fs";
import path from "path";
import { ACTIVATIONS } from "./activations.js";
import { isActivationUnlocked } from "./entitlements.js";
import {
  CODES_LIST_PATH,
  DAILY_CODE_PATH,
  CURRENT_EMBODY_CODE,
  RETIRED_EMBODY_CODE,
  cardByCode,
  currentEmbodyCard,
  isCurrentEmbodyCode,
  isRetiredEmbodyCode,
  retiredRecord,
} from "./recodeDeck.js";

export const CODES_LIST_HREF = "#your-codes";

export const LOOKUP_UNAVAILABLE =
  "I can’t verify that code from chat yet, but that does not mean it isn’t valid. Check your codes in the app first. If it still isn’t showing there, support can check your account directly.";

export const AMBIGUOUS_ASK =
  "Are you looking for the code card or an activation to listen to?";

export const ACTIVATION_CLOSEST_LEAD_ENV = "ACTIVATION_CLOSEST_LEAD";
export const ACTIVATION_CLOSEST_LEAD_DEFAULT =
  "I don't have an activation just for that yet, but this one is really close to what you're feeling. Want to try it?";

export const SYMPTOM_GUARDRAIL_ENV = "SYMPTOM_GUARDRAIL";
export const SYMPTOM_GUARDRAIL_SENTENCE_ENV = "SYMPTOM_GUARDRAIL_SENTENCE";
export const SYMPTOM_GUARDRAIL_PLACEHOLDER =
  "DRAFT — pending Rachael's approval: What you're feeling in your body matters on its own. I'm not going to treat dizziness, lightheadedness, or a symptom tied to a surgery or medical history as only a pattern.";

const NEVER_LINK_SLUGS = new Set(["spirit-connection-activation"]);

// A lookup is a request to open or identify a code or activation.
// Mentioning "activation", "listen", "using", "numbers", or "method" in an
// ordinary sentence is not a request. Those stay on the coaching path.
const CODE_NUMBER = /(?<!\d)\d{4,6}(?!\d)/;
const CODE_REQUEST =
  /\b(?:where(?:'s| is)|what(?:'s| is)|which|open|show me|do i have|tell me about|can you (?:open|show|find|pull))\b[\s\S]{0,80}\b(?:codes?|cards?|numbers?)\b|\bwhere\s+(?:can|do|should)\s+i\s+find\b[\s\S]{0,60}\b(?:codes?|cards?)\b|\b(?:show me|open)\b[\s\S]{0,40}\b(?:that|the|my)\s+(?:code|card)\b|\b(?:i\s+)?(?:drew|pulled|drawn|draw)\b[\s\S]{0,80}\b(?:codes?|cards?)\b|\b(?:codes?|cards?)\b[\s\S]{0,40}\b(?:i\s+)?(?:drew|pulled|drawn)\b/i;
const ACTIVATION_REQUEST =
  /\b(?:where(?:'s| is)|where\s+(?:can|do|should)\s+i\s+find|what(?:'s| is)|which|open|show me|do i have|do you have|how do i find)\b[\s\S]{0,80}\bactivations?\b|\b(?:can|could|may)\s+i\s+(?:listen|play|hear)\b|\b(?:where|how)\s+(?:can|do)\s+i\s+(?:listen|play|hear)\b|\b(?:i\s+want\s+to|i'?d\s+like\s+to|let\s+me)\s+(?:listen|play|hear)\b|\bdo you have an activation\b/i;
const ANAPHORA =
  /\b(that|this|the)\s+(card|one|code)\b/i;
// Words that show up inside real titles but are not a title on their own.
const WEAK_TITLE_WORDS = new Set([
  "more", "than", "your", "with", "from", "into", "this", "that", "have", "been",
  "just", "like", "when", "what", "only", "over", "under", "above", "method", "gap",
]);
const PROGRAMMING =
  /\b(code|coding)\b[^.\n]{0,40}\b(site|website|web\s?page|app|html|css|javascript)\b|\b(site|website|html|css|javascript)\b[^.\n]{0,40}\b(code|coding)\b/i;

export function codeCardHref(code) {
  const n = String(code || "").trim();
  if (!/^\d{4,6}$/.test(n) || isRetiredEmbodyCode(n)) return "";
  return `#code-${n}`;
}

export function activationHref(slug) {
  const s = String(slug || "").trim().toLowerCase();
  if (!/^[a-z0-9-]{2,80}$/.test(s)) return "";
  return `#activation-${s}`;
}

export function playerActivationsFromHtml(html) {
  const out = [];
  const re = /['"]([a-z0-9-]{2,80})['"]\s*:\s*\{[^}]*?\btitle:\s*['"]([^'"]+)['"](?:[^}]*?\bdescription:\s*['"]([^'"]*)['"])?/g;
  let m;
  while ((m = re.exec(String(html || "")))) {
    out.push({ slug: m[1], title: m[2], description: m[3] || "", categories: [] });
  }
  return out;
}

function mergedActivations(activations) {
  if (activations) return activations;
  const map = new Map();
  for (const a of ACTIVATIONS) {
    if (a && a.slug && a.title) map.set(a.slug, a);
  }
  try {
    const html = fs.readFileSync(path.join(process.cwd(), "public", "app-refresh.html"), "utf8");
    for (const extra of playerActivationsFromHtml(html)) {
      if (!map.has(extra.slug)) map.set(extra.slug, extra);
    }
  } catch {
    // The library list still answers if the page file is unavailable.
  }
  return [...map.values()];
}

export function activationCatalog(activations = null) {
  return mergedActivations(activations)
    .filter((a) => a && a.slug && a.title && !NEVER_LINK_SLUGS.has(a.slug))
    .map((a) => ({
      slug: a.slug,
      title: a.title,
      description: a.description || "",
      categories: a.categories || [],
    }));
}

export function symptomGuardrailEnabled(env = process.env) {
  return String(env[SYMPTOM_GUARDRAIL_ENV] || "off").trim().toLowerCase() === "on";
}

export function symptomSentence(env = process.env) {
  const custom = env[SYMPTOM_GUARDRAIL_SENTENCE_ENV];
  return custom && String(custom).trim() ? String(custom).trim() : SYMPTOM_GUARDRAIL_PLACEHOLDER;
}

export function symptomTriggered(message) {
  const t = String(message || "");
  if (/\b(dizz(?:y|iness)|light[-\s]?headed(?:ness)?|vertigo|faint(?:ing|ed)?)\b/i.test(t)) return true;
  const symptom = /\b(pain|ache(?:s|ing)?|bleeding|swell(?:ing|ed)?|numb(?:ness)?|nausea|nauseous|short(?:ness)? of breath)\b/i.test(t);
  const medical = /\b(surgery|post-?op|operation|incision|medical history|diagnos(?:is|ed)|doctor|hospital|condition|injury|scar)\b/i.test(t);
  return symptom && medical;
}

export function applySymptomGuardrail(message, reply, env = process.env) {
  const triggered = symptomTriggered(message);
  if (!triggered || !symptomGuardrailEnabled(env)) {
    return { triggered, memberFacing: false, reply: String(reply || "") };
  }
  const line = symptomSentence(env);
  const note =
    "This is a physical symptom, so I'm not going to treat it as only a pattern. Please check with a doctor or qualified professional if you're dizzy, lightheaded, or this is in the same area as a surgery or medical history. I can sit with what this brings up after you know you're safe.";
  const base = String(reply || "").trim();
  const withLine = base.includes(line) ? base : `${line}\n\n${note}${base ? `\n\n${base}` : ""}`;
  return { triggered: true, memberFacing: true, reply: withLine };
}

export function closestLead(env = process.env) {
  const custom = env[ACTIVATION_CLOSEST_LEAD_ENV];
  return custom && String(custom).trim() ? String(custom).trim() : ACTIVATION_CLOSEST_LEAD_DEFAULT;
}

export function stripInternalIds(text) {
  return String(text || "")
    .replace(/\brec[A-Za-z0-9]{10,}\b/g, "")
    .replace(/\b(app|tbl|fld|sel)[A-Za-z0-9]{10,}\b/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([.,!?])/g, "$1");
}

const GENERIC_WORDS = new Set([
  "the", "and", "for", "you", "your", "this", "that", "with", "have", "what", "where", "can", "now",
  "one", "thing", "just", "about", "activation", "activations", "listen", "listening", "experience",
  "experiencing", "play", "playing", "using", "use", "code", "codes", "card", "cards", "number", "deck",
  "more", "than", "method", "gap",
]);

function words(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((w) => w.length > 3 && !GENERIC_WORDS.has(w));
}

function isJustCodeNumbers(text) {
  if (!CODE_NUMBER.test(text)) return false;
  const rest = String(text)
    .replace(/(?<!\d)\d{4,6}(?!\d)/g, " ")
    .replace(/\b(and|or|the|a|an|code|codes|card|cards|number|numbers|please|my)\b/gi, " ")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim();
  return rest.length === 0;
}

function isBareCodeReference(text) {
  return /^\s*(?:(?:the|that|this|my)\s+)?(?:number|numbers|code|card|deck)(?:\s+(?:thing|one))?\s*\??\s*$/i.test(String(text || "").trim());
}

// "Its a code 98321" / "code 98321" — a number the member is pointing at,
// not a sentence that happens to contain digits.
function isCodePointer(text) {
  return /^\s*(?:it(?:'?s|s)?|it is|this is|that(?:'?s| is)?|i mean)?\s*(?:a\s+)?(?:code|card|number)\s*(?:is\s+)?#?\s*\d{4,6}\s*[.!]?\s*$/i.test(
    String(text || "").trim()
  );
}

function isCodeLookup(text) {
  if (isJustCodeNumbers(text) || isBareCodeReference(text) || isCodePointer(text) || CODE_REQUEST.test(text)) return true;
  return CODE_NUMBER.test(text) && /\b(tell me about|what(?:'s| is)|where(?:'s| is)|which|open|show me|do i have|is this)\b/i.test(text);
}

function isActivationLookup(text) {
  return ACTIVATION_REQUEST.test(text);
}

function bareNameIntent(text, deck) {
  const trimmed = String(text || "").trim();
  // A bare name ("embody", "wealth"), not a sentence that happens to contain one.
  if (trimmed.length > 40) return null;
  const tokens = words(trimmed).filter((t) => !WEAK_TITLE_WORDS.has(t));
  if (!tokens.length || tokens.length > 3) return null;
  const codeHit = mentionedCodes(trimmed, deck).some((hit) => {
    const name = hit.card?.name || hit.retired?.name || "";
    const nameTokens = words(name);
    return nameTokens.length > 0 && tokens.every((t) => nameTokens.includes(t) || stemHit(t, { title: name }));
  });
  const actHit = scoreActivations(trimmed, activationCatalog()).some((scored) => {
    if (!scored.exact) return false;
    return tokens.every((t) => words(scored.activation.title).includes(t) || stemHit(t, scored.activation));
  });
  if (codeHit && actHit) return "ambiguous";
  if (codeHit) return "code";
  if (actHit) return "activation";
  return null;
}

export function classifyIntent(message, deck) {
  const text = String(message || "");
  if (!text.trim() || PROGRAMMING.test(text)) return null;
  const codeLookup = isCodeLookup(text);
  const activationLookup = isActivationLookup(text);
  if (codeLookup && activationLookup) return "ambiguous";
  if (codeLookup) return "code";
  if (activationLookup) return "activation";
  return bareNameIntent(text, deck);
}

function mentionedCodes(message, deck) {
  const out = [];
  const seen = new Set();
  const re = /(?<!\d)(\d{4,6})(?!\d)/g;
  let m;
  while ((m = re.exec(message))) {
    const code = m[1];
    if (seen.has(code)) continue;
    seen.add(code);
    if (isRetiredEmbodyCode(code)) out.push({ retired: retiredRecord(code), code });
    else {
      const card = cardByCode(deck, code);
      if (card) out.push({ card, code });
      else out.push({ unknown: code, code });
    }
  }
  const names = [...(deck || [])].sort((a, b) => b.name.length - a.name.length);
  const lower = message.toLowerCase();
  for (const card of names) {
    if (seen.has(card.code)) continue;
    const name = card.name.toLowerCase();
    const token = name.replace(/[^a-z0-9]+/g, " ").trim();
    const reName = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}\\b`, "i");
    if (reName.test(lower)) {
      seen.add(card.code);
      out.push({ card, code: card.code });
    }
  }
  return out;
}

function normalizeMatchText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// A title match is the activation's name, not its internal slug and not one
// short word taken from a longer title ("more", "method", "gap").
export function fullTitleMatch(message, activation) {
  const msg = normalizeMatchText(message);
  const title = normalizeMatchText(activation && activation.title);
  if (!msg || !title || title.length < 4) return false;
  if (title.length >= 8 && msg.includes(title)) return true;
  const core = title.replace(/\bactivations?\b/g, " ").replace(/\s+/g, " ").trim();
  if (!core) return false;
  if (core.includes(" ")) return core.length >= 8 && msg.includes(core);
  if (core.length < 5 || WEAK_TITLE_WORDS.has(core)) return false;
  const near = new RegExp(`\\b${core}\\b(?:\\s+\\w+){0,3}\\s+activations?\\b|\\bactivations?\\b(?:\\s+\\w+){0,3}\\s+${core}\\b`);
  return near.test(msg);
}

function stemHit(token, activation) {
  if (!token || token.length < 5 || WEAK_TITLE_WORDS.has(token)) return false;
  const blob = String(activation && activation.title || "").toLowerCase();
  const roots = [token];
  if (token.endsWith("y") && token.length > 4) roots.push(token.slice(0, -1));
  return roots.some((t) => t.length >= 4 && blob.includes(t));
}

export function scoreActivations(message, catalog) {
  const tokens = words(message);
  return catalog
    .map((a) => {
      const titleTokens = words(a.title);
      const blob = words(`${a.title} ${a.description} ${(a.categories || []).join(" ")}`);
      let score = 0;
      let exact = false;
      if (fullTitleMatch(message, a)) {
        score += 12;
        exact = true;
      }
      for (const t of tokens) {
        if (WEAK_TITLE_WORDS.has(t)) continue;
        if (titleTokens.includes(t) || stemHit(t, a)) {
          score += 5;
          if (t.length >= 5) exact = true;
        } else if (blob.includes(t)) score += 2;
      }
      return { activation: a, score, exact };
    })
    .sort((a, b) => b.score - a.score || a.activation.title.localeCompare(b.activation.title));
}

export function codeFacts(card, { held = [], entitlement = null, codePull = false, historyUnavailable = false } = {}) {
  const inclusion = card.paid ? "paid-unlock" : "included-with-membership";
  if (historyUnavailable) {
    return { inclusion, memberStatus: "unknown", activationUnlocked: false, heldRow: null };
  }
  const code = card.code;
  const heldRow = (held || []).find((h) => String(h.code) === code);
  const ent = entitlement || { canUseTier: false, unlockedActivationSlugs: [] };
  let memberStatus = "not yet unlocked";
  if (heldRow) memberStatus = "held";
  else if (codePull || ent.canUseTier) memberStatus = "unlocked";
  const slug = card.activationSlug;
  const activationUnlocked = !!(slug && isActivationUnlocked(slug, ent));
  return { inclusion, memberStatus, activationUnlocked, heldRow: heldRow || null };
}

function inclusionPhrase(inclusion) {
  return inclusion === "paid-unlock" ? "a paid unlock" : "included with your membership";
}

function statusPhrase(status) {
  if (status === "held") return "you hold this code";
  if (status === "unlocked") return "it's unlocked for you";
  if (status === "unknown") return "I can't check your own list from here yet";
  return "it is not yet unlocked for you";
}

export function renderCodeCard(card, facts) {
  const href = codeCardHref(card.code);
  const where = `You'll find it in ${CODES_LIST_PATH}. You can also pull a card from ${DAILY_CODE_PATH}.`;
  const unlocks = card.activationTitle
    ? `It pairs with ${card.activationTitle}, which is the activation this code unlocks. Next step: open the code card, then listen to ${card.activationTitle} when you want the activation itself.`
    : "This code doesn't have a paired activation in the library yet. Next step: open the code card and read it there.";
  const link = href ? `\n\n[Open the ${card.name} code card](${href})` : "";
  return `${card.name} is code ${card.code}. It's ${inclusionPhrase(facts.inclusion)}, and ${statusPhrase(facts.memberStatus)}. ${where} ${unlocks}${link}`;
}

function renderRetired(deck) {
  const current = currentEmbodyCard(deck);
  const href = current ? codeCardHref(current.code) : codeCardHref(CURRENT_EMBODY_CODE);
  const link = href ? `\n\n[Open the Embody code card](${href})` : "";
  return `${RETIRED_EMBODY_CODE} is a retired Embody code. It is not a current Embody code. The current Embody code is ${CURRENT_EMBODY_CODE}. You'll find it in ${CODES_LIST_PATH}.${link}`;
}

function renderUnknown(code) {
  return `I can't match ${code} to a current code. Double-check the digits and send it again.`;
}

function recentHeld(held, deck) {
  const sorted = [...(held || [])].sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
  for (const row of sorted) {
    const card = cardByCode(deck, row.code) || (deck || []).find((c) => c.name.toLowerCase() === String(row.name || "").toLowerCase());
    if (card && !isRetiredEmbodyCode(card.code)) return card;
  }
  return null;
}

export function buildCodeReply(message, { deck, held, entitlement, codePull, historyUnavailable = false }) {
  const hits = mentionedCodes(message, deck || []);
  const unknown = hits.filter((h) => h.unknown);
  const retired = hits.filter((h) => h.retired);
  const cards = hits.filter((h) => h.card).map((h) => h.card);
  if (!hits.length && ANAPHORA.test(message) && /\b(pull(?:ed|ing)?|drew|drawn|draw)\b/i.test(message)) {
    const recent = recentHeld(held, deck);
    if (recent) cards.push(recent);
  }
  if (!cards.length && !retired.length && unknown.length === 1 && hits.length === 1) {
    return { kind: "unknown-number", reply: renderUnknown(unknown[0].code) };
  }
  if (!cards.length && !retired.length && !unknown.length) {
    return {
      kind: "code-unspecified",
      reply: `I can open a code card for you. Send the number on it, or look in ${CODES_LIST_PATH}: [Your codes](${CODES_LIST_HREF}). I don't want to guess the wrong one.`,
    };
  }
  const parts = [];
  for (const card of cards) {
    if (isRetiredEmbodyCode(card.code) || !isCurrentEmbodyCode(card.code, deck) && card.name.toLowerCase() === "embody" && card.code !== CURRENT_EMBODY_CODE) {
      continue;
    }
    parts.push(renderCodeCard(card, codeFacts(card, { held, entitlement, codePull, historyUnavailable })));
  }
  for (const r of retired) parts.push(renderRetired(deck));
  for (const u of unknown) parts.push(renderUnknown(u.code));
  if (cards.some((c) => c.name.toLowerCase() === "embody")) {
    const only = currentEmbodyCard(deck);
    if (only && !cards.some((c) => c.code === only.code) && !parts.length) {
      parts.push(renderCodeCard(only, codeFacts(only, { held, entitlement, codePull, historyUnavailable })));
    }
  }
  return { kind: "code", reply: parts.filter(Boolean).join("\n\n") };
}

function listenLine(activation) {
  const href = activationHref(activation.slug);
  return `If you want to listen to it now, [click here](${href}).`;
}

function pairedFromDeck(message, deck, catalog) {
  const hits = mentionedCodes(message, deck || []).filter((h) => h.card && h.card.activationSlug);
  for (const hit of hits) {
    const found = catalog.find((a) => a.slug === hit.card.activationSlug);
    if (found) return found;
  }
  return null;
}

export function buildActivationReply(message, { catalog, env, deck = null }) {
  const paired = pairedFromDeck(message, deck, catalog);
  if (paired) {
    const about = paired.description ? ` ${paired.description}` : "";
    return { kind: "activation", reply: `${paired.title} is in the app.${about}\n\n${listenLine(paired)}` };
  }
  const ranked = scoreActivations(message, catalog);
  const best = ranked[0];
  const tokens = words(message);
  const strong = best && (best.exact || best.score >= 5);
  if (!tokens.length) {
    return {
      kind: "activation-unspecified",
      reply: `Tell me what you want to listen to, and I'll open that activation. ${AMBIGUOUS_ASK}`,
    };
  }
  if (strong && best.activation) {
    const a = best.activation;
    const about = a.description ? ` ${a.description}` : "";
    return {
      kind: "activation",
      reply: `${a.title} is in the app.${about}\n\n${listenLine(a)}`,
    };
  }
  const closest = best && best.score > 0 ? best.activation : catalog.find((a) => a.slug === "clearing-activation") || catalog[0];
  if (!closest) return { kind: "activation-none", reply: closestLead(env) };
  return {
    kind: "activation-closest",
    reply: `${closestLead(env)}\n\n${closest.title} is the closest activation in the library.${closest.description ? ` ${closest.description}` : ""}\n\n${listenLine(closest)}`,
  };
}

export function appendActivationLinks(reply, catalog = activationCatalog()) {
  let text = String(reply || "");
  const titles = [...catalog].sort((a, b) => b.title.length - a.title.length);
  const found = [];
  const lower = text.toLowerCase();
  for (const a of titles) {
    if (lower.includes(a.title.toLowerCase())) found.push(a);
  }
  for (const a of found.slice(0, 4)) {
    const href = activationHref(a.slug);
    if (!href || text.includes(href)) continue;
    text += `\n\nIf you want to listen to ${a.title} now, [click here](${href}).`;
  }
  return text;
}

/**
 * Deterministic chat answer for a code or activation question.
 * Returns null when the message should stay on the normal coaching path.
 */
/**
 * @param {{ message?: string, deck?: any[]|null, deckError?: boolean, held?: any[], entitlement?: any, codePull?: boolean, historyUnavailable?: boolean, env?: any, activations?: any[]|null }} [opts]
 */
export function resolveLookup({
  message,
  deck = null,
  deckError = false,
  held = [],
  entitlement = null,
  codePull = false,
  historyUnavailable = false,
  env = process.env,
  activations = null,
} = {}) {
  const catalog = activationCatalog(activations);
  const intent = classifyIntent(message, deck || []);
  if (!intent) return null;
  if (intent === "ambiguous") return { kind: "ambiguous", reply: AMBIGUOUS_ASK };
  if (intent === "code") {
    if (deckError || !deck) return { kind: "fallback", reply: LOOKUP_UNAVAILABLE };
    const built = buildCodeReply(message, { deck, held, entitlement, codePull, historyUnavailable });
    return built;
  }
  return buildActivationReply(message, { catalog, env, deck });
}

export function normalizeReplyText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

export function isSameCannedReply(reply, previousAssistant) {
  const next = normalizeReplyText(reply);
  const prev = normalizeReplyText(previousAssistant);
  return !!next && next === prev;
}

function incidentalFacts(message, deck) {
  const parts = [];
  const seenCode = new Set();
  if (CODE_NUMBER.test(String(message || ""))) {
    for (const hit of mentionedCodes(message, deck)) {
      if (hit.retired) {
        parts.push(`${RETIRED_EMBODY_CODE} is a retired Embody code. The current Embody code is ${CURRENT_EMBODY_CODE}. Link: ${codeCardHref(CURRENT_EMBODY_CODE)}.`);
        seenCode.add(hit.code);
      } else if (hit.card) {
        const href = codeCardHref(hit.card.code);
        parts.push(`${hit.card.name} is code ${hit.card.code}.${href ? ` Link: ${href}.` : ""}`);
        seenCode.add(hit.card.code);
      }
    }
  }
  const seenSlug = new Set();
  for (const activation of activationCatalog()) {
    if (!fullTitleMatch(message, activation) || seenSlug.has(activation.slug)) continue;
    seenSlug.add(activation.slug);
    const href = activationHref(activation.slug);
    const card = (deck || []).find((c) => c.activationSlug === activation.slug);
    const codeBit = card && !seenCode.has(card.code)
      ? ` Paired code: ${card.name} ${card.code}${codeCardHref(card.code) ? ` (${codeCardHref(card.code)})` : ""}.`
      : "";
    parts.push(`${activation.title} is in the app.${href ? ` Link: ${href}.` : ""}${codeBit}`);
  }
  return parts.join("\n");
}

function groundingBody({ message, deck, found, held, entitlement, codePull, historyUnavailable, env, activations }) {
  if (found && (found.kind === "code" || found.kind === "activation" || found.kind === "unknown-number" || found.kind === "fallback")) {
    return found.reply;
  }
  if (found && found.kind === "ambiguous") {
    const catalog = activationCatalog(activations);
    const code = deck ? buildCodeReply(message, { deck, held, entitlement, codePull, historyUnavailable }) : null;
    const act = buildActivationReply(message, { catalog, env, deck });
    return [code && code.kind === "code" ? code.reply : "", act && act.kind === "activation" ? act.reply : ""]
      .filter(Boolean)
      .join("\n\n");
  }
  return incidentalFacts(message, deck);
}

export function formatGroundingNote(body, { asked = false } = {}) {
  const facts = String(body || "").trim();
  if (!facts) return "";
  if (asked) {
    return `\n\nCODE / ACTIVATION FACTS: The member asked about a code or activation during an ongoing conversation. Answer inside that conversation. Use only these facts for the number, the name, and the link. Point them to that link in the app. Do not invent a code. Do not say there is no record. Do not tell them to email anyone. Do not drop the rest of what they asked.\n${facts}\n`;
  }
  return `\n\nCODE / ACTIVATION FACTS (background only — do not make this the reply): A real code or activation was mentioned. Answer what the member actually asked. Do not send an activation card or a code card as your reply. If you name it, use only this:\n${facts}\n`;
}

const ASKED_FACT_KINDS = new Set(["code", "activation", "unknown-number", "fallback", "ambiguous"]);

/**
 * Canned lookup replies are only for a clear lookup that opens the conversation.
 * Inside a conversation, or when the canned text would repeat the previous
 * bot reply, the model answers and is given the real code or activation facts.
 * @param {{ message?: string, deck?: any[]|null, deckError?: boolean, held?: any[], entitlement?: any, codePull?: boolean, historyUnavailable?: boolean, env?: any, activations?: any[]|null, priorMessageCount?: number, previousAssistant?: string }} [opts]
 */
export function planLookupDelivery({
  message,
  deck = null,
  deckError = false,
  held = [],
  entitlement = null,
  codePull = false,
  historyUnavailable = false,
  env = process.env,
  activations = null,
  priorMessageCount = 0,
  previousAssistant = "",
} = {}) {
  const found = resolveLookup({
    message,
    deck,
    deckError,
    held,
    entitlement,
    codePull,
    historyUnavailable,
    env,
    activations,
  });
  const repeat = !!(found && found.reply && isSameCannedReply(found.reply, previousAssistant));
  const inConversation = Number(priorMessageCount) > 0;
  if (found && found.reply && !inConversation && !repeat) {
    return { delivery: "canned", reply: found.reply, kind: found.kind, note: "" };
  }
  const body = groundingBody({ message, deck, found, held, entitlement, codePull, historyUnavailable, env, activations });
  const asked = !!(found && ASKED_FACT_KINDS.has(found.kind));
  return {
    delivery: "ai",
    reply: null,
    kind: found ? found.kind : null,
    note: formatGroundingNote(body, { asked }),
    factualReply: found?.reply || "",
  };
}

export function forbiddenLookupLanguage(text) {
  return /\b(no record|may not exist|does(?:n'?t| not) exist|email support|email rachael|email me|does not exist)\b|rachaelsbutterflyeffect@gmail\.com/i.test(String(text || ""));
}

/**
 * If the model answered a real lookup by saying there is no record or by
 * sending the member to email, use the deck answer instead.
 * @param {string} modelReply
 * @param {string} lookupReply
 */
export function repairLookupMiss(modelReply, lookupReply) {
  const factual = String(lookupReply || "").trim();
  if (!factual) return String(modelReply || "");
  const model = String(modelReply || "");
  if (!forbiddenLookupLanguage(model)) return model;
  return factual;
}
