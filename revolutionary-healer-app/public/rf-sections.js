/* Shared reader for /api/revolution-sections (My Revolution sections + stat-row counts). Loaded by rf-sections / rf-tracking. */
(function () {
  if (window.rfRevData) return;
  var cur = null, at = 0;
  function email() { return (typeof RH_EMAIL !== 'undefined' && RH_EMAIL) || ''; }
  window.rfRevData = function (force) {
    if (cur && !force && Date.now() - at < 30000) return cur;
    var em = email(); if (!em) return Promise.resolve(null);
    at = Date.now();
    cur = fetch('/api/revolution-sections?email=' + encodeURIComponent(em), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
      .then(function (d) { if (d) { window.__rfRevData = d; try { document.dispatchEvent(new CustomEvent('rf:rev-data', { detail: d })); } catch (e) {} } return d; });
    return cur;
  };
})();
/* My Revolution in three sections (Oct 15 2026, exact-list SAVE_SECTIONS): GAP Method™ (completed runs), My Shifting
 * Cards (the existing Shift cards, unchanged), Codes (every pulled code, with its date). Every code pull is saved
 * (POST /api/code-pulls). Read side: /api/revolution-sections, computed from existing rows (nothing rewritten). */
(function () {
  if (window.__rfSections) return; window.__rfSections = 1;
  function email() { return (typeof RH_EMAIL !== 'undefined' && RH_EMAIL) || ''; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function day(v) { var d = v ? new Date(v) : null; return d && !isNaN(d) ? d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''; }
  function data(f) { return window.rfRevData ? window.rfRevData(f) : Promise.resolve(null); }
  var STAR = '<img src="/images/icons/app-emoji-star.png" class="app-emoji-icon" alt="">';
  // 1) every pull is saved
  document.addEventListener('rf:code-pulled', function (ev) {
    var cd = ev.detail, em = email(); if (!cd || !em) return;
    fetch('/api/code-pulls', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: em, name: cd.n, card: cd.f, code: cd.c }) })
      .then(function (r) { window.__rfLastPullSaved = r.ok; return r.ok && data(true); }).catch(function () { window.__rfLastPullSaved = false; });
  });
  // 2) the sections (preview, Rachael Oct 15): My Most Recent Shifts (newest 3 real cards), My Shifting Cards (two
  // in-place accordions, GAP Method™ Shifts and Code Upgrade Shifts, each listing ALL of that type, newest first),
  // then Codes. Every list is a real [data-role="shifts-list"], so the refresh's own cards render into it with all
  // their behaviour; each list is filtered synchronously (MutationObserver) so nothing flashes or jumps.
  var ACC = [['gap', '◈', 'GAP Method™ Shifts', 'Your GAP Method™ Shifts will gather here.'], ['code', '✧', 'Code Upgrade Shifts', 'Codes you save as Shifting cards will gather here.'], ['other', '❋', 'Other Shifts', '']];
  function kind(s) { return !s ? '' : s.method === 'GAP Method' ? 'gap' : s.method === 'Code Upgrade' ? 'code' : 'other'; }
  function shiftsArr() { return window.SHIFTS || []; }
  var lastList = null; // only the list the member tapped keeps its card open (no duplicate open cards elsewhere)
  function filter(list) {
    var f = list.getAttribute('data-rf-filter') || 'recent', all = shiftsArr(), top = all.slice(0, 3).map(function (x) { return String(x.id); });
    var n = 0;
    Array.prototype.forEach.call(list.children, function (el) {
      if (!el.classList.contains('rf-sbub')) { if (f !== 'recent') el.classList.add('rf-xhide'); return; }
      var id = el.getAttribute('data-shift-id'), s = all.find(function (x) { return String(x.id) === id; });
      var show = f === 'recent' ? top.indexOf(id) >= 0 : kind(s) === f;
      el.classList.toggle('rf-xhide', !show); if (show) n++;
      if (lastList && list !== lastList && el.classList.contains('open')) { el.classList.remove('open'); el.setAttribute('aria-expanded', 'false'); }
    });
    if (f !== 'recent') {
      var acc = list.closest('.rf-acc'); if (acc) { acc.querySelector('.rf-acc-n').textContent = '(' + n + ')'; var em = acc.querySelector('.rf-rempty'); if (em) em.hidden = n > 0; if (f === 'other') acc.hidden = n === 0; }
    }
  }
  function watch(list) {
    if (list.__rfF) return; list.__rfF = true;
    new MutationObserver(function () { filter(list); }).observe(list, { childList: true });
    list.addEventListener('pointerdown', function () { lastList = list; }, true);
    list.addEventListener('keydown', function () { lastList = list; }, true);
    filter(list);
  }
  var needPaint = false;
  function ensure() {
    var list = document.querySelector('#my-revolution .revolution-subsection [data-role="shifts-list"]:not([data-rf-filter])'); if (!list) return null;
    var sub = list.closest('.revolution-subsection'); if (!sub) return null;
    var h = sub.querySelector('.subsection-head h3'); if (h && !h.hasAttribute('data-orig')) { h.setAttribute('data-orig', h.textContent); h.innerHTML = STAR + ' My Most Recent Shifts'; }
    sub.classList.add('rf-recent'); watch(list);
    var cards = document.getElementById('rf-sec-cards');
    if (!cards) {
      cards = document.createElement('div'); cards.className = 'revolution-subsection rf-rsec'; cards.id = 'rf-sec-cards';
      cards.innerHTML = '<div class="subsection-head"><h3>' + STAR + ' My Shifting Cards</h3></div>' + ACC.map(function (a) {
        return '<div class="rf-acc" data-acc="' + a[0] + '"' + (a[0] === 'other' ? ' hidden' : '') + '><button type="button" class="rf-acc-btn" aria-expanded="false" aria-controls="rf-acc-' + a[0] + '"><span class="rf-orb" aria-hidden="true">' + a[1] + '</span><span class="txt">' + a[2] + ' <span class="rf-acc-n"></span></span><span class="rf-chev" aria-hidden="true"></span></button>' +
          '<div class="rf-acc-panel" id="rf-acc-' + a[0] + '" hidden><div class="shifts-list rf-acc-list" data-role="shifts-list" data-rf-filter="' + a[0] + '"></div>' + (a[3] ? '<p class="rf-rempty" hidden>' + a[3] + '</p>' : '') + '</div></div>';
      }).join('');
      sub.parentNode.insertBefore(cards, sub.nextSibling);
      cards.querySelectorAll('[data-rf-filter]').forEach(watch);
      needPaint = true;
    }
    var c = document.getElementById('rf-sec-codes');
    if (!c) {
      c = document.createElement('div'); c.className = 'revolution-subsection rf-rsec'; c.id = 'rf-sec-codes';
      c.innerHTML = '<div class="subsection-head"><h3>' + STAR + ' Codes</h3></div><div class="rf-rlist rf-codes-list" data-rf-list="codes"></div>';
      cards.parentNode.insertBefore(c, cards.nextSibling);
    }
    // the new lists fill on the next render; ask for one as soon as the Shifts are loaded
    if (needPaint && shiftsArr().length && typeof window.renderFocusAndShifts === 'function') { needPaint = false; try { window.renderFocusAndShifts(shiftsArr()); } catch (e) {} }
    return { c: c.querySelector('[data-rf-list]') };
  }
  // accordion: expands in place, collapsed by default, chevron turns
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.rf-acc-btn'); if (!b) return;
    var panel = document.getElementById(b.getAttribute('aria-controls')); if (!panel) return;
    var open = panel.hidden; panel.hidden = !open; b.setAttribute('aria-expanded', String(open)); b.parentNode.classList.toggle('open', open);
    if (open) { var l = panel.querySelector('[data-rf-filter]'); if (l) filter(l); }
  });
  var showAll = false, CAP = 4;
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-rf-more]'); if (!b) return;
    showAll = !showAll; render(window.__rfRevData);
    if (!showAll) { var sec = document.getElementById('rf-sec-codes'); if (sec) sec.scrollIntoView({ block: 'start' }); }
  });
  function render(d) {
    var el = ensure(); if (!el || !d || !d.codes) return;
    var list = showAll ? d.codes : d.codes.slice(0, CAP);
    el.c.innerHTML = d.codes.length ? list.map(function (x) {
      return '<div class="rf-ritem rf-citem">' + (x.card ? '<img class="rf-cthumb" src="/code-cards/' + esc(x.card) + '.webp" alt="" loading="lazy">' : '') + '<span class="bt"><span class="nm">' + esc(x.name) + '</span>' +
        (x.code ? '<span class="fr">' + esc(x.code) + '</span>' : '') + '<span class="dt">' + (x.from === 'saved' ? 'Saved ' : 'Pulled ') + esc(day(x.at)) + '</span></span></div>';
    }).join('') + (d.codes.length > CAP ? '<button type="button" class="rf-rmore" data-rf-more="codes" aria-expanded="' + showAll + '">' + (showAll ? 'Show fewer' : 'Show all ' + d.codes.length) + '</button>' : '') : '<p class="rf-rempty">Every code you pull on Today\'s Focus is kept here.</p>';
  }
  document.addEventListener('rf:rev-data', function (ev) { render(ev.detail); });
  // re-read when the Shifts change (a GAP run completed, a card saved or deleted)
  var lastN = -1, q = false;
  new MutationObserver(function () {
    if (q) return; q = true; requestAnimationFrame(function () { q = false; ensure(); var n = (window.SHIFTS || []).length; if (n !== lastN) { var first = lastN < 0; lastN = n; data(!first); } });
  }).observe(document.body, { childList: true, subtree: true });
  data(false).then(render);
})();
