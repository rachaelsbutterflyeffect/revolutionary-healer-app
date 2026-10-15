/* ===== UI REFRESH: screens, Home, Shifting cards, Embodied pill, GAP Step 2 chips =====
   Runs after all of app.html's own scripts. It never replaces live logic: it wraps the live
   routers (showMain / showPage / goToMyRevolution / rhOpenChatWithMessage / renderFocusAndShifts /
   setupDay2 / sendToGapChat) and calls the originals first. Every API call below is an existing
   live endpoint (PATCH /api/shifts) or the live functions themselves. */
(function () {
  if (typeof RH_EMAIL === 'undefined' || !RH_EMAIL) return;
  var B = document.body, RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SUPPORT = 'Rachaelsbutterflyeffect@gmail.com';
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
  // ---------- smooth scrolling (Oct 15 round 3): decorative motion rests while the member scrolls or switches pages ----------
  var busyT = null;
  function busy(ms) { if (!B.classList.contains('rf-busy')) B.classList.add('rf-busy'); clearTimeout(busyT); busyT = setTimeout(function () { B.classList.remove('rf-busy'); }, ms || 180); }
  window.__rfBusy = function () { return B.classList.contains('rf-busy'); };
  addEventListener('scroll', function () { busy(180); }, { passive: true, capture: true });
  addEventListener('touchmove', function () { busy(220); }, { passive: true });
  addEventListener('wheel', function () { busy(180); }, { passive: true });
  function rfGo(s, opts) {
    opts = opts || {};
    busy(450);
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
    var from = curPage, r = _showPage.apply(this, arguments); curPage = id; rfGo('page');
    // back from an activation returns to the section it was opened from; any other way in starts at the sections
    if (id === 'activations-page') { if (from === 'activation-detail-page' && B.getAttribute('data-rf-lib') === 'cat') {} else libSections(); }
    return r;
  };
  // ---------- Activations: four big sections (mock-up) -> that section's activations ----------
  function libSections() {
    B.setAttribute('data-rf-lib', 'sections');
    document.querySelectorAll('#rf-lsecs .rf-lsec').forEach(function (b) {
      var cat = b.getAttribute('data-rf-sec'), n = 0;
      document.querySelectorAll('#activation-library-grid .media-card').forEach(function (c) { if ((c.getAttribute('data-category') || '').split(',').map(function (x) { return x.trim(); }).indexOf(cat) !== -1) n++; });
      var el = b.querySelector('[data-rf-count]'); if (el) el.textContent = n;
    });
  }
  function libSection(cat) {
    var chip = document.querySelector('.category-chips .filter-chip[data-category="' + cat + '"]');
    window.__rhLibExpanded = false;
    var se = document.getElementById('rh-lib-search'); if (se) se.value = '';
    if (chip) { try { selectCategoryChip(chip); } catch (e) { chip.click(); } }
    var sec = document.querySelector('#rf-lsecs [data-rf-sec="' + cat + '"] b'), tt = document.getElementById('rf-sec-ttl');
    if (tt) tt.textContent = sec ? sec.textContent : cat;
    B.setAttribute('data-rf-lib', 'cat');
    try { window.scrollTo(0, 0); } catch (e) {}
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-rf-sec]'); if (b) { e.preventDefault(); libSection(b.getAttribute('data-rf-sec')); return; }
    var a = e.target.closest && e.target.closest('[data-rf-allsecs]'); if (a) { e.preventDefault(); libSections(); try { window.scrollTo(0, 0); } catch (x) {} return; }
    // the section tabs inside a section switch the title with them
    var c = e.target.closest && e.target.closest('#rf-lib-sub .category-chips .filter-chip');
    if (c && B.getAttribute('data-rf-lib') === 'cat') { var sec = document.querySelector('#rf-lsecs [data-rf-sec="' + c.getAttribute('data-category') + '"] b'), tt = document.getElementById('rf-sec-ttl'); if (tt && sec) tt.textContent = sec.textContent; }
  });
  var _goRev0 = window.goToMyRevolution;
  var _goRev = function () {
    var siv = Element.prototype.scrollIntoView; Element.prototype.scrollIntoView = function () {};
    try { return _goRev0.apply(this, arguments); } finally { Element.prototype.scrollIntoView = siv; }
  };
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
  // Ask Rachael Anything (round 2): a lane opens a fresh chat with Rachael's scripted opener (instant, no API call,
  // typed like a reply) and the mock-up r17 option chips (feat/wow-mockup 6ffc46b: LANES / chips() / startLane()).
  // Tapping a chip removes the chips, the chip becomes the member's message, and the real chat API answers (streamed).
  // Spiritual Gifts opener + "I feel disconnected today": Rachael's own wording (Oct 15); the rest is the mock-up's.
  var LANES = {
    gifts: ['Spiritual Gifts', "Let's explore your spiritual gifts. What are you looking at?", ['I feel disconnected today', 'Trusting my intuition', 'Seeing signs', 'Opening my channel', 'Not sure yet']],
    money: ['Money & Prosperity', "Let's look at your money energy. Where do you want to feel the shift?", ['Receiving more', 'Charging my worth', 'Calm around money', 'Clearing old stories']],
    energy: ['Energy & Frequency', "Let's talk about your energy. What kind of energy shift are you looking for today?", ['More energy', 'Calm my nervous system', 'Focus', 'Confidence', 'Clear the static']],
    vis: ['Visibility & Impact', "Let's talk about being seen. What feels most true right now?", ["I'm ready to show up", 'Fear of judgment', 'Sharing my message', 'Growing my impact']]
  };
  window.RF_LANES = LANES;
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-rf-lane]'); if (!t) return;
    var lane = LANES[t.getAttribute('data-rf-lane')]; if (!lane) return;
    e.preventDefault();
    var a = document.activeElement; if (a && a.blur) a.blur();
    showMain(); rfGo('chat');
    var tries = 0;
    (function go() {
      if (window.__rhSending && tries++ < 240) { setTimeout(go, 250); return; } // a reply still streaming: open after it
      newChatNoKeyboard(); startLane(lane);
    })();
  });
  function laneThread() { return document.getElementById('rh-chat-thread'); }
  function clearLaneChips() { document.querySelectorAll('#rh-chat-thread .rf-chips').forEach(function (c) { c.remove(); }); }
  function startLane(lane) {
    var th = laneThread(); if (!th) return;
    removeTopics(); clearLaneChips();
    var w = document.getElementById('rh-chat-welcome'); if (w) w.style.display = 'none';
    var b = document.createElement('div'); b.className = 'rh-msg rh-msg-assistant rf-scripted rh-msg-streaming'; th.appendChild(b);
    var words = lane[1].match(/\S+\s*|\s+/g) || [], i = 0, txt = '';
    (function tick() {
      if (!b.isConnected) return; // she started another chat meanwhile
      var n = 1 + (Math.random() * 3 | 0); txt += words.slice(i, i + n).join(''); i += n; b.textContent = txt; toBottom();
      if (i < words.length) setTimeout(tick, RM ? 0 : 35 + Math.random() * 45);
      else { b.classList.remove('rh-msg-streaming'); laneChips(lane); }
    })();
  }
  function laneChips(lane) {
    var th = laneThread(); if (!th) return;
    var c = document.createElement('div'); c.className = 'rf-chips';
    lane[2].forEach(function (x) {
      var k = document.createElement('button'); k.type = 'button'; k.className = 'rf-chip'; k.textContent = x;
      k.onclick = function () { if (window.__rhSending) return; c.remove(); window.__rfLaneTopic = { topic: lane[0], opener: lane[1], text: x }; sendNoKeyboard(x); };
      c.appendChild(k);
    });
    th.appendChild(c); toBottom();
  }
  // the chip's message reaches the chat API with its topic (the scripted opener is not in the saved history)
  (function () {
    var f = window.fetch; if (!f) return;
    window.fetch = function (u, o) {
      try {
        var L = window.__rfLaneTopic;
        if (L && String(u).indexOf('/api/chat') === 0 && String(u).indexOf('/api/chats') !== 0 && o && o.method === 'POST' && typeof o.body === 'string') {
          var p = JSON.parse(o.body);
          if (p.message === L.text) { p.message = L.topic + ' (Rachael asked: "' + L.opener + '") ' + L.text; o = Object.assign({}, o, { body: JSON.stringify(p) }); }
          window.__rfLaneTopic = null;
        }
      } catch (x) {}
      return f.apply(this, [u, o]);
    };
  })();

  // ---------- chat: no keyboard unless the member taps the message box ----------
  // Live rhStartNewChat() ends with input.focus(): on iPhone that pops the keyboard (squashing the thread)
  // and scrolls the page to the box. In the refresh a lane, a topic bubble or the + button never focus it.
  function noFocus(fn) {
    var i = document.getElementById('chat-input'), y = window.scrollY;
    if (i) i.focus = function () {};
    try { return fn(); } finally { if (i) delete i.focus; if (window.scrollY !== y) window.scrollTo(0, y); }
  }
  function newChatNoKeyboard() { noFocus(function () { try { if (typeof rhStartNewChat === 'function') rhStartNewChat(); } catch (err) {} }); syncTopics(); }
  function sendNoKeyboard(text) {
    var input = document.getElementById('chat-input'); if (!input) return;
    var a = document.activeElement; if (a === input) input.blur();
    input.value = text; removeTopics();
    noFocus(function () { try { sendHeroChat(); } catch (err) {} });
    toBottom();
  }
  // the header + and the drawer's New chat: same new chat, the page does not move, no keyboard
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('#rh-new-chat-top-btn, #rh-new-chat-btn'); if (!b) return;
    e.preventDefault(); e.stopImmediatePropagation();
    var th = document.getElementById('rh-chat-thread');
    newChatNoKeyboard(); if (th) th.scrollTop = 0;
  }, true);

  // ---------- chat topic bubbles (mock-up chat screen): shown with the welcome on an empty chat ----------
  var TOPICS = ['Continue a shift', 'Something feels off', 'I want clarity', 'Help me with a decision'];
  function topicsEl() {
    var w = document.getElementById('rh-chat-welcome'); if (!w) return null;
    var c = document.getElementById('rf-topics');
    if (!c) {
      c = document.createElement('div'); c.id = 'rf-topics'; c.className = 'rf-topics';
      TOPICS.forEach(function (t) { var b = document.createElement('button'); b.type = 'button'; b.className = 'rf-topic'; b.textContent = t; b.onclick = function () { if (window.__rhSending) return; sendNoKeyboard(t); }; c.appendChild(b); });
      w.parentNode.insertBefore(c, w.nextSibling);
    }
    return c;
  }
  function removeTopics() { var c = document.getElementById('rf-topics'); if (c) c.hidden = true; }
  function syncTopics() {
    var w = document.getElementById('rh-chat-welcome'), th = document.getElementById('rh-chat-thread'); if (!w || !th) return;
    var empty = !th.querySelector('.rh-msg, .rh-thinking') && w.style.display !== 'none';
    var c = topicsEl(); if (!c) return;
    if (c.previousSibling !== w) w.parentNode.insertBefore(c, w.nextSibling);
    c.hidden = !empty;
  }
  (function () {
    var th = document.getElementById('rh-chat-thread'), w = document.getElementById('rh-chat-welcome');
    if (!th) return;
    var mo = new MutationObserver(function () { syncTopics(); });
    mo.observe(th, { childList: true }); if (w) mo.observe(w, { attributes: true, attributeFilter: ['style'] });
    syncTopics();
  })();
  // typing your own message also clears them (same as the mock-up)
  var sendBtn0 = document.getElementById('hero-speak-btn');
  if (sendBtn0) sendBtn0.addEventListener('click', function () { var i = document.getElementById('chat-input'); if (i && i.value.trim()) { removeTopics(); clearLaneChips(); window.__rfLaneTopic = null; } }, true);

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
    var vv = window.visualViewport, vh = vv ? vv.height : window.innerHeight, off = vv ? vv.offsetTop : 0;
    // iOS: the keyboard shrinks the visual viewport and may scroll it (offsetTop); the layout viewport stays.
    // Keep the page itself at the top so the chat header never slides away, and size the shell to what's visible.
    if (kb && window.scrollY) { try { window.scrollTo(0, 0); } catch (e) {} }
    var top = shell.getBoundingClientRect().top - off;
    if (top < 0 || top > vh) top = 70;
    var room = kb ? 8 : (window.matchMedia && matchMedia('(min-width:820px)').matches ? 40 : 104); // nav height + gap (desktop: the nav is at the side)
    var hh = Math.max(kb ? 160 : 220, Math.round(vh - top - room));
    shell.style.setProperty('--rf-chat-h', hh + 'px');
    B.style.setProperty('--rf-chat-h', hh + 'px');
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
  function homeHi(h) { return greetFor(h).replace(/\.$/, ''); } // Rachael, Oct 15: just the time greeting; the big WELCOME BACK sits under it
  var greet = '', gi = 0, gt = null;
  function typeGreet() {
    var say = document.getElementById('rf-say'); if (!say) return;
    greet = homeHi(new Date().getHours()); gi = 0; clearTimeout(gt);
    say.setAttribute('aria-label', greet);
    (function step() { say.textContent = greet.slice(0, ++gi); if (gi < greet.length) gt = setTimeout(step, RM ? 0 : 45); })();
  }
  setInterval(function () { var g = homeHi(new Date().getHours()); if (g !== greet) { greet = g; var say = document.getElementById('rf-say'); if (say) say.textContent = g; } }, 60000);
  document.addEventListener('rf:name', function () { typeGreet(); fillAccount(); fixWelcome(); });
  function fixWelcome() { var w = document.getElementById('profile-welcome-line'); if (w) w.textContent = greetFor(new Date().getHours()); } // Rachael, Oct 14: the time greeting, never "welcome back"
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
  // Oct 15 2026 (Rachael, matches the mock-up): tapping a Shift does NOT open the enlarged Shift view. The card
  // opens in place to show that Shift's own recommended activation (by the Shift's id) with a Listen button
  // that goes straight to the activation. Each card keeps the one-tap Embodied pill and a small Delete.
  // iOS: every card gets its own onclick (Safari only sends taps on plain <div>s to elements it sees as
  // clickable), and the list is never rebuilt while a finger is down, so a tap can't land on a replaced node.
  function actFor(s) {
    var t = String((s && s.activation) || '').trim(); if (!t) return null;
    var slug = null;
    try { slug = rhSlugForActivationTitle(t); } catch (e) {}
    var D = window.ACTIVATION_DETAILS || (typeof ACTIVATION_DETAILS !== 'undefined' ? ACTIVATION_DETAILS : {});
    if (!slug) { var base = t.split(':')[0].trim().toLowerCase(); for (var k in D) { var dt = String(D[k].title || '').trim().toLowerCase(); if (dt === t.toLowerCase() || dt.split(':')[0].trim() === base) { slug = k; break; } } }
    var d = slug && D[slug];
    return { slug: d ? slug : null, title: (d && d.title ? d.title : t).split(':')[0], desc: d && d.description ? d.description : '', cover: d && d.cover ? d.cover : '' };
  }
  function shortText(d) { var w = String(d || '').replace(/\s+/g, ' ').trim().split(' '); if (w.length <= 12) return w.join(' '); return w.slice(0, 12).join(' ').replace(/[,;:.]+$/, '') + '…'; }
  function openAct(s) {
    var a = actFor(s);
    if (a && a.slug) { try { closeShiftModal(); } catch (e) {} handleActivationCardClick(a.slug); }
    else showPage('activations-page'); // no matching activation: the library, never a dead end
  }
  window.rfOpenShiftActivation = function (id) { var s = shiftById(id); if (s) openAct(s); };
  function shiftById(id) { return (window.SHIFTS || []).filter(function (x) { return String(x.id) === String(id); })[0] || null; }
  function pillHtml(s) {
    return s.statusClass === 'embodied' ? '<span class="rf-pill emb">Embodied</span>'
      : '<button type="button" class="rf-pill" data-rf-emb="' + esc(s.id) + '">Mark Embodied</button>';
  }
  var openId = null, fingerDown = false, pending = null;
  function cardHtml(s) {
    var a = actFor(s), open = String(openId) === String(s.id);
    var xp = '';
    if (open) {
      xp = '<div class="rf-xp"><div class="rf-xth"' + (a && a.cover ? ' style="background-image:url(&quot;' + esc(a.cover) + '&quot;)"' : '') + ' aria-hidden="true">' + (a && a.cover ? '' : '✦') + '</div>' +
        '<div class="rf-xb"><div class="rf-xt">' + esc(a ? a.title : 'Activation Library') + '</div><div class="rf-xl">' + esc(a && a.desc ? shortText(a.desc) : 'Open the library to choose your activation.') + '</div></div>' +
        '<button type="button" class="rf-xlisten" data-rf-listen="' + esc(s.id) + '">▶ Listen</button></div>' +
        '<div class="rf-xfoot"><button type="button" class="rf-del" data-rf-del="' + esc(s.id) + '">Delete Shift</button></div>';
    }
    return '<div class="rf-orb" aria-hidden="true">✦</div><div class="bt"><div class="src">' + esc(s.method || 'GAP Method') + '</div><div class="nm">' + esc(s.identity) + '</div><div class="fr">Current Frequency: ' + esc(s.frequency) + '</div><div class="dt">' + esc(s.date) + '</div>' +
      (open ? '' : '<div class="rf-cue">▶ Tap to open your activation</div>') + '</div>' + pillHtml(s) + xp;
  }
  function wireCard(d, s) {
    d.onclick = function (e) {
      var t = e.target;
      if (t.closest('[data-rf-emb]')) { e.stopPropagation(); embody(s.id, t.closest('[data-rf-emb]')); return; }
      if (t.closest('[data-rf-listen]')) { e.stopPropagation(); openAct(s); return; }
      if (t.closest('[data-rf-del]')) { e.stopPropagation(); cardDelete(s.id); return; }
      if (t.closest('.rf-pill')) return;
      openId = String(openId) === String(s.id) ? null : String(s.id); bubbles(window.SHIFTS || []);
    };
    d.onkeydown = function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target === d) { e.preventDefault(); d.onclick({ target: d, stopPropagation: function () {} }); } };
  }
  // Delete from a card: the same exact-id Delete flow (it checks the Shift loaded in the Shift view), with
  // that view loaded for this Shift but kept out of sight; the in-app confirm sheet is what the member sees.
  function cardDelete(id) {
    var m = document.getElementById('shift-modal'); if (!m) return;
    m.classList.add('rf-silent');
    try { openShiftModal(String(id)); } catch (e) {}
    var done = function () { if (m.classList.contains('active')) { try { closeShiftModal(); } catch (e) {} } m.classList.remove('rf-silent'); var l = (window.SHIFTS || []).some(function (x) { return String(x.id) === String(openId); }); if (!l) openId = null; renderFocusAndShifts(window.SHIFTS || []); };
    Promise.resolve(rhDeleteShift(String(id))).then(done, done);
  }
  function bubbles(shifts) {
    if (fingerDown) { pending = shifts; return; }
    document.querySelectorAll('[data-role="shifts-list"]').forEach(function (list) {
      if (!list.__rfWired) {
        list.__rfWired = true;
        list.addEventListener('pointerdown', function () { fingerDown = true; });
        var up = function () { if (!fingerDown) return; fingerDown = false; if (pending) { var p = pending; pending = null; setTimeout(function () { bubbles(p); }, 350); } };
        ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { list.addEventListener(ev, up); });
      }
      list.querySelectorAll('.rf-sbub').forEach(function (n) { n.remove(); });
      shifts.forEach(function (s) {
        var d = document.createElement('div');
        d.className = 'rf-sbub' + (String(openId) === String(s.id) ? ' open' : ''); d.setAttribute('role', 'button'); d.tabIndex = 0;
        d.setAttribute('aria-expanded', String(String(openId) === String(s.id))); d.setAttribute('data-shift-id', String(s.id));
        d.innerHTML = cardHtml(s); wireCard(d, s);
        list.appendChild(d);
      });
    });
    focusExtras(shifts);
  }
  // ---------- Today's Focus: tap = that Shift's activation; Reading / Activation / new Shifting card; Change focus ----------
  var FK = 'rf_focus_' + RH_EMAIL;
  function focusShift() { var fb = document.querySelector('[data-role="focus-open"]'); return fb ? shiftById(fb.getAttribute('data-shift-id')) : null; }
  function focusExtras(shifts) {
    var card = document.querySelector('#my-revolution [data-role="focus-card"]'), fb = document.querySelector('[data-role="focus-open"]'), ff = card && card.querySelector('.focus-card-footer');
    if (!card || !fb || !ff) return;
    // iOS Safari only sends a tap's click to an element that is itself clickable: a plain div whose only
    // listener is on document never gets one (the Today's Focus tap bug). An own onclick makes it tappable;
    // the work is done by the capture listener below.
    if (!card.onclick) { card.onclick = function () {}; card.setAttribute('role', 'button'); card.style.cursor = 'pointer'; }
    var s = focusShift();
    var old = ff.querySelector('.rf-pill'); if (old) old.remove();
    if (s && s.statusClass !== 'embodied') { var w = document.createElement('div'); w.innerHTML = pillHtml(s); var p = w.firstChild; p.style.alignSelf = 'flex-start'; ff.insertBefore(p, fb); }
    var x = card.querySelector('.rf-fx');
    if (!x) {
      x = document.createElement('div'); x.className = 'rf-fx';
      x.innerHTML = '<div class="rf-fdoors"><button type="button" class="rf-fdoor" data-rf-f="reading" aria-expanded="false"><span aria-hidden="true">✧</span>Your reading</button>' +
        '<button type="button" class="rf-fdoor" data-rf-f="act"><span aria-hidden="true">▶</span>Your activation</button>' +
        '<button type="button" class="rf-fdoor" data-rf-f="new"><span aria-hidden="true">✦</span>Create a new Shifting card</button></div>' +
        '<div class="rf-freading" hidden></div><button type="button" class="rf-fchange" data-rf-f="change">Change focus</button>';
      ff.parentNode.insertBefore(x, ff.nextSibling);
    }
    var rd = x.querySelector('.rf-freading');
    if (s) rd.innerHTML = (s.gap ? '<p>' + esc(s.gap) + '</p>' : '') + (s.maintaining ? '<p>' + esc(s.maintaining).replace(/\n/g, '<br>') + '</p>' : '') || '<p>Your reading for this Shift is in its card.</p>';
    x.querySelector('.rf-fchange').hidden = (window.SHIFTS || shifts || []).length < 2;
  }
  document.addEventListener('click', function (e) {
    var card = e.target.closest && e.target.closest('#my-revolution [data-role="focus-card"]'); if (!card) return;
    var s = focusShift(); var f = e.target.closest('[data-rf-f]');
    if (e.target.closest('[data-rf-emb]')) return; // the pill handler below
    e.preventDefault(); e.stopPropagation();
    if (f) {
      var k = f.getAttribute('data-rf-f');
      if (k === 'reading') { var rd = card.querySelector('.rf-freading'), open = rd.hidden; rd.hidden = !open; f.setAttribute('aria-expanded', String(open)); return; }
      if (k === 'new') { startGap(); return; }
      if (k === 'change') { pickFocus(); return; }
    }
    if (s) openAct(s); // the card itself, its Continue button and "Your activation"
  }, true);
  function pickFocus() {
    var list = window.SHIFTS || []; if (list.length < 2) return;
    var cur = focusShift();
    var bd = document.createElement('div'); bd.className = 'rh-sheet-backdrop rf-pick-backdrop';
    bd.innerHTML = '<div class="rh-sheet rf-pick" role="dialog" aria-label="Choose today\'s focus"><p class="rh-sheet-msg">Choose today\'s focus</p><div class="rf-pick-list"></div><div class="rh-sheet-actions"><button type="button" class="rh-sheet-cancel">Cancel</button></div></div>';
    var pl = bd.querySelector('.rf-pick-list');
    list.forEach(function (s) { var b = document.createElement('button'); b.type = 'button'; b.className = 'rf-pick-item' + (cur && String(cur.id) === String(s.id) ? ' on' : ''); b.innerHTML = '<b>' + esc(s.identity) + '</b><small>' + esc(s.frequency) + ' · ' + esc(s.date) + '</small>'; b.onclick = function () { setFocus(s.id); bd.remove(); }; pl.appendChild(b); });
    bd.querySelector('.rh-sheet-cancel').onclick = function () { bd.remove(); };
    bd.addEventListener('click', function (e) { if (e.target === bd) bd.remove(); });
    document.body.appendChild(bd);
  }
  function setFocus(id) {
    try { localStorage.setItem(FK, String(id)); sessionStorage.setItem('rhFocusShiftId', String(id)); } catch (e) {}
    renderFocusAndShifts(window.SHIFTS || []);
  }
  // a focus the member chose survives reloads (per member, this browser); a newer GAP Shift still wins this session
  try { var pin = localStorage.getItem(FK); if (pin && !sessionStorage.getItem('rhFocusShiftId')) sessionStorage.setItem('rhFocusShiftId', pin); } catch (e) {}
  var _rfs = window.renderFocusAndShifts;
  renderFocusAndShifts = window.renderFocusAndShifts = function (shifts) { var r = _rfs.apply(this, arguments); try { bubbles(shifts || []); } catch (e) {} return r; };
  document.addEventListener('click', function (e) {
    var p = e.target.closest && e.target.closest('[data-rf-emb]');
    if (p && !p.closest('.rf-sbub')) { e.stopPropagation(); e.preventDefault(); embody(p.getAttribute('data-rf-emb'), p); }
  });
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
  // the enlarged Shift bubble (still reachable from older links): a visible Delete (the fixed, exact-id flow)
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
    var rs = function () { var d = Math.min(window.devicePixelRatio || 1, 2), nh = Math.max(innerHeight, (window.screen && screen.height) || 0);
      // the iOS toolbar collapsing/expanding only changes the height: keep the canvas (sized to the tallest
      // viewport) and the same stars, so nothing re-draws or jumps mid-scroll
      if (W === innerWidth && H && nh <= H) return;
      var same = W === innerWidth; W = innerWidth; H = Math.max(nh, H || 0); sky.width = W * d; sky.height = H * d; sky.style.width = W + 'px'; sky.style.height = H + 'px'; sx.setTransform(d, 0, 0, d, 0, 0);
      if (same && stars.length) return;
      stars = Array.from({ length: 110 }, function () { return { x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.4 + .2, z: Math.random() * .8 + .2, p: Math.random() * 6, g: Math.random() < .35 }; }); };
    rs(); addEventListener('resize', rs);
    addEventListener('pointermove', function (e) { px = (e.clientX / W - .5) * 14; py = (e.clientY / H - .5) * 14; });
    var fx = fly && fly.getContext('2d'), FW = 0, FH = 0, pts = [], vort = [];
    var rf = function () { if (!fx) return; var d = Math.min(window.devicePixelRatio || 1, 2); FW = fly.clientWidth; FH = fly.clientHeight; if (!FW || !FH) return; fly.width = FW * d; fly.height = FH * d; fx.setTransform(d, 0, 0, d, 0, 0);
      pts = Array.from({ length: 520 }, function () { var t = Math.random() * Math.PI * 2, side = Math.random() < .5 ? -1 : 1; var r = (Math.exp(Math.sin(t)) - 2 * Math.cos(4 * t) + Math.pow(Math.sin((2 * t - Math.PI) / 24), 5)) * Math.pow(Math.random(), .35); return { bx: Math.sin(t) * r * side, by: -Math.cos(t) * r, s: side, j: Math.random() * 6, c: Math.random() < .18 }; });
      var k = Math.min(FW, FH) / 7.2; vort = Array.from({ length: 140 }, function () { return { a: Math.random() * 7, r: k * (.9 + Math.random() * 2.4), w: .004 + Math.random() * .01, inw: Math.random() < .4 ? .08 + Math.random() * .15 : 0, s: Math.random() * 1.6 + .4, j: Math.random() * 6, c: Math.random() < .4 }; }); };
    addEventListener('resize', rf);
    var T = 0, fc = 0, hero = fly && fly.parentNode;
    var frame = function () {
      T += .016; fc++;
      if (!document.hidden && !B.classList.contains('rf-busy') && (fc & 1)) {
        sx.clearRect(0, 0, W, H);
        for (var i = 0; i < stars.length; i++) { var s = stars[i], a = .45 + .55 * Math.sin(T * 1.5 + s.p); sx.fillStyle = s.g ? 'rgba(255,226,150,' + a + ')' : 'rgba(220,255,250,' + (a * .8) + ')'; sx.beginPath(); sx.arc(s.x + px * s.z, s.y + py * s.z, s.r, 0, 7); sx.fill(); }
        var hr = hero && hero.getBoundingClientRect();
        if (fx && B.getAttribute('data-rf') === 'home' && !B.classList.contains('gm-lock') && hr && hr.bottom > 0 && hr.top < innerHeight) {
          if (!FW || fly.clientWidth !== FW) rf();
          if (FW) {
            fx.clearRect(0, 0, FW, FH); var cx = FW / 2 + px * .6, cy = FH / 2 - 6 + py * .6, k = Math.min(FW, FH) / 7.2;
            fx.globalCompositeOperation = 'lighter';
            for (var j = 0; j < pts.length; j++) { var p = pts[j]; var x = cx + Math.abs(p.bx) * p.s * k * .92 + Math.sin(T * .6 + p.j) * .8, y = cy + p.by * k * .9 + Math.cos(T * .5 + p.j) * .8; fx.fillStyle = p.c ? 'rgba(110,240,228,.75)' : 'rgba(255,224,150,.8)'; fx.fillRect(x, y, 1.6, 1.6); }
            fx.fillStyle = 'rgba(255,246,214,.9)'; fx.fillRect(cx - 1, cy - k * .9, 2, k * 1.6);
            for (var q = 0; q < vort.length; q++) { var v = vort[q]; v.a += v.w * (RM ? 0 : 2); v.r -= v.inw * (RM ? 0 : 2); if (v.r < k * .4) { v.r = k * (2 + Math.random() * 1.4); v.a = Math.random() * 7; }
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

// ---- Held-back features (Oct 15 2026): each one is its own file + its own server switch (lib/features.js).
// Nothing is fetched or shown unless /api/features says true for THIS member.
(function () {
  var MAP = { codePull: 'rf-codes', homeCheckin: 'rf-checkin', codeShifts: 'rf-codeshift' };
  var tries = 0;
  function load(n) {
    if (document.getElementById('rf-feat-' + n)) return;
    var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/' + n + '.css'; l.id = 'rf-feat-' + n; document.head.appendChild(l);
    var s = document.createElement('script'); s.src = '/' + n + '.js'; document.body.appendChild(s);
  }
  function go() {
    var em = (typeof RH_EMAIL !== 'undefined' && RH_EMAIL) || '';
    if (!em) { if (++tries < 80) setTimeout(go, 250); return; }
    fetch('/api/features?email=' + encodeURIComponent(em), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (f) { window.__rfFeatures = f || {}; Object.keys(MAP).forEach(function (k) { if (f && f[k] === true) load(MAP[k]); }); })
      .catch(function () {});
  }
  go();
})();
