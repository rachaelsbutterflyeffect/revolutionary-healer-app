// Member-facing chat behavior that has to be the same every time:
// a listen debrief, a starter chip, a recommendation that matches the
// Shift the app already saved, and an honest activation match.
// Activations and codes come from the library. Nothing here invents one.

import { activationCatalog, activationHref, classifyIntent, repairLookupMiss, resolveLookup } from "./codeChat.js";
import { RETIRED_EMBODY_CODE } from "./recodeDeck.js";

const FEELING_WORDS = [
  "calmer", "calm", "lighter", "heavier", "heavy", "peaceful", "peace", "sad", "emotional",
  "anxious", "anxiety", "tired", "sleepy", "relief", "relieved", "softer", "soft", "quiet",
  "grounded", "shaky", "numb", "relaxed", "tingly", "warm", "cold", "better", "worse", "weird", "open",
];

const RECENT_LISTEN =
  /\b(?:the |that |my )?activation i just\b|\bi just (?:did|listened|finished|played|heard)\b|\bjust (?:did|listened to|finished) (?:the |that |an |my )?(?:activation|one|it)\b|\b(?:after|because of|from) (?:the |that |my )?(?:activation|listen)\b|\b(?:in|during) (?:an|the|that|my) activation\b/i;

const ASKING_NEXT =
  /\b(?:what should i|recommend|another activation|next activation|where is|where do i find|how do i find|do you have|can i listen|which activation|new activation|code card)\b/i;

const FEELING_SIGNAL =
  /\b(felt|feeling|feels|feel|calmer|heavy|lighter|yawn|yawns|anxious|anxiety|peaceful|sad|relief|tired|shaky|numb|relaxed)\b/i;

// Lane chips from the home chat (scripts/ui-refresh/refresh.js LANES).
// slug must exist in the activation catalog. line is one plain sentence.
// question is the one gentle question that follows the activation.
const STARTER_CHIPS = {
  "i feel disconnected today": {
    slug: "remembrance-activation",
    line: "It is a listen for coming back to who you are under the noise.",
    question: "Where do you feel that disconnect?",
  },
  "trusting my intuition": {
    slug: "intuition-activation",
    line: "It is a listen for trusting what you already know.",
    question: "When did you know something and then talk yourself out of it?",
  },
  "seeing signs": {
    slug: "clairvoyance-activation",
    line: "It is a listen for inner sight.",
    question: "What kind of sign have you been noticing?",
  },
  "opening my channel": {
    slug: "activating-your-channel-to-spirit",
    line: "It is a listen for opening the way you hear guidance.",
    question: "What gets in the way when you try to listen?",
  },
  "not sure yet": {
    slug: "grounding",
    line: "You are not sure yet, so start with a simple listen that brings you back into your body.",
    question: "What feels off right now?",
  },
  "receiving more": {
    slug: "prosperity-flow-activation",
    line: "It is a listen for letting money come in and stay.",
    question: "Where does receiving feel tight?",
  },
  "charging my worth": {
    slug: "confidence-activation",
    line: "It is a listen for saying your price without talking yourself out of it.",
    question: "What price do you want to say?",
  },
  "calm around money": {
    slug: "prosperity-flow-activation",
    line: "It is a listen for when money makes your body brace.",
    question: "Where do you feel it when money comes up?",
  },
  "clearing old stories": {
    slug: "clearing-activation",
    line: "It makes room when an old story feels heavy.",
    question: "Which old story feels the loudest?",
  },
  "more energy": {
    slug: "light-frequency-activation",
    line: "It is a short listen for when you feel dim and want your light back.",
    question: "Do you want more energy in your body, or a lighter mood?",
  },
  "calm my nervous system": {
    slug: "nervous-system-recalibration",
    line: "It is a listen for when rest feels hard.",
    question: "What happens when you try to rest?",
  },
  focus: {
    slug: "grounding",
    line: "It is a listen for when your mind is in too many places.",
    question: "What keeps pulling you away?",
  },
  confidence: {
    slug: "confidence-activation",
    line: "It is a listen for showing up when you start to shrink.",
    question: "Where do you shrink when it is time to speak?",
  },
  "clear the static": {
    slug: "clearing-activation",
    line: "It is a listen for when everything feels noisy.",
    question: "Does the noise feel like it is in your head, or like you picked it up?",
  },
  "i'm ready to show up": {
    slug: "expansion-activation",
    line: "It is a listen for taking up the space you are ready to be seen in.",
    question: "Where are you ready to be seen first?",
  },
  "fear of judgment": {
    slug: "confidence-activation",
    line: "It is a listen for showing up when you are worried what people will think.",
    question: "Whose opinion gets loud?",
  },
  "sharing my message": {
    slug: "throat-chakra-activation",
    line: "It is a listen for saying what is true.",
    question: "What have you been keeping back?",
  },
  "growing my impact": {
    slug: "impact-vibe-booster",
    line: "It is a short listen for the people your work is here to help.",
    question: "Who do you want this to reach?",
  },
};

const CHIP_WRAP = /^(.*?)\s+\(Rachael asked:\s*"([^"]*)"\)\s+(.+)$/s;

const RECALIBRATION_SLUG = "nervous-system-recalibration";
const EXPANSION_SLUG = "nervous-system-expansion";
const GRIEF_TOPIC = /\b(grief|grieving|bereave\w*|mourning|stacked loss|someone died|passed away)\b/i;
// Broad words Rachael asked for. They do not steal money, business, clients,
// visibility, or a code. Grief stays with the grief rule.
const NSE_BROAD = /\b(?:presence|be present|feel safe|safety|grounding|ground myself|grounded|expand(?:ing|ed)?|expansion)\b/i;
const NSE_OFF_TOPIC = /\b(?:money|income|business|clients?|visibility|codes?)\b/i;
const NSE_CORE = /\b(?:nervous system|fight\s*\/?\s*flight|fight or flight|fawn|shut\s*down|overwhelm(?:ed)?|anxiet(?:y|ies)|anxious|on edge|can'?t relax|cannot relax|unsafe(?: in (?:my |the )?body)?|don'?t feel safe(?: in (?:my |the )?body)?|do not feel safe|not feeling present|can'?t feel present|not present|come back to (?:the )?present|come back to now|here and now|not feeling grounded|don'?t feel grounded|brac(?:ed|ing)|freeze)\b/i;

function matchesNervousExpansion(text) {
  const value = String(text || "");
  if (GRIEF_TOPIC.test(value)) return false;
  if (NSE_CORE.test(value)) return true;
  return NSE_BROAD.test(value) && !NSE_OFF_TOPIC.test(value);
}

const TOPIC_RULES = [
  {
    id: "nervous-expansion",
    strength: "strong",
    slug: EXPANSION_SLUG,
    test: { test: matchesNervousExpansion },
    line: (title) => `${title} is the listen for this. It brings your body, your emotions and your mind back to right now, where it is safe to stop bracing and expand.`,
  },
  {
    id: "boundary",
    strength: "strong",
    slug: "protection-shielding",
    test: /\b(boundar(?:y|ies)|shield(?:ing)?|absorb(?:ing|ed)?\b.{0,40}\b(?:energy|everyone|people)|other people'?s energy)\b/i,
    line: (title) => `${title} is the one for this. It helps you stay open without taking on what is not yours.`,
  },
  {
    id: "grief",
    strength: "closest",
    slug: "soul-retrieval",
    test: /\b(grief|grieving|bereave\w*|mourning|stacked loss|someone died|passed away)\b/i,
    line: (title) =>
      `I don't have an activation just for grief. ${title} is the closest one in the library. It is for parts of you that got left in past pain. It will not take the grief away.`,
  },
  {
    id: "symptom",
    strength: "closest",
    slug: "grounding",
    test: /\b(symptom|dizzy|dizziness|light-?headed|nausea|nauseous|surgery|headache)\b/i,
    line: (title) =>
      `I don't have an activation for a body symptom. ${title} is the closest listen. It is for when you feel scattered. It is not a treatment for the symptom.`,
  },
];

const INVENTED_ACTIVATION = /\b([A-Z][\w'’&+-]*(?:\s+[A-Z][\w'’&+-]*){0,8}\s+(?:Activation|Booster))\b/g;

function coreTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b(activation|booster|the|and)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function sameActivationTitle(a, b) {
  const left = coreTitle(a);
  const right = coreTitle(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const x = left.split(" ").filter(Boolean);
  const y = right.split(" ").filter(Boolean);
  if (x.length < 2 || y.length < 2) return false;
  const [shorter, longer] = x.length <= y.length ? [x, y] : [y, x];
  return shorter.every((token) => longer.includes(token));
}

function catalogOf(catalog) {
  return catalog || activationCatalog();
}

export function activationsNamedIn(text, catalog) {
  const lower = String(text || "").toLowerCase();
  const found = [];
  const titles = [...catalogOf(catalog)].sort((a, b) => String(b.title).length - String(a.title).length);
  for (const activation of titles) {
    const title = String(activation?.title || "");
    if (title && lower.includes(title.toLowerCase())) found.push(activation);
  }
  return found;
}

function shiftRow(shift) {
  const fields = shift?.fields || shift || {};
  const recommended = String(fields.recommended_activation ?? fields.recommendedActivation ?? "").trim();
  const status = String(fields.progress_status ?? fields.progressStatus ?? "shifting").trim().toLowerCase();
  const manual = fields.manual_focus === true || fields.manualFocus === true;
  const time = Date.parse(fields.updated_at || fields.updatedAt || fields.created_at || fields.createdAt || "") || 0;
  return { recommended, status, manual, time };
}

/** The activation already chosen on Today's Focus, or the latest Shifting Shift. */
export function currentRecommendation(shifts) {
  const rows = (Array.isArray(shifts) ? shifts : []).map(shiftRow).filter((row) => row.recommended);
  const pinned = rows.filter((row) => row.manual).sort((a, b) => b.time - a.time);
  if (pinned.length) return pinned[0].recommended;
  const open = rows.filter((row) => row.status !== "embodied").sort((a, b) => b.time - a.time);
  return open[0]?.recommended || "";
}

export function recommendationPromptNote(shifts) {
  const title = currentRecommendation(shifts);
  if (!title) return "";
  return `\n\nHER CURRENT RECOMMENDATION: ${title}. This is the activation already chosen for her on her latest Shift or Today's Focus. When you recommend an activation, recommend this one unless she clearly asks for something else. If you recommend a different one, say why in one plain sentence, and name ${title} so she can see what changed.\n`;
}

function feelingWord(message) {
  const text = String(message || "").toLowerCase();
  const stated = text.match(/\b(?:felt|feels|feeling|feel)\s+([a-z]+)/);
  if (stated && FEELING_WORDS.includes(stated[1])) return stated[1];
  for (const word of FEELING_WORDS) {
    if (new RegExp(`\\b${word}\\b`).test(text)) return word;
  }
  if (/\byawns?\b/.test(text)) return "yawny";
  return "";
}

function reflectFeeling(feeling) {
  if (feeling === "anxiety") return "You felt anxious";
  if (feeling === "peace") return "You felt peaceful";
  if (feeling === "yawny") return "You noticed more yawns";
  if (!feeling) return "You noticed something from that listen";
  return `You felt ${feeling}`;
}

/**
 * A report of how a listen just felt. The reply reflects that and asks
 * what she noticed. It does not offer the next card.
 * Returns null when this message should stay on the normal path.
 */
const JUST_DID = /\b(?:i|you) just (?:did|listened(?: to)?|finished|played|heard)\b/i;

function recentListen(text) {
  return RECENT_LISTEN.test(text) || JUST_DID.test(text);
}

function mentionsRecalibration(text) {
  return /\b(?:nervous system recalibrat\w*|recalibration|calibration)\b/i.test(String(text || ""));
}

/** Completions (marked listened or the player finishing) or a finished play. */
export function recalibrationIsComplete(input) {
  const completedSlugs = (input && input.completedSlugs) || [];
  const finishedSlugs = (input && input.finishedSlugs) || [];
  return [...completedSlugs, ...finishedSlugs].map((slug) => String(slug || "")).includes(RECALIBRATION_SLUG);
}

function expansionFollowOn(catalog) {
  const activation = catalogOf(catalog).find((item) => item.slug === EXPANSION_SLUG);
  if (!activation?.title) return "";
  return `You've already done Nervous System Recalibration. Your next step is ${activation.title}.${listenLink(activation)}`;
}

export function listenDebriefReply(message, { previousAssistant = "" } = {}) {
  const text = String(message || "").trim();
  const earlier = String(previousAssistant || "");
  const recent = recentListen(text) || recentListen(earlier);
  if (!text || ASKING_NEXT.test(text) || !recent || !FEELING_SIGNAL.test(text)) return null;
  const feeling = feelingWord(text);
  const reflected = reflectFeeling(feeling);
  const head = feeling && feeling !== "yawny" ? `${reflected} after that listen.` : `${reflected}.`;
  const reply = `${head} What did you notice?`;
  if (!mentionsRecalibration(`${earlier}\n${text}`)) return reply;
  const href = activationHref(EXPANSION_SLUG);
  const link = href ? `\n\nIf you want to try it, [click here](${href}).` : "";
  return `${reply}\n\nYour next listen is Nervous System Expansion.${link}`;
}

export function parseStarterChip(message) {
  const raw = String(message || "").trim();
  if (!raw) return null;
  const wrapped = raw.match(CHIP_WRAP);
  const text = wrapped ? wrapped[3].trim() : raw;
  const key = text.toLowerCase();
  if (!STARTER_CHIPS[key]) return null;
  if (!wrapped && text !== raw) return null;
  return { topic: wrapped ? wrapped[1].trim() : "", text, key };
}

export function starterChipReply(message, { catalog, savedTitle = "", recalibrationDone = false } = {}) {
  const chip = parseStarterChip(message);
  if (!chip) return null;
  const spec = STARTER_CHIPS[chip.key];
  const list = catalogOf(catalog);
  if (chip.key === "calm my nervous system" && recalibrationDone) {
    const next = expansionFollowOn(list);
    if (next) return next;
  }
  const activation = list.find((item) => item.slug === spec.slug);
  if (!activation?.title) return null;
  const saved = String(savedTitle || "").trim();
  const same = saved && sameActivationTitle(saved, activation.title);
  const title = same ? saved : activation.title;
  const why = saved && !same
    ? `Your latest Shift points to ${saved}. You picked “${chip.text},” so this one is for that instead.\n\n`
    : "";
  const href = activationHref(activation.slug);
  const link = href ? `\n\nIf you want to listen now, [click here](${href}).` : "";
  return `${why}Try the ${title} now. ${spec.line}${link}\n\n${spec.question}`;
}

export function matchRecommendationTopic(message, catalog, { recalibrationDone = false } = {}) {
  const text = String(message || "");
  const list = catalogOf(catalog);
  const hits = TOPIC_RULES.filter((rule) => rule.test.test(text));
  const rule = hits.find((item) => item.strength === "strong") || hits[0];
  if (!rule) return null;
  const activation = list.find((item) => item.slug === rule.slug);
  if (!activation?.title) return null;
  const followOn = recalibrationDone && rule.id === "nervous-expansion";
  return {
    id: rule.id,
    strength: rule.strength,
    activation,
    line: followOn
      ? `You've already done Nervous System Recalibration. Your next step is ${activation.title}.`
      : rule.line(activation.title),
  };
}

function listenLink(activation) {
  const href = activationHref(activation?.slug);
  return href ? `\n\nIf you want to try it, [click here](${href}).` : "";
}

function oversells(text) {
  return /\b(perfect for|exactly what|made for|just what you need|will (?:heal|fix|cure|take away)|this is the grief|for your grief)\b/i.test(String(text || ""));
}

function stripInventedActivations(text, catalog) {
  let removed = false;
  const out = String(text || "").replace(INVENTED_ACTIVATION, (phrase) => {
    const known = catalogOf(catalog).some((item) => sameActivationTitle(item.title, phrase) || item.title.toLowerCase() === phrase.toLowerCase());
    if (known) return phrase;
    removed = true;
    return "";
  });
  return {
    removed,
    text: out.replace(/[ \t]{2,}/g, " ").replace(/\s+([.,!?])/g, "$1").replace(/\(\s*\)/g, "").trim(),
  };
}

function stripInventedCodes(text, deck) {
  if (!Array.isArray(deck)) return { text: String(text || ""), stripped: false };
  let stripped = false;
  const out = String(text || "").replace(/\bcode\s*#?\s*(\d{4,6})\b/gi, (full, num) => {
    if (num === RETIRED_EMBODY_CODE || deck.some((card) => String(card.code) === num)) return full;
    stripped = true;
    return "";
  });
  return { text: out.replace(/[ \t]{2,}/g, " ").trim(), stripped };
}

function withoutTitles(text, activations) {
  const sentences = String(text || "").split(/(?<=[.!?])\s+/);
  return sentences
    .filter((sentence) => {
      const lower = sentence.toLowerCase();
      return !activations.some((item) => lower.includes(String(item.title || "").toLowerCase()));
    })
    .join(" ")
    .trim();
}

function applyTopicHonesty(text, message, catalog, { inventedRemoved = false, recalibrationDone = false } = {}) {
  const match = matchRecommendationTopic(message, catalog, { recalibrationDone });
  const named = activationsNamedIn(text, catalog);
  if (!match) {
    if (inventedRemoved && !/don't have an activation by that name/i.test(text)) {
      return `${text}\n\nI don't have an activation by that name.`.trim();
    }
    return text;
  }
  if (!named.length && !inventedRemoved) {
    if (match.id === "nervous-expansion" && match.strength === "strong") {
      return `${text}\n\n${match.line}${listenLink(match.activation)}`.trim();
    }
    return text;
  }
  const wrong = named.filter((item) => item.slug !== match.activation.slug);
  const hasRight = named.some((item) => item.slug === match.activation.slug);
  const pitch = `${match.line}${listenLink(match.activation)}`;
  const loose = wrong.length || (match.strength === "closest" && (oversells(text) || !hasRight)) || (match.strength === "strong" && !hasRight);
  if (!loose) return text;
  const kept = withoutTitles(text, wrong);
  if (!kept || oversells(kept) || !kept.toLowerCase().includes(match.activation.title.toLowerCase())) {
    return kept && !oversells(kept) ? `${kept}\n\n${pitch}`.trim() : pitch;
  }
  return kept;
}

function isRecommendation(text, title) {
  const escaped = String(title || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!escaped) return false;
  return new RegExp(
    `(?:try|listen to|start with|recommend|go with|open|pull up|use)\\s+(?:the\\s+)?${escaped}|${escaped}\\s+(?:is the one|is the closest|is for|will|can help|tonight|now|is perfect)`,
    "i"
  ).test(String(text || ""));
}

function messageNamesOtherActivation(message, savedTitle, catalog) {
  return activationsNamedIn(message, catalog).some((item) => !sameActivationTitle(item.title, savedTitle));
}

function clearReasonToChange(message, savedTitle, catalog) {
  const text = String(message || "");
  if (parseStarterChip(text)) return true;
  if (messageNamesOtherActivation(text, savedTitle, catalog)) return true;
  if (/\b(?:not that one|something else|different activation)\b/i.test(text)) return true;
  if (/\b(?:don'?t|do not)\s+want\s+(?:the |that |this )?(?:nervous|activation|one|it)\b/i.test(text)) return true;
  const topic = matchRecommendationTopic(text, catalog);
  if (topic && !sameActivationTitle(topic.activation.title, savedTitle)) return true;
  return false;
}

function explainsChange(reply, savedTitle) {
  const text = String(reply || "");
  if (!/\bbecause\b/i.test(text)) return false;
  return text.toLowerCase().includes(String(savedTitle || "").toLowerCase()) || sameActivationTitle(text, savedTitle);
}

function changeBecause(message, savedTitle, catalog) {
  const topic = matchRecommendationTopic(message, catalog);
  if (topic?.id === "grief") return `you are talking about grief, and ${savedTitle} is not for grief`;
  if (topic?.id === "symptom") return `you are talking about a body symptom, and ${savedTitle} is not a treatment for that`;
  if (topic?.id === "boundary") return `you are talking about boundaries, and ${savedTitle} is not the one for that`;
  const chip = parseStarterChip(message);
  if (chip) return `you picked “${chip.text}”`;
  const asked = activationsNamedIn(message, catalog).find((item) => !sameActivationTitle(item.title, savedTitle));
  if (asked) return `you asked for ${asked.title}`;
  return "what you just said is about something else";
}

/**
 * If this reply recommends an activation, it should be the one the app
 * already saved, unless the member clearly asked for something else.
 */
export function alignRecommendation(reply, { message = "", savedTitle = "", catalog } = {}) {
  const saved = String(savedTitle || "").trim();
  const text = String(reply || "");
  if (!saved) return text;
  const list = catalogOf(catalog);
  const others = activationsNamedIn(text, list)
    .filter((item) => !sameActivationTitle(item.title, saved))
    .filter((item) => isRecommendation(text, item.title));
  if (!others.length) return text;
  if (clearReasonToChange(message, saved, list)) {
    if (explainsChange(text, saved)) return text;
    return `${text.trim()}\n\nThis is different from ${saved} because ${changeBecause(message, saved, list)}.`;
  }
  const savedActivation = list.find((item) => sameActivationTitle(item.title, saved));
  const href = savedActivation ? activationHref(savedActivation.slug) : "";
  const link = href ? `\n\nIf you want to listen now, [click here](${href}).` : "";
  return `The one already picked for you is ${saved}. That is the one to try.${link}`;
}

/**
 * Last pass on a model reply: real lookup facts, no invented names,
 * honest topic matches, then the saved recommendation.
 * @param {string} reply
 * @param {{ message?: string, catalog?: any[]|null, deck?: any[]|null, savedTitle?: string, lookupReply?: string, recalibrationDone?: boolean }} [opts]
 */
export function finalizeMemberReply(reply, {
  message = "",
  catalog,
  deck = null,
  savedTitle = "",
  lookupReply = "",
  recalibrationDone = false,
} = {}) {
  const list = catalogOf(catalog);
  const intent = classifyIntent(message, deck || []);
  if (intent) {
    const factual = lookupReply || resolveLookup({
      message,
      deck,
      entitlement: { canUseTier: true, unlockedActivationSlugs: "ALL" },
      codePull: true,
    })?.reply;
    return repairLookupMiss(reply, factual);
  }
  const stripped = stripInventedActivations(reply, list);
  const codes = stripInventedCodes(stripped.text, deck);
  let text = codes.text;
  if (codes.stripped) {
    text = `${text}\n\nI can't match that number to a current code.`.trim();
  }
  text = applyTopicHonesty(text, message, list, { inventedRemoved: stripped.removed, recalibrationDone });
  return alignRecommendation(text, { message, savedTitle, catalog: list }).trim();
}
