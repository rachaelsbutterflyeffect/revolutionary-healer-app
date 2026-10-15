/* Five-question "find your activation today" check-in on Home (refresh only, Oct 15 2026).
 * Loaded ONLY when /api/features says homeCheckin=true for this member (HOME_CHECKIN=list + HOME_CHECKIN_ALLOWLIST).
 * Questions, recommender matrix, copy and the gold galaxy swirl are ported from mock-up r17 (feat/wow-mockup 6ffc46b,
 * "Daily focus diagnostic" + "Check-in: radial galaxy swirl"). The result is a REAL library activation: title, description
 * and cover come from the app's own library card; Listen now opens it the normal way (handleActivationCardClick). */
(function () {
  if (window.__rfCheckin) return; window.__rfCheckin = 1;
  var RM = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  function $(s, r) { return (r || document).querySelector(s); }
  function buzz() { try { navigator.vibrate && navigator.vibrate(8); } catch (e) {} }
  var DQ = [{ q: "How is your energy today?" }, { q: "How connected do you feel?" }, { q: "How grounded do you feel?" },
    { q: "What's pulling at you most right now, body or mind?", k: 'bm', o: [['body', 'Body'], ['mind', 'Mind']] },
    { q: "Today, do you want to slow down or get moving?", k: 'sm', o: [['slow', 'Slow down'], ['move', 'Get moving']] }];
  var dv = [], dp = {}; var DN = DQ.length;
  function dProg() { return (dv.filter(Boolean).length + Object.keys(dp).length) / DN; }
  function dGlow() { var o = $('#dorb'); if (o) o.style.filter = 'brightness(' + (.8 + dProg() * .6) + ')'; }
  var DMAP = {
    energy: { body: { slow: 'nervous-system-recalibration', move: 'light-frequency-activation' }, mind: { slow: 'clearing-activation', move: 'lifting-you-higher-activation' } },
    connection: { body: { slow: 'sacred-bowl-activation', move: 'activating-your-gifts' }, mind: { slow: 'activating-your-channel-to-spirit', move: 'intuition-activation' } },
    grounded: { body: { slow: 'grounding', move: '10-min-earth-star-activation' }, mind: { slow: 'protection-shielding', move: 'alignment-activation' } },
    high: { body: { slow: 'pink-cloud-activation', move: 'confidence-activation' }, mind: { slow: 'remembrance-activation', move: 'expansion-activation' } } };
  var DNEED = { energy: 'raising your energy', connection: 'reopening your connection', grounded: 'coming back into your body', high: 'letting your light be seen' };
  window.RF_CHECKIN_MAP = DMAP;
  function act(slug) { // the app's own library card for this activation
    var c = document.querySelector('.media-card[data-activation-slug="' + slug + '"]');
    var th = c && c.querySelector('.media-thumb'); var bg = th ? (th.style.backgroundImage || getComputedStyle(th).backgroundImage) : '';
    var t = c && c.querySelector('h3'); var d = c && c.querySelector('p');
    return { s: slug, t: t ? t.textContent.trim() : slug, d: d ? d.textContent.trim() : '', bg: bg && bg !== 'none' ? bg : '' };
  }
  function dStep(i) {
    dGlow(); var d = $('#diag');
    var head = '<div class="prog3">' + DQ.map(function (_, j) { return '<i class="' + (j <= i ? 'on' : '') + '"></i>'; }).join('') + '</div><div class="q-label" style="text-align:center;margin-top:10px">STEP ' + (i + 1) + ' OF ' + DN + '</div>';
    var nav = function (has) { return '<div class="row-between"><button type="button" class="btn-t" id="d-back">' + (i ? '← Back' : '') + '</button><button type="button" class="btn-g" id="d-next" ' + (has ? '' : 'disabled') + '>' + (i < DN - 1 ? 'Next →' : 'See my activation →') + '</button></div>'; };
    if (i < 3) {
      d.innerHTML = head + '<div class="qn">' + DQ[i].q + '</div><div class="dots10">' + Array.from({ length: 10 }, function (_, k) { return '<button type="button" data-v="' + (k + 1) + '"' + (dv[i] === k + 1 ? ' class="sel"' : '') + '>' + (k + 1) + '</button>'; }).join('') + '</div><div class="scale-l"><span>LOW</span><span>HIGH</span></div>' + nav(dv[i]);
      d.querySelectorAll('.dots10 button').forEach(function (bn) { bn.onclick = function () { var v = +bn.dataset.v; dv[i] = v; d.querySelectorAll('.dots10 button').forEach(function (x) { x.classList.toggle('fill', +x.dataset.v < v); x.classList.toggle('sel', +x.dataset.v === v); }); $('#d-next').disabled = false; buzz(); dGlow(); }; });
    } else if (i < DN) {
      var Q = DQ[i];
      d.innerHTML = head + '<div class="qn">' + Q.q.replace("'", "&#39;") + '</div><div class="qpick">' + Q.o.map(function (o) { return '<button type="button" data-v="' + o[0] + '" aria-pressed="' + (dp[Q.k] === o[0]) + '"' + (dp[Q.k] === o[0] ? ' class="sel"' : '') + '>' + o[1] + '</button>'; }).join('') + '</div>' + nav(dp[Q.k]);
      d.querySelectorAll('.qpick button').forEach(function (bn) { bn.onclick = function () { dp[Q.k] = bn.dataset.v; d.querySelectorAll('.qpick button').forEach(function (x) { var on = x === bn; x.classList.toggle('sel', on); x.setAttribute('aria-pressed', on); }); $('#d-next').disabled = false; buzz(); dGlow(); }; });
    }
    if (i < DN) { $('#d-back').onclick = function () { if (i) dStep(i - 1); }; $('#d-next').onclick = function () { dStep(i + 1); }; return; }
    var e = dv[0], c = dv[1], g = dv[2]; var m = Math.min(e, c, g); var need = m >= 8 ? 'high' : e === m ? 'energy' : c === m ? 'connection' : 'grounded';
    var slug = DMAP[need][dp.bm][dp.sm]; var a = act(slug);
    var lead = need === 'high' ? 'All three scores came in high today (' + e + ', ' + c + ', ' + g + '), so this is about ' + DNEED.high + '.' : ({ energy: 'Energy', connection: 'Connection', grounded: 'Grounded' }[need]) + ' came in lowest (' + m + '/10), so today is about ' + DNEED[need] + '.';
    var why = lead + ' You said your ' + dp.bm + ' is pulling at you most and you want to ' + (dp.sm === 'slow' ? 'slow down' : 'get moving') + ', so this one meets you there.';
    window.__rfCheckinResult = { need: need, bm: dp.bm, sm: dp.sm, slug: slug, scores: [e, c, g] };
    d.innerHTML = '<div><div class="q-label" style="text-align:center">YOUR ACTIVATION</div><div class="qn" style="font-size:26px">Here\'s the activation that best fits you today, based on your energy</div><div class="acard"><div class="cv"></div><div class="bd"><h2></h2><p class="ad"></p><p class="why"></p><button type="button" class="btn-g" id="d-play">▶ Listen now</button></div></div><div style="text-align:center;margin-top:14px"><button type="button" class="btn-t" id="d-again">↺ Retake</button></div></div>';
    if (a.bg) d.querySelector('.acard .cv').style.backgroundImage = a.bg; else d.querySelector('.acard .cv').style.display = 'none';
    d.querySelector('.acard h2').textContent = a.t; d.querySelector('.acard .ad').textContent = a.d; d.querySelector('.acard .why').textContent = '✦ ' + why;
    $('#d-play').onclick = function () { buzz(); if (typeof window.handleActivationCardClick === 'function') window.handleActivationCardClick(slug); };
    $('#d-again').onclick = function () { dv = []; dp = {}; dStep(0); };
  }
  function swirl() { // ported verbatim (logic) from mock-up r12/r17
    var c = $('#fitc'); if (!c) return; var x = c.getContext('2d'); var S = 0, vis = true;
    var P = Array.from({ length: 240 }, function () { var u = Math.random(); var r = .03 + .94 * u * u; var arm = (Math.random() < .5 ? 0 : Math.PI); var a = r < .18 ? Math.random() * 6.283 : arm + r * 4.2 + (Math.random() - .5) * (1.3 + r * 1.1);
      return { a: a, r: r, sp: .0027 + .0117 * (1 - r), s: (.35 + 1.15 * (1 - r)) * (.7 + Math.random() * .6), dim: 1 - .62 * r, tw: Math.random() * 6.283, t: Math.random() < .12, wob: Math.random() * 6.283 }; });
    function size() { var d = Math.min(devicePixelRatio, 2); S = c.clientWidth; c.width = S * d; c.height = S * d; x.setTransform(d, 0, 0, d, 0, 0); }
    function draw(T) { x.clearRect(0, 0, S, S); var cx = S / 2, cy = S / 2, R = S / 2;
      var core = x.createRadialGradient(cx, cy, 0, cx, cy, R * .3); core.addColorStop(0, 'rgba(255,240,200,.30)'); core.addColorStop(.35, 'rgba(255,214,130,.06)'); core.addColorStop(1, 'rgba(255,214,130,0)'); x.fillStyle = core; x.fillRect(0, 0, S, S);
      P.forEach(function (p) { var rr = R * p.r * (1 + .02 * Math.sin(T * .7 + p.wob)); var px = cx + Math.cos(p.a) * rr, py = cy + Math.sin(p.a) * rr; var al = Math.min(1, (.55 + .45 * Math.abs(Math.sin(T * 1.8 + p.tw))) * (.25 + .85 * p.dim));
        x.fillStyle = p.t ? 'rgba(255,250,232,' + al + ')' : 'rgba(255,' + (212 + (p.s * 14 | 0)) + ',' + (135 + (p.s * 36 | 0)) + ',' + al + ')'; x.shadowColor = 'rgba(255,206,110,1)'; x.shadowBlur = 1.5 + 2 * p.dim; x.beginPath(); x.arc(px, py, p.s, 0, 7); x.fill(); if (p.s > .9) { x.shadowBlur = 0; x.fillStyle = 'rgba(255,253,240,' + al + ')'; x.beginPath(); x.arc(px, py, p.s * .45, 0, 7); x.fill(); }
        if (p.s > 1.5 && al > .75) { x.strokeStyle = 'rgba(255,241,196,' + (al * .55) + ')'; x.lineWidth = .7; x.beginPath(); x.moveTo(px - 4, py); x.lineTo(px + 4, py); x.moveTo(px, py - 4); x.lineTo(px, py + 4); x.stroke(); } }); x.shadowBlur = 0; }
    size(); addEventListener('resize', function () { size(); if (RM) draw(0); });
    if (window.IntersectionObserver) new IntersectionObserver(function (es) { vis = es[0].isIntersecting; }).observe(c);
    if (RM) { draw(0); return; }
    var T = 0; (function loop() { requestAnimationFrame(loop); if (!vis || document.body.getAttribute('data-rf') !== 'fit') return; var g = dProg(); T += .022 * (1 + g * .6); P.forEach(function (p) { p.a += p.sp * (1 + g * .8); }); draw(T); })();
  }
  function mount() {
    var home = document.getElementById('rf-home'); if (!home || document.getElementById('rf-fit')) return;
    var secs = home.querySelectorAll('.rf-sec'); var lanes = null; secs.forEach(function (s) { if (s.querySelector('.rf-lanes')) lanes = s; });
    var sec = document.createElement('div'); sec.className = 'rf-sec rf-reveal in'; sec.id = 'rf-fit-door';
    sec.innerHTML = '<h3>Your Activation Today</h3><button type="button" class="rf-door" data-rf-go="fit"><span class="rf-orb" aria-hidden="true">◉</span><span class="txt">Find the activation that best fits you today</span><span class="arr" aria-hidden="true">→</span></button>';
    if (lanes) lanes.parentNode.insertBefore(sec, lanes.nextSibling); else home.appendChild(sec);
    var scr = document.createElement('section'); scr.className = 'rf-screen'; scr.id = 'rf-fit'; scr.setAttribute('aria-label', 'Your activation today');
    scr.innerHTML = '<button type="button" class="rf-back" data-rf-go="home">← Home</button><h2 class="ttl shine">Your Activation</h2><p class="sub">Five quick taps. Then the activation that best fits you today.</p><div class="small-orb fit-ring" id="dorb"><canvas id="fitc" aria-hidden="true"></canvas></div><div id="diag"></div>';
    home.parentNode.insertBefore(scr, home.nextSibling);
    document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('[data-rf-go="fit"]')) { dv = []; dp = {}; dStep(0); } }, true);
    dStep(0); swirl();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
