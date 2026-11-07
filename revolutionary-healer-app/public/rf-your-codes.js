/* Your codes: the in-app list of Recode Deck codes this member holds.
   A chat link (#code-98321 or #your-codes) opens this cards view. */
(function () {
  if (window.__rfYourCodes) return;
  window.__rfYourCodes = 1;

  function email() {
    return (typeof RH_EMAIL !== "undefined" && RH_EMAIL) || "";
  }
  function root() {
    var rev = document.getElementById("my-revolution");
    if (!rev) return null;
    return rev.querySelector(".wrap") || rev;
  }
  function ensure() {
    var host = root();
    if (!host) return null;
    var sec = document.getElementById("rf-your-codes");
    if (sec) return sec;
    sec = document.createElement("section");
    sec.id = "rf-your-codes";
    sec.className = "revolution-subsection";
    sec.setAttribute("aria-label", "Your codes");
    sec.innerHTML = '<h3>Your codes</h3><p class="rf-yc-path">My Revolution → Your codes</p><div id="rf-yc-list"></div>';
    var shifts = host.querySelector(".revolution-subsection");
    if (shifts && shifts.parentNode === host) host.insertBefore(sec, shifts.nextSibling);
    else host.appendChild(sec);
    return sec;
  }
  function statusLabel(s) {
    if (s === "held") return "You hold this code";
    if (s === "unlocked") return "Unlocked for you";
    if (s === "not yet unlocked") return "Not yet unlocked";
    return "";
  }
  function inclusionLabel(s) {
    if (s === "paid-unlock") return "Paid unlock";
    if (s === "included-with-membership") return "Included with your membership";
    return "";
  }
  function cardEl(c, open) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "rf-yc-card" + (open ? " rf-yc-on" : "");
    b.setAttribute("data-code", c.code);
    var name = document.createElement("div");
    name.className = "rf-yc-name";
    name.textContent = c.name || "Code";
    var num = document.createElement("div");
    num.className = "rf-yc-num";
    num.textContent = c.code || "";
    var st = document.createElement("div");
    st.className = "rf-yc-status";
    st.textContent = [inclusionLabel(c.inclusion), statusLabel(c.memberStatus)].filter(Boolean).join(" · ");
    b.appendChild(name);
    b.appendChild(num);
    b.appendChild(st);
    if (open) {
      if (c.reading) {
        var p = document.createElement("p");
        p.className = "rf-yc-read";
        p.textContent = c.reading;
        b.appendChild(p);
      }
      if (c.activationSlug && c.activationTitle) {
        var listen = document.createElement("span");
        listen.className = "rf-yc-listen";
        listen.textContent = "Listen to " + c.activationTitle;
        listen.setAttribute("data-activation", c.activationSlug);
        b.appendChild(listen);
      }
    }
    return b;
  }
  function paint(data, focus) {
    var sec = ensure();
    if (!sec) return;
    var list = document.getElementById("rf-yc-list");
    if (!list) return;
    list.textContent = "";
    var rows = (data && data.held) || [];
    var extra = data && data.focus && !rows.some(function (r) { return r.code === data.focus.code; }) ? data.focus : null;
    if (!rows.length && !extra) {
      var empty = document.createElement("p");
      empty.className = "rf-yc-empty";
      empty.textContent = data && data.message
        ? data.message
        : "Codes you pull show up here. You can also pull one from Today's Focus → Your Daily Code.";
      list.appendChild(empty);
      return;
    }
    if (extra) list.appendChild(cardEl(extra, extra.code === focus));
    rows.forEach(function (c) { list.appendChild(cardEl(c, c.code === focus)); });
    var on = list.querySelector(".rf-yc-on");
    if (on && on.scrollIntoView) on.scrollIntoView({ block: "center" });
  }
  function load(focus) {
    var em = email();
    var url = "/api/recode-codes?email=" + encodeURIComponent(em) + (focus ? "&focus=" + encodeURIComponent(focus) : "");
    return fetch(url, { cache: "no-store", credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.json() : { held: [], message: "" }; })
      .then(function (d) { paint(d, focus || ""); return d; })
      .catch(function () { paint({ held: [], message: "I can’t verify that code from chat yet, but that does not mean it isn’t valid. Check your codes in the app first. If it still isn’t showing there, support can check your account directly." }, focus || ""); });
  }
  function showRev() {
    if (typeof window.rfGo === "function") window.rfGo("rev");
    else if (typeof window.goToMyRevolution === "function") window.goToMyRevolution();
  }
  window.rhOpenCodeCard = function (code) {
    var n = String(code || "").replace(/\D/g, "");
    showRev();
    ensure();
    return load(n);
  };
  window.rhOpenYourCodes = function () {
    showRev();
    ensure();
    return load(window.__rhPendingCode || "");
  };
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var listen = t.closest(".rf-yc-listen");
    if (listen) {
      e.preventDefault();
      e.stopPropagation();
      var slug = listen.getAttribute("data-activation");
      if (slug && typeof window.handleActivationCardClick === "function") window.handleActivationCardClick(slug);
      return;
    }
    var card = t.closest("#rf-your-codes .rf-yc-card");
    if (!card) return;
    var code = card.getAttribute("data-code");
    var open = card.classList.contains("rf-yc-on");
    if (open) card.classList.remove("rf-yc-on");
    else if (code) window.rhOpenCodeCard(code);
  });
  function fromHash() {
    var h = (location.hash || "").replace(/^#/, "");
    if (h === "your-codes") window.rhOpenYourCodes();
    else if (/^code-\d{4,6}$/.test(h)) window.rhOpenCodeCard(h.slice(5));
  }
  window.addEventListener("hashchange", fromHash);
  function boot() {
    if (!email()) return;
    ensure();
    load("");
    if (window.__rhPendingCode) window.rhOpenCodeCard(window.__rhPendingCode);
    fromHash();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
