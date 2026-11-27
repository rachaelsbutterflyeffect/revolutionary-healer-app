// Acceptance tests for Recode Deck lookup, activation links, and the symptom guardrail.
import assert from "node:assert/strict";
import fs from "fs";
import {
  loadRecodeDeck,
  isCurrentEmbodyCode,
  currentEmbodyCard,
  CURRENT_EMBODY_CODE,
  RETIRED_EMBODY_CODE,
  CODES_LIST_PATH,
  DAILY_CODE_PATH,
} from "../lib/recodeDeck.js";
import {
  resolveLookup,
  codeFacts,
  classifyIntent,
  scoreActivations,
  planLookupDelivery,
  isSameCannedReply,
  symptomTriggered,
  symptomGuardrailEnabled,
  applySymptomGuardrail,
  SYMPTOM_GUARDRAIL_PLACEHOLDER,
  SYMPTOM_GUARDRAIL_ENV,
  SYMPTOM_GUARDRAIL_SENTENCE_ENV,
  ACTIVATION_CLOSEST_LEAD_DEFAULT,
  LOOKUP_UNAVAILABLE,
  AMBIGUOUS_ASK,
  stripInternalIds,
  forbiddenLookupLanguage,
  activationCatalog,
  codeCardHref,
} from "../lib/codeChat.js";
import { ACTIVATIONS } from "../lib/activations.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok", name); };
const deck = loadRecodeDeck();
const full = { canUseTier: true, unlockedActivationSlugs: "ALL" };
const lockedEnt = { canUseTier: false, unlockedActivationSlugs: [] };

function ask(message, extra = {}) {
  const found = resolveLookup({
    message,
    deck,
    held: extra.held || [],
    entitlement: extra.entitlement || full,
    codePull: extra.codePull !== false,
    historyUnavailable: !!extra.historyUnavailable,
    deckError: !!extra.deckError,
    env: extra.env || {},
  });
  assert.ok(found && found.reply, message);
  return found.reply;
}

t("deck is the canonical file and Embody is only 98321", () => {
  assert.ok(deck.length >= 40);
  const embody = deck.filter((c) => c.name.toLowerCase() === "embody");
  assert.deepEqual(embody.map((c) => c.code), [CURRENT_EMBODY_CODE]);
  assert.equal(isCurrentEmbodyCode("98321", deck), true);
  assert.equal(isCurrentEmbodyCode("61374", deck), false);
  assert.equal(currentEmbodyCard(deck).code, "98321");
  assert.equal(deck.some((c) => c.code === RETIRED_EMBODY_CODE), false);
  assert.equal(codeCardHref("61374"), "");
  assert.equal(codeCardHref("98321"), "#code-98321");
});

t("where is my Embody code", () => {
  const reply = ask("Where is my Embody code?");
  assert.match(reply, /Embody/);
  assert.match(reply, /98321/);
  assert.match(reply, new RegExp(CODES_LIST_PATH.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(reply, /#code-98321/);
  assert.doesNotMatch(reply, /61374/);
  assert.doesNotMatch(reply, /#code-61374/);
  assert.doesNotMatch(reply, /#activation-/);
  assert.equal(forbiddenLookupLanguage(reply), false);
});

t("98321 identifies Embody, what it unlocks, and the activation", () => {
  const reply = ask("98321");
  assert.match(reply, /Embody/);
  assert.match(reply, /98321/);
  assert.match(reply, /Embodiment Activation/);
  assert.match(reply, /Next step/);
  assert.match(reply, /#code-98321/);
  assert.doesNotMatch(reply, /#activation-/);
  assert.equal(forbiddenLookupLanguage(reply), false);
});

t("one included code and one not-yet-unlocked code, neither invalid", () => {
  const embody = deck.find((c) => c.code === "98321");
  const wealth = deck.find((c) => c.code === "88118");
  const heldFacts = codeFacts(embody, { held: [{ code: "98321" }], entitlement: lockedEnt, codePull: false });
  const lockedFacts = codeFacts(wealth, { held: [], entitlement: lockedEnt, codePull: false });
  assert.equal(heldFacts.inclusion, "included-with-membership");
  assert.equal(heldFacts.memberStatus, "held");
  assert.equal(lockedFacts.inclusion, "included-with-membership");
  assert.equal(lockedFacts.memberStatus, "not yet unlocked");
  const reply = ask("Tell me about 98321 and 88118", {
    held: [{ code: "98321", name: "Embody" }],
    entitlement: lockedEnt,
    codePull: false,
  });
  assert.match(reply, /included with your membership/);
  assert.match(reply, /you hold this code/);
  assert.match(reply, /not yet unlocked/);
  assert.match(reply, /88118/);
  assert.doesNotMatch(reply, /invalid|no record|does not exist|doesn't exist|email support/i);
});

t("random wrong number asks to double-check and invents nothing", () => {
  const reply = ask("123456");
  assert.match(reply, /123456/);
  assert.match(reply, /[Dd]ouble-check/);
  assert.match(reply, /can't match/);
  assert.doesNotMatch(reply, /Embody|Wealth|98321|Grounding/);
  assert.equal(forbiddenLookupLanguage(reply), false);
  assert.doesNotMatch(reply, /email support/i);
});

t("61374 is retired and is not a second current Embody code", () => {
  const reply = ask("61374");
  assert.match(reply, /retired/);
  assert.match(reply, /not a current Embody code/);
  assert.match(reply, /98321/);
  assert.match(reply, /#code-98321/);
  assert.doesNotMatch(reply, /#code-61374/);
  assert.doesNotMatch(reply, /current Embody code is 61374/);
  const both = ask("What is my Embody code, 98321 or 61374?");
  assert.match(both, /98321/);
  assert.match(both, /retired/);
  assert.doesNotMatch(both, /#code-61374/);
  const currentLines = both.split("\n").filter((line) => /current Embody code/i.test(line));
  assert.ok(currentLines.every((line) => line.includes("98321") && !/is 61374/.test(line)));
});

t("lookup failure uses the exact fallback and does not say there is no record", () => {
  const reply = resolveLookup({ message: "Where is my Embody code?", deck: null, deckError: true }).reply;
  assert.equal(reply, LOOKUP_UNAVAILABLE);
  assert.equal(forbiddenLookupLanguage(reply), false);
  assert.doesNotMatch(reply, /no record|may not exist|email support/i);
});

t("wealth draw uses held history and links to the cards view", () => {
  const reply = ask("I drew a wealth code the other day but didn't save it as a shift, can you show me that code?", {
    held: [{ code: "88118", name: "Wealth", at: "2026-11-01T00:00:00Z" }],
  });
  assert.match(reply, /Wealth/);
  assert.match(reply, /88118/);
  assert.match(reply, /#code-88118/);
  assert.match(reply, /you hold this code/);
  assert.doesNotMatch(reply, /#activation-/);
});

t("loose wording: that card I pulled", () => {
  const reply = ask("that card I pulled", {
    held: [{ code: "88118", name: "Wealth", at: "2026-11-02T00:00:00Z" }],
  });
  assert.equal(classifyIntent("that card I pulled", deck), "code");
  assert.match(reply, /Wealth/);
  assert.match(reply, /#code-88118/);
});

t("loose wording: the number thing does not invent a code", () => {
  const reply = ask("the number thing");
  assert.equal(classifyIntent("the number thing", deck), "code");
  assert.match(reply, /#your-codes/);
  assert.doesNotMatch(reply, /98321|88118|Embody|Wealth/);
});

t("loose wording: can I listen to the embody one", () => {
  const reply = ask("can I listen to the embody one");
  assert.equal(classifyIntent("can I listen to the embody one", deck), "activation");
  assert.match(reply, /Embodiment Activation/);
  assert.match(reply, /click here/);
  assert.match(reply, /#activation-embodiment-activation/);
  assert.doesNotMatch(reply, /#code-/);
});

t("ambiguous message asks instead of guessing", () => {
  const reply = ask("embody");
  assert.equal(reply, AMBIGUOUS_ASK);
  assert.doesNotMatch(reply, /#code-|#activation-/);
});

t("activation that is not in the library offers the closest real one", () => {
  const reply = ask("do you have an activation for my dishwasher");
  assert.match(reply, new RegExp(ACTIVATION_CLOSEST_LEAD_DEFAULT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const href = reply.match(/#activation-([a-z0-9-]+)/);
  assert.ok(href, reply);
  assert.ok(activationCatalog().some((a) => a.slug === href[1]));
  const page = fs.readFileSync(new URL("../public/app-refresh.html", import.meta.url), "utf8");
  assert.ok(ACTIVATIONS.some((a) => a.slug === href[1]) || page.includes(`'${href[1]}'`) || page.includes(`"${href[1]}"`));
  assert.doesNotMatch(reply, /does(?:n't| not) exist|no such|invalid/i);
});

t("no raw internal ids in lookup answers", () => {
  const dirty = stripInternalIds("Your shift recAbCdEfGhIjKlMn is appXYZXYZXYZXYZ and tblABCDEFGHIJK.");
  assert.doesNotMatch(dirty, /rec[A-Za-z0-9]{10,}|app[A-Za-z0-9]{10,}|tbl[A-Za-z0-9]{10,}/);
  for (const message of ["Where is my Embody code?", "98321", "can I listen to the embody one", "61374", "123456"]) {
    const reply = ask(message);
    assert.doesNotMatch(reply, /rec[A-Za-z0-9]{10,}/, message);
    assert.doesNotMatch(reply, /kajabiLessonId|wistiaId/, message);
  }
});

t("symptom guardrail is off unless enabled", () => {
  assert.equal(symptomTriggered("I feel dizzy and lightheaded"), true);
  assert.equal(symptomTriggered("I had shoulder surgery and that area still aches"), true);
  assert.equal(symptomTriggered("I keep looping the same pattern at work"), false);
  assert.equal(symptomGuardrailEnabled({}), false);
  assert.equal(symptomGuardrailEnabled({ [SYMPTOM_GUARDRAIL_ENV]: "off" }), false);
  const off = applySymptomGuardrail("I'm dizzy", "Let's look at the pattern underneath this.", {});
  assert.equal(off.memberFacing, false);
  assert.equal(off.reply, "Let's look at the pattern underneath this.");
  const on = applySymptomGuardrail("I'm dizzy and lightheaded", "This is just a pattern.", { [SYMPTOM_GUARDRAIL_ENV]: "on" });
  assert.equal(on.memberFacing, true);
  assert.match(on.reply, new RegExp(SYMPTOM_GUARDRAIL_PLACEHOLDER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(on.reply, /not going to treat it as only a pattern/);
  const custom = applySymptomGuardrail("I'm dizzy", "", {
    [SYMPTOM_GUARDRAIL_ENV]: "on",
    [SYMPTOM_GUARDRAIL_SENTENCE_ENV]: "CUSTOM SYMPTOM LINE",
  });
  assert.match(custom.reply, /CUSTOM SYMPTOM LINE/);
});

t("code upgrade card creation path is still in the app", () => {
  const shift = fs.readFileSync(new URL("../app/api/gap-shift/route.ts", import.meta.url), "utf8");
  const client = fs.readFileSync(new URL("../public/rf-codeshift.js", import.meta.url), "utf8");
  const deckFile = fs.readFileSync(new URL("../public/rf-codes.js", import.meta.url), "utf8");
  assert.match(shift, /source === "code-upgrade"/);
  assert.match(shift, /methodName: "Code Upgrade"/);
  assert.match(client, /source: 'code-upgrade'/);
  assert.match(deckFile, /rf:code-pulled/);
  assert.match(deckFile, /98321/);
  assert.doesNotMatch(deckFile, /61374/);
});

t("chat scroll and typewriter hooks are still in the page", () => {
  const page = fs.readFileSync(new URL("../public/app.html", import.meta.url), "utf8");
  assert.match(page, /function rhScrollToBottom/);
  assert.match(page, /function rhIsNearBottom/);
  assert.match(page, /rhFollowReply/);
  assert.match(page, /RH_FOLLOW_SLACK_PX = 80/);
  assert.match(page, /function rhSetTextWithLinks/);
  assert.match(page, /#your-codes/);
  assert.match(page, /rf-your-codes.js/);
});

const NOT_LOOKUPS = [
  "Can you log this into the same Shift? I'll do the Confidence Activation… Which client should I send it to?",
  "Thanks — I'll listen to the Confidence Activation. But which client should I start with?",
  "Let's set the activation aside… what is the GAP Method for?",
  "The activation I just did",
  "More yawns than I've had in an activation, my body felt heavy",
  "I keep using my phone at night and experiencing anxiety",
  "My numbers this month were terrible",
];

t("ordinary sentences are not lookups", () => {
  for (const message of NOT_LOOKUPS) {
    assert.equal(classifyIntent(message, deck), null, message);
    assert.equal(resolveLookup({ message, deck, entitlement: full, codePull: true }), null, message);
    const plan = planLookupDelivery({ message, deck, entitlement: full, codePull: true, priorMessageCount: 4 });
    assert.equal(plan.delivery, "ai", message);
    assert.equal(plan.reply, null, message);
  }
});

t("short words and internal names are not a title match", () => {
  const catalog = activationCatalog();
  const more = scoreActivations(NOT_LOOKUPS[4], catalog);
  assert.equal(more.some((s) => s.exact && s.activation.slug === "more-than-enough-activation"), false);
  const method = scoreActivations(NOT_LOOKUPS[2], catalog);
  assert.equal(method.some((s) => s.exact && /gap-method/.test(s.activation.slug)), false);
  const gap = scoreActivations("what is the GAP Method for?", catalog);
  assert.equal(gap.some((s) => s.exact && /gap-method/.test(s.activation.slug)), false);
  assert.equal(gap.some((s) => s.exact && s.activation.slug === "activating-your-gifts"), false);
});

t("a mentioned activation inside a sentence is background, not the reply", () => {
  for (const message of [NOT_LOOKUPS[0], NOT_LOOKUPS[1]]) {
    const plan = planLookupDelivery({ message, deck, entitlement: full, codePull: true, priorMessageCount: 4 });
    assert.equal(plan.delivery, "ai", message);
    assert.match(plan.note, /background only/, message);
    assert.match(plan.note, /#activation-confidence-activation/, message);
    assert.match(plan.note, /53778/, message);
    assert.doesNotMatch(plan.note, /#activation-gap-method/, message);
  }
  for (const message of NOT_LOOKUPS.slice(2)) {
    const plan = planLookupDelivery({ message, deck, entitlement: full, codePull: true, priorMessageCount: 4 });
    assert.equal(plan.note, "", message);
  }
});

t("clear lookups still answer from the deck", () => {
  const wealth = ask("what's code 88118?");
  assert.match(wealth, /Wealth/);
  assert.match(wealth, /88118/);
  assert.match(wealth, /#code-88118/);
  assert.equal(forbiddenLookupLanguage(wealth), false);

  const where = ask("where is the Confidence Activation?");
  assert.match(where, /Confidence Activation/);
  assert.match(where, /#activation-confidence-activation/);
  assert.doesNotMatch(where, /#activation-gap-method/);

  const open = ask("open my Embody code");
  assert.match(open, /Embody/);
  assert.match(open, /98321/);
  assert.match(open, /#code-98321/);
  assert.doesNotMatch(open, /61374/);
  assert.doesNotMatch(open, /#code-61374/);

  const have = ask("do I have the Confidence Activation?");
  assert.match(have, /Confidence Activation/);
  assert.match(have, /#activation-confidence-activation/);
});

t("a lookup inside a conversation goes to the model with the real facts", () => {
  const plan = planLookupDelivery({
    message: "what's code 88118?",
    deck,
    entitlement: full,
    codePull: true,
    priorMessageCount: 3,
  });
  assert.equal(plan.delivery, "ai");
  assert.match(plan.note, /88118/);
  assert.match(plan.note, /Wealth/);
  assert.match(plan.note, /#code-88118/);
  assert.match(plan.note, /Do not invent a code/);
  const opening = planLookupDelivery({
    message: "where is the Confidence Activation?",
    deck,
    entitlement: full,
    codePull: true,
    priorMessageCount: 0,
  });
  assert.equal(opening.delivery, "canned");
  assert.match(opening.reply, /#activation-confidence-activation/);
});

t("the same canned reply is never sent twice", () => {
  const first = planLookupDelivery({
    message: "what's code 88118?",
    deck,
    entitlement: full,
    codePull: true,
    priorMessageCount: 0,
  });
  assert.equal(first.delivery, "canned");
  assert.equal(isSameCannedReply(first.reply, first.reply), true);
  const again = planLookupDelivery({
    message: "what's code 88118?",
    deck,
    entitlement: full,
    codePull: true,
    priorMessageCount: 0,
    previousAssistant: first.reply,
  });
  assert.equal(again.delivery, "ai");
  assert.match(again.note, /88118/);
  assert.match(again.note, /#code-88118/);
});

t("Worth 36911 is the 42nd code and opens Worthiness", () => {
  assert.equal(deck.length, 42);
  const card = deck.find((c) => c.code === "36911");
  assert.equal(card.name, "Worth");
  assert.equal(card.activationSlug, "worthiness");
  assert.equal(card.missingActivation, false);
  assert.match(card.reading, /you've been trying to prove a worth you already have/);
  const reply = ask("36911");
  assert.match(reply, /Worth/);
  assert.match(reply, /36911/);
  assert.match(reply, /Worthiness/);
  assert.match(reply, /#code-36911/);
});

t("codes list path is My Revolution", () => {
  assert.equal(CODES_LIST_PATH, "My Revolution → Your codes");
  assert.match(DAILY_CODE_PATH, /Today's Focus/);
  const css = fs.readFileSync(new URL("../public/rf-your-codes.css", import.meta.url), "utf8");
  assert.match(css, /#06080b/);
  assert.match(css, /#e8c873/);
  assert.match(css, /#fdfbf5/);
  assert.doesNotMatch(css, /purple|#7c3aed|#a855f7/i);
});

console.log(n, "passed");
