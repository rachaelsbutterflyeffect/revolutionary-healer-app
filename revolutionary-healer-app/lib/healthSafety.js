// Physical Symptoms & Medical Safety Protocol (Rachael, Nov 7 2026).
// A screening layer in front of coaching and activation recommendations.
// It reads the current message and the prior conversation. It does not diagnose.
//
// SYMPTOM_GUARDRAIL=off (default, and production) leaves member replies unchanged.
// The example lines are the defaults and can be replaced with env values.

export const SYMPTOM_GUARDRAIL_ENV = "SYMPTOM_GUARDRAIL";

export const SYMPTOM_LINE_ENV = {
  default: "SYMPTOM_GUARDRAIL_DEFAULT",
  mild: "SYMPTOM_GUARDRAIL_MILD",
  assessment: "SYMPTOM_GUARDRAIL_ASSESSMENT",
  emergency: "SYMPTOM_GUARDRAIL_EMERGENCY",
  neuro: "SYMPTOM_GUARDRAIL_NEURO",
  ground: "SYMPTOM_GUARDRAIL_GROUND",
  dismissal: "SYMPTOM_GUARDRAIL_DISMISSAL",
};

export const SYMPTOM_LINES = {
  default:
    "I'm sorry you're experiencing that. We can absolutely explore what was happening emotionally or energetically around the time this started. But physical symptoms can have physical causes too, so I want to make sure we're not overlooking anything important.",
  mild:
    "That doesn't sound very comfortable. Has this happened before, or is it something new? We can explore what was going on for you emotionally or energetically, too. Sometimes there are patterns worth noticing alongside what we're experiencing physically.",
  assessment:
    "I'm sorry you're dealing with that. We can definitely explore what was happening around the time it started, but I also want to be mindful that physical symptoms sometimes need physical support. Because this has happened more than once, I'd recommend getting it checked by a healthcare professional to check on the physical side of things. We can still explore the emotional and energetic side of the experience without overlooking your physical wellbeing.",
  emergency:
    "I'm concerned about the symptoms you're describing. These can sometimes be signs of something that needs immediate medical attention. Please call your local emergency number or seek emergency care now. Don't drive yourself if you're dizzy, faint, or having neurological symptoms. We can return to the emotional or energetic side later. Your immediate physical safety comes first.",
  neuro:
    "I'm sorry you're dealing with that. We can definitely explore what was happening around the time it started, but I also want to be mindful that physical symptoms sometimes need physical support. With a history of brain surgery or a neurological condition and these symptoms in the same area, I'd recommend getting this checked promptly by a healthcare professional. We can still explore the emotional and energetic side of the experience without overlooking your physical wellbeing.",
  ground:
    "Let's pause and ground first. Feet on the floor, a quieter breath, and a little protection around you is enough for this moment.",
  dismissal:
    "I'm not going to set the physical symptom aside because it might be an energetic release.",
};

const SALES =
  /https?:\/\/\S*(?:checkout|offers)|\b(?:book a 1:1|full access|upgrade today|clear channel method|\$\d+)\b/i;

export function symptomGuardrailEnabled(env = process.env) {
  return String(env[SYMPTOM_GUARDRAIL_ENV] || "off").trim().toLowerCase() === "on";
}

function line(which, env = process.env) {
  const custom = env[SYMPTOM_LINE_ENV[which]];
  return custom && String(custom).trim() ? String(custom).trim() : SYMPTOM_LINES[which];
}

function historyText(history) {
  return (history || [])
    .map((m) => (m && (m.text || m.content)) || "")
    .filter(Boolean)
    .join("\n");
}

function has(text, re) {
  return re.test(String(text || ""));
}

const EMERGENCY = [
  /\b(one[- ]sided|one side|left side|right side)\b[^.\n]{0,80}\b(numb(?:ness)?|weak(?:ness)?)\b/i,
  /\b(numb(?:ness)?|weak(?:ness)?)\b[^.\n]{0,80}\b(one[- ]sided|one side|left side|right side)\b/i,
  /\b(slurr\w*\s+speech|speech\s+is\s+slurr\w*|trouble speaking|can'?t speak|facial droop)\b/i,
  /\b(sudden|worst)\b[^.\n]{0,40}\bheadaches?\b|\bworst headache\b/i,
  /\b(vision loss|can'?t see|lost (?:my )?vision)\b/i,
  /\b(chest pain|chest pressure|pressure in (?:my )?chest)\b/i,
  /\b(can'?t breathe|cannot breathe|severe.{0,20}breath|significant.{0,20}breath)\b/i,
  /\bseizure/i,
  /\b(throat (?:is )?swell|can'?t swallow)\b/i,
  /\b(faint(?:ed|ing)?|passed out)\b[^.\n]{0,60}\b(chest|speech|numb|confus|vision)\b/i,
  /\b(sudden)\b[^.\n]{0,40}\b(dizz\w*|light[-\s]?headed\w*)\b[^.\n]{0,60}\b(can'?t walk|trouble walking|coordination)\b/i,
];

const NEURO_HISTORY = /\b(brain surgery|brain tumou?r|stroke|seizure disorder|neurological|neuro history)\b/i;
const HEAD_SYMPTOM = /\b(dizz(?:y|iness)|light[-\s]?headed(?:ness)?|vertigo|headaches?|head (?:sensation|feels|felt)|unpleasant[^.\n]{0,30}head|numb(?:ness)?)\b/i;
const DIZZY = /\b(dizz(?:y|iness)|light[-\s]?headed(?:ness)?|vertigo)\b/i;
const HEADACHE = /\bheadaches?\b/i;
const RECURRENT = /\b(again and again|keeps? happening|third time|second time|more than once|recurr\w*|keeps? coming back|every time|another time|keeps? getting)\b/i;
const WORSENING = /\b(getting worse|gotten worse|worsen\w*|worse than)\b/i;
const MILD_HEADACHE = /\bmild headaches?\b/i;
const ORDINARY = /\b(tired|exhausted|drained|wiped out|common cold|run[- ]down)\b/i;
const DISMISSAL = /\b(just an energetic release|just energy|only energy|energetic release|it'?s just (?:an )?energ(?:y|etic))\b/i;
const PATTERN = /\b(settl\w*|harmony|self-silenc\w*|keep the peace|shrink)\b/i;

function emergencyHit(text) {
  return EMERGENCY.some((re) => re.test(text));
}

/**
 * @returns {"emergency"|"assessment"|"mild"|"clarify"|"ordinary"|"none"}
 */
export function classifyHealth(message, history = []) {
  const current = String(message || "");
  const prior = historyText(history);
  const all = `${prior}\n${current}`;
  if (emergencyHit(current) || emergencyHit(all)) return "emergency";

  const neuro = NEURO_HISTORY.test(all) && HEAD_SYMPTOM.test(all);
  const dizzy = DIZZY.test(all);
  const headache = HEADACHE.test(all);
  const recurrent = RECURRENT.test(all);
  const worsening = WORSENING.test(all);
  const mildHeadache = MILD_HEADACHE.test(current) || (MILD_HEADACHE.test(all) && !worsening && !recurrent);

  if (neuro && (dizzy || headache || /\bhead\b/i.test(all))) return "assessment";
  if (dizzy && (recurrent || worsening)) return "assessment";
  if (headache && (recurrent || worsening) && !mildHeadache) return "assessment";
  if (dizzy && !recurrent && !neuro) return "clarify";
  if (mildHeadache || (headache && !recurrent && !worsening && !neuro)) return "mild";
  if (ORDINARY.test(current) && !dizzy && !headache && !emergencyHit(all)) return "ordinary";
  return "none";
}

function patternSentence(all) {
  if (PATTERN.test(all)) {
    return "We can still look at the part where you settle for less to keep the harmony. That sits on the emotional side, and it doesn't replace getting the physical symptoms checked.";
  }
  return "";
}

export function screenHealth({ message = "", history = [], env = process.env } = {}) {
  const enabled = symptomGuardrailEnabled(env);
  const level = classifyHealth(message, history);
  if (!enabled || level === "none" || level === "ordinary") {
    return {
      enabled,
      level: enabled ? level : "off",
      memberFacing: false,
      blockCoaching: false,
      allowActivation: true,
      reply: null,
      instruction: enabled && level === "ordinary"
        ? "The member mentioned ordinary tiredness or feeling drained. Do not turn that into a medical warning, a doctor visit, or an emergency. No sales offer."
        : "",
    };
  }
  const all = `${historyText(history)}\n${message}`;
  const dismissed = DISMISSAL.test(message);
  let reply = "";
  if (level === "emergency") {
    reply = line("emergency", env);
  } else if (level === "assessment") {
    const parts = [];
    if (dismissed) parts.push(line("dismissal", env));
    parts.push(NEURO_HISTORY.test(all) ? line("neuro", env) : line("assessment", env));
    const pattern = patternSentence(all);
    if (pattern) parts.push(pattern);
    reply = parts.join("\n\n");
  } else if (level === "mild") {
    reply = `${line("mild", env)}\n\n${line("ground", env)}`;
  } else {
    reply = line("default", env);
  }
  return {
    enabled: true,
    level,
      memberFacing: true,
      blockCoaching: true,
      allowActivation: false,
    reply,
    instruction: coachingNote(level, env),
  };
}

function coachingNote(level, env) {
  const base = "HEALTH SAFETY SCREENING is on for this turn. Do not sell, mention checkout, upgrades, prices, or booking. Do not say a pattern, practice, frequency, or energetic release caused the physical symptom. Do not tell her to wait a few days. Do not promise an activation will resolve a physical symptom.";
  if (level === "emergency") return `${base} Emergency signs are present. Do not offer an activation, grounding, or a spiritual explanation as an alternative to emergency care. Use this wording:\n${line("emergency", env)}`;
  if (level === "assessment") return `${base} Recommend a healthcare professional check before any pattern work. You may explore the emotional side only after that recommendation.`;
  if (level === "mild") return `${base} This sounds mild. Pause and ground. Do not send her to a doctor or emergency care from this description.`;
  return `${base} Ask at most one or two questions. Do not jump to a doctor visit yet.`;
}

export function stripSafetySales(text) {
  return String(text || "")
    .split("\n")
    .filter((paragraph) => !SALES.test(paragraph))
    .join("\n")
    .trim();
}

/** Keep a coaching reply behind the screening line. Emergency replaces the reply. */
export function applyHealthSafety(message, reply, env = process.env, history = []) {
  const screen = screenHealth({ message, history, env });
  if (!screen.memberFacing) return { ...screen, reply: String(reply || "") };
  if (screen.blockCoaching) return { ...screen, reply: screen.reply };
  const body = stripSafetySales(reply);
  const lead = screen.reply;
  const combined = body && !body.includes(lead.split("\n")[0]) ? `${lead}\n\n${body}` : lead;
  return { ...screen, reply: stripSafetySales(combined) };
}
