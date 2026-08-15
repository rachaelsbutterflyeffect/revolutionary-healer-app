// Overrides duplicate activation cover photos assigned by activation-covers.js
// with distinct real photos, so no two different activations share the same graphic.
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

  function apply() {
    document.querySelectorAll('[data-activation-slug]').forEach(function(card) {
      var slug = card.getAttribute('data-activation-slug');
      var url = FIXES[slug];
      if (!url) { return; }
      var thumb = card.querySelector('.media-thumb, .fav-thumb');
      if (!thumb) { return; }
      thumb.style.backgroundImage = 'url("' + url + '")';
      thumb.style.backgroundSize = 'cover';
      thumb.style.backgroundPosition = 'center';
    });
  }

  apply();
  if (document.readyState !== 'complete') {
    window.addEventListener('load', apply);
  }
  setTimeout(apply, 300);
  setTimeout(apply, 1200);
})();
