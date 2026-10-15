// node scripts/test-ui-refresh.mjs -- the UI_REFRESH switch (lib/uiRefresh.js).
import assert from "node:assert/strict";
import { uiRefreshAllowed } from "../lib/uiRefresh.js";
let n = 0; const t = (name, fn) => { fn(); n++; console.log("ok", name); };
const base = { TESTER_EMAILS: "", CHAT_STREAMING_ALLOWLIST: "stream.member@example.com" };
t("missing = off", () => assert.equal(uiRefreshAllowed("rachaelsbutterflyeffect@gmail.com", { ...base }), false));
t("off = nobody", () => assert.equal(uiRefreshAllowed("rachaelsbutterflyeffect@gmail.com", { ...base, UI_REFRESH: "off" }), false));
t("garbage = nobody", () => assert.equal(uiRefreshAllowed("rachaelsbutterflyeffect@gmail.com", { ...base, UI_REFRESH: "yes" }), false));
const A = { ...base, UI_REFRESH: "allowlist", UI_REFRESH_ALLOWLIST: " Extra@Example.com " };
t("allowlist: Rachael", () => assert.equal(uiRefreshAllowed("RachaelsButterflyEffect@gmail.com ", A), true));
t("allowlist: Ray", () => assert.equal(uiRefreshAllowed("rachael.ball08@gmail.com", A), true));
t("allowlist: gapqa alias", () => assert.equal(uiRefreshAllowed("rachaelsbutterflyeffect+gapqa7@gmail.com", A), true));
t("allowlist: streaming allowlist", () => assert.equal(uiRefreshAllowed("stream.member@example.com", A), true));
t("allowlist: UI_REFRESH_ALLOWLIST", () => assert.equal(uiRefreshAllowed("extra@example.com", A), true));
t("allowlist: regular member no", () => assert.equal(uiRefreshAllowed("member@example.com", A), false));
t("allowlist: empty email no", () => assert.equal(uiRefreshAllowed("", A), false));
t("on = everyone", () => assert.equal(uiRefreshAllowed("member@example.com", { ...base, UI_REFRESH: "on" }), true));
console.log(n, "passed");

const L = { ...base, UI_REFRESH: "list", UI_REFRESH_ALLOWLIST: "rachaelsbutterflyeffect@gmail.com, rachael.ball08@gmail.com", TESTER_EMAILS: "rachaelsbutterflyeffect@gmail.com,rachael.ball08@gmail.com,other.tester@example.com", CHAT_STREAMING_ALLOWLIST: "stream.member@example.com" };
t("list: Rachael", () => assert.equal(uiRefreshAllowed("RachaelsButterflyEffect@gmail.com ", L), true));
t("list: Ray", () => assert.equal(uiRefreshAllowed("rachael.ball08@gmail.com", L), true));
t("list: other tester stays classic", () => assert.equal(uiRefreshAllowed("other.tester@example.com", L), false));
t("list: gapqa alias stays classic", () => assert.equal(uiRefreshAllowed("rachaelsbutterflyeffect+gapqa7@gmail.com", L), false));
t("list: streaming allowlist stays classic", () => assert.equal(uiRefreshAllowed("stream.member@example.com", L), false));
t("list: empty list = nobody", () => assert.equal(uiRefreshAllowed("rachaelsbutterflyeffect@gmail.com", { ...base, UI_REFRESH: "list" }), false));
