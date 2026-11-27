// Real member chats, Oct 31–Nov 16: lookups, listen debriefs, saved
// recommendations, starter chips, and honest topic matches.
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadRecodeDeck } from "../lib/recodeDeck.js";
import {
  activationCatalog,
  classifyIntent,
  forbiddenLookupLanguage,
  planLookupDelivery,
  repairLookupMiss,
  resolveLookup,
  symptomGuardrailEnabled,
  SYMPTOM_GUARDRAIL_PLACEHOLDER,
} from "../lib/codeChat.js";
import {
  alignRecommendation,
  currentRecommendation,
  finalizeMemberReply,
  listenDebriefReply,
  matchRecommendationTopic,
  recalibrationIsComplete,
  parseStarterChip,
  recommendationPromptNote,
  starterChipReply,
} from "../lib/memberChat.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok", name); };
const deck = loadRecodeDeck();
const catalog = activationCatalog();
const full = { canUseTier: true, unlockedActivationSlugs: "ALL" };

function ask(message) {
  const found = resolveLookup({ message, deck, entitlement: full, codePull: true });
  assert.ok(found && found.reply, message);
  return found.reply;
}

const GROWING = 'Visibility & Impact (Rachael asked: "Let\'s talk about being seen. What feels most true right now?") Growing my impact';
const STORIES = 'Money & Prosperity (Rachael asked: "Let\'s look at your money energy. Where do you want to feel the shift?") Clearing old stories';

t("symptom guardrail switch stays off", () => {
  assert.equal(symptomGuardrailEnabled({}), false);
  assert.match(fs.readFileSync(new URL("../lib/codeChat.js", import.meta.url), "utf8"), /SYMPTOM_GUARDRAIL_ENV = "SYMPTOM_GUARDRAIL"/);
});

t("1. where is the Embody code points into the app", () => {
  const reply = ask("Where is the Embody code");
  assert.equal(classifyIntent("Where is the Embody code", deck), "code");
  assert.match(reply, /Embody/);
  assert.match(reply, /98321/);
  assert.match(reply, /#code-98321/);
  assert.match(reply, /Embodiment Activation/);
  assert.equal(forbiddenLookupLanguage(reply), false);
  assert.doesNotMatch(reply, /email/i);
  assert.doesNotMatch(reply, /61374/);
});

t("1. Its a code 98321 points at the Embody card", () => {
  assert.equal(classifyIntent("Its a code 98321", deck), "code");
  const reply = ask("Its a code 98321");
  assert.match(reply, /Embody/);
  assert.match(reply, /98321/);
  assert.match(reply, /#code-98321/);
  assert.equal(forbiddenLookupLanguage(reply), false);
  assert.doesNotMatch(reply, /email/i);
});

t("1. a code number and an activation by name both open in the app", () => {
  const byNumber = ask("98321");
  assert.match(byNumber, /#code-98321/);
  assert.match(byNumber, /Embodiment Activation/);
  assert.doesNotMatch(byNumber, /email/i);

  const byName = ask("where do I find the Embodiment Activation");
  assert.equal(classifyIntent("where do I find the Embodiment Activation", deck), "activation");
  assert.match(byName, /Embodiment Activation/);
  assert.match(byName, /#activation-embodiment-activation/);
  assert.doesNotMatch(byName, /#code-/);
  assert.equal(forbiddenLookupLanguage(byName), false);
  assert.doesNotMatch(byName, /email/i);

  const whereIs = ask("where is the Embodiment Activation");
  assert.match(whereIs, /#activation-embodiment-activation/);
});

t("1. a missed lookup inside a chat is repaired with the real card", () => {
  const plan = planLookupDelivery({
    message: "Its a code 98321",
    deck,
    entitlement: full,
    codePull: true,
    priorMessageCount: 2,
  });
  assert.equal(plan.delivery, "ai");
  assert.match(plan.note, /98321/);
  assert.match(plan.note, /#code-98321/);
  assert.match(plan.note, /Do not say there is no record/);
  assert.match(plan.note, /Do not tell them to email/);
  assert.match(plan.note, /Do not invent a code/);
  const repaired = repairLookupMiss("I have no record of that code. Please email Rachael at Rachaelsbutterflyeffect@gmail.com.", plan.factualReply);
  assert.match(repaired, /#code-98321/);
  assert.equal(forbiddenLookupLanguage(repaired), false);
  assert.doesNotMatch(repaired, /email/i);
  const kept = repairLookupMiss(plan.factualReply, plan.factualReply);
  assert.equal(kept, plan.factualReply);
});

t("2. a listen debrief reflects the feeling and does not pitch the next card", () => {
  const reply = listenDebriefReply("I felt calmer because of the activation I just did");
  assert.match(reply, /You felt calmer after that listen/);
  assert.match(reply, /What did you notice\?/);
  assert.doesNotMatch(reply, /code card|new activation|Confidence|click here|#activation|#code|want a/i);
  assert.equal(listenDebriefReply("The activation I just did"), null);
  const heavy = listenDebriefReply("More yawns than I've had in an activation, my body felt heavy");
  assert.match(heavy, /heavy/);
  assert.match(heavy, /What did you notice\?/);
  assert.doesNotMatch(heavy, /#activation|code card|new activation/i);
  assert.equal(listenDebriefReply("I keep using my phone at night and experiencing anxiety"), null);
});

t("3. a chat recommendation stays with the saved Shift", () => {
  const shifts = [{
    id: "recGalja",
    fields: {
      recommended_activation: "Nervous System Recalibration",
      progress_status: "shifting",
      created_at: "2026-11-10T00:00:00Z",
    },
  }];
  assert.equal(currentRecommendation(shifts), "Nervous System Recalibration");
  const note = recommendationPromptNote(shifts);
  assert.match(note, /HER CURRENT RECOMMENDATION: Nervous System Recalibration/);
  assert.match(note, /say why/);
  const older = {
    id: "recOld",
    fields: {
      recommended_activation: "Confidence Activation",
      progress_status: "shifting",
      created_at: "2026-10-01T00:00:00Z",
    },
  };
  const pinned = {
    id: "recPin",
    fields: {
      recommended_activation: "Grounding Activation",
      progress_status: "shifting",
      manual_focus: true,
      created_at: "2026-09-01T00:00:00Z",
    },
  };
  assert.equal(currentRecommendation([older, shifts[0]]), "Nervous System Recalibration");
  assert.equal(currentRecommendation([pinned, shifts[0]]), "Grounding Activation");

  const reply = alignRecommendation(
    "You should listen to the Confidence Activation tonight.",
    { savedTitle: "Nervous System Recalibration", message: "How am I doing with this shift?", catalog }
  );
  assert.match(reply, /Nervous System Recalibration/);
  assert.match(reply, /#activation-nervous-system-recalibration/);
  assert.doesNotMatch(reply, /Confidence Activation/);
  const mention = alignRecommendation(
    "Last week the Confidence Activation helped. What feels different now?",
    { savedTitle: "Nervous System Recalibration", message: "How am I doing with this shift?", catalog }
  );
  assert.match(mention, /Confidence Activation/);
  assert.match(mention, /What feels different now\?/);
});

t("3. a real change names the saved activation and says why", () => {
  const reply = alignRecommendation(
    "Listen to the Confidence Activation.",
    {
      savedTitle: "Nervous System Recalibration",
      message: "I don't want the nervous system one. I want the Confidence Activation.",
      catalog,
    }
  );
  assert.match(reply, /Confidence Activation/);
  assert.match(reply, /Nervous System Recalibration/);
  assert.match(reply, /because/i);
});

t("4. a starter chip gives one real activation and one gentle question", () => {
  for (const [message, title, slug] of [
    [GROWING, "Impact Vibe Booster", "impact-vibe-booster"],
    [STORIES, "Clearing Activation", "clearing-activation"],
  ]) {
    const chip = parseStarterChip(message);
    assert.ok(chip, message);
    const reply = starterChipReply(message, { catalog });
    assert.match(reply, new RegExp(title));
    assert.match(reply, new RegExp(`#activation-${slug}`));
    assert.match(reply, /\?/);
    assert.ok(catalog.some((item) => item.slug === slug), slug);
    assert.equal(forbiddenLookupLanguage(reply), false);
    assert.doesNotMatch(reply, /email/i);
  }
  const changed = starterChipReply(STORIES, { catalog, savedTitle: "Nervous System Recalibration" });
  assert.match(changed, /Clearing Activation/);
  assert.match(changed, /Nervous System Recalibration/);
  assert.match(changed, /instead/);
  assert.match(changed, /\?/);
  const same = starterChipReply(GROWING, { catalog, savedTitle: "Impact Vibe Booster" });
  assert.match(same, /Impact Vibe Booster/);
  assert.doesNotMatch(same, /instead/);
});

t("4. every starter chip points at an activation that exists", () => {
  const route = fs.readFileSync(new URL("../scripts/ui-refresh/refresh.js", import.meta.url), "utf8");
  const laneChips = [
    "I feel disconnected today", "Trusting my intuition", "Seeing signs", "Opening my channel", "Not sure yet",
    "Receiving more", "Charging my worth", "Calm around money", "Clearing old stories",
    "More energy", "Calm my nervous system", "Focus", "Confidence", "Clear the static",
    "I'm ready to show up", "Fear of judgment", "Sharing my message", "Growing my impact",
  ];
  for (const chip of laneChips) {
    assert.ok(route.includes(chip), chip);
    const reply = starterChipReply(chip, { catalog });
    assert.ok(reply, chip);
    const href = reply.match(/#activation-([a-z0-9-]+)/);
    assert.ok(href, reply);
    assert.ok(catalog.some((item) => item.slug === href[1]), chip);
    assert.match(reply, /\?/);
  }
});

t("5. grief is not sold as Pink Cloud, and a loose match stays honest", () => {
  const grief = matchRecommendationTopic("I am in grief from stacked loss", catalog);
  assert.equal(grief.strength, "closest");
  assert.notEqual(grief.activation.slug, "pink-cloud-activation");
  assert.equal(grief.activation.slug, "soul-retrieval");
  assert.match(grief.line, /don't have an activation just for grief/i);
  assert.doesNotMatch(grief.line, /perfect|exactly what|made for|Pink Cloud/i);
  assert.ok(catalog.some((item) => item.slug === grief.activation.slug));

  const boundary = matchRecommendationTopic("I can't keep my boundaries. I absorb everyone else's energy.", catalog);
  assert.equal(boundary.strength, "strong");
  assert.equal(boundary.activation.slug, "protection-shielding");

  const symptom = matchRecommendationTopic("I have this symptom of dizziness. What activation should I do?", catalog);
  assert.equal(symptom.strength, "closest");
  assert.notEqual(symptom.activation.slug, "pink-cloud-activation");
  assert.match(symptom.line, /don't have an activation for a body symptom/i);
  assert.doesNotMatch(symptom.line, new RegExp(SYMPTOM_GUARDRAIL_PLACEHOLDER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  const rewritten = finalizeMemberReply(
    "Pink Cloud Activation will lift this stacked loss.",
    { message: "I am in grief from stacked loss", catalog, deck, savedTitle: "" }
  );
  assert.doesNotMatch(rewritten, /Pink Cloud/);
  assert.match(rewritten, /Soul Retrieval Activation/);
  assert.match(rewritten, /#activation-soul-retrieval/);
  assert.match(rewritten, /don't have an activation just for grief/i);

  const invented = finalizeMemberReply(
    "Try the Quantum Grief Release Activation, code 55555.",
    { message: "stacked loss and grief", catalog, deck, savedTitle: "" }
  );
  assert.doesNotMatch(invented, /Quantum Grief|55555/);
  assert.match(invented, /Soul Retrieval Activation/);
  assert.ok(catalog.some((item) => invented.includes(item.title)));
});

t("5. a saved recommendation still gets a why when the topic is different", () => {
  const reply = finalizeMemberReply(
    "Pink Cloud Activation is perfect for your grief.",
    {
      message: "I am in grief from stacked loss",
      catalog,
      deck,
      savedTitle: "Nervous System Recalibration",
    }
  );
  assert.doesNotMatch(reply, /Pink Cloud/);
  assert.match(reply, /Soul Retrieval Activation/);
  assert.match(reply, /Nervous System Recalibration/);
  assert.match(reply, /because/i);
});

t("6. nervous system expansion is the listen for safety, anxiety, and fight or flight", () => {
  const phrases = [
    "My nervous system is braced",
    "I feel unsafe in my body",
    "I have so much anxiety",
    "I am overwhelmed and I can't relax",
    "I am in fight or flight",
    "I freeze and then I fawn",
    "I go into shutdown",
    "I am not feeling present",
    "I am not feeling grounded",
    "I want to expand without feeling scared",
    "I feel so braced",
    "I'm bracing for the next thing",
    "I'm anxious all the time",
    "I am on edge",
    "I don't feel safe",
    "I feel safe when I come back",
    "I need more safety",
    "I need to come back to the present",
    "I want to come back to now",
    "I want to be here and now",
    "I want to be present",
    "I am looking for presence",
    "I want to feel more grounded",
    "Help me with grounding",
    "I want to ground myself",
    "I'm ready to expand",
  ];
  for (const phrase of phrases) {
    const match = matchRecommendationTopic(phrase, catalog);
    assert.equal(match.activation.slug, "nervous-system-expansion", phrase);
    assert.equal(match.strength, "strong", phrase);
  }
  const chip = starterChipReply("Calm my nervous system", { catalog });
  assert.match(chip, /#activation-nervous-system-recalibration/);
  assert.doesNotMatch(chip, /nervous-system-expansion/);

  const quiet = finalizeMemberReply("Take a breath.", {
    message: "I can't relax and I don't feel safe in my body",
    catalog,
    deck,
    savedTitle: "",
  });
  assert.match(quiet, /Nervous System Expansion/);
  assert.match(quiet, /#activation-nervous-system-expansion/);

  const code = classifyIntent("I can't relax. Show me code 98321", deck);
  assert.equal(code, "code");
  const looked = finalizeMemberReply("Here is the card.", {
    message: "I can't relax. Show me code 98321",
    catalog,
    deck,
    savedTitle: "",
    lookupReply: "Code 98321 is a real code.",
  });
  assert.equal(looked, "Here is the card.");
  assert.doesNotMatch(looked, /nervous-system-expansion/);

  for (const phrase of ["I want to expand my business", "help me expand my income", "I want to expand my visibility", "expand my client list"]) {
    const blocked = matchRecommendationTopic(phrase, catalog);
    assert.notEqual(blocked?.activation?.slug, "nervous-system-expansion", phrase);
  }
  const griefStill = matchRecommendationTopic("I am grieving and I want to expand", catalog);
  assert.equal(griefStill.activation.slug, "soul-retrieval");
});

t("7. a finished Recalibration offers Expansion next, and an unfinished one does not", () => {
  assert.equal(recalibrationIsComplete({ completedSlugs: ["nervous-system-recalibration"] }), true);
  assert.equal(recalibrationIsComplete({ finishedSlugs: ["nervous-system-recalibration"] }), true);
  assert.equal(recalibrationIsComplete({ completedSlugs: ["grounding"] }), false);

  const waiting = starterChipReply("Calm my nervous system", { catalog, recalibrationDone: false });
  assert.match(waiting, /#activation-nervous-system-recalibration/);
  assert.doesNotMatch(waiting, /nervous-system-expansion/);

  const ready = starterChipReply("Calm my nervous system", { catalog, recalibrationDone: true });
  assert.match(ready, /You've already done Nervous System Recalibration/);
  assert.match(ready, /Your next step is Nervous System Expansion/);
  assert.match(ready, /#activation-nervous-system-expansion/);
  assert.doesNotMatch(ready, /#activation-nervous-system-recalibration/);

  const next = finalizeMemberReply("Take a breath.", {
    message: "I feel so braced",
    catalog,
    deck,
    savedTitle: "",
    recalibrationDone: true,
  });
  assert.match(next, /You've already done Nervous System Recalibration/);
  assert.match(next, /#activation-nervous-system-expansion/);

  const first = finalizeMemberReply("Take a breath.", {
    message: "I feel so braced",
    catalog,
    deck,
    savedTitle: "",
    recalibrationDone: false,
  });
  assert.doesNotMatch(first, /already done Nervous System Recalibration/i);
  assert.match(first, /#activation-nervous-system-expansion/);

  const debrief = listenDebriefReply("I felt calmer", {
    previousAssistant: "You just did Nervous System Recalibration — tell me what shifted for you and how you feel...",
  });
  assert.match(debrief, /What did you notice\?/);
  assert.match(debrief, /Your next listen is Nervous System Expansion/);
  assert.match(debrief, /#activation-nervous-system-expansion/);

  const otherListen = listenDebriefReply("I felt calmer", {
    previousAssistant: "You just did Slowing the Mind — tell me what shifted for you and how you feel...",
  });
  assert.match(otherListen, /What did you notice\?/);
  assert.doesNotMatch(otherListen, /Nervous System Expansion/);
});

t("chat scroll and typewriter hooks are untouched", () => {
  const page = fs.readFileSync(new URL("../public/app.html", import.meta.url), "utf8");
  assert.match(page, /function rhScrollToBottom/);
  assert.match(page, /function rhIsNearBottom/);
  assert.match(page, /rhFollowReply/);
  assert.match(page, /function rhSetTextWithLinks/);
});

t("the route uses the debrief, the chip, the saved recommendation, and the final pass", () => {
  const route = fs.readFileSync(new URL("../app/api/chat/route.ts", import.meta.url), "utf8");
  assert.match(route, /listenDebriefReply\(message, \{ previousAssistant \}\)/);
  assert.match(route, /starterChipReply\(message, \{ savedTitle, recalibrationDone \}\)/);
  assert.match(route, /recalibrationDone/);
  assert.match(route, /recommendationPromptNote\(existingShiftRecords\)/);
  assert.match(route, /finalizeMemberReply\(/);
  assert.match(route, /Recommended activation: \$\{f\.recommended_activation/);
});

console.log(n, "passed");
