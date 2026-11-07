import assert from "node:assert/strict";
import { classifyHealth, screenHealth, SYMPTOM_LINES, SYMPTOM_GUARDRAIL_ENV } from "../lib/healthSafety.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok", name); };
const on = { [SYMPTOM_GUARDRAIL_ENV]: "on" };

t("switch off leaves the reply alone", () => {
  const s = screenHealth({ message: "I feel dizzy and lightheaded", env: {} });
  assert.equal(s.memberFacing, false);
  assert.equal(s.reply, null);
});

t("member B: dizziness, head sensation, brain surgery, third time", () => {
  const history = [
    { role: "user", text: "I got dizzy and lightheaded after giving an energy exchange." },
    { role: "user", text: "Filling her head with light felt unpleasant in my head." },
    { role: "user", text: "I have a history of brain surgery in that same area." },
  ];
  const message = "This is the third time. I think I settle for less to keep the harmony.";
  assert.equal(classifyHealth(message, history), "assessment");
  const s = screenHealth({ message, history, env: on });
  assert.match(s.reply, /healthcare professional/);
  assert.match(s.reply, /promptly|brain surgery/);
  assert.match(s.reply, /settle for less to keep the harmony/);
  assert.doesNotMatch(s.reply, /#activation-|Confidence Activation/);
  assert.equal(s.blockCoaching, true);
});

t("member C mild headache pauses and grounds without a doctor", () => {
  const s = screenHealth({ message: "I get a mild headache when I think about being seen", env: on });
  assert.equal(s.level, "mild");
  assert.match(s.reply, new RegExp(SYMPTOM_LINES.mild.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(s.reply, /pause and ground/i);
  assert.doesNotMatch(s.reply, /doctor|healthcare|emergency/i);
});

t("tired and drained is not a safety speech", () => {
  const s = screenHealth({ message: "I'm feeling tired and drained", env: on });
  assert.equal(s.level, "ordinary");
  assert.equal(s.memberFacing, false);
  assert.match(s.instruction, /do not turn that into a medical warning/i);
});

t("sudden one-sided numbness and slurred speech is emergency with no activation", () => {
  const s = screenHealth({ message: "I suddenly have numbness on one side and my speech is slurred", env: on });
  assert.equal(s.level, "emergency");
  assert.equal(s.reply, SYMPTOM_LINES.emergency);
  assert.doesNotMatch(s.reply, /activation|ground|listen/i);
  assert.equal(s.allowActivation, false);
});

t("recurring headaches getting worse is level 2", () => {
  const s = screenHealth({ message: "My headaches keep coming back and they're getting worse", env: on });
  assert.equal(s.level, "assessment");
  assert.match(s.reply, /more than once/);
  assert.match(s.reply, /healthcare professional/);
});

t("energetic release does not downgrade recurring dizziness", () => {
  const history = [{ role: "user", text: "I keep getting dizzy again and again." }];
  const s = screenHealth({ message: "It's just an energetic release", history, env: on });
  assert.equal(s.level, "assessment");
  assert.match(s.reply, /not going to set the physical symptom aside/);
  assert.match(s.reply, /healthcare professional/);
});

t("example lines are configurable", () => {
  const s = screenHealth({
    message: "I suddenly have numbness on one side and my speech is slurred",
    env: { ...on, SYMPTOM_GUARDRAIL_EMERGENCY: "CUSTOM EMERGENCY LINE" },
  });
  assert.equal(s.reply, "CUSTOM EMERGENCY LINE");
});

console.log(n, "passed");
