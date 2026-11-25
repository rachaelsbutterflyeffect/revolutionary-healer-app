/* Black Friday 2026 banner. Home screen only.
   Shows while now < 2026-12-01T04:59:00Z (Nov 30 2026, 11:59 PM America/Toronto).
   After that instant the original home returns on the next render, with no deploy.
   Kill switch: set BF26_KILL to true and redeploy. Nothing else has to change. */
(function (root) {
  var BF26_KILL = false;
  var BF26_UNTIL_ISO = "2026-12-01T04:59:00Z";
  var BF26_UNTIL = Date.parse(BF26_UNTIL_ISO);
  var QUIZ = "https://activation-quiz-mockup.vercel.app";
  var PROD_HOSTS = {
    "www.therevolutionaryhealer.com": 1,
    "therevolutionaryhealer.com": 1,
    "revolutionary-healer-app-7jzf.vercel.app": 1,
    "revolutionary-healer-app-rachaelsbutterflyeffect-6807s-projects.vercel.app": 1
  };

  function productionHost(hostname) {
    return !!PROD_HOSTS[String(hostname || "").toLowerCase()];
  }

  // ?bfnow=<ISO> (or off / on) is honored only off the production hosts,
  // so a preview can show the home from after the cutoff.
  function resolveNow(nowMs, hostname, search) {
    if (!productionHost(hostname)) {
      var q = "";
      try {
        q = new URLSearchParams(String(search || "").replace(/^\?/, "")).get("bfnow") || "";
      } catch (e) { q = ""; }
      if (q === "off") return BF26_UNTIL;
      if (q === "on") return BF26_UNTIL - 1;
      if (q) {
        var t = Date.parse(q);
        if (!isNaN(t)) return t;
      }
    }
    return nowMs;
  }

  function bannerOn(nowMs, kill) {
    if (kill) return false;
    return nowMs < BF26_UNTIL;
  }

  root.BF26 = {
    KILL: BF26_KILL,
    UNTIL_ISO: BF26_UNTIL_ISO,
    UNTIL: BF26_UNTIL,
    QUIZ: QUIZ,
    productionHost: productionHost,
    resolveNow: resolveNow,
    bannerOn: bannerOn
  };

  if (typeof document === "undefined") return;

  var STAR = "\u2726";
  var placed = false;

  function ensureAssets() {
    if (!document.getElementById("bf26-css")) {
      var css = document.createElement("link");
      css.id = "bf26-css";
      css.rel = "stylesheet";
      css.href = "/bf26.css";
      document.head.appendChild(css);
    }
    if (!document.getElementById("bf26-font")) {
      var font = document.createElement("link");
      font.id = "bf26-font";
      font.rel = "stylesheet";
      font.href = "https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&display=swap";
      document.head.appendChild(font);
    }
    if (!document.getElementById("bf26-hide")) {
      var hide = document.createElement("style");
      hide.id = "bf26-hide";
      hide.textContent = "html.bf26-on #rf-home>.rf-hero,html.bf26-on #rf-home>.rf-welcome,body.bf26-on #rf-home>.rf-hero,body.bf26-on #rf-home>.rf-welcome{display:none!important}";
      document.head.appendChild(hide);
    }
  }

  function bannerNode() {
    var slot = document.createElement("div");
    slot.className = "bf26-slot";
    slot.id = "bf26-slot";
    slot.innerHTML =
      '<div class="bf26-banner" id="bf26-banner" role="region" aria-label="Black Friday">' +
        '<div class="bf26-foil bf26-foil-top" aria-hidden="true"></div>' +
        '<div class="bf26-foil bf26-foil-bot" aria-hidden="true"></div>' +
        '<div class="bf26-vignette" aria-hidden="true"></div>' +
        '<div class="bf26-shine" aria-hidden="true"></div>' +
        '<div class="bf26-halo" aria-hidden="true"></div>' +
        '<svg class="bf26-bf bf26-bf-a" viewBox="0 0 100 80" aria-hidden="true" focusable="false"><g fill="none" stroke="#3FD6C8" stroke-width="1.8"><path d="M50 40C40 10 10 0 6 18s20 26 44 22M50 40C60 10 90 0 94 18S74 44 50 40M50 40C38 50 18 70 26 76s20-14 24-36M50 40C62 50 82 70 74 76S54 62 50 40"/><path d="M50 26v34M48 24l-6-10M52 24l6-10"/></g></svg>' +
        '<svg class="bf26-bf bf26-bf-b" viewBox="0 0 100 80" aria-hidden="true" focusable="false"><g fill="none" stroke="#1EAAA0" stroke-width="1.8"><path d="M50 40C40 10 10 0 6 18s20 26 44 22M50 40C60 10 90 0 94 18S74 44 50 40M50 40C38 50 18 70 26 76s20-14 24-36M50 40C62 50 82 70 74 76S54 62 50 40"/><path d="M50 26v34"/></g></svg>' +
        '<span class="bf26-spark bf26-spark-1" aria-hidden="true">' + STAR + '</span>' +
        '<span class="bf26-spark bf26-spark-2" aria-hidden="true">' + STAR + '</span>' +
        '<span class="bf26-spark bf26-spark-3" aria-hidden="true">' + STAR + '</span>' +
        '<span class="bf26-spark bf26-spark-4" aria-hidden="true">' + STAR + '</span>' +
        '<div class="bf26-copy">' +
          '<div class="bf26-label">' + STAR + ' BLACK FRIDAY ' + STAR + '</div>' +
          '<div class="bf26-headline">Skip the random discounts. Find what your energy needs this season.</div>' +
          '<a class="bf26-btn" href="' + QUIZ + '"><span class="bf26-sheen" aria-hidden="true"></span><span class="bf26-btn-text">Find the program that\'s best for you</span></a>' +
          '<div class="bf26-sub">Two-minute quiz, hundreds in savings</div>' +
          '<div class="bf26-fine">Available until Monday, November 30th.</div>' +
        '</div>' +
      '</div>';
    return slot;
  }

  // Pull the bar to the viewport edges. The home column is centered, and on
  // desktop the sidebar padding is not equal, so a pure 50vw trick misses.
  function place(slot) {
    if (!slot || !slot.parentElement) return;
    if (slot.parentElement.getClientRects().length === 0) return;
    slot.style.marginLeft = "0px";
    slot.style.width = "100%";
    var natural = slot.getBoundingClientRect().left;
    var width = document.documentElement.clientWidth;
    slot.style.marginLeft = (-natural) + "px";
    slot.style.width = width + "px";
    slot.style.maxWidth = width + "px";
  }

  function mount() {
    if (document.getElementById("bf26-banner")) {
      var again = document.getElementById("bf26-slot");
      if (again) place(again);
      return;
    }
    ensureAssets();
    var refresh = document.body.classList.contains("rf");
    var parent, before;
    if (refresh) {
      var home = document.getElementById("rf-home");
      if (!home) return;
      var top = home.querySelector(":scope > .rf-top");
      parent = home;
      before = top ? top.nextSibling : home.firstChild;
      document.documentElement.classList.add("bf26-on");
      document.body.classList.add("bf26-on");
    } else {
      var hero = document.getElementById("hero-section");
      if (!hero) return;
      var wrap = hero.querySelector(":scope > .wrap") || hero;
      parent = wrap;
      before = wrap.firstChild;
    }
    var slot = bannerNode();
    parent.insertBefore(slot, before);
    place(slot);
    requestAnimationFrame(function () { place(slot); });
    if (!placed) {
      placed = true;
      addEventListener("resize", function () {
        var live = document.getElementById("bf26-slot");
        if (live) place(live);
      });
    }
  }

  function clearBanner() {
    document.documentElement.classList.remove("bf26-on");
    document.body.classList.remove("bf26-on");
    var slot = document.getElementById("bf26-slot");
    if (slot) slot.remove();
  }

  function nowMs() {
    return root.BF26.resolveNow(Date.now(), location.hostname, location.search);
  }

  function apply() {
    if (root.BF26.bannerOn(nowMs(), root.BF26.KILL)) mount();
    else clearBanner();
  }

  function start() {
    apply();
    var left = root.BF26.UNTIL - Date.now();
    if (left > 0 && left < 2147483647) setTimeout(apply, left + 50);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
  addEventListener("pageshow", apply);
})(typeof globalThis !== "undefined" ? globalThis : this);
