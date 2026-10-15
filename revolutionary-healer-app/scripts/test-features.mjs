// node scripts/test-features.mjs -- per-feature "list" switches (lib/features.js).
import assert from "node:assert/strict";
import { featureAllowed, featuresFor } from "../lib/features.js";
let n = 0; const t = (name, fn) => { fn(); n++; console.log("ok", name); };
const L = { CODE_PULL: "list", CODE_PULL_ALLOWLIST: "rachaelsbutterflyeffect@gmail.com, rachael.ball08@gmail.com", TESTER_EMAILS: "x@example.com", UI_REFRESH: "on" };
t("missing = off", () => assert.equal(featureAllowed("CODE_PULL", "rachaelsbutterflyeffect@gmail.com", {}), false));
t("on is not a mode", () => assert.equal(featureAllowed("CODE_PULL", "a@b.com", { CODE_PULL: "on" }), false));
t("list: Rachael", () => assert.equal(featureAllowed("CODE_PULL", " RachaelsButterflyEffect@gmail.com", L), true));
t("list: Ray", () => assert.equal(featureAllowed("CODE_PULL", "rachael.ball08@gmail.com", L), true));
t("list: tester not on list", () => assert.equal(featureAllowed("CODE_PULL", "x@example.com", L), false));
t("list: gapqa alias", () => assert.equal(featureAllowed("CODE_PULL", "rachaelsbutterflyeffect+gapqa1@gmail.com", L), false));
t("featuresFor shape", () => assert.deepEqual(featuresFor("rachael.ball08@gmail.com", L), { codePull: true, homeCheckin: false }));
const C = { ...L, HOME_CHECKIN: "list", HOME_CHECKIN_ALLOWLIST: "rachael.ball08@gmail.com" };
t("homeCheckin is its own switch", () => assert.deepEqual(featuresFor("rachaelsbutterflyeffect@gmail.com", C), { codePull: true, homeCheckin: false }));
t("homeCheckin: Ray", () => assert.equal(featuresFor("rachael.ball08@gmail.com", C).homeCheckin, true));
console.log(n, "passed");
