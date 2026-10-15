/* "Shift the codes" (Oct 15 2026): save a pulled Code Upgrade card as a Shifting card, refresh only.
 * Loaded ONLY when /api/features says codeShifts=true (CODE_SHIFTS=list + CODE_SHIFTS_ALLOWLIST); the server enforces the
 * same switch (POST /api/gap-shift source "code-upgrade"). Door + "Saving… / ✓ Saved to your Shifts" feel from mock-up r17
 * (feat/wow-mockup 6ffc46b, #cushl); the saved row is the app's own Code Upgrade Shift shape from feat/luxury-home
 * (method_name "Code Upgrade", focus_area "code-upgrade:<card>", reading in gap_explanation, paired activation title). */
(function () {
  if (window.__rfCodeShift) return; window.__rfCodeShift = 1;
  function buzz() { try { navigator.vibrate && navigator.vibrate(8); } catch (e) {} }
  function email() { return (typeof RH_EMAIL !== 'undefined' && RH_EMAIL) || ''; }
  document.addEventListener('rf:code-shown', function (ev) {
    var cd = ev.detail && ev.detail.card, slot = ev.detail && ev.detail.slot; if (!cd || !slot) return;
    slot.innerHTML = '<div class="door cudoor" id="cushift" role="button" tabindex="0"><div class="orb">✦</div><div class="txt">Create Shifting Card</div><div class="arr">→</div></div><p class="rf-cu-note" id="cushift-note" aria-live="polite"></p>';
    var sl = slot.querySelector('#cushift'), note = slot.querySelector('#cushift-note'); var saving = false, saved = false;
    async function save() {
      if (saving || saved) return; var em = email(); if (!em) { note.textContent = 'Please sign in to save this Shift.'; return; }
      saving = true; buzz(); var t = sl.querySelector('.txt'); t.textContent = 'Saving…'; note.textContent = '';
      try {
        var res = await fetch('/api/gap-shift', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          source: 'code-upgrade', email: em, divineIdentityName: cd.n, currentFrequency: 'Code Upgrade', focusArea: 'code-upgrade:' + cd.f,
          gapExplanation: cd.r, recommendedActivation: cd.a }) });
        var data = await res.json().catch(function () { return {}; });
        if (!res.ok || !data.shiftId) throw new Error(data.error || ('HTTP ' + res.status));
        saved = true; t.textContent = '✓ Saved to your Shifts'; sl.classList.add('done'); sl.setAttribute('aria-disabled', 'true');
        window.__rfLastCodeShift = data.shiftId;
        note.textContent = 'Shifting card saved to My Revolution';
        if (typeof window.loadMemberRevolutionData === 'function') { try { await window.loadMemberRevolutionData(); } catch (e) {} }
      } catch (err) {
        t.textContent = 'Create Shifting Card'; note.textContent = 'Something went wrong saving this Shift. Please try again.';
      } finally { saving = false; }
    }
    sl.onclick = save; sl.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); save(); } };
  });
  // A saved Code Upgrade Shift leads with its code card picture on the Shift cards.
  function decorate() {
    var list = window.RF_CU_CARDS || [], dir = window.RF_CU_DIR || '/code-cards/'; if (!list.length || typeof SHIFTS === 'undefined') return;
    document.querySelectorAll('.rf-sbub[data-shift-id]').forEach(function (el) {
      if (el.querySelector('.rf-cu-thumb')) return;
      var s = SHIFTS.find(function (x) { return String(x.id) === el.getAttribute('data-shift-id'); }); if (!s || s.method !== 'Code Upgrade') return;
      var c = list.find(function (x) { return x.n === s.identity; }); if (!c) return;
      var im = document.createElement('img'); im.className = 'rf-cu-thumb'; im.src = dir + c.f + '.webp'; im.alt = c.n + ' code card'; el.insertBefore(im, el.firstChild); el.classList.add('rf-has-cu');
    });
  }
  var queued = false; // one pass per frame at most, so chat typing never pays for this
  new MutationObserver(function () { if (queued) return; queued = true; requestAnimationFrame(function () { queued = false; decorate(); }); }).observe(document.body, { childList: true, subtree: true });
  decorate();
})();
