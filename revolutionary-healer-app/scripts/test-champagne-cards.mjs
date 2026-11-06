// The two approved live cards: champagne Favorites bubble and the Home
// "fits you today" door. Reset & Restore, saved favorites, and the recommender stay.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { execSync } from "node:child_process";
import fs from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

const app = new URL("..", import.meta.url).pathname;
const repo = new URL("../..", import.meta.url).pathname;
const html = fs.readFileSync(app + "public/app-refresh.html", "utf8");
const refreshJs = fs.readFileSync(app + "scripts/ui-refresh/refresh.js", "utf8");
const checkin = fs.readFileSync(app + "public/rf-checkin.js", "utf8");
let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok", name); };

const names = execSync("git diff --name-only origin/main", { cwd: repo }).toString().trim().split("\n").filter(Boolean);
const allowed = new Set([
  "revolutionary-healer-app/public/app-refresh.html",
  "revolutionary-healer-app/scripts/ui-refresh/build.py",
  "revolutionary-healer-app/scripts/ui-refresh/refresh.css",
  "revolutionary-healer-app/package.json",
]);
t("diff stays on the two cards", () => {
  const extra = names.filter((f) => !allowed.has(f));
  assert.deepEqual(extra, []);
});

t("shipped page diff does not touch Reset & Restore", () => {
  const diff = execSync("git diff -U0 origin/main -- revolutionary-healer-app/public/app-refresh.html", { cwd: repo }).toString();
  assert.equal((diff.match(/^@@/gm) || []).length, 2);
  for (const word of ["rr-card", "rr-days", "rr-new", "rr-open", "reset-and-restore"]) {
    assert.equal(diff.includes(word), false, word);
  }
});

t("both Reset & Restore banners keep live chrome", () => {
  for (const id of ["rr-home-card", "rr-lib-card"]) {
    const i = html.indexOf('id="' + id + '"');
    assert.ok(i > 0, id);
    const chunk = html.slice(i, i + 900);
    assert.match(chunk, /reset-and-restore-banner\.jpg/);
    assert.match(chunk, /NEW · 5-DAY SERIES/);
    assert.match(chunk, /<div class="rr-days"[^>]*>\s*<i><\/i><i><\/i><i><\/i><i><\/i><i><\/i>\s*<\/div>/);
    assert.match(chunk, /Begin Day 1/);
    assert.ok(chunk.indexOf("rr-card-art") < chunk.indexOf("rr-new"), "label stays under the artwork");
  }
});

t("Favorites bubble keeps the live action hooks", () => {
  const tile = html.match(/<button type="button" class="rf-lsec rf-favtile"[\s\S]*?<\/button>/);
  assert.ok(tile, "tile");
  assert.match(tile[0], /data-rf-favs/);
  assert.match(tile[0], /<b>Favorites<\/b>/);
  assert.match(tile[0], /Create a list of your favorite activations/);
  assert.match(tile[0], /data-rf-favcount/);
  assert.equal(tile[0].includes("sec-favourites.webp"), false);
  assert.match(refreshJs, /tile\.hidden = n === 0/);
  assert.match(refreshJs, /getFavoriteActivationSlugs\(\)/);
  assert.match(refreshJs, /e\.target\.closest\('\[data-rf-favs\]'\)/);
  assert.match(html, /fetch\('\/api\/favorites'/);
  assert.match(html, /activationSlug: slug/);
  assert.match(html, /localStorage\.setItem\('rh_favorites_' \+ RH_EMAIL/);
});

t("recommendation door copy and map are unchanged", () => {
  assert.match(checkin, /data-rf-go="fit"/);
  assert.match(checkin, /Find the activation that best fits you today/);
  assert.match(checkin, /handleActivationCardClick\(slug\)/);
  assert.match(checkin, /nervous-system-recalibration/);
  assert.match(html, /#rf-fit-door \.rf-door \{/);
  assert.equal(html.includes("#rf-home .rf-door {"), false);
});

console.log(n, "static checks passed");

const EMAIL = "champagne-cards@example.com";
const KEPT = "slowing-the-mind";
const ADDED = "lifting-emotional-anxiety";
let favs = [KEPT];
const writes = [];
const port = 9333;
const dir = "/tmp/chrome-champagne-cards";
fs.rmSync(dir, { recursive: true, force: true });
const chrome = spawn("google-chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`,
  "--window-size=390,980",
], { stdio: "ignore" });

function cdp(ws) {
  let id = 0;
  const pending = new Map();
  const waiters = [];
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else resolve(msg.result);
    } else waiters.forEach((fn) => fn(msg));
  });
  return {
    send(method, params = {}) {
      const my = ++id;
      ws.send(JSON.stringify({ id: my, method, params }));
      return new Promise((resolve, reject) => pending.set(my, { resolve, reject }));
    },
    on(fn) { waiters.push(fn); },
  };
}

async function browserVersion() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) return r.json();
    } catch (e) {}
    await delay(150);
  }
  throw new Error("chrome debugger did not start");
}

function fulfill(client, requestId, obj) {
  return client.send("Fetch.fulfillRequest", {
    requestId,
    responseCode: 200,
    responseHeaders: [{ name: "Content-Type", value: "application/json" }],
    body: Buffer.from(JSON.stringify(obj)).toString("base64"),
  });
}

try {
  const ver = await browserVersion();
  const browser = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((res, rej) => { browser.addEventListener("open", res); browser.addEventListener("error", rej); });
  const b = cdp(browser);
  const { targetId } = await b.send("Target.createTarget", { url: "about:blank" });
  const pageWs = new WebSocket(`ws://127.0.0.1:${port}/devtools/page/${targetId}`);
  await new Promise((res, rej) => { pageWs.addEventListener("open", res); pageWs.addEventListener("error", rej); });
  const page = cdp(pageWs);
  const paused = [];
  page.on((msg) => {
    if (msg.method === "Runtime.consoleAPICalled") {
      const text = (msg.params.args || []).map((a) => a.value || a.description || "").join(" ");
      if (text) console.log("page:", text);
    }
    if (msg.method !== "Fetch.requestPaused") return;
    paused.push(msg.params.request.method + " " + msg.params.request.url);
    const { requestId, request } = msg.params;
    const url = request.url;
    if (url.includes("/api/ui-refresh")) return fulfill(page, requestId, { refresh: true, firstName: "Rachael" });
    if (url.includes("/api/access")) return fulfill(page, requestId, { memberActive: true, tierActive: true, memberSince: "2024-01-01" });
    if (url.includes("/api/features")) return fulfill(page, requestId, { homeCheckin: true });
    if (url.includes("/api/favorites")) {
      if (request.method === "GET") return fulfill(page, requestId, { slugs: favs.slice() });
      const body = JSON.parse(request.postData || "{}");
      writes.push({ method: request.method, body });
      if (request.method === "POST" && body.activationSlug) favs = [body.activationSlug, ...favs.filter((s) => s !== body.activationSlug)];
      if (request.method === "DELETE") favs = favs.filter((s) => s !== body.activationSlug);
      return fulfill(page, requestId, { ok: true });
    }
    return page.send("Fetch.continueRequest", { requestId });
  });
  await page.send("Runtime.enable");
  await page.send("Page.enable");
  await page.send("Fetch.enable", { patterns: [
    { urlPattern: "*api/ui-refresh*", requestStage: "Request" },
    { urlPattern: "*api/access*", requestStage: "Request" },
    { urlPattern: "*api/features*", requestStage: "Request" },
    { urlPattern: "*api/favorites*", requestStage: "Request" },
  ]});
  await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 980, deviceScaleFactor: 1, mobile: true });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `
    localStorage.setItem('rh_member_email', ${JSON.stringify(EMAIL)});
    localStorage.setItem('rh_member_login_at', String(Date.now()));
    localStorage.setItem('rh_ui_refresh', '1:' + ${JSON.stringify(EMAIL)});
    localStorage.setItem('rh_favorites_${EMAIL}', ${JSON.stringify(JSON.stringify([KEPT]))});
  ` });
  await page.send("Page.navigate", { url: "http://127.0.0.1:3000/app-refresh.html" });

  async function value(expression) {
    const r = await page.send("Runtime.evaluate", { expression, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + expression);
    return r.result.value;
  }
  async function until(expression, ms = 10000) {
    const start = Date.now();
    let last;
    while (Date.now() - start < ms) {
      last = await value(expression);
      if (last) return last;
      await delay(150);
    }
    const where = await value(`JSON.stringify({href:location.href, email:localStorage.getItem('rh_member_email'), features:window.__rfFeatures||null, fit:!!document.getElementById('rf-fit-door')})`).catch((e) => String(e));
    throw new Error("timed out: " + expression + " last=" + JSON.stringify(last) + " where=" + where + " paused=" + paused.slice(0, 12).join(" | "));
  }

  await until("location.pathname === '/app-refresh.html' && !!document.getElementById('rf-fit-door')");
  const home = await value(`(() => {
    const fit = document.querySelector('#rf-fit-door .rf-door');
    const gap = document.querySelector('.rf-door[data-rf-go="gap"]');
    const rr = document.getElementById('rr-home-card');
    const art = rr.querySelector('.rr-card-art');
    const label = rr.querySelector('.rr-new');
    const fs = getComputedStyle(fit);
    const gs = getComputedStyle(gap);
    const nav = getComputedStyle(document.getElementById('rf-nav'));
    return {
      href: location.href,
      fitText: fit.querySelector('.txt').textContent,
      fitGo: fit.getAttribute('data-rf-go'),
      fitBg: fs.backgroundImage,
      fitColor: fs.color,
      gapBg: gs.backgroundImage,
      navBg: nav.backgroundImage + nav.backgroundColor,
      dots: rr.querySelectorAll('.rr-days i').length,
      label: label.textContent,
      labelAfterArt: !!(art.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING),
      art: art.style.backgroundImage,
      open: rr.querySelector('.rr-open').textContent,
      otherDoor: gap.querySelector('.txt').innerText.replace(/\\s+/g, ' ').trim(),
    };
  })()`);
  assert.equal(home.fitText, "Find the activation that best fits you today");
  assert.equal(home.fitGo, "fit");
  assert.match(home.fitBg, /255,\s*248,\s*230/);
  assert.equal(home.fitColor, "rgb(36, 28, 10)");
  assert.equal(home.gapBg.includes("255, 248, 230"), false);
  assert.equal(home.navBg.includes("255, 248, 230"), false);
  assert.equal(home.dots, 5);
  assert.equal(home.label, "NEW · 5-DAY SERIES");
  assert.equal(home.labelAfterArt, true);
  assert.match(home.art, /reset-and-restore-banner\.jpg/);
  assert.equal(home.open, "Begin Day 1");
  assert.match(home.otherDoor, /GAP Method/);
  console.log("ok home card is champagne and Reset & Restore is unchanged");

  await value(`document.getElementById('rr-home-sec').scrollIntoView({block:'start'}); window.scrollBy(0, -12);`);
  await delay(250);
  const homeShot = await page.send("Page.captureScreenshot", { format: "png" });
  fs.mkdirSync("/opt/cursor/artifacts", { recursive: true });
  fs.writeFileSync("/opt/cursor/artifacts/screenshot_live_home_champagne_fit.png", Buffer.from(homeShot.data, "base64"));

  async function onQuestion(text) {
    await until(`document.body.getAttribute('data-rf') === 'fit' && document.querySelector('#diag .qn') && document.querySelector('#diag .qn').textContent.includes(${JSON.stringify(text)})`);
  }
  await value(`document.querySelector('#rf-fit-door .rf-door').click()`);
  await onQuestion("How is your energy");
  await value(`document.querySelector('#diag .dots10 button[data-v="1"]').click(); document.getElementById('d-next').click();`);
  await onQuestion("How connected");
  await value(`document.querySelector('#diag .dots10 button[data-v="9"]').click(); document.getElementById('d-next').click();`);
  await onQuestion("How grounded");
  await value(`document.querySelector('#diag .dots10 button[data-v="9"]').click(); document.getElementById('d-next').click();`);
  await onQuestion("body or mind");
  await value(`document.querySelector('#diag .qpick button[data-v="body"]').click(); document.getElementById('d-next').click();`);
  await onQuestion("slow down");
  await value(`document.querySelector('#diag .qpick button[data-v="slow"]').click(); document.getElementById('d-next').click();`);
  const result = await until(`window.__rfCheckinResult && window.__rfCheckinResult.slug`);
  assert.equal(result, "nervous-system-recalibration");
  await value(`document.getElementById('d-play').click()`);
  await until(`document.getElementById('activation-detail-title') && document.getElementById('activation-detail-title').textContent.includes('Nervous System')`);
  console.log("ok recommendation still opens Nervous System Recalibration");

  await value(`document.querySelector('#rf-nav [data-rf-nav="lib"]').click()`);
  await until(`document.getElementById('activations-page') && document.getElementById('activations-page').classList.contains('active') && document.querySelector('#rf-lsecs [data-rf-favs]') && document.querySelector('#rf-lsecs [data-rf-favs]').hidden === false`);
  const act = await value(`(() => {
    const tile = document.querySelector('#rf-lsecs [data-rf-favs]');
    const rr = document.getElementById('rr-lib-card');
    const next = document.querySelector('#rf-lsecs [data-rf-sec="Mind + Body"]');
    const ts = getComputedStyle(tile);
    return {
      title: tile.querySelector('b').textContent,
      pitch: tile.querySelector('.rf-favpitch').textContent,
      count: tile.querySelector('[data-rf-favcount]').textContent,
      countDisplay: getComputedStyle(tile.querySelector('[data-rf-favcount]')).display,
      label: tile.getAttribute('aria-label'),
      photo: tile.querySelector('.bgc') ? 'yes' : 'no',
      bg: ts.backgroundImage,
      color: ts.color,
      minHeight: parseFloat(ts.minHeight) || 0,
      nextPhoto: next.querySelector('.bgc').style.backgroundImage,
      nextMin: parseFloat(getComputedStyle(next).minHeight),
      dots: rr.querySelectorAll('.rr-days i').length,
      ribbon: rr.querySelector('.rr-new').textContent,
      open: rr.querySelector('.rr-open').textContent,
      art: rr.querySelector('.rr-card-art').style.backgroundImage,
    };
  })()`);
  assert.equal(act.title, "Favorites");
  assert.equal(act.pitch, "Create a list of your favorite activations");
  assert.equal(act.count, "1 ACTIVATION");
  assert.equal(act.countDisplay, "none");
  assert.equal(act.label, "Favourites · 1 activation");
  assert.equal(act.photo, "no");
  assert.match(act.bg, /255,\s*248,\s*230/);
  assert.equal(act.color, "rgb(36, 28, 10)");
  assert.ok(act.minHeight < 120, "favorites bubble stays compact");
  assert.match(act.nextPhoto, /sec-mind-body\.webp/);
  assert.ok(act.nextMin >= 140, "other section tiles stay tall");
  assert.equal(act.dots, 5);
  assert.equal(act.ribbon, "NEW · 5-DAY SERIES");
  assert.equal(act.open, "Begin Day 1");
  assert.match(act.art, /reset-and-restore-banner\.jpg/);
  console.log("ok Favorites bubble keeps the saved count and the next tile stays a photo");

  await value(`document.getElementById('rr-lib-sec').scrollIntoView({block:'start'}); window.scrollBy(0, -70);`);
  await delay(250);
  const actShot = await page.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync("/opt/cursor/artifacts/screenshot_live_activations_champagne_favorites.png", Buffer.from(actShot.data, "base64"));

  await value(`document.querySelector('#rf-lsecs [data-rf-favs]').click()`);
  await until(`document.body.getAttribute('data-rf-libfav') === '1' && !!document.querySelector('#rf-favgrid [data-activation-slug="${KEPT}"]')`);
  console.log("ok opening Favorites lists the saved activation");

  await value(`document.querySelector('[data-rf-allsecs]').click()`);
  await until(`!document.body.hasAttribute('data-rf-libfav') && !!document.querySelector('#activation-library-grid [data-activation-slug="${ADDED}"] .heart-btn')`);
  await value(`document.querySelector('#activation-library-grid [data-activation-slug="${ADDED}"] .heart-btn').click()`);
  await until(`JSON.parse(localStorage.getItem('rh_favorites_${EMAIL}')).includes('${ADDED}') && JSON.parse(localStorage.getItem('rh_favorites_${EMAIL}')).includes('${KEPT}')`);
  await value(`document.querySelector('#activation-library-grid [data-activation-slug="${ADDED}"] .heart-btn').click()`);
  await until(`!JSON.parse(localStorage.getItem('rh_favorites_${EMAIL}')).includes('${ADDED}') && JSON.parse(localStorage.getItem('rh_favorites_${EMAIL}')).includes('${KEPT}')`);
  assert.deepEqual(writes.map((w) => w.method + " " + w.body.activationSlug), ["POST " + ADDED, "DELETE " + ADDED]);
  assert.equal(writes.every((w) => w.body.email === EMAIL), true);
  console.log("ok heart still saves and removes without dropping the existing favorite");
  console.log("functional checks passed");
} finally {
  chrome.kill("SIGKILL");
}
