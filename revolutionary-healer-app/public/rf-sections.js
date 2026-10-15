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
  // 2) the sections
  function ensure() {
    var list = document.querySelector('#my-revolution [data-role="shifts-list"]'); if (!list) return null;
    var sub = list.closest('.revolution-subsection'); if (!sub) return null;
    var h = sub.querySelector('.subsection-head h3'); if (h && !h.hasAttribute('data-orig')) { h.setAttribute('data-orig', h.textContent); h.innerHTML = STAR + ' My Shifting Cards'; }
    var g = document.getElementById('rf-sec-gap');
    if (!g) {
      g = document.createElement('div'); g.className = 'revolution-subsection rf-rsec'; g.id = 'rf-sec-gap';
      g.innerHTML = '<div class="subsection-head"><h3>' + STAR + ' GAP Method™</h3></div><div class="rf-rlist" data-rf-list="gap"></div>';
      sub.parentNode.insertBefore(g, sub);
    }
    var c = document.getElementById('rf-sec-codes');
    if (!c) {
      c = document.createElement('div'); c.className = 'revolution-subsection rf-rsec'; c.id = 'rf-sec-codes';
      c.innerHTML = '<div class="subsection-head"><h3>' + STAR + ' Codes</h3></div><div class="rf-rlist rf-codes-list" data-rf-list="codes"></div>';
      sub.parentNode.insertBefore(c, sub.nextSibling);
    }
    return { g: g.querySelector('[data-rf-list]'), c: c.querySelector('[data-rf-list]') };
  }
  function render(d) {
    var el = ensure(); if (!el || !d || !d.gap) return;
    el.g.innerHTML = d.gap.length ? d.gap.map(function (x) {
      return '<button type="button" class="rf-ritem rf-gitem"' + (x.shiftId ? ' data-rf-shift="' + esc(x.shiftId) + '"' : ' disabled') + '><span class="rf-orb" aria-hidden="true">◈</span><span class="bt"><span class="nm">' + esc(x.identity || 'GAP Method™ run') + '</span>' +
        (x.frequency ? '<span class="fr">Current Frequency: ' + esc(x.frequency) + '</span>' : '') + '<span class="dt">Completed ' + esc(day(x.at)) + '</span></span>' + (x.shiftId ? '<span class="arr" aria-hidden="true">→</span>' : '') + '</button>';
    }).join('') : '<p class="rf-rempty">Each GAP Method™ run you complete gathers here.</p>';
    el.c.innerHTML = d.codes.length ? d.codes.map(function (x) {
      return '<div class="rf-ritem rf-citem">' + (x.card ? '<img class="rf-cthumb" src="/code-cards/' + esc(x.card) + '.webp" alt="" loading="lazy">' : '') + '<span class="bt"><span class="nm">' + esc(x.name) + '</span>' +
        (x.code ? '<span class="fr">' + esc(x.code) + '</span>' : '') + '<span class="dt">' + (x.from === 'saved' ? 'Saved ' : 'Pulled ') + esc(day(x.at)) + '</span></span></div>';
    }).join('') : '<p class="rf-rempty">Every code you pull on Today\'s Focus is kept here.</p>';
  }
  // A GAP run opens its Shifting card
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-rf-shift]'); if (!b) return;
    var card = document.querySelector('#my-revolution .rf-sbub[data-shift-id="' + b.getAttribute('data-rf-shift') + '"]'); if (!card) return;
    e.preventDefault(); card.scrollIntoView({ block: 'center', behavior: 'smooth' }); if (!card.classList.contains('open')) card.click();
  });
  document.addEventListener('rf:rev-data', function (ev) { render(ev.detail); });
  // re-read when the Shifts change (a GAP run completed, a card saved or deleted)
  var lastN = -1, q = false;
  new MutationObserver(function () {
    if (q) return; q = true; requestAnimationFrame(function () { q = false; ensure(); var n = (window.SHIFTS || []).length; if (n !== lastN) { var first = lastN < 0; lastN = n; data(!first); } });
  }).observe(document.body, { childList: true, subtree: true });
  data(false).then(render);
})();
