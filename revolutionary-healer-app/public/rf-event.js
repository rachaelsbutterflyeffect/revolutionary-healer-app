/* Featured Activation event at the top of the Activations page (refresh only; REVIEW build, Oct 15 2026).
 * Loaded ONLY when /api/features says featuredEvent=true for this member (FEATURED_EVENT=list + FEATURED_EVENT_ALLOWLIST).
 * Swap it monthly by editing RF_EVENT below: it shows from `start` until `end` (member's clock) and then hides itself.
 * Copy: the eyebrow is a label; the title + tagline are the existing SpookBound banner copy from app.html. */
(function () {
  var RF_EVENT = {
    slug: 'spookbound-2026',                       // the activation the CTA opens (handleActivationCardClick)
    start: '2026-10-01T00:00:00-04:00',
    end: '2026-11-01T00:00:00-04:00',              // hidden from this moment on
    image: '/images/covers/spookbound-2026.jpg',   // the build's SpookBound art (title + tagline are in the artwork)
    imageW: 900, imageH: 506,
    eyebrow: 'Featured Activation · October',
    title: 'Spookbound 2026',
    tagline: 'Banish the shadows of curses, black magic & spells.',
    cta: 'Begin SpookBound'
  };
  window.RF_EVENT = RF_EVENT;
  var now = Date.now();
  if (!(now >= Date.parse(RF_EVENT.start) && now < Date.parse(RF_EVENT.end))) return;
  var KEY = 'rh_rf_event_dismissed_' + RF_EVENT.slug;
  try { if (localStorage.getItem(KEY)) return; } catch (e) {}
  function esc(t) { return String(t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function mount() {
    // Lives at the very top of the Activations page (above the heading, the category tiles and Favourites)
    var wrap = document.querySelector('#activations-page > .wrap'); if (!wrap || document.getElementById('rf-event')) return !!wrap;
    var first = wrap.firstElementChild; while (first && first.classList.contains('page-back')) first = first.nextElementSibling;
    var ev = document.createElement('section'); ev.id = 'rf-event'; ev.className = 'rf-event'; ev.setAttribute('aria-label', RF_EVENT.eyebrow + ': ' + RF_EVENT.title);
    var em = ''; for (var i = 0; i < 9; i++) em += '<i></i>';
    ev.innerHTML =
      '<div class="rf-ev-rule" aria-hidden="true"></div>' +
      '<div class="rf-ev-eyebrow"><span class="rf-ev-dot" aria-hidden="true"></span>' + esc(RF_EVENT.eyebrow) + '<span class="rf-ev-dot" aria-hidden="true"></span></div>' +
      '<button type="button" class="rf-ev-x" aria-label="Dismiss the featured activation">&times;</button>' +
      '<button type="button" class="rf-ev-poster" data-rf-ev-open aria-label="' + esc(RF_EVENT.cta) + '">' +
        '<img src="' + esc(RF_EVENT.image) + '" width="' + RF_EVENT.imageW + '" height="' + RF_EVENT.imageH + '" alt="' + esc(RF_EVENT.title + ': ' + RF_EVENT.tagline) + '" decoding="async">' +
        '<span class="rf-ev-sweep" aria-hidden="true"></span><span class="rf-ev-embers" aria-hidden="true">' + em + '</span>' +
      '</button>' +
      '<h2 class="rf-ev-title">' + esc(RF_EVENT.title) + '</h2>' +
      '<p class="rf-ev-tag">' + esc(RF_EVENT.tagline) + '</p>' +
      '<button type="button" class="rf-ev-cta" data-rf-ev-open><span class="rf-ev-play" aria-hidden="true"><svg width="10" height="10" viewBox="0 0 24 24"><polygon points="6,4 20,12 6,20" fill="currentColor"/></svg></span>' + esc(RF_EVENT.cta) + '</button>' +
      '<div class="rf-ev-rule rf-ev-rule-b" aria-hidden="true"></div>';
    wrap.insertBefore(ev, first);
    ev.addEventListener('click', function (e) {
      if (e.target.closest('.rf-ev-x')) { try { localStorage.setItem(KEY, String(Date.now())); } catch (x) {} ev.remove(); return; }
      if (e.target.closest('[data-rf-ev-open]')) { try { handleActivationCardClick(RF_EVENT.slug); } catch (x) {} }
    });
    // embers + light sweep run only while the event is on screen (and rest while scrolling, via body.rf-busy)
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { es.forEach(function (en) { ev.classList.toggle('rf-ev-live', en.isIntersecting); }); }, { threshold: .05 }).observe(ev);
    else ev.classList.add('rf-ev-live');
    // stop at the end moment even if the page stays open
    var left = Date.parse(RF_EVENT.end) - Date.now(); if (left < 2147483647) setTimeout(function () { ev.remove(); }, Math.max(0, left));
    return true;
  }
  if (!mount()) { var n = 0, iv = setInterval(function () { if (mount() || ++n > 40) clearInterval(iv); }, 250); }
})();
