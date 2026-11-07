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

const NEVER_LINK_SLUGS = new Set(["spirit-connection-activation"]);

const CODE_CUE =
  /\b(draw|drew|drawn|pull(?:ed|ing)?|deck|cards?|numbers?|digits?|codes?)\b/i;
const ACTIVATION_CUE =
  /\b(listen(?:ing)?|experience|experiencing|use|using|play(?:ing)?|activation|hear it)\b/i;
const ANAPHORA =
  /\b(that|this|the)\s+(card|one|code)\b/i;
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
]);

function words(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((w) => w.length > 3 && !GENERIC_WORDS.has(w));
}

export function classifyIntent(message, deck) {
  const text = String(message || "");
  if (!text.trim() || PROGRAMMING.test(text)) return null;
  const codeCue = CODE_CUE.test(text) || /(?<!\d)\d{4,6}(?!\d)/.test(text);
  const activationCue = ACTIVATION_CUE.test(text);
  if (codeCue && activationCue) return "ambiguous";
  if (codeCue) return "code";
  if (activationCue) return "activation";
  // A bare name ("embody", "wealth") is a lookup only when the message is short.
  // Longer notes stay on the normal coaching path.
  if (String(text).trim().length > 80) return null;
  const codeHit = mentionedCodes(text, deck).some((c) => c.card || c.retired);
  const actHit = scoreActivations(text, activationCatalog()).some((s) => s.exact);
  if (codeHit && actHit) return "ambiguous";
  if (codeHit) return "code";
  if (actHit) return "activation";
  return null;
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

function stemHit(token, activation) {
  const blob = `${activation.title} ${activation.slug}`.toLowerCase();
  const roots = [token];
  if (token.endsWith("y") && token.length > 4) roots.push(token.slice(0, -1));
  return roots.some((t) => t.length >= 4 && blob.includes(t));
}

export function scoreActivations(message, catalog) {
  const tokens = words(message);
  return catalog
    .map((a) => {
      const titleTokens = words(a.title);
      const blob = words(`${a.title} ${a.description} ${a.categories.join(" ")}`);
      let score = 0;
      let exact = false;
      for (const t of tokens) {
        if (titleTokens.includes(t) || stemHit(t, a)) {
          score += 5;
          exact = true;
        } else if (blob.includes(t)) score += 2;
      }
      const title = a.title.toLowerCase();
      if (tokens.length && tokens.every((t) => title.includes(t) || stemHit(t, a))) exact = true;
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

export function forbiddenLookupLanguage(text) {
  return /\b(no record|may not exist|does(?:n'?t| not) exist|email support|does not exist)\b/i.test(String(text || ""));
}
