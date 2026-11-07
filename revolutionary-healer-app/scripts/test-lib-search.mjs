// node scripts/test-lib-search.mjs
import fs from "fs";
import vm from "vm";
import assert from "assert";

const root = new URL("../", import.meta.url);
const code = fs.readFileSync(new URL("public/lib-search.js", root), "utf8");
const window = {};
vm.runInNewContext(code, { window });
const { rhQueryHit, rhCatLabel } = window;

assert.equal(rhQueryHit("regulates an overworked nervous system", "nervous"), true);
assert.equal(rhQueryHit("strengthens your confidence", "confidence"), true);
assert.equal(rhQueryHit("no medical words here", "dizzy"), false);
assert.equal(rhQueryHit("a moment of dizziness in the copy", "dizzy"), true);
assert.equal(rhQueryHit("a moment of dizziness in the copy", "dizziness"), true);
assert.equal(rhQueryHit("feel dizzy when you stand", "dizziness"), true);
assert.equal(rhCatLabel("Mind + Body"), "Mind & Body");
assert.equal(rhCatLabel("Gifts + Spirit"), "Gifts & Spirit");

const refresh = fs.readFileSync(new URL("public/app-refresh.html", root), "utf8");
assert.match(refresh, /data-activation-slug="nervous-system-recalibration" data-category="Mind \+ Body"/);
assert.doesNotMatch(refresh, /filter-chip\[data-category="All"\] \{ display:\s*none/);
assert.match(refresh, /No activations match/);
assert.match(refresh, /Searching all categories/);
assert.match(refresh, /rh-player-poster/);
assert.match(refresh, /poster-srcset\.js/);
assert.match(refresh, /lib-search\.js/);

const data = fs.readFileSync(new URL("lib/activations.js", root), "utf8");
assert.match(data, /slug: "nervous-system-recalibration", categories: \["Mind \+ Body"\]/);

console.log("ok lib search");
