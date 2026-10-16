/* Code Upgrade daily card pull for the refreshed app (Oct 15 2026).
 * Loaded ONLY when /api/features says codePull=true for this member (CODE_PULL=list + CODE_PULL_ALLOWLIST).
 * Look + behaviour ported from mock-up r17 (feat/wow-mockup 6ffc46b, "Code Upgrade card pull"); deck data, card art and
 * code -> activation pairings are the app's Code Upgrade deck from feat/luxury-home (unchanged). 7 codes have no paired
 * activation in the library yet ("missing"): they get the reading only (decision 11). */
(function () {
  if (window.__rfCodes) return; window.__rfCodes = 1;
  var CU_DIR = '/code-cards/';
  var CU_CARDS = [
        { n: 'Psychic', c: '96311', f: 'psychic-96311', a: 'Psychic Emerson Activation', s: '', missing: true, r: 'This card is calling your sight back home. Somewhere along the way you learned it was safer to keep what you know quiet, to second-guess the nudge and wait for proof. That old code of hiddenness is upgrading now. Your knowing is allowed to be clear, spoken and trusted, and it doesn\u2019t need anyone\u2019s permission to be real.' },
        { n: 'Sovereignty', c: '11211', f: 'sovereignty-11211', a: 'Sovereignty Activation', s: '', missing: true, r: 'Love, this one is about taking your power back from every room you shrank in. The old code said your needs came last and your voice had to be earned. Sovereignty rewrites that: you are the authority in your own field. Decisions get simpler when you stop asking who you have to be to stay safe.' },
        { n: 'Vibration', c: '12127', f: 'vibration-12127', a: 'Raise Your Vibration Activation', s: '', missing: true, r: 'Your frequency has been carrying other people\u2019s weather. This card says it\u2019s time to set it down. The old code of matching whatever heaviness is around you is lifting, and your natural vibration is light, steady and yours. Notice how quickly things move when you stop dimming to fit in.' },
        { n: 'Prosperity Flow', c: '36951', f: 'prosperity-flow-36951', a: 'Prosperity Flow Activation', s: '', missing: true, r: 'Here\u2019s what I see: you\u2019ve been bracing around money, holding on tight in case it stops. That scarcity code is ready to dissolve. Prosperity isn\u2019t a reward you earn by overgiving, it\u2019s a current you are allowed to stand in. Let it come in, and let it stay.' },
        { n: 'Expansion', c: '71325', f: 'expansion-71325', a: 'Expansion Activation', s: 'expansion-activation', r: 'You\u2019ve outgrown the container you\u2019ve been living in, and part of you already knows it. The old code of limitation kept you small so nobody would be uncomfortable. Expansion means taking up the space your gifts were always meant to fill. You don\u2019t have to have it all figured out to grow into it.' },
        { n: 'Embody', c: '98321', f: 'embody-98321', a: 'Embodiment Activation', s: '', missing: true, r: 'Your light body is asking to be fully lived in. The old code taught you to leave your body when things got intense, to float above it all. This Embody code calls every part of you back in, so your energy has a home and your shifts finally hold.' },
        { n: 'Grounding', c: '97531', f: 'grounding-97531', a: 'Grounding Activation', s: 'grounding', r: 'Babe, you\u2019ve been holding everyone, and it\u2019s left you a little untethered. This card roots you back down. The old code said safety came from staying alert; the upgrade is safety that lives in your body. From here you can be seen without being swept away.' },
        { n: 'Clear', c: '7112', f: 'clear-7112', a: 'Clearing Activation', s: 'clearing-activation', r: 'There\u2019s some static in your field that isn\u2019t yours. Clear is the reset. The old code of carrying it all quietly is releasing, and clarity is what\u2019s left underneath. Expect your next step to feel obvious once the noise moves out.' },
        { n: 'Nervous System', c: '9383', f: 'nervous-system-9383', a: 'Nervous System Recalibration Activation', s: 'nervous-system-recalibration', r: 'Your system has been running on high alert for a long time, and it makes sense. This card is permission to soften. The old code said rest had to be earned; the upgrade is a body that knows it\u2019s safe now. When your nervous system settles, the shifts you\u2019ve been working for start to stick.' },
        { n: 'Protection', c: '7891', f: 'protection-7891', a: 'Protection & Shielding Activation', s: 'protection-shielding', r: 'You\u2019re so open and so sensitive, and that\u2019s a gift. The old code said being open meant absorbing everything. Protection rewrites it: you can stay soft-hearted and still have strong edges. What isn\u2019t yours doesn\u2019t get to stay.' },
        { n: 'Wealth', c: '88118', f: 'wealth-88118', a: 'Wealth Frequency Activation', s: 'wealth-frequency-activation', r: 'This one is big. Wealth is showing up because you\u2019re ready to hold more than you\u2019ve allowed yourself before. The old lack code kept a ceiling on what felt safe to receive. That ceiling is lifting. Let your energy get used to more, so your bank account can follow.' },
        { n: 'Receiving', c: '7127', f: 'receiving-7127', a: 'More Than Enough Activation', s: 'more-than-enough-activation', r: 'You are amazing at giving, and receiving has been the harder side. The old code said you had to earn every good thing. Receiving opens your hands: support, money, love and opportunity are allowed to come to you easily. Practice saying thank you and letting it land.' },
        { n: 'Throat Chakra', c: '86116', f: 'throat-chakra-86116', a: 'Throat Chakra Activation', s: 'throat-chakra-activation', r: 'There\u2019s something you\u2019ve been holding back from saying. This card says your voice is safe now. The old code of hiding your truth to keep the peace is upgrading into clear, warm expression. People are waiting to hear exactly what you know.' },
        { n: 'Sacral Chakra', c: '22317', f: 'sacral-chakra-22317', a: 'Sacred Bowl Activation', s: 'sacred-bowl-activation', r: 'Your creative, joyful energy wants to move again. The old code turned pleasure and play into something you had to justify. Sacral energy is your flow: creating, feeling and enjoying your life. When you let yourself want things, everything gets easier to receive.' },
        { n: 'Earth Star', c: '93321', f: 'earth-star-93321', a: '10 Min Earth Star Activation', s: '10-min-earth-star-activation', r: 'This card anchors you into something deeper than this moment\u2019s chaos. The old code was instability, never quite sure where you stand. Your Earth Star connects you to a foundation that doesn\u2019t move. From here, your big visions have something solid to grow from.' },
        { n: 'Third Eye Chakra', c: '53682', f: 'third-eye-chakra-53682', a: 'Third Eye Activation', s: 'third-eye-activation', r: 'Your inner vision is getting sharper, and you may have been doubting what you see. The old code said you had to prove it before you trusted it. The upgrade is clear sight you can rely on. Pay attention to the images and the knowings that come this week.' },
        { n: 'Confidence', c: '53778', f: 'confidence-53778', a: 'Confidence Activation', s: 'confidence-activation', r: 'This card is here because you\u2019ve been second-guessing yourself more than you deserve. The old code said you had to be sure before you could speak. Confidence rewrites it: you get to decide, show up and adjust as you go. Your certainty grows from moving, not from waiting.' },
        { n: 'Alignment', c: '11111', f: 'alignment-11111', a: 'Alignment Activation', s: 'alignment-activation', r: 'There\u2019s been static between what you want and how you\u2019ve been moving. The old code pulled you in every direction at once. Alignment brings you back to one clear line. When you choose from that place, your next step stops feeling like a guess.' },
        { n: 'Success', c: '82128', f: 'success-82128', a: 'Success Code Activation', s: 'gap-method-expander', r: 'Success is calling you to stop shrinking it. The old code said it was safer not to want too much, in case it didn\u2019t come. This upgrade lets you claim it out loud. Your work is meant to land, and you\u2019re allowed to feel it land.' },
        { n: 'Creation', c: '010101', f: 'creation-010101', a: 'Creator Within Activation', s: 'creator-within-activation', r: 'Something new wants to be born through you. The old code made creating feel like pressure, like you had to force it into being. Creation reconnects you to the root of it, where ideas grow naturally. Let it come from your soul, and it will feel like you.' },
        { n: 'Crystal Business', c: '01576', f: 'crystal-business-01576', a: 'Crystal Business Activation', s: 'crystal-business-activation', r: 'Your business wants clarity, love. The old code kept it cloudy, too many ideas and not enough flow. This card brings crystalline focus: one clear offer, one clear message, and energy that moves freely. Simplicity is the upgrade.' },
        { n: 'Visibility', c: '80213', f: 'visibility-80213', a: 'Visibility Activation', s: 'visibility-activation', r: 'You\u2019ve been seen a little and then pulled back, right when it started to work. That\u2019s the old code of hiddenness keeping you safe. Visibility says you can stay out in the open as things grow. More eyes don\u2019t take anything from you.' },
        { n: 'Light Code', c: '71073', f: 'light-code-71073', a: 'Light Frequency Activation: Increase your Light and Shine Like the Sun!', s: 'light-frequency-activation', r: 'Your light has been turned down to fit the room. The old code taught you that shining too bright made people uncomfortable. This Light Code turns it back up. The people meant for you can only find you when you glow.' },
        { n: 'Remembrance', c: '79321', f: 'remembrance-79321', a: 'Remembrance Activation', s: 'remembrance-activation', r: 'This card is a homecoming. You\u2019ve been searching outside yourself for something you already carry. The old code of forgetting is lifting, and what you knew before all the noise is coming back. Trust what feels familiar.' },
        { n: 'Ascend', c: '09371', f: 'ascend-09371', a: 'Lifting You Higher Activation: Raise your Vibration Above The Matrix Frequencies', s: 'lifting-you-higher-activation', r: 'You\u2019re rising, and part of you has been holding onto the old ground out of habit. The old code kept you tethered to heavy collective energy. Ascend lifts you above it, so you think, feel and choose from a higher place. It\u2019s safe to go up.' },
        { n: 'Clairvoyance', c: '33934', f: 'clairvoyance-33934', a: 'Clairvoyance Activation', s: 'clairvoyance-activation', r: 'Your inner sight is opening. The old code said visions were imagination and you should keep them to yourself. This card says what you see is real information. Write down the images that come, and watch how often they make sense later.' },
        { n: 'Timeline', c: '8653', f: 'timeline-8653', a: 'Timeline Collapse Activation', s: 'timeline-collapse-activation', r: 'You\u2019re standing between two versions of your life. The old code kept replaying the slower, heavier path. This card collapses that timeline so the one that\u2019s already shifting can take over. Act like the new version is already here.' },
        { n: 'Millionaire', c: '77117', f: 'millionaire-77117', a: 'Million Dollar Blueprint Activation', s: 'million-dollar-blueprint-activation', r: 'Millionaire isn\u2019t about the money. It\u2019s about the frequency of the healer who receives it with ease. This card clears the ceiling you placed on what you\u2019re allowed to have, so wealth can meet you where you already are.' },
        { n: 'Power', c: '55673', f: 'power-55673', a: 'Power Activation', s: '', missing: true, r: 'Your power has been sitting just under the surface, waiting for you to stop apologizing for it. The old code said strength made you too much. Power upgrades that into steady, grounded authority. You can be soft and powerful at the same time.' },
        { n: 'Leadership', c: '80613', f: 'leadership-80613', a: 'Leadership Recode Activation', s: 'leadership-recode-activation', r: 'People are already looking to you, whether you feel ready or not. The old code of hesitation made you wait for permission to lead. This card recodes that. Lead from your heart and your knowing, and let it be enough.' },
        { n: 'Channel', c: '4301', f: 'channel-4301', a: 'Activating Your Channel To Spirit Activation', s: 'activating-your-channel-to-spirit', r: 'Your channel is clearing. The old code said guidance had to be complicated or reserved for someone else. This card opens the line between you and Spirit so messages come through clean. Ask, then listen for the quiet answer.' },
        { n: 'High Vibe', c: '4407', f: 'high-vibe-4407', a: 'Yes Factor Vibe Booster', s: 'yes-factor-vibe-booster', r: 'This card is a reminder that your vibe is yours to set. The old code let the day decide how you felt. High Vibe upgrades it into starting from joy and clarity on purpose. Begin there, and the rest of the day follows.' },
        { n: 'Gifts', c: '1112', f: 'gifts-1112', a: 'Activating Your Gifts Activation', s: 'activating-your-gifts', r: 'Your gifts aren\u2019t asleep, babe. They\u2019ve been waiting for you to use them on purpose. The old code said they were too much or not enough. This card says they\u2019re exactly right, and they get stronger every time you trust them.' },
        { n: 'Intuition', c: '08912', f: 'intuition-08912', a: 'Intuition Activation', s: 'intuition-activation', r: 'Your intuition has always known the way. This code clears the noise and doubt that taught you to second-guess yourself, so you can hear your inner guidance clearly and trust it enough to act.' },
        { n: 'Impact', c: '9909', f: 'impact-9909', a: 'Impact Vibe Booster', s: 'impact-vibe-booster', r: 'You came here to change lives, and this card wants you to remember it. The old code made your work feel small, like it didn\u2019t really matter. Impact reconnects you to the ripple you\u2019re already creating. Someone is waiting for exactly what you share.' },
        { n: 'Freedom', c: '80112', f: 'freedom-80112', a: 'Freedom Timeline Activation', s: 'gap-method-creator', r: 'You\u2019ve been carrying rules that were never yours. The old code of limitation told you what\u2019s possible and what\u2019s not. Freedom opens your wings. You get to build a life and business that feels spacious, on your own terms.' },
        { n: 'Soul-Led Business', c: '6710', f: 'soul-led-business-6710', a: 'Emerging Your Soul Into Your Business Activation', s: 'emerging-your-soul-into-your-business', r: 'Your business wants more of your soul in it. The old code said strategy had to come first and your heart second. This card flips that. When your soul leads, the right people feel it, and the work feels like you again.' },
        { n: 'Release', c: '66810', f: 'release-66810', a: 'Pink Cloud Activation', s: 'pink-cloud-activation', r: 'You\u2019re ready to let go of something you\u2019ve been gripping for a long time. The old code said holding on kept you safe. Release lets it fall away gently, so there\u2019s room for what\u2019s next. You don\u2019t lose yourself when you let go. You find more of yourself.' },
        { n: 'Certainty', c: '33560', f: 'certainty-33560', a: 'Removing the Frequency of Doubt', s: 'gap-method-wayshower', r: 'Doubt has been doing a lot of the talking lately. The old code said you had to be completely sure before you moved. Certainty upgrades that into a steady inner yes. You already know more than you\u2019re giving yourself credit for.' },

        { n: 'Magnetic', c: '77311', f: 'magnetic-77311', a: 'Magnetic Field Activation', s: 'magnetic-field-activation', r: 'Love, you\u2019ve been chasing what is already trying to find you. Magnetic says stop running after it. The old code said you had to work harder to be chosen. The new code is you, settled in your own field, letting the right people, money and moments come to you.' },
        { n: 'Reset', c: '2202', f: 'reset-2202', a: 'Reset Activation', s: '', missing: true, r: 'This card is a clean slate, babe. You\u2019ve been carrying yesterday into today and calling it responsibility. The old code said you had to keep pushing through. The new code is a full reset: breathe, come back to centre, and begin again from your own energy.' }
      ];
  window.RF_CU_CARDS = CU_CARDS; window.RF_CU_DIR = CU_DIR;
  // TEMPORARY (launch day Oct 16 2026, Rachael): activations held back from the code card while their rename + playback
  // fix waits on the post-launch cleanup list. The card and its reading still show; only the activation door is left off.
  // The code -> activation pairings above are NOT changed. To bring an activation back, remove its slug from this list.
  var HELD_BACK_ACTIVATIONS = ['activating-your-channel-to-spirit'];
  var RM = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var cuLast = -1;
  function $(s, r) { return (r || document).querySelector(s); }
  function buzz() { try { navigator.vibrate && navigator.vibrate(8); } catch (e) {} }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function deckHTML() {
    var h = '<div class="deckhint" id="dhint"><b>Tap or swipe up to pull a card.</b></div><div class="deckstage" id="dstage">';
    for (var k = 0; k < 7; k++) { var t = k - 3; h += '<div class="dcard" role="button" tabindex="0" aria-label="Pull this card" data-k="' + k + '" style="--x:' + (t * 34) + 'px;--y:' + (Math.abs(t) * Math.abs(t) * 5) + 'px;--r:' + (t * 9) + 'deg;--d:-' + (k * .6) + 's;z-index:' + (10 - Math.abs(t)) + '"><div class="f" style="background-image:url(' + CU_DIR + 'card-back.webp)"></div><div class="f fr"></div></div>'; }
    return h + '</div><div id="codeinfo"></div>';
  }
  function setupDeck() {
    var st = $('#dstage'); var busy = false;
    st.querySelectorAll('.dcard').forEach(function (c) {
      var y0 = null, x0 = 0, t0 = 0, s0 = 0;
      c.addEventListener('pointerdown', function (e) { y0 = e.clientY; x0 = e.clientX; t0 = Date.now(); s0 = window.scrollY; });
      c.addEventListener('pointercancel', function () { y0 = null; });
      c.addEventListener('pointerup', function (e) {
        if (y0 === null) return; var dy = y0 - e.clientY, dx = Math.abs(e.clientX - x0), dt = Date.now() - t0, scrolled = Math.abs(window.scrollY - s0) > 2; y0 = null; if (scrolled) return;
        if (Math.abs(dy) < 10 && dx < 10 && dt < 400) pull(c); else if (dy > 50 && dx < dy && dt < 450) pull(c);
      });
      c.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pull(c); } });
    });
    function pull(c) {
      if (busy) return; busy = true; buzz();
      var i; do { i = Math.random() * CU_CARDS.length | 0; } while (i === cuLast && CU_CARDS.length > 1); cuLast = i; var cd = CU_CARDS[i];
      window.__rfCodePulled = cd;
      try { document.dispatchEvent(new CustomEvent('rf:code-pulled', { detail: cd })); } catch (e) {}
      c.querySelector('.fr').style.backgroundImage = 'url(' + CU_DIR + cd.f + '.webp)';
      st.querySelectorAll('.dcard').forEach(function (x) { if (x !== c) x.classList.add('gone'); }); c.classList.add('pulled');
      requestAnimationFrame(function () { requestAnimationFrame(function () { c.classList.add('flip'); }); });
      setTimeout(function () {
        st.classList.add('done'); if (!RM) burst(st);
        setTimeout(function () {
          $('#dhint').innerHTML = 'Today\'s code';
          var hasAct = !cd.missing && !!cd.s && HELD_BACK_ACTIVATIONS.indexOf(cd.s) === -1;
          $('#codeinfo').innerHTML = '<div class="codeinfo"><button type="button" class="chev" id="cuchev" aria-label="Scroll down to your reading"><i></i><i></i><i></i></button><div class="code shine codepop" style="font-size:44px;margin:0">' + esc(cd.n) + '</div><div class="num">' + esc(cd.c) + '</div><div class="divider"></div><div class="cuup" id="cuhead"></div><div class="cudoors">' +
            '<div class="door cudoor" id="curead" role="button" tabindex="0" aria-expanded="false" aria-controls="cudrop"><div class="orb">✧</div><div class="txt"></div><div class="arr">▾</div></div><div class="cudrop" id="cudrop" hidden><p class="rd"></p></div>' +
            (hasAct ? '<div class="door cudoor" id="cuact" role="button" tabindex="0"><div class="orb t">◉</div><div class="txt"></div><div class="arr">→</div></div>' : '') +
            '<div id="cuextra"></div></div><p class="sub" style="font-size:16px;margin-top:12px">Carry this word with you today. Come back to it whenever the noise gets loud.</p><button class="btn-t" id="cuagain" style="margin-top:10px">↺ Pull another card</button></div>';
          $('#codeinfo .rd').textContent = cd.r;
          $('#cuchev').onclick = function (e) { e.stopPropagation(); $('#cuhead').scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'center' }); };
          $('#cuhead').textContent = cd.n + ' ' + cd.c; $('#curead .txt').textContent = cd.n + ' Reading';
          var key = function (el, fn) { el.onclick = fn; el.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } }; };
          var rb = $('#curead'), dr = $('#cudrop');
          key(rb, function () { buzz(); var o = dr.hidden; dr.hidden = !o; rb.classList.toggle('open', o); rb.setAttribute('aria-expanded', o); });
          var ab = $('#cuact');
          if (ab) { ab.querySelector('.txt').textContent = cd.a; ab.setAttribute('aria-label', cd.a + '. Opens it'); key(ab, function () { buzz(); if (typeof window.handleActivationCardClick === 'function') window.handleActivationCardClick(cd.s); }); }
          try { document.dispatchEvent(new CustomEvent('rf:code-shown', { detail: { card: cd, slot: $('#cuextra') } })); } catch (e) {}
          busy = false;
          $('#cuagain').onclick = function () { $('#cudeck').innerHTML = deckHTML(); setupDeck(); window.scrollTo({ top: 0, behavior: RM ? 'auto' : 'smooth' }); };
        }, RM ? 0 : 800);
      }, 0);
    }
  }
  function burst(st) { for (var k = 0; k < 36; k++) { var p = document.createElement('i'); p.className = 'spark' + (k % 3 ? '' : ' t'); var a = Math.random() * 6.28, r = 90 + Math.random() * 130; p.style.setProperty('--tx', Math.cos(a) * r + 'px'); p.style.setProperty('--ty', Math.sin(a) * r + 'px'); p.style.top = '45%'; st.append(p); (function (p) { setTimeout(function () { p.remove(); }, 1400); })(p); } }

  // Home: the "Find your daily focus today" door from the mock-up (r13-r17 "Your Doors": code, gap, chat), first in the lineup.
  function homeDoor() {
    if (document.getElementById('rf-door-code')) return true;
    var gap = document.querySelector('#rf-home .rf-door[data-rf-go="gap"]'); if (!gap) return false;
    var d = document.createElement('button'); d.type = 'button'; d.className = 'rf-door'; d.id = 'rf-door-code'; d.setAttribute('data-rf-go', 'focus');
    d.innerHTML = '<span class="rf-orb" aria-hidden="true">✧</span><span class="txt">Find your daily focus today</span><span class="arr" aria-hidden="true">→</span>';
    gap.parentNode.insertBefore(d, gap); gap.parentNode.classList.add('rf-doors3');
    return true;
  }
  // Today's Focus = one screen in two parts: today's code (pull, reading, activation, save as a Shift), then the Shift you're in.
  function mount() {
    var head = document.getElementById('rf-focus-head'); if (!head || document.getElementById('rf-codes')) return;
    var sec = document.createElement('section'); sec.className = 'rf-screen'; sec.id = 'rf-codes'; sec.setAttribute('aria-label', 'Your daily code');
    sec.innerHTML = '<div class="rf-sec rf-cu-h"><h3>Your Daily Code</h3></div><div id="cudeck"></div><div class="rf-sec rf-cu-h rf-cu-h2" id="rf-codes-after"><h3>Your Newest Shift</h3></div>';
    head.parentNode.insertBefore(sec, head.nextSibling);
    var sub = head.querySelector('.rf-sub'); if (sub) { sub.setAttribute('data-orig', sub.textContent); sub.hidden = true; }
    $('#cudeck').innerHTML = deckHTML(); setupDeck();
    CU_CARDS.slice(0, 8).forEach(function (c) { var im = new Image(); im.src = CU_DIR + c.f + '.webp'; });
    document.body.classList.add('rf-has-codes');
    if (!homeDoor()) { var n = 0, iv = setInterval(function () { if (homeDoor() || ++n > 40) clearInterval(iv); }, 250); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
