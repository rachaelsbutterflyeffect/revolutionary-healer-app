/* ===== UI REFRESH: screens, Home, Shifting cards, Embodied pill, GAP Step 2 chips =====
   Runs after all of app.html's own scripts. It never replaces live logic: it wraps the live
   routers (showMain / showPage / goToMyRevolution / rhOpenChatWithMessage / renderFocusAndShifts /
   setupDay2 / sendToGapChat) and calls the originals first. Every API call below is an existing
   live endpoint (PATCH /api/shifts) or the live functions themselves. */
(function () {
  if (typeof RH_EMAIL === 'undefined' || !RH_EMAIL) return;
  var B = document.body, RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SUPPORT = 'contactrachaelsbutterflyeffect@gmail.com';
  var MANAGE = 'https://www.rachaelsbutterflyeffect.com/settings/account';
  function $(s) { return document.querySelector(s); }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // ---------- screens ----------
  var NAV_FOR = { home: 'home', focus: 'focus', chat: 'chat', rev: 'rev' };
  var curPage = null;
  function navKey(s) {
    if (NAV_FOR[s]) return NAV_FOR[s];
    if (s === 'page') { if (curPage === 'activations-page' || curPage === 'activation-detail-page') return 'lib'; if (curPage === 'favorites-page') return 'rev'; }
    return '';
  }
  function rfGo(s, opts) {
    opts = opts || {};
    B.setAttribute('data-rf', s);
    var k = navKey(s);
    document.querySelectorAll('#rf-nav button').forEach(function (b) { var on = b.getAttribute('data-rf-nav') === k; b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    if (!opts.keepScroll) { try { window.scrollTo(0, 0); } catch (e) {} }
    if (s === 'chat') { sizeChat(); setTimeout(sizeChat, 60); }
    if (s === 'home') revealHome();
    if (s === 'account') fillAccount();
  }
  window.rfGo = rfGo;

  var _showMain = window.showMain;
  showMain = window.showMain = function () { var r = _showMain.apply(this, arguments); curPage = null; rfGo('home'); return r; };
  var _showPage = window.showPage;
  showPage = window.showPage = function (id) {
    if (id === 'membership-management-page') { window.open(MANAGE, '_blank', 'noopener'); return; }
    var r = _showPage.apply(this, arguments); curPage = id; rfGo('page'); return r;
  };
  var _goRev = window.goToMyRevolution;
  goToMyRevolution = window.goToMyRevolution = function () { var r = _goRev.apply(this, arguments); curPage = null; rfGo('rev'); return r; };
  var _openChat = window.rhOpenChatWithMessage;
  rhOpenChatWithMessage = window.rhOpenChatWithMessage = function () { var r = _openChat.apply(this, arguments); rfGo('chat'); toBottom(); return r; };
  // CCM "Tell me more" runs showMain() + addRhMessage(): land on Chat right after it.
  document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('[data-ccm-more]')) setTimeout(function () { rfGo('chat'); toBottom(); }, 0); }, true);
  // SpookBound is not part of the refresh: anything that would open it goes to the library instead.
  var _hacc = window.handleActivationCardClick;
  handleActivationCardClick = window.handleActivationCardClick = function (slug) {
    if (slug === 'spookbound-2026') { showPage('activations-page'); return; }
    return _hacc.apply(this, arguments);
  };
  function stripSpook(root) { (root || document).querySelectorAll('[data-activation-slug="spookbound-2026"]').forEach(function (n) { n.remove(); }); }
  stripSpook();
  new MutationObserver(function (ms) { ms.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1) { if (n.getAttribute('data-activation-slug') === 'spookbound-2026') n.remove(); else stripSpook(n); } }); }); }).observe(B, { childList: true, subtree: true });

  // every [data-rf-go] / nav button
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-rf-go],[data-rf-nav]'); if (!t) return;
    var g = t.getAttribute('data-rf-go') || t.getAttribute('data-rf-nav');
    e.preventDefault();
    if (g === 'home') showMain();
    else if (g === 'focus') { _goRev(); curPage = null; rfGo('focus'); }
    else if (g === 'chat') { showMain(); rfGo('chat'); toBottom(); }
    else if (g === 'lib') showPage('activations-page');
    else if (g === 'rev') goToMyRevolution();
    else if (g === 'shifts') { goToMyRevolution(); var l = $('#my-revolution [data-role="shifts-list"]'); if (l) setTimeout(function () { l.scrollIntoView({ block: 'start', behavior: RM ? 'auto' : 'smooth' }); }, 30); }
    else if (g === 'profile') showPage('profile-page');
    else if (g === 'gap') startGap();
    else rfGo(g);
  });
  function startGap() {
    // Same entry as the live GAP Method button (it also resumes a pop-up closed mid-way).
    var b = document.getElementById('gap-method-starter-btn');
    if (b) b.click(); else startGapMethodInChat();
  }
  // Ask Rachael Anything: a fresh chat that opens on the member's own first message.
  var LANES = {
    gifts: 'I want to explore my spiritual gifts.',
    money: 'I want to shift my money energy.',
    energy: 'I want to tune my energy and frequency.',
    vis: 'I want to be seen more in my business.'
  };
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-rf-lane]'); if (!t) return;
    var text = LANES[t.getAttribute('data-rf-lane')]; if (!text) return;
    showMain(); rfGo('chat');
    try { if (typeof rhStartNewChat === 'function') rhStartNewChat(); } catch (err) {}
    var input = document.getElementById('chat-input');
    if (input) { input.value = text; try { sendHeroChat(); } catch (err) {} }
    toBottom();
  });

  // ---------- chat sizing: never under the nav, keyboard-aware ----------
  function isField(el) { return el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !/^(button|checkbox|radio|submit|reset|range|color|file|image)$/i.test(el.type || ''))); }
  // The on-screen keyboard is open when a text field has focus AND the visible height has dropped
  // well below this width's full height (iOS shrinks the visual viewport, Android the window).
  var fullH = {};
  function noteFull() { var w = window.innerWidth, h = Math.max(window.innerHeight, window.visualViewport ? visualViewport.height : 0); if (!isField(document.activeElement) || !fullH[w]) fullH[w] = Math.max(fullH[w] || 0, h); }
  function kbOpen() {
    var a = document.activeElement;
    if (!isField(a) || (a.closest && a.closest('#hero-gap-embed'))) return false;
    var vh = window.visualViewport ? visualViewport.height : window.innerHeight, full = fullH[window.innerWidth] || window.innerHeight;
    return vh < full - 120;
  }
  function sizeChat() {
    var shell = document.getElementById('rh-chat-shell'); if (!shell || B.getAttribute('data-rf') !== 'chat') return;
    noteFull(); var kb = kbOpen(); B.classList.toggle('rf-kb', kb);
    var vv = window.visualViewport, vh = vv ? vv.height : window.innerHeight;
    var top = shell.getBoundingClientRect().top + (vv ? 0 : 0);
    if (top < 0 || top > vh) top = 70;
    var room = kb ? 8 : 104; // nav height + gap
    shell.style.setProperty('--rf-chat-h', Math.max(220, Math.round(vh - top - room)) + 'px');
    B.style.setProperty('--rf-chat-h', Math.max(220, Math.round(vh - top - room)) + 'px');
  }
  window.rfSizeChat = sizeChat;
  function toBottom() { var th = document.getElementById('rh-chat-thread'); if (th) setTimeout(function () { th.scrollTop = th.scrollHeight; }, 30); }
  noteFull(); window.addEventListener('resize', sizeChat);
  if (window.visualViewport) { visualViewport.addEventListener('resize', sizeChat); visualViewport.addEventListener('scroll', sizeChat); }
  document.addEventListener('focusin', function (e) { if (isField(e.target)) { B.classList.toggle('rf-kb', kbOpen()); sizeChat(); } });
  document.addEventListener('focusout', function () { setTimeout(function () { B.classList.toggle('rf-kb', kbOpen()); sizeChat(); }, 50); });

  // an empty Send puts the cursor in the message box instead of doing nothing
  var sendBtn = document.getElementById('hero-speak-btn');
  if (sendBtn) sendBtn.addEventListener('click', function () { var i = document.getElementById('chat-input'); if (i && !i.value.trim()) { try { i.focus(); } catch (e) {} } });

  // ---------- greeting ----------
  function usableName(n) { n = String(n || '').trim(); if (!n || /@/.test(n) || /^(test|tester|testing|test\s*user|member|user|demo|sample|null|undefined)\d*$/i.test(n)) return ''; return n.split(/\s+/)[0]; }
  function firstName() { return usableName(window.__RF_FIRST); }
  function greetFor(h) { var p = h >= 5 && h < 12 ? 'Good morning' : h >= 12 && h < 17 ? 'Good afternoon' : h >= 17 && h < 22 ? 'Good evening' : 'Good night'; return p + ', ' + (firstName() || 'Revolutionary Healer') + '.'; }
  var greet = '', gi = 0, gt = null;
  function typeGreet() {
    var say = document.getElementById('rf-say'); if (!say) return;
    greet = greetFor(new Date().getHours()); gi = 0; clearTimeout(gt);
    say.setAttribute('aria-label', greet);
    (function step() { say.textContent = greet.slice(0, ++gi); if (gi < greet.length) gt = setTimeout(step, RM ? 0 : 45); })();
  }
  setInterval(function () { var g = greetFor(new Date().getHours()); if (g !== greet) { greet = g; var say = document.getElementById('rf-say'); if (say) say.textContent = g; } }, 60000);
  document.addEventListener('rf:name', function () { typeGreet(); fillAccount(); fixWelcome(); });
  function fixWelcome() { var w = document.getElementById('profile-welcome-line'); if (w) w.textContent = firstName() ? 'Welcome back, ' + firstName() + '.' : 'Welcome back.'; }
  var _ipf = window.initProfileFields;
  if (typeof _ipf === 'function') { initProfileFields = window.initProfileFields = function () { var r = _ipf.apply(this, arguments); fixWelcome(); return r; }; }
  fixWelcome();
  var revealed = false;
  function revealHome() {
    if (!revealed) { revealed = true; typeGreet(); }
    var els = document.querySelectorAll('#rf-home .rf-reveal');
    if (!('IntersectionObserver' in window) || RM) { els.forEach(function (x) { x.classList.add('in'); }); return; }
    var io = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }); }, { threshold: .08 });
    els.forEach(function (x) { if (!x.classList.contains('in')) io.observe(x); });
  }

  // ---------- Account / Support ----------
  function fillAccount() {
    var n = firstName(), row = document.getElementById('rf-ac-name-row');
    if (row) { row.hidden = !n; var b = document.getElementById('rf-ac-name'); if (b) b.textContent = n; }
    var em = document.getElementById('rf-ac-email'); if (em) em.textContent = RH_EMAIL;
    var ms = document.getElementById('member-since-value'), msRow = document.getElementById('rf-ac-since-row');
    if (msRow && ms) msRow.hidden = !(ms.textContent || '').trim();
  }
  try { SUPPORT_EMAIL = SUPPORT; } catch (e) {}
  var cs = document.getElementById('btn-contact-support'); if (cs) cs.href = 'mailto:' + SUPPORT;
  var _pms = window.populateMemberSinceIfReady;
  if (typeof _pms === 'function') { populateMemberSinceIfReady = window.populateMemberSinceIfReady = function () { var r = _pms.apply(this, arguments); fillAccount(); return r; }; }
  var faqRow = document.getElementById('rf-faqrow'), faqs = document.getElementById('rf-faqs');
  if (faqRow && faqs) faqRow.addEventListener('click', function () { var open = faqs.hidden; faqs.hidden = !open; faqRow.setAttribute('aria-expanded', String(open)); });
  document.querySelectorAll('.rf-fq').forEach(function (q) {
    q.addEventListener('click', function () { var f = q.closest('.rf-faq'), a = f.querySelector('.rf-fa'), open = a.hidden; a.hidden = !open; f.classList.toggle('open', open); q.setAttribute('aria-expanded', String(open)); });
  });

  // ---------- Shifting cards + Embodied pill ----------
  function pillHtml(s) {
    return s.statusClass === 'embodied' ? '<span class="rf-pill emb">Embodied</span>'
      : '<button type="button" class="rf-pill" data-rf-emb="' + esc(s.id) + '">Mark Embodied</button>';
  }
  function bubbles(shifts) {
    document.querySelectorAll('[data-role="shifts-list"]').forEach(function (list) {
      list.querySelectorAll('.rf-sbub').forEach(function (n) { n.remove(); });
      shifts.forEach(function (s) {
        var d = document.createElement('div');
        d.className = 'rf-sbub'; d.setAttribute('role', 'button'); d.tabIndex = 0; d.setAttribute('data-shift-id', String(s.id));
        d.innerHTML = '<div class="rf-orb" aria-hidden="true">✦</div><div class="bt"><div class="src">' + esc(s.method || 'GAP Method') + '</div><div class="nm">' + esc(s.identity) + '</div><div class="fr">Current Frequency: ' + esc(s.frequency) + '</div><div class="dt">' + esc(s.date) + '</div></div>' + pillHtml(s);
        list.appendChild(d);
      });
    });
    // focus card: the same pill, for the Shift it shows
    var fb = document.querySelector('[data-role="focus-open"]'), ff = document.querySelector('.focus-card-footer');
    if (fb && ff) {
      var old = ff.querySelector('.rf-pill'); if (old) old.remove();
      var id = fb.getAttribute('data-shift-id'), s = (window.SHIFTS || shifts).filter(function (x) { return String(x.id) === String(id); })[0];
      if (s) { var w = document.createElement('div'); w.innerHTML = pillHtml(s); var p = w.firstChild; p.style.alignSelf = 'flex-start'; ff.insertBefore(p, fb); }
    }
  }
  var _rfs = window.renderFocusAndShifts;
  renderFocusAndShifts = window.renderFocusAndShifts = function (shifts) { var r = _rfs.apply(this, arguments); try { bubbles(shifts || []); } catch (e) {} return r; };
  document.addEventListener('click', function (e) {
    var p = e.target.closest && e.target.closest('[data-rf-emb]');
    if (p) { e.stopPropagation(); e.preventDefault(); embody(p.getAttribute('data-rf-emb'), p); return; }
    var c = e.target.closest && e.target.closest('.rf-sbub');
    if (c) openShiftModal(c.getAttribute('data-shift-id'));
  });
  document.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('rf-sbub')) { e.preventDefault(); openShiftModal(e.target.getAttribute('data-shift-id')); } });
  function embody(id, btn) {
    if (!id || btn.getAttribute('aria-busy') === 'true') return;
    btn.setAttribute('aria-busy', 'true'); btn.disabled = true; btn.textContent = 'Saving…';
    fetch('/api/shifts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id, email: RH_EMAIL, progressStatus: 'embodied' }) })
      .then(function (r) { if (!r.ok) throw new Error('status ' + r.status); return r.json(); })
      .then(function () {
        (window.SHIFTS || []).forEach(function (s) { if (String(s.id) === String(id)) { s.statusClass = 'embodied'; s.statusLabel = '\ud83d\udfe2 Embodied'; } });
        renderFocusAndShifts(window.SHIFTS || []);
        var cur = window.__rhCurrentShift; if (cur && String(cur.id) === String(id) && typeof renderShiftModal === 'function') renderShiftModal(cur);
      })
      .catch(function () {
        btn.removeAttribute('aria-busy'); btn.disabled = false; btn.textContent = 'Mark Embodied';
        rhSheet({ message: "We couldn't mark that Shift as Embodied. Please try again.", alert: true, okLabel: 'OK' });
      });
  }
  // the enlarged Shift bubble: a visible Delete (the fixed, exact-id flow)
  var del = document.getElementById('rf-shift-delete');
  if (del) del.addEventListener('click', function () {
    var m = document.getElementById('shift-modal'), id = m && m.getAttribute('data-shift-id');
    if (!id || m.classList.contains('shift-modal-missing')) return;
    rhDeleteShift(id);
  });

  // ---------- GAP Step 2 quick-reply chips (all four topics) ----------
  var CHIPS = {
    money: { topic: 'money', chips: ['Receiving more?', 'Charging my worth', 'Clearing old stories'] },
    business: { topic: 'business and visibility', chips: ['Being seen more?', 'Sharing my offers', 'Clearing fear of judgment'] },
    gifts: { topic: 'your spiritual gifts', chips: ['Trusting my intuition?', 'Owning my gifts', 'Clearing old blocks'] },
    energy: { topic: 'energy and frequency', chips: ['Feeling lighter?', 'Protecting my energy', 'Clearing heavy energy'] }
  };
  function removeChips() { var c = document.getElementById('mk-chips'); if (c) c.remove(); }
  if (typeof setupDay2 === 'function' && typeof sendToGapChat === 'function') {
    var liveSetup = setupDay2;
    setupDay2 = window.setupDay2 = function () {
      var r = liveSetup.apply(this, arguments);
      try {
        removeChips();
        var d = CHIPS[selectedDomain], log = document.getElementById('chat-log');
        if (!d || !log || log.querySelector('.bubble.user')) return r; // only before the member's first reply
        var w = document.createElement('div'); w.id = 'mk-chips'; w.className = 'mk-chips';
        var p = document.createElement('p'); p.className = 'mk-see'; p.textContent = 'I see that you want to look at ' + d.topic + '.'; w.appendChild(p);
        var row = document.createElement('div'); row.className = 'mk-chip-row'; w.appendChild(row);
        d.chips.forEach(function (t) {
          var b = document.createElement('button'); b.type = 'button'; b.className = 'mk-chip'; b.textContent = t;
          b.onclick = function () { var input = document.getElementById('gap-chat-input'); if (!input || input.disabled) return; input.value = t; sendChat(); };
          row.appendChild(b);
        });
        log.appendChild(w); log.scrollTop = log.scrollHeight;
      } catch (e) {}
      return r;
    };
    var liveSend = sendToGapChat;
    sendToGapChat = window.sendToGapChat = function () { removeChips(); return liveSend.apply(this, arguments); };
  }

  // ---------- starfield + butterfly ----------
  var sky = document.getElementById('rf-sky'), fly = document.getElementById('rf-fly');
  if (sky && sky.getContext) {
    var sx = sky.getContext('2d'), W, H, stars = [], px = 0, py = 0;
    var rs = function () { var d = Math.min(window.devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight; sky.width = W * d; sky.height = H * d; sky.style.width = W + 'px'; sky.style.height = H + 'px'; sx.setTransform(d, 0, 0, d, 0, 0);
      stars = Array.from({ length: 110 }, function () { return { x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.4 + .2, z: Math.random() * .8 + .2, p: Math.random() * 6, g: Math.random() < .35 }; }); };
    rs(); addEventListener('resize', rs);
    addEventListener('pointermove', function (e) { px = (e.clientX / W - .5) * 14; py = (e.clientY / H - .5) * 14; });
    var fx = fly && fly.getContext('2d'), FW = 0, FH = 0, pts = [], vort = [];
    var rf = function () { if (!fx) return; var d = Math.min(window.devicePixelRatio || 1, 2); FW = fly.clientWidth; FH = fly.clientHeight; if (!FW || !FH) return; fly.width = FW * d; fly.height = FH * d; fx.setTransform(d, 0, 0, d, 0, 0);
      pts = Array.from({ length: 520 }, function () { var t = Math.random() * Math.PI * 2, side = Math.random() < .5 ? -1 : 1; var r = (Math.exp(Math.sin(t)) - 2 * Math.cos(4 * t) + Math.pow(Math.sin((2 * t - Math.PI) / 24), 5)) * Math.pow(Math.random(), .35); return { bx: Math.sin(t) * r * side, by: -Math.cos(t) * r, s: side, j: Math.random() * 6, c: Math.random() < .18 }; });
      var k = Math.min(FW, FH) / 7.2; vort = Array.from({ length: 140 }, function () { return { a: Math.random() * 7, r: k * (.9 + Math.random() * 2.4), w: .004 + Math.random() * .01, inw: Math.random() < .4 ? .08 + Math.random() * .15 : 0, s: Math.random() * 1.6 + .4, j: Math.random() * 6, c: Math.random() < .4 }; }); };
    addEventListener('resize', rf);
    var T = 0;
    var frame = function () {
      T += .016;
      if (!document.hidden) {
        sx.clearRect(0, 0, W, H);
        for (var i = 0; i < stars.length; i++) { var s = stars[i], a = .45 + .55 * Math.sin(T * 1.5 + s.p); sx.fillStyle = s.g ? 'rgba(255,226,150,' + a + ')' : 'rgba(220,255,250,' + (a * .8) + ')'; sx.beginPath(); sx.arc(s.x + px * s.z, s.y + py * s.z, s.r, 0, 7); sx.fill(); }
        if (fx && B.getAttribute('data-rf') === 'home' && !B.classList.contains('gm-lock')) {
          if (!FW || fly.clientWidth !== FW) rf();
          if (FW) {
            fx.clearRect(0, 0, FW, FH); var cx = FW / 2 + px * .6, cy = FH / 2 - 6 + py * .6, k = Math.min(FW, FH) / 7.2;
            fx.globalCompositeOperation = 'lighter';
            for (var j = 0; j < pts.length; j++) { var p = pts[j]; var x = cx + Math.abs(p.bx) * p.s * k * .92 + Math.sin(T * .6 + p.j) * .8, y = cy + p.by * k * .9 + Math.cos(T * .5 + p.j) * .8; fx.fillStyle = p.c ? 'rgba(110,240,228,.75)' : 'rgba(255,224,150,.8)'; fx.fillRect(x, y, 1.6, 1.6); }
            fx.fillStyle = 'rgba(255,246,214,.9)'; fx.fillRect(cx - 1, cy - k * .9, 2, k * 1.6);
            for (var q = 0; q < vort.length; q++) { var v = vort[q]; v.a += v.w * (RM ? 0 : 1); v.r -= v.inw * (RM ? 0 : 1); if (v.r < k * .4) { v.r = k * (2 + Math.random() * 1.4); v.a = Math.random() * 7; }
              var tw = .35 + .65 * Math.abs(Math.sin(T * 2 + v.j)), vx = cx + Math.cos(v.a) * v.r, vy = cy + Math.sin(v.a) * v.r * .62;
              fx.fillStyle = v.c ? 'rgba(110,240,228,' + tw + ')' : 'rgba(255,226,150,' + tw + ')'; fx.beginPath(); fx.arc(vx, vy, v.s, 0, 7); fx.fill();
              if (v.s > 1.3) { fx.fillRect(vx - v.s * 2.5, vy - .3, v.s * 5, .6); fx.fillRect(vx - .3, vy - v.s * 2.5, .6, v.s * 5); } }
            fx.globalCompositeOperation = 'source-over';
          }
        }
      }
      if (!RM) requestAnimationFrame(frame);
    };
    frame(); if (RM) setTimeout(frame, 300);
  }

  // ---------- first screen ----------
  var h = (location.hash || '').slice(1);
  var START = { focus: 'focus', chat: 'chat', activations: 'lib', revolution: 'rev', profile: 'profile' };
  if (h === 'favorites-page') { rhOpenFavorites(); }
  else if (START[h]) { var fake = document.createElement('span'); fake.setAttribute('data-rf-go', START[h]); B.appendChild(fake); fake.click(); fake.remove(); }
  else rfGo('home');
})();
