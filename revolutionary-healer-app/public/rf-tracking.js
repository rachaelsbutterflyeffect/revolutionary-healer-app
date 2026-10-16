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
/* My Revolution stat row (Oct 15 2026, exact-list METHOD_TRACKING), from mock-up r17: GAP SCANS / SHIFTS / CODES.
 * Counts come from history (computed at read time from existing rows), then grow. Zero rule: never a bare "0";
 * an empty count shows the starter mark ✧ and "first one waiting". */
(function () {
  if (window.__rfTracking) return; window.__rfTracking = 1;
  // [key, plural label, singular label, plural description, singular description]: 1 reads '1 GAP Scan', '1 Shift', '1 Code'
  var ROW = [['gapScans', 'GAP Scans', 'GAP Scan', 'GAP Method™ runs completed', 'GAP Method™ run completed'], ['shifts', 'Shifts', 'Shift', 'Shifting cards created', 'Shifting card created'], ['codes', 'Codes', 'Code', 'codes pulled', 'code pulled']];
  function mount() {
    var head = document.getElementById('rf-rev-head'); if (!head) return null;
    var r = document.getElementById('rf-stats');
    if (!r) {
      r = document.createElement('div'); r.id = 'rf-stats'; r.className = 'rf-stats'; r.setAttribute('role', 'list');
      r.innerHTML = ROW.map(function (x) { return '<div class="rf-stat" role="listitem" data-k="' + x[0] + '"><b>·</b><small>' + x[1] + '</small><i class="rf-stat-start" hidden>first one waiting</i></div>'; }).join('');
      head.appendChild(r);
    }
    return r;
  }
  function draw(d) {
    var r = mount(); if (!r || !d || !d.counts) return;
    ROW.forEach(function (x) {
      var el = r.querySelector('[data-k="' + x[0] + '"]'), n = +d.counts[x[0]] || 0;
      el.querySelector('b').textContent = n > 0 ? String(n) : '✧'; el.classList.toggle('zero', n === 0);
      el.querySelector('.rf-stat-start').hidden = n > 0;
      el.querySelector('small').textContent = n === 1 ? x[2] : x[1];
      el.setAttribute('aria-label', n > 0 ? n + ' ' + (n === 1 ? x[4] : x[3]) : 'No ' + x[3] + ' yet');
    });
  }
  document.addEventListener('rf:rev-data', function (ev) { draw(ev.detail); });
  var q = false, lastN = -1;
  new MutationObserver(function () { if (q) return; q = true; requestAnimationFrame(function () { q = false; mount(); var n = (window.SHIFTS || []).length; if (lastN >= 0 && n !== lastN && window.rfRevData) window.rfRevData(true); lastN = n; }); }).observe(document.body, { childList: true, subtree: true });
  if (window.__rfRevData) draw(window.__rfRevData);
  if (window.rfRevData) window.rfRevData(false).then(draw);
})();
