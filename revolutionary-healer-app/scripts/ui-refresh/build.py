#!/usr/bin/env python3
"""Builds public/app-refresh.html from public/app.html (UI refresh, r17 look).
Look only: app.html's markup, IDs, data-roles, onclicks, scripts, API calls and storage keys are
carried over; new markup is added around them. Re-run after any app.html change:
    python3 build.py <path-to>/public
"""
import re, sys, os, html
PUB = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(PUB, 'app.html'), encoding='utf-8').read()
s = src
def rd(n): return open(os.path.join(HERE, n), encoding='utf-8').read()
def once(old, new, label):
    global s
    n = s.count(old)
    if n != 1: sys.exit('anchor %r found %d times (%s)' % (old[:60], n, label))
    s = s.replace(old, new)

FAQS = [
 ("What is the GAP Method™?", "A guided process that helps you find the gap between where your energy is now and where you want it to be, then gives you a Shifting card and an activation to help you shift it."),
 ("How do I use the activations?", "Pick a category, choose an activation, and press Listen. Find a quiet moment, put on headphones if you can, and let it play through. Come back to it whenever you need it."),
 ("What is a Shifting card?", "A card that saves a shift you're working on, with where it came from, the date, and its activation. You'll find them in My Revolution, and you can mark each one Embodied when it feels anchored."),
 ("How do I manage my membership?", "Go to Profile, then Account, then Manage membership. For anything else, tap Contact Support and we'll get back to you."),
]
SUPPORT = 'Rachaelsbutterflyeffect@gmail.com'
MANAGE_ONCLICK = "window.open('https://www.rachaelsbutterflyeffect.com/settings/account','_blank')"

# ---- the classic page's own switch must never run here (it would send this page to itself) ----
s = re.sub(r'<script id="rf-switch">.*?</script>\n', '', s, count=1, flags=re.S)
if 'rf-switch' in s: sys.exit('rf-switch still present')

# ---- <html>, <head> ----
once('<html lang="en">', '<html lang="en" class="rf-html">', 'html')
GUARD = """<style id="rf-critical">html.rf-html{background:#06080b}html.rf-html body{background:transparent;color:#fdfbf5}</style>
<script id="rf-guard">
// UI refresh switch: this page is only for members the server allows (UI_REFRESH = off / allowlist / on).
// Anyone else goes back to the classic app.html with the same query + hash. The decision is remembered per
// member (localStorage rh_ui_refresh, also written by the landing page and app.html). A member with no
// remembered "yes" gets a dark screen, never this page, until the server answers (2.5 s cap -> classic).
(function () {
  try {
    var e = localStorage.getItem('rh_member_email');
    if (!e) return; // the page's own sign-in check sends them to '/'
    var K = 'rh_ui_refresh', de = document.documentElement, yes = (localStorage.getItem(K) || sessionStorage.getItem(K)) === '1:' + e;
    var st = null;
    if (!yes) { st = document.createElement('style'); st.id = 'rf-guard-hold'; st.textContent = 'body{visibility:hidden!important}'; de.appendChild(st); }
    var back = function () { location.replace('/app.html' + location.search + location.hash); };
    var t = st ? setTimeout(back, 2500) : 0;
    fetch('/api/ui-refresh?email=' + encodeURIComponent(e), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        clearTimeout(t);
        if (!d) { if (st) back(); return; }
        try { localStorage.setItem(K, (d.refresh ? '1:' : '0:') + e); } catch (x) {}
        if (!d.refresh) { back(); return; }
        if (st) st.remove();
        window.__RF_FIRST = d.firstName || '';
        var fire = function () { document.dispatchEvent(new Event('rf:name')); };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fire); else fire();
      }).catch(function () { clearTimeout(t); if (st) back(); });
  } catch (x) {}
})();
</script>
"""
FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
         '<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600&family=Cormorant+Garamond:wght@400;500;600&family=Cormorant+SC:wght@500;600&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">\n')
once('<title>The Revolutionary Healer</title>', '<title>The Revolutionary Healer</title>\n' + GUARD + FONTS, 'title')
once('</head>\n<body>', '<style id="rf-css">\n' + rd('refresh.css') + '\n</style>\n</head>\n<body class="rf" data-rf="home">\n<canvas id="rf-sky" aria-hidden="true"></canvas><div class="rf-aurora" aria-hidden="true"></div>', 'body')

# ---- activation page order (Rachael, Oct 15): the player, then the Tell Me What You Experienced block with the
# favourite heart (and Mark as Listened) right under it, then What This Activation Is For / When To Use This.
# Same elements, ids, onclicks and copy; only their order changes.
_m = re.search(r'(    <div id="activation-detail-whatfor".*?\n    </div>\n    <div id="activation-detail-whentouse".*?\n    </div>\n)(    <div style="margin-top:24px;padding-top:20px;border-top:1px solid rgba\(169,153,127,0.25\);">\n      <h3[^\n]*Tell Me What You Experienced</h3>.*?\n    </div>\n)(    <div class="activation-detail-actions">.*?\n    </div>\n)', s, flags=re.S)
if not _m: sys.exit('activation detail blocks not found')
_xp = _m.group(2).replace('<div style="margin-top:24px;', '<div class="rf-xpblock" style="margin-top:24px;', 1)
s = s[:_m.start()] + _xp + _m.group(3) + _m.group(1) + s[_m.end():]

# ---- Home + Chat header, before the live hero/chat section ----
HOME = """
<section class="rf-screen" id="rf-home" aria-label="Home">
 <div class="rf-top"><div class="rf-mark rf-shine">REVOLUTIONARY HEALER</div><button type="button" class="rf-avatar" data-rf-go="profile" aria-label="Your profile"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8.5" r="3.6"/><path d="M4.8 20c.9-3.6 3.8-5.6 7.2-5.6s6.3 2 7.2 5.6"/></svg></button></div>
 <button type="button" class="rf-hero" data-rf-go="focus" aria-label="Open Today's Focus"><span class="rf-halo"></span><canvas id="rf-fly" aria-hidden="true"></canvas></button>
 <div class="rf-welcome"><p class="rf-hi" id="rf-say" aria-live="polite">Good day, Revolutionary Healer, welcome back</p><h1 class="rf-shine rf-big">Welcome<br>Back</h1><div class="rf-divider"></div><p>What are we doing today?<br><b>Pick your focus.</b></p></div>
 <div class="rf-sec rf-reveal"><h3>Your Doors</h3>
  <button type="button" class="rf-door" data-rf-go="gap"><span class="rf-orb" aria-hidden="true">◈</span><span class="txt">Find the resistance that's keeping you stuck</span><span class="arr" aria-hidden="true">→</span></button>
  <button type="button" class="rf-door" data-rf-go="chat"><span class="rf-orb" aria-hidden="true">❋</span><span class="txt">Dive deep with Rachael in your back pocket</span><span class="arr" aria-hidden="true">→</span></button>
 </div>
 <div class="rf-sec rf-reveal"><h3>Ask Rachael Anything</h3><div class="rf-lanes">
  <button type="button" class="rf-tile" data-rf-lane="gifts"><span class="ic" aria-hidden="true">👁</span><span><b>Spiritual Gifts</b><br><small>What's calling you?</small></span></button>
  <button type="button" class="rf-tile" data-rf-lane="money"><span class="ic" aria-hidden="true">✺</span><span><b>Money &amp; Prosperity</b><br><small>Feel the shift</small></span></button>
  <button type="button" class="rf-tile" data-rf-lane="energy"><span class="ic" aria-hidden="true">⚡</span><span><b>Energy &amp; Frequency</b><br><small>Tune your field</small></span></button>
  <button type="button" class="rf-tile" data-rf-lane="vis"><span class="ic" aria-hidden="true">☀</span><span><b>Visibility &amp; Impact</b><br><small>Be seen</small></span></button>
 </div></div>
 <div class="rf-sec rf-reveal"><h3>Go Deeper</h3><div class="rf-deeps">
  <button type="button" class="rf-deep" data-rf-go="lib"><span aria-hidden="true">♫</span>Activation Library</button>
  <button type="button" class="rf-deep" data-rf-go="shifts"><span aria-hidden="true">✦</span>Your Shifts</button>
  <button type="button" class="rf-deep" data-rf-go="rev"><span aria-hidden="true">❖</span>My Revolution</button>
 </div></div>
</section>
<div class="rf-screen" id="rf-chat-head"><button type="button" class="rf-back" data-rf-go="home">← Home</button></div>
"""
once('<section class="hero" id="hero-section">', HOME + '<section class="hero" id="hero-section">', 'home')

# ---- Today's Focus + My Revolution headers ----
HEADS = """<div class="rf-screen" id="rf-focus-head"><button type="button" class="rf-back" data-rf-go="home">← Home</button><h2 class="rf-ttl">Today's Focus</h2><p class="rf-sub">Your newest Shift, ready when you are.</p></div>
<div class="rf-screen" id="rf-rev-head"><button type="button" class="rf-back" data-rf-go="home">← Home</button><h2 class="rf-ttl">My Revolution</h2><p class="rf-sub">Every Gap seen. Every Shift made.</p></div>
"""
once('<section class="block" id="my-revolution">', HEADS + '<section class="block" id="my-revolution">', 'heads')

# ---- Profile (same IDs + onclicks), Account, Support ----
a = s.index('<section class="block page-view" id="profile-page"')
b = s.index('<section class="block page-view" id="membership-management-page"')
faq_html = ''.join('<div class="rf-faq"><button type="button" class="rf-fq" aria-expanded="false">%s<span aria-hidden="true">+</span></button><p class="rf-fa" hidden>%s</p></div>' % (html.escape(q), html.escape(a_)) for q, a_ in FAQS)
PROFILE = """<section class="block page-view" id="profile-page" style="border-bottom: none;">
  <div class="wrap">
    <a class="page-back" onclick="showMain(); return false;">← Home</a>
    <div class="section-head"><div><h2 class="serif">My Profile</h2><p id="profile-welcome-line"></p></div></div>
    <div class="rf-avrow">
      <div class="avatar-circle" id="profile-avatar-circle">R</div>
      <div class="rf-avbtns">
        <input type="file" id="profile-photo-input" accept="image/*" style="display:none;">
        <button class="btn-secondary" onclick="document.getElementById('profile-photo-input').click()">Upload Photo</button>
        <button class="btn-secondary" onclick="handleRemovePhotoClick()">Remove Photo</button>
      </div>
    </div>
    <p id="profile-photo-status" class="rf-status"></p>
    <div class="rf-hidden-fields" aria-hidden="true"><input type="text" class="field-input" id="profile-name-input" value="" tabindex="-1"><input type="email" class="field-input" id="profile-email-input" value="" tabindex="-1"></div>
    <button type="button" class="rf-card" data-rf-go="account"><h2>Account</h2><p>Name, email and membership live here.</p><span class="parr" aria-hidden="true">→</span></button>
    <button type="button" class="rf-card" data-rf-go="support"><h2>Support</h2><p>Questions? Reach the team any time.</p><span class="parr" aria-hidden="true">→</span></button>
    <div class="rf-plist rf-psignout"><a href="#" class="rf-prow2" id="rf-signout-main" onclick="signOutMember(); return false;">Sign out<span aria-hidden="true">→</span></a></div>
  </div>
</section>

<section class="rf-screen" id="rf-account" aria-label="Account">
  <button type="button" class="rf-back" data-rf-go="profile">← Profile</button>
  <h2 class="rf-ttl">Account</h2><div class="rf-divider"></div>
  <div class="rf-pinfo">
    <div class="rf-pi" id="rf-ac-name-row" hidden><small>Name</small><b id="rf-ac-name"></b></div>
    <div class="rf-pi"><small>Email</small><b id="rf-ac-email"></b></div>
    <div class="rf-pi"><small>Membership</small><b>Revolutionary Healer</b></div>
    <div class="rf-pi" id="rf-ac-since-row" hidden><small>Member since</small><b id="member-since-value">&nbsp;</b></div>
  </div>
  <div class="rf-plist">
    <button type="button" class="rf-prow2" id="rf-manage" onclick="%(manage)s">Manage membership<span aria-hidden="true">↗</span></button>
  </div>
</section>

<section class="rf-screen" id="rf-support" aria-label="Support">
  <button type="button" class="rf-back" data-rf-go="profile">← Profile</button>
  <h2 class="rf-ttl">Support</h2><div class="rf-divider"></div>
  <p class="rf-sub" style="font-size:18px">Need help? If you have questions about your membership or need assistance with Revolutionary Healer, we're here to help.</p>
  <div class="rf-plist">
    <a class="rf-prow2" id="btn-contact-support" href="mailto:%(mail)s">Contact Support<span aria-hidden="true">✉</span></a>
    <p class="rf-csmail">%(mail)s</p>
    <button type="button" class="rf-prow2" id="rf-faqrow" aria-expanded="false" aria-controls="rf-faqs">Frequently Asked Questions<span class="rf-farr" aria-hidden="true">▾</span></button>
    <div class="rf-faqs" id="rf-faqs" hidden>%(faqs)s</div>
  </div>
</section>

""" % {'manage': MANAGE_ONCLICK, 'mail': SUPPORT, 'faqs': faq_html}
s = s[:a] + PROFILE + s[b:]

# ---- SpookBound: not part of the refresh (card removed from the library grid; banner hidden by CSS) ----
i = s.index('<div class="media-card spookbound-card"')
depth, j = 0, i
for m in re.finditer(r'<div\b|</div>', s[i:]):
    depth += 1 if m.group(0) == '<div' else -1
    if depth == 0: j = i + m.end(); break
s = s[:i] + s[j:].lstrip(' ').lstrip('\n')

# ---- Shift bubble: a visible Delete (exact-id flow from Step 1) ----
once('        <button class="btn-secondary" id="shift-modal-embodied-btn">Mark This Shift As Embodied →</button>\n      </div>\n    </div>\n',
     '        <button class="btn-secondary" id="shift-modal-embodied-btn">Mark This Shift As Embodied →</button>\n      </div>\n    </div>\n    <button type="button" class="rf-delete" id="rf-shift-delete">Delete this Shift</button>\n', 'delete')

# ---- Activations: the mock-up's four big sections (Rachael's own section covers) -> that section's activations ----
LSECS = """<div class="rf-lsecs" id="rf-lsecs">
""" + ''.join('  <button type="button" class="rf-lsec" data-rf-sec="%s"><span class="bgc" style="background-image:url(\'/images/sections/sec-%s.webp\');background-position:%s" aria-hidden="true"></span><span class="in"><b>%s</b><small><span data-rf-count></span> ACTIVATIONS</small></span><span class="arr" aria-hidden="true">→</span></button>\n' % x for x in [
    ('Gifts + Spirit', 'gifts', '24% 22%', 'Spiritual Gifts'), ('Money + Receiving', 'money', '82% 20%', 'Money &amp; Prosperity'),
    ('Energy + Frequency', 'energy', '72% 26%', 'Energy &amp; Frequency'), ('Business + Impact', 'vis', '62% 26%', 'Visibility &amp; Impact')]) + "</div>\n"
once('<div class="revolution-subsection" id="gap-method-activations-subsection">', LSECS + '<div class="revolution-subsection" id="gap-method-activations-subsection">', 'lsecs')
once('    <div class="revolution-subsection">\n      <div class="filter-chips category-chips">',
     '    <div class="revolution-subsection" id="rf-lib-sub">\n      <button type="button" class="rf-back rf-allsecs" data-rf-allsecs>← All sections</button><h3 class="rf-sec-ttl" id="rf-sec-ttl"></h3>\n      <div class="filter-chips category-chips">', 'libsub')

# ---- back-link labels (text only; onclicks unchanged) ----
s = s.replace('>← Back to My Revolution</a>', '>← My Revolution</a>').replace('>← Back to Activations</a>', '>← Activations</a>').replace('>← Back to Home</a>', '>← Home</a>')

# ---- end of body: GAP look, nav, refresh script ----
NAV = """<nav id="rf-nav" aria-label="Main">
 <div class="rf-nav-title" aria-hidden="true">Revolutionary Healer</div><div class="rf-nav-div" aria-hidden="true"></div>
 <button type="button" data-rf-nav="home"><span aria-hidden="true">⌂</span>Home</button>
 <button type="button" data-rf-nav="focus"><span aria-hidden="true">✧</span>Today's Focus</button>
 <button type="button" data-rf-nav="chat"><span aria-hidden="true">❋</span>Chat</button>
 <button type="button" data-rf-nav="lib"><span aria-hidden="true">♫</span>Activations</button>
 <button type="button" data-rf-nav="rev"><span aria-hidden="true">❖</span><b class="rf-my">My </b>Revolution</button>
 <button type="button" class="rf-nav-foot" data-rf-go="chat"><span aria-hidden="true">❋</span>Ask Rachael anything</button>
</nav>
"""
# live app.html calls showLockedActivationPrompt() for locked cards but has no #locked-activation-toast
# element (dormant while DEMO_ENTITLEMENT_MODE is 'full'); the refresh supplies it so a locked tap is never dead.
TOAST = '<div class="locked-activation-toast" id="locked-activation-toast" role="status"><span>This Activation opens with full membership.</span><a onclick="showPage(\'upgrade-page\'); return false;" href="#">Upgrade &rarr;</a></div>\n'
k = s.rindex('</body>')
s = s[:k] + TOAST + '<style id="rf-gap-css">\n' + rd('gap.css') + '\n</style>\n' + NAV + '<script id="rf-js">\n' + rd('refresh.js') + '\n</script>\n' + s[k:]

out = os.path.join(PUB, 'app-refresh.html')
open(out, 'w', encoding='utf-8').write(s)

# ---- carry-over check: everything app.html relies on is still here ----
def grab(pat, t): return set(re.findall(pat, t))
checks = {
  'id': r'\bid="([^"]+)"', 'data-role': r'data-role="([^"]+)"', 'onclick': r'onclick="([^"]*)"',
  'script src': r'<script[^>]*src="([^"]+)"', 'api': r"(/api/[A-Za-z0-9_\-/]+)", 'localStorage': r"localStorage\.(?:get|set|remove)Item\('([^']+)'",
  'sessionStorage': r"sessionStorage\.(?:get|set|remove)Item\('([^']+)'", 'function': r'\bfunction ([A-Za-z_$][\w$]*)\s*\(',
}
EXPECTED_MISSING = {'onclick': {"handleActivationCardClick('spookbound-2026')", "event.stopPropagation(); toggleHeart(this)",
                                "handleResetPasswordClick()"},   # Reset password removed from the refresh (Rachael, Oct 15)
                    'id': {'reset-password-status'}}
bad = 0
for k_, pat in checks.items():
    miss = grab(pat, src) - grab(pat, s)
    miss.discard('rf-switch')
    allowed = EXPECTED_MISSING.get(k_, set())
    if k_ in ('onclick', 'id'):
        # toggleHeart(this) still exists on every other card; only the SpookBound card's copy went away
        miss = {m for m in miss if m not in allowed}
    if miss: bad += 1; print('MISSING', k_, sorted(miss)[:20])
print('wrote', out, len(s), 'bytes;', 'carry-over OK' if not bad else 'carry-over FAILED')
sys.exit(1 if bad else 0)
