/* Member layout v5. Loaded only when /api/features says memberLayoutV5 (MEMBER_LAYOUT_V5).
   Markup and paint only. It moves existing nodes; it does not rewrite the chat, the code
   deck, the activation finder, or the GAP Method.
   Wiring:
   - #cudeck stays inside #rf-codes (so public/rf-codes.js flip, pull, and code_pull stay as they are).
     The whole #rf-codes block is moved into #mlv5-code on Home.
   - The finder door #rf-fit-door is moved to the top of Activations. Its back control is
     retargeted from data-rf-go="home" to data-rf-go="lib" so Back returns to the library.
     Questions, the recommender, the result card, and Listen now are untouched.
   - The home chat card logs chat_card_tap, then uses the same home chat control
     as before this layout (data-rf-go="chat" on the card). It does not start a
     new chat or focus the message box. */
(function () {
  if (window.__mlv5) return;
  if (!window.__rfFeatures || window.__rfFeatures.memberLayoutV5 !== true) return;
  window.__mlv5 = 1;
  var EYE = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M2.2 12S6.2 6.2 12 6.2 21.8 12 21.8 12 17.8 17.8 12 17.8 2.2 12 2.2 12z"/><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/></svg>';

  function tap(name) {
    try {
      if (window.rhActivity && typeof window.rhActivity.layoutTap === 'function') window.rhActivity.layoutTap(name);
    } catch (e) {}
  }

  document.documentElement.classList.add('mlv5');
  document.body.classList.add('mlv5');

  document.querySelectorAll('.mlv5-only').forEach(function (n) {
    if (n.id === 'mlv5-code-sec') return;
    n.hidden = false;
  });

  var focusNav = document.querySelector('#rf-nav [data-rf-nav="focus"]');
  if (focusNav) { focusNav.hidden = true; focusNav.setAttribute('aria-hidden', 'true'); }
  var foot = document.querySelector('#rf-nav .rf-nav-foot');
  if (foot) { foot.hidden = true; foot.setAttribute('aria-hidden', 'true'); }
  document.querySelectorAll('#rf-nav button').forEach(function (b) {
    if (b.hidden) return;
    if (!b.getAttribute('data-mlv5-track')) {
      b.setAttribute('data-mlv5-track', 'nav-' + (b.getAttribute('data-rf-nav') || b.getAttribute('data-rf-go') || 'item'));
    }
  });
  var avatar = document.querySelector('#rf-home .rf-avatar');
  if (avatar && !avatar.getAttribute('data-mlv5-track')) avatar.setAttribute('data-mlv5-track', 'profile');

  var doors = document.getElementById('mlv5-doors');
  if (doors) {
    ['gap', 'chat'].forEach(function (name) {
      var door = document.querySelector('#rf-home .rf-door[data-rf-go="' + name + '"]');
      if (!door) return;
      if (!door.getAttribute('data-mlv5-track')) door.setAttribute('data-mlv5-track', name + '-door');
      doors.appendChild(door);
    });
  }

  function placeDeck() {
    var codes = document.getElementById('rf-codes');
    var slot = document.getElementById('mlv5-code');
    var sec = document.getElementById('mlv5-code-sec');
    if (!codes || !slot || !sec) return false;
    if (codes.parentNode !== slot) slot.appendChild(codes);
    sec.hidden = false;
    return true;
  }
  function placeFinder() {
    var door = document.getElementById('rf-fit-door');
    var slot = document.getElementById('mlv5-fit');
    if (!door || !slot) return false;
    if (door.parentNode !== slot) slot.appendChild(door);
    var orb = door.querySelector('.rf-orb');
    if (orb && !orb.getAttribute('data-mlv5-eye')) { orb.innerHTML = EYE; orb.setAttribute('data-mlv5-eye', '1'); }
    var back = document.querySelector('#rf-fit .rf-back');
    if (back && back.getAttribute('data-rf-go') !== 'lib') {
      back.setAttribute('data-rf-go', 'lib');
      back.textContent = '\u2190 Activations';
    }
    return true;
  }

  placeDeck();
  placeFinder();
  var tries = 0;
  var wait = setInterval(function () {
    var deck = placeDeck();
    var finder = placeFinder();
    if ((deck && finder) || ++tries > 80) clearInterval(wait);
  }, 100);

  document.addEventListener('click', function (e) {
    if (!document.body.classList.contains('mlv5')) return;
    var card = e.target.closest && e.target.closest('[data-mlv5-open-chat]');
    if (!card) return;
    try {
      if (window.rhActivity && typeof window.rhActivity.chatCard === 'function') window.rhActivity.chatCard('Open chat');
    } catch (err) {}
  }, true);

  document.addEventListener('click', function (e) {
    if (!document.body.classList.contains('mlv5')) return;
    var book = e.target.closest && e.target.closest('[data-mlv5-book]');
    if (!book) return;
    try {
      if (window.rhActivity && typeof window.rhActivity.goDeeperBook === 'function') window.rhActivity.goDeeperBook('revolution-go-deeper');
    } catch (err) {}
  }, true);

  document.addEventListener('click', function (e) {
    if (!document.body.classList.contains('mlv5')) return;
    var t = e.target.closest && e.target.closest('[data-mlv5-track]');
    if (!t || t.hasAttribute('data-mlv5-open-chat')) return;
    var name = t.getAttribute('data-mlv5-track');
    if (name) tap(name);
  });

  var chatGuardUntil = 0;
  function dropChatFocus() {
    var input = document.getElementById('chat-input');
    if (input && document.activeElement === input) { try { input.blur(); } catch (e) {} }
  }
  document.addEventListener('focusin', function (e) {
    if (!document.body.classList.contains('mlv5')) return;
    if (Date.now() > chatGuardUntil) return;
    if (e.target && e.target.id === 'chat-input') dropChatFocus();
  }, true);
  document.addEventListener('click', function (e) {
    if (!document.body.classList.contains('mlv5')) return;
    if (e.target.closest && e.target.closest('#chat-input, #hero-speak-btn')) return;
    var opener = e.target.closest && e.target.closest('[data-rf-go="chat"], [data-rf-nav="chat"], [data-mlv5-open-chat], [data-rf-lane]');
    if (!opener) return;
    chatGuardUntil = Date.now() + 700;
    setTimeout(dropChatFocus, 0);
    setTimeout(dropChatFocus, 60);
    setTimeout(dropChatFocus, 320);
    setTimeout(dropChatFocus, 640);
  }, true);

  if (typeof window.rfGo === 'function' && !window.rfGo.__mlv5) {
    var prevGo = window.rfGo;
    window.rfGo = function (s) {
      var r = prevGo.apply(this, arguments);
      try {
        if (document.body.classList.contains('mlv5') && (s === 'home' || s === 'chat' || s === 'focus') && window.rhActivity && typeof window.rhActivity.nav === 'function') window.rhActivity.nav(s);
      } catch (err) {}
      return r;
    };
    window.rfGo.__mlv5 = 1;
  }

  function labelOf(el) {
    var named = el.getAttribute('aria-label') || el.getAttribute('data-rf-go') || el.getAttribute('data-rf-nav') || el.getAttribute('data-rf-lane') || '';
    if (!named) named = (el.innerText || el.textContent || '');
    return String(named).replace(/\s+/g, ' ').trim().slice(0, 60);
  }
  document.addEventListener('click', function (e) {
    if (!document.body.classList.contains('mlv5')) return;
    var acc = e.target.closest && e.target.closest('.rf-acc-btn');
    if (acc) {
      var panel = document.getElementById(acc.getAttribute('aria-controls') || '');
      if (panel && panel.hidden && window.rhActivity && typeof window.rhActivity.sectionOpen === 'function') {
        window.rhActivity.sectionOpen((acc.getAttribute('aria-controls') || '').indexOf('code') >= 0 ? 'codes' : 'gaps');
      }
    }
    var el = e.target.closest && e.target.closest('a, button, [role="button"], [data-rf-go], [data-rf-nav], [data-rf-sec], .rf-lsec, .rf-sbub, .mlv5-chat-card, .mlv5-feature, .mlv5-gd-card');
    if (!el) return;
    if (el.closest('#chat-input, #rh-chat-thread, #hero-gap-embed')) return;
    if (el.hasAttribute('data-mlv5-open-chat') || el.hasAttribute('data-mlv5-book') || el.hasAttribute('data-mlv5-track') || el.hasAttribute('data-rf-lane') || el.classList.contains('rf-acc-btn')) return;
    var name = labelOf(el);
    if (name) tap(name);
  }, true);

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  function retitle(root, acc, name) {
    var btn = root && root.querySelector('[data-acc="' + acc + '"] .txt');
    if (!btn || btn.getAttribute('data-mlv5-name') === name) return;
    var n = btn.querySelector('.rf-acc-n');
    var count = n ? n.textContent : '';
    btn.innerHTML = name + ' <span class="rf-acc-n">' + count + '</span>';
    btn.setAttribute('data-mlv5-name', name);
  }
  var dressing = false;
  function dressRevolution() {
    if (dressing || !document.body.classList.contains('mlv5')) return;
    dressing = true;
    try { dressRevolutionBody(); } catch (e) {}
    dressing = false;
  }
  function dressRevolutionBody() {
    var recent = document.querySelector('#my-revolution [data-rf-filter="recent"]') || document.querySelector('#my-revolution .revolution-subsection [data-role="shifts-list"]:not([data-rf-filter])');
    var cards = document.getElementById('rf-sec-cards');
    if (!cards && recent) {
      var sub = recent.closest('.revolution-subsection');
      if (sub && sub.parentNode) {
        cards = document.createElement('div');
        cards.id = 'rf-sec-cards';
        cards.className = 'revolution-subsection rf-rsec';
        cards.innerHTML = '<div class="subsection-head"><h3>My Shifting Cards</h3></div>' +
          '<div class="rf-acc" data-acc="gap"><button type="button" class="rf-acc-btn" aria-expanded="false" aria-controls="rf-acc-gap"><span class="txt" data-mlv5-name="My GAPs">My GAPs <span class="rf-acc-n"></span></span><span class="rf-chev" aria-hidden="true"></span></button><div class="rf-acc-panel" id="rf-acc-gap" hidden><div class="shifts-list" data-role="shifts-list" data-rf-filter="gap"></div></div></div>' +
          '<div class="rf-acc" data-acc="code"><button type="button" class="rf-acc-btn" aria-expanded="false" aria-controls="rf-acc-code"><span class="txt" data-mlv5-name="My Codes">My Codes <span class="rf-acc-n"></span></span><span class="rf-chev" aria-hidden="true"></span></button><div class="rf-acc-panel" id="rf-acc-code" hidden><div class="shifts-list" data-role="shifts-list" data-rf-filter="code"></div></div></div>';
        sub.parentNode.insertBefore(cards, sub.nextSibling);
        sub.classList.add('rf-recent');
        recent.setAttribute('data-rf-filter', 'recent');
        var h = sub.querySelector('h3');
        if (h) h.textContent = 'My Most Recent Shifts';
        if (typeof window.renderFocusAndShifts === 'function') { try { window.renderFocusAndShifts(window.SHIFTS || []); } catch (e) {} }
      }
    }
    retitle(cards, 'gap', 'My GAPs');
    retitle(cards, 'code', 'My Codes');
    var recentList = document.querySelector('#my-revolution [data-rf-filter="recent"]');
    if (recentList) {
      var top = (window.SHIFTS || []).slice(0, 3).map(function (s) { return String(s.id); });
      recentList.querySelectorAll('.rf-sbub').forEach(function (el) {
        el.hidden = top.indexOf(el.getAttribute('data-shift-id')) < 0;
      });
    }
    document.querySelectorAll('#my-revolution [data-rf-filter="recent"] .rf-sbub, #my-revolution .rf-recent .rf-sbub').forEach(function (card) {
      if (card.hidden || card.querySelector('.rf-xp')) return;
      var id = card.getAttribute('data-shift-id');
      var s = (window.SHIFTS || []).filter(function (x) { return String(x.id) === String(id); })[0];
      if (!s) return;
      var row = document.createElement('div');
      row.className = 'rf-xp mlv5-open-row';
      row.innerHTML = '<div class="rf-xl">' + esc(s.activation || 'Listen') + '</div><button type="button" class="rf-xlisten" data-rf-listen="' + esc(id) + '">▶ Listen</button>';
      card.appendChild(row);
    });
    var codePanel = document.getElementById('rf-acc-code');
    var pulls = window.__rfRevData && window.__rfRevData.codes;
    if (codePanel && pulls) {
      var host = codePanel.querySelector('.mlv5-pulls');
      if (!host) {
        host = document.createElement('div');
        host.className = 'mlv5-pulls shifts-list';
        codePanel.appendChild(host);
      }
      var html = pulls.filter(function (c) { return c && c.from === 'pull'; }).map(function (c) {
        var when = c.at ? new Date(c.at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
        return '<div class="rf-sbub mlv5-pull"><div class="bt"><div class="src">Code</div><div class="nm">' + esc(c.name) + '</div>' +
          (c.code ? '<div class="cn">' + esc(c.code) + '</div>' : '') +
          '<div class="dt">' + esc(when) + '</div></div></div>';
      }).join('');
      if (host.getAttribute('data-html') !== String(html.length)) {
        host.innerHTML = html;
        host.setAttribute('data-html', String(html.length));
      }
      var count = codePanel.parentNode && codePanel.parentNode.querySelector('.rf-acc-n');
      var shown = 0;
      codePanel.querySelectorAll('.rf-sbub').forEach(function (el) {
        if (!el.hidden && !el.classList.contains('rf-xhide')) shown++;
      });
      if (count) count.textContent = '(' + shown + ')';
    }
    var deeper = document.getElementById('mlv5-deeper');
    var wrap = document.querySelector('#my-revolution .wrap');
    if (deeper && wrap && deeper.parentNode !== wrap) wrap.appendChild(deeper);
    else if (deeper && wrap && deeper !== wrap.lastElementChild) wrap.appendChild(deeper);
  }
  dressRevolution();
  document.addEventListener('rf:rev-data', dressRevolution);
  var revWatch = document.getElementById('my-revolution');
  if (revWatch && window.MutationObserver) new MutationObserver(function () { dressRevolution(); }).observe(revWatch, { childList: true, subtree: true });
})();
