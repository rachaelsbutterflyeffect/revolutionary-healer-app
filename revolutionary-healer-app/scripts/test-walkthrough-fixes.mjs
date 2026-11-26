// Walk-through fixes: Step 3 next card, All chip, one code count, memory framing.
import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("../", import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, root), "utf8");
const page = read("public/app-refresh.html");
const prompt = read("lib/prompts.js");
const sections = read("public/rf-sections.js");
const v5 = read("public/layout-v5.js");

assert.match(page, /row\.scrollLeft = Math\.max/);
assert.doesNotMatch(page, /gapScrollToActivation[\s\S]{0,500}behavior: smooth/);
assert.match(page, /gap_next_tap/);
assert.match(page, /gap_next_listen/);
assert.match(page, /Your Shift is saved\. This is your next step\./);
assert.match(page, /__rhLibSection = btn\.getAttribute\('data-category'\)/);
assert.match(page, /if \(!q && category === 'All'\) window\.__rhLibExpanded = true/);
assert.match(page, /focusArea: r\.focusArea/);

assert.match(prompt, /from earlier conversations, not this chat/);
assert.match(prompt, /Never say "you just said"/);

assert.match(sections, /__rfRevData\.codes\.length/);
assert.match(v5, /codeRows\.length/);
assert.match(v5, /mlv5-code-dup/);

const grid = page.split('id="activation-library-grid"')[1].split('id="activation-detail-page"')[0];
const cards = [...grid.matchAll(/data-category="([^"]+)"/g)].map((m) => m[1]);
const energy = cards.filter((cat) => cat.split(",").map((s) => s.trim()).includes("Energy + Frequency"));
assert.equal(energy.length, 11, "Energy & Frequency library cards");

console.log("walkthrough fixes ok");
