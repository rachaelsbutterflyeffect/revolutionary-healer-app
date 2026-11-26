/* Member layout v5. Loaded only when /api/features says memberLayoutV5 (MEMBER_LAYOUT_V5).
   Markup and paint only. It moves existing nodes; it does not rewrite the chat, the code
   deck, the activation finder, or the GAP Method.
   Wiring:
   - #cudeck stays inside #rf-codes (so public/rf-codes.js flip, pull, and code_pull stay as they are).
     The whole #rf-codes block is moved into #mlv5-code on Home.
   - The finder door #rf-fit-door is moved to the top of Activations. Its back control is
     retargeted from data-rf-go="home" to data-rf-go="lib" so Back returns to the library.
     Questions, the recommender, the result card, and Listen now are untouched.
   - The home chat card is one control. It logs chat_card_tap and opens a new chat
     with the existing entry (showMain, rfGo('chat'), rhStartNewChat). The four topic
     lanes and startLane stay in refresh.js, unchanged, for the flag-off home. */
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
    e.preventDefault();
    e.stopPropagation();
    try {
      if (window.rhActivity && typeof window.rhActivity.chatCard === 'function') window.rhActivity.chatCard('Open chat');
    } catch (err) {}
    try { if (typeof showMain === 'function') showMain(); } catch (err2) {}
    try { if (typeof rfGo === 'function') rfGo('chat'); } catch (err3) {}
    try { if (typeof rhStartNewChat === 'function') rhStartNewChat(); } catch (err4) {}
  }, true);

  document.addEventListener('click', function (e) {
    if (!document.body.classList.contains('mlv5')) return;
    var t = e.target.closest && e.target.closest('[data-mlv5-track]');
    if (!t || t.hasAttribute('data-mlv5-open-chat')) return;
    var name = t.getAttribute('data-mlv5-track');
    if (name) tap(name);
  });
})();
