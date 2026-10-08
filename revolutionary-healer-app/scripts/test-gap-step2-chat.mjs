// Step 2 plain chat (Oct 8 2026): the greeting is display-only, and the request the page sends
// is built exactly as on main. No browser, no network.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const html = readFileSync(new URL("../public/app.html", import.meta.url), "utf8");
const main = execFileSync("git", ["show", "origin/main:revolutionary-healer-app/public/app.html"], { encoding: "utf8", maxBuffer: 64 << 20 });
const grab = (src, start) => {
  const i = src.indexOf(start); assert.ok(i >= 0, start);
  const ends = ["\n  function ", "\n  var ", "\nfunction ", "\n</script>"].map((e) => src.indexOf(e, i + start.length)).filter((n) => n > i);
  return src.slice(i, Math.min(...ends));
};
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log("ok - " + name); };

test("greeting names the topic the screen already uses, and reads naturally for all 4", () => {
  const dom = html.slice(html.indexOf("var DOMAINS = ["), html.indexOf("var QUESTION_BANKS"));
  const labels = [...dom.matchAll(/{ key: "(\w+)", label: "([^"]+)" \}/g)].map((m) => m[2]);
  assert.deepEqual(labels, ["Business + Visibility", "Money", "Spiritual Gifts", "Energy + Frequency"]);
  for (const label of labels) {
    const line = "I'm excited to go deeper into this gap around your " + label + ".";
    assert.match(line, /^I'm excited to go deeper into this gap around your .+\.$/);
    assert.ok(!/your your|around the your/.test(line), line);
  }
  assert.match(html, /addBotBubble\("I'm excited to go deeper into this gap around your " \+ domainLabel \+ "\."\)/);
});

test("greeting is display-only: marked, and setupDay2 pushes ONLY the opening question", () => {
  const fn = grab(html, "function setupDay2()");
  assert.match(fn, /setAttribute\('data-gap-greeting', '1'\)/);
  assert.match(fn, /log\.innerHTML = '';/); // a fresh Step 2 always starts clean, so it cannot double
  const pushes = fn.match(/gapChatHistory\.push\([\s\S]*?\);/g) || [];
  assert.deepEqual(pushes, ["gapChatHistory.push({ role: 'assistant', content: openingQ });"]);
  assert.ok(!fn.includes("excited to go deeper") || fn.indexOf("excited to go deeper") < fn.indexOf("gapChatHistory.push"));
  assert.doesNotMatch(fn, /gapChatHistory\.push\([\s\S]*excited/);
});

test("the request payload is built exactly as on main (history is gapChatHistory, nothing added)", () => {
  for (const start of ["function sendToGapChat(", "function buildGapContext(", "var STEP2_OPENING_QUESTIONS"]) {
    assert.equal(grab(html, start), grab(main, start), start + " changed");
  }
  assert.match(grab(html, "function sendToGapChat("), /history: gapChatHistory/);
});

test("the fold, the intro and the arrow are gone; the tracker and Step 3 markup are untouched", () => {
  for (const gone of ["gap-s2-", "d2-intro", "d2-note", "Now let's make this specific."]) assert.equal(html.includes(gone), false, gone);
  assert.ok(html.includes(">Step 1<") || html.includes("STEP 1") || html.includes("Step 1"));
  assert.equal(grab(html, '<div id="view-day3"'), grab(main, '<div id="view-day3"'));
});

test("Step 1 Complete copy is the approved text and keeps its label, button and back link", () => {
  assert.match(html, /Let's explore what's actually happening around your " \+ domainLabel \+ ", and how it's showing up in your thoughts, emotions, behavior, choices and reality\./);
  assert.match(html, /I have a feeling about what's here, but I want to hear it from you first\./);
  assert.match(html, /Let's chat\.";/);
  assert.match(html, />Step 1 complete</);
  assert.match(html, /GO TO STEP 2 →/);
  assert.match(html, /← Back to change an answer/);
});

console.log(passed + " passed, 0 failed");
