// Overrides duplicate activation cover photos assigned by activation-covers.js
// with distinct real photos, so no two different activations share the same graphic.
// activation-covers.js re-applies its own (duplicate) images on page/section
// switches, so this uses a MutationObserver to keep winning the race permanently,
// plus a light interval as a fallback in case the DOM nodes get replaced entirely.
(function() {
  var FIXES = {
    'gap-method-creator': '/images/covers/gap-method-creator.jpg',
    'leadership-recode-activation': '/images/covers/leadership-recode-activation.jpg',
    'gap-method-expander': '/images/covers/gap-method-expander.jpg',
    'crystal-business-activation': '/images/covers/crystal-business-activation.jpg',
    'gap-method-wayshower': '/images/covers/gap-method-wayshower.jpg',
    'gap-method-messenger': '/images/covers/gap-method-messenger.jpg',
    'impact-vibe-booster': '/images/covers/impact-vibe-booster.jpg',
    'million-dollar-blueprint-activation': '/images/covers/million-dollar-blueprint-activation.jpg',
    'gap-method-leader': '/images/covers/gap-method-leader.jpg'
  };

  var observed = new WeakSet();

  function setCover(thumb, url) {
    var target = 'url("' + url + '")';
    if (thumb.style.backgroundImage === target) { return; }
    thumb.style.backgroundImage = target;
    thumb.style.backgroundSize = 'cover';
    thumb.style.backgroundPosition = 'center';
  }

  function watch(thumb, url) {
    if (observed.has(thumb)) { return; }
    observed.add(thumb);
    var mo = new MutationObserver(function() {
      setCover(thumb, url);
    });
    mo.observe(thumb, { attributes: true, attributeFilter: ['style'] });
  }

  function apply() {
    document.querySelectorAll('[data-activation-slug]').forEach(function(card) {
      var slug = card.getAttribute('data-activation-slug');
      var url = FIXES[slug];
      if (!url) { return; }
      var thumb = card.querySelector('.media-thumb, .fav-thumb');
      if (!thumb) { return; }
      setCover(thumb, url);
      watch(thumb, url);
    });
  }

  apply();
  if (document.readyState !== 'complete') {
    window.addEventListener('load', apply);
  }
  setTimeout(apply, 300);
  setTimeout(apply, 1200);
  setInterval(apply, 1500);

  // Also re-scan whenever new cards get added to the page (SPA section switches).
  var bodyObserver = new MutationObserver(function() { apply(); });
  bodyObserver.observe(document.body, { childList: true, subtree: true });
})();
