  /* ---------- Chat history speed (Oct 15 2026) ----------
     Rachael: "load time on the chat history is really slow". Every drawer open
     and every conversation tap used to wait on a fresh server + Airtable round
     trip (often a cold start) before anything showed. Now:
       - the conversation list and the last few opened conversations are kept
         on this device (localStorage, per member, size-capped) and shown
         instantly, then refreshed quietly in the background;
       - the list is warmed once after the page loads, and a conversation's
         messages start loading the moment a finger touches its row;
       - the server reads only the columns it needs and only the newest
         messages first (?limit), in parallel.
     History is drawn in one go with no typewriter; new replies still type. */
  // Set the thread's scroll position without the smooth glide (the thread has
  // scroll-behavior:smooth, so opening a long conversation used to visibly
  // scroll through the whole history for about a second before settling).
  function rhJumpThread(t, top) {
    if (!t) return;
    var prev = t.style.scrollBehavior;
    t.style.scrollBehavior = 'auto';
    t.scrollTop = top;
    requestAnimationFrame(function () { t.style.scrollBehavior = prev; });
  }
  // Never wait forever (Oct 15, Ray: drawer stuck on "Loading conversations…"):
  // a request that never settles (phone app resumed from background, network
  // switch, stalled connection) used to leave the drawer loading for good. Every
  // chat-history request now gives up after `ms` and the drawer shows a retry.
  function rhFetchTimeout(url, ms) {
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer;
    var timeout = new Promise(function (_, reject) {
      timer = setTimeout(function () { try { if (ctrl) ctrl.abort(); } catch (e) {} reject(new Error('timeout')); }, ms);
    });
    var req = fetch(url, ctrl ? { signal: ctrl.signal } : undefined);
    return Promise.race([req, timeout]).then(function (res) { clearTimeout(timer); return res; }, function (err) { clearTimeout(timer); throw err; });
  }
  function rhJsonTimeout(res, ms) {
    return Promise.race([res.json(), new Promise(function (_, reject) { setTimeout(function () { reject(new Error('timeout')); }, ms); })]);
  }
  var RH_HIST_TIMEOUT_MS = 12000;
  var RH_HIST_LIST_LIMIT = 40;
  var RH_HIST_MSG_LIMIT = 60;
  var RH_HIST_MAX_CHATS = 8;
  var RH_HIST_MAX_CHARS = 250000;
  function rhHistKey(kind) { return 'rh_hist_' + kind + '_' + (RH_EMAIL || ''); }
  function rhHistRead(kind) {
    try { var v = localStorage.getItem(rhHistKey(kind)); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  }
  function rhHistWrite(kind, val) {
    try { localStorage.setItem(rhHistKey(kind), JSON.stringify(val)); } catch (e) {
      try { localStorage.removeItem(rhHistKey('msgs')); } catch (e2) {}
    }
  }
  function rhHistGetMsgs(chatId) {
    var all = rhHistRead('msgs') || {};
    return all[chatId] || null;
  }
  function rhHistPutMsgs(chatId, data) {
    if (!chatId || !data) return;
    var all = rhHistRead('msgs') || {};
    all[chatId] = { at: Date.now(), messages: data.messages || [], hasMore: !!data.hasMore };
    var ids = Object.keys(all).sort(function (a, b) { return (all[b].at || 0) - (all[a].at || 0); });
    var keep = {}, chars = 0;
    for (var i = 0; i < ids.length && i < RH_HIST_MAX_CHATS; i++) {
      var size = JSON.stringify(all[ids[i]]).length;
      if (i > 0 && chars + size > RH_HIST_MAX_CHARS) break;
      chars += size; keep[ids[i]] = all[ids[i]];
    }
    rhHistWrite('msgs', keep);
  }
  function rhHistDropChat(chatId) {
    var all = rhHistRead('msgs') || {};
    if (all[chatId]) { delete all[chatId]; rhHistWrite('msgs', all); }
    var l = rhHistRead('list');
    if (l && l.chats) { l.chats = l.chats.filter(function (c) { return c.id !== chatId; }); rhHistWrite('list', l); }
  }
  // One in-flight request per chat, shared by the touch prefetch and the tap.
  var rhMsgInflight = {};
  function rhFetchChatMessages(chatId) {
    // Reuse a request still in flight, or one that finished in the last 3s
    // (finger-down prefetch followed by the tap).
    var hit = rhMsgInflight[chatId];
    if (hit && (!hit.done || Date.now() - hit.done < 3000)) return hit.p;
    var p = rhFetchTimeout('/api/chats/' + encodeURIComponent(chatId) + '?limit=' + RH_HIST_MSG_LIMIT, RH_HIST_TIMEOUT_MS).then(function (res) {
      if (res.status === 404) { var e = new Error('not found'); throw e; }
      if (!res.ok) throw new Error('load failed');
      return rhJsonTimeout(res, RH_HIST_TIMEOUT_MS);
    }).then(function (data) {
      if (!data || !Array.isArray(data.messages)) throw new Error('bad response');
      rhHistPutMsgs(chatId, data); return data;
    });
    p.catch(function () { if (rhMsgInflight[chatId] && rhMsgInflight[chatId].p === p) delete rhMsgInflight[chatId]; });
    var entry = rhMsgInflight[chatId] = { p: p, done: 0 };
    p.then(function () { entry.done = Date.now(); }, function () {});
    return p;
  }
  function rhPrefetchChat(chatId) {
    if (!chatId) return;
    rhFetchChatMessages(chatId).catch(function () {});
  }
  // While the drawer is open, quietly load the 3 most recent conversations
  // this device doesn't have yet (once per visit), so the likely tap is instant.
  var rhPrefetchedOnce = {};
  function rhPrefetchTopChats() {
    var chats = (window.__rhChatList || []).filter(function (c) { return !c.archived; }).slice(0, 3);
    chats.forEach(function (c, i) {
      if (rhPrefetchedOnce[c.id] || rhHistGetMsgs(c.id)) return;
      rhPrefetchedOnce[c.id] = 1;
      setTimeout(function () { rhPrefetchChat(c.id); }, 150 * i);
    });
  }
  var rhListInflight = null;
  function rhFetchChatList() {
    if (rhListInflight) return rhListInflight;
    rhListInflight = rhFetchTimeout('/api/chats?email=' + encodeURIComponent(RH_EMAIL) + '&limit=' + RH_HIST_LIST_LIMIT, RH_HIST_TIMEOUT_MS)
      .then(function (res) { if (!res.ok) throw new Error('list failed'); return rhJsonTimeout(res, RH_HIST_TIMEOUT_MS); })
      .then(function (data) {
        if (!data || !Array.isArray(data.chats)) throw new Error('bad response');
        if (data.hasMore) {
          // More than fit in the first page: show the newest now, then add the
          // older ones underneath (rows already on screen don't move).
          var prev = window.__rhChatList;
          if (prev && prev.length > (data.chats || []).length) {
            var seen = {}; (data.chats || []).forEach(function (c) { seen[c.id] = 1; });
            var oldest = (data.chats || []).slice(-1)[0];
            var cut = oldest ? (oldest.lastMessageAt || oldest.updatedAt || oldest.createdAt || '') : '';
            data = { chats: (data.chats || []).concat(prev.filter(function (c) { return !seen[c.id] && (c.lastMessageAt || c.updatedAt || c.createdAt || '') <= cut; })), hasMore: true };
          }
          rhFetchTimeout('/api/chats?email=' + encodeURIComponent(RH_EMAIL), 20000).then(function (r) { return r.ok ? rhJsonTimeout(r, 20000) : null; }).then(function (full) {
            if (!full || !Array.isArray(full.chats)) return;
            window.__rhChatList = full.chats;
            rhHistWrite('list', { at: Date.now(), chats: full.chats });
            var d = document.getElementById('rh-drawer');
            if (d && d.classList.contains('rh-open')) rhRenderDrawerList();
          }).catch(function () {});
        }
        rhHistWrite('list', { at: Date.now(), chats: data.chats || [] });
        return data;
      });
    var p = rhListInflight;
    p.then(function () { rhListInflight = null; }, function () { rhListInflight = null; });
    return p;
  }

  // The drawer always leaves "Loading conversations…": it shows the list, the
  // empty state, or a message with Try again.
  function rhDrawerMessage(list, text, withRetry) {
    list.__rhHtml = null; // a later list render must not be skipped as "unchanged"
    list.innerHTML = '<div class="rh-drawer-empty">' + rhEscapeHtml(text) + '</div>';
    if (withRetry) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = 'Try again'; b.className = 'rh-drawer-retry';
      b.style.cssText = 'display:block;margin:10px auto 0;background:none;border:none;color:var(--gold);text-decoration:underline;cursor:pointer;padding:6px;font:inherit;';
      b.addEventListener('click', function () {
        list.__rhHtml = null;
        list.innerHTML = '<div class="rh-drawer-empty">Loading conversations&hellip;</div>';
        rhLoadDrawerList();
      });
      list.firstChild.appendChild(b);
    }
  }
  function rhDrawerShowsList(list) { return !!(list && list.querySelector('.rh-drawer-item')); }
  async function rhLoadDrawerList() {
    var list = document.getElementById('rh-drawer-list');
    if (!list) return;
    if (!RH_EMAIL) { rhDrawerMessage(list, 'Please sign in again to see your conversations.', false); return; }
    list.__rhPointerDown = false; // a touch that never got its pointerup can't hold the list back
    // Instant paint from this device's copy, then refresh.
    if (!window.__rhChatList) {
      var cached = rhHistRead('list');
      if (cached && Array.isArray(cached.chats)) window.__rhChatList = cached.chats;
    }
    if (window.__rhChatList) { try { rhRenderDrawerList(); } catch (e) {} }
    try {
      var data = await rhFetchChatList();
      window.__rhChatList = data.chats || [];
      rhRenderDrawerList();
      rhPrefetchTopChats();
    } catch (e) {
      // Keep a list that's already showing (saved copy); otherwise say so and offer a retry.
      if (!rhDrawerShowsList(list)) {
        rhDrawerMessage(list, e && e.message === 'timeout' ? 'Your conversations are taking too long to load.' : "Couldn't load your conversations.", true);
      }
    }
  }

  function rhMaybeRefreshDrawerAfterSend() {
    var d = document.getElementById('rh-drawer');
    if (d && d.classList.contains('rh-open')) rhLoadDrawerList();
  }

  function rhRenderDrawerList() {
    var list = document.getElementById('rh-drawer-list');
    if (!list) return;
    var chats = (Array.isArray(window.__rhChatList) ? window.__rhChatList : []).filter(function (c) { return c && c.id && !c.archived; });
    if (!chats.length) {
      rhDrawerMessage(list, 'No conversations yet.', false);
      return;
    }
    chats.sort(function (a, b) {
      var av = String(a.lastMessageAt || a.updatedAt || a.createdAt || '');
      var bv = String(b.lastMessageAt || b.updatedAt || b.createdAt || '');
      return bv.localeCompare(av);
    });
    var html = '';
    var lastGroup = null;
    chats.forEach(function (c) {
      var g = rhGroupLabel(c.lastMessageAt || c.updatedAt || c.createdAt);
      if (g !== lastGroup) {
        html += '<div class="rh-drawer-group-label">' + rhEscapeHtml(g) + '</div>';
        lastGroup = g;
      }
      var active = c.id === window.__rhActiveChatId ? ' rh-active' : '';
      html += '<div class="rh-drawer-item' + active + '" data-chat-id="' + c.id + '">' +
        '<span class="rh-drawer-item-title" data-open="' + c.id + '">' + rhEscapeHtml(c.title || rhPlaceholderChatTitle(c.createdAt)) + '</span>' +
        '<button type="button" class="rh-drawer-item-menu" data-menu="' + c.id + '">⋯</button>' +
        '</div>';
    });
    // QA Oct 14 (flickering / un-openable entry): a refresh used to rebuild the
    // list even when nothing changed, and could do it between a tap's touchstart
    // and click, so the tapped row was replaced and the tap was lost. Skip
    // identical rebuilds, and defer a rebuild while a finger/mouse is down.
    if (list.__rhHtml === html) return;
    if (list.__rhPointerDown) { list.__rhPendingRender = true; return; }
    list.__rhHtml = html;
    if (!list.__rhPointerWired) {
      list.__rhPointerWired = true;
      list.addEventListener('pointerdown', function () { list.__rhPointerDown = true; });
      var up = function () { if (!list.__rhPointerDown) return; list.__rhPointerDown = false; if (list.__rhPendingRender) { list.__rhPendingRender = false; setTimeout(rhRenderDrawerList, 350); } };
      list.addEventListener('pointerup', up); list.addEventListener('pointercancel', up); list.addEventListener('pointerleave', up);
    }
    list.innerHTML = html;
    list.querySelectorAll('[data-open]').forEach(function (elx) {
      elx.addEventListener('pointerdown', function () { rhPrefetchChat(elx.getAttribute('data-open')); }, { passive: true });
      elx.addEventListener('click', function () { rhSelectChat(elx.getAttribute('data-open')); });
    });
    list.querySelectorAll('[data-menu]').forEach(function (elx) {
      elx.addEventListener('click', function (ev) {
        ev.stopPropagation();
        rhToggleItemMenu(elx.getAttribute('data-menu'), elx);
      });
    });
  }

  function rhToggleItemMenu(chatId, anchorEl) {
    var existing = document.querySelector('.rh-drawer-popover');
    if (existing) existing.remove();
    if (existing && existing.getAttribute('data-for') === chatId) return;
    var pop = document.createElement('div');
    pop.className = 'rh-drawer-popover';
    pop.setAttribute('data-for', chatId);
    pop.innerHTML = '<button type="button" data-act="rename">Rename</button>' +
      '<button type="button" data-act="archive">Archive</button>' +
      '<button type="button" data-act="delete" class="rh-danger">Delete</button>';
    anchorEl.closest('.rh-drawer-item').appendChild(pop);
    pop.querySelector('[data-act="rename"]').addEventListener('click', function (ev) { ev.stopPropagation(); pop.remove(); rhRenameChat(chatId); });
    pop.querySelector('[data-act="archive"]').addEventListener('click', function (ev) { ev.stopPropagation(); pop.remove(); rhArchiveChat(chatId); });
    pop.querySelector('[data-act="delete"]').addEventListener('click', function (ev) { ev.stopPropagation(); pop.remove(); rhDeleteChat(chatId); });
  }

  async function rhRenameChat(chatId) {
    var current = (window.__rhChatList || []).find(function (c) { return c.id === chatId; });
    var next = await rhSheet({ input: true, message: 'Rename this chat', value: current ? current.title : '', okLabel: 'Save', cancelLabel: 'Cancel' });
    if (next === null) return;
    next = next.trim();
    if (!next) return;
    try {
      await fetch('/api/chats/' + encodeURIComponent(chatId), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: next })
      });
      rhLoadDrawerList();
    } catch (e) {}
  }

  async function rhArchiveChat(chatId) {
    if (!(await rhSheet({ message: 'Archive this chat? You can find it again later if needed.', okLabel: 'Archive', cancelLabel: 'Cancel' }))) return;
    try {
      await fetch('/api/chats/' + encodeURIComponent(chatId), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived: true })
      });
      rhHistDropChat(chatId);
      if (window.__rhActiveChatId === chatId) rhStartNewChat();
      rhLoadDrawerList();
    } catch (e) {}
  }

  async function rhDeleteChat(chatId) {
    if (!(await rhSheet({ message: 'Delete this chat? This cannot be undone.', okLabel: 'Delete', cancelLabel: 'Cancel', danger: true }))) return;
    try {
      await fetch('/api/chats/' + encodeURIComponent(chatId), { method: 'DELETE' });
      rhHistDropChat(chatId);
      if (window.__rhActiveChatId === chatId) rhStartNewChat();
      rhLoadDrawerList();
    } catch (e) {}
  }

  function rhStartNewChat() {
    window.__rhActiveChatId = null;
    if (RH_EMAIL) { try { localStorage.removeItem('rh_active_chat_' + RH_EMAIL); } catch (e) {} }
    var t = rhThread();
    if (t) {
      t.querySelectorAll('.rh-msg, .rh-thinking').forEach(function (n) { n.remove(); });
    }
    var w = document.getElementById('rh-chat-welcome');
    if (w) w.style.display = '';
    rhCloseDrawer();
    var input = document.getElementById('chat-input');
    if (input) input.focus();
  }

  async function rhSelectChat(chatId) {
    if (!chatId) return;
    rhCloseDrawer();
    var t = rhThread();
    if (!t) return;
    t.querySelectorAll('.rh-msg, .rh-thinking').forEach(function (n) { n.remove(); });
    var w = document.getElementById('rh-chat-welcome');
    if (w) w.style.display = 'none';
    var rhSelectToken = (window.__rhSelectToken = (window.__rhSelectToken || 0) + 1);
    // Draw a saved conversation in one go (no typewriter: history is not a
    // new reply). Returns the nodes drawn so a fresher copy can replace them.
    function drawHistory(data, sig) {
      var msgs = data.messages || [];
      var frag = document.createDocumentFragment(), nodes = [];
      if (data.hasMore) {
        var more = document.createElement('div');
        more.className = 'rh-msg rh-hist-more';
        more.style.cssText = 'background:none;border:none;box-shadow:none;text-align:center;align-self:center;padding:4px 0;';
        var mb = document.createElement('button'); mb.type = 'button'; mb.textContent = 'Show earlier messages';
        mb.style.cssText = 'background:none;border:none;color:var(--gold);text-decoration:underline;cursor:pointer;padding:0;font:inherit;';
        mb.addEventListener('click', function () { rhLoadEarlierMessages(chatId, more); });
        more.appendChild(mb); frag.appendChild(more); nodes.push(more);
      }
      msgs.forEach(function (m) {
        var el = document.createElement('div');
        el.className = 'rh-msg ' + (m.role === 'assistant' ? 'rh-msg-assistant' : 'rh-msg-user');
        if (m.role === 'assistant') rhSetTextWithLinks(el, m.text); else el.textContent = m.text;
        frag.appendChild(el); nodes.push(el);
      });
      t.appendChild(frag);
      if (w) w.style.display = msgs.length ? 'none' : '';
      t.__rhHistNodes = nodes; t.__rhHistSig = sig;
      return nodes;
    }
    function sigOf(data) {
      var m = (data && data.messages) || [];
      var last = m[m.length - 1];
      return m.length + '|' + (last ? (last.id + ':' + (last.text || '').length) : '') + '|' + (data && data.hasMore ? 1 : 0);
    }
    function markActive() {
      window.__rhActiveChatId = chatId;
      if (RH_EMAIL) { try { localStorage.setItem('rh_active_chat_' + RH_EMAIL, chatId); localStorage.setItem('rh_active_chat_at_' + RH_EMAIL, String(Date.now())); } catch (e) {} }
    }
    var cached = rhHistGetMsgs(chatId);
    var shownFromCache = false;
    if (cached && cached.messages && cached.messages.length) {
      markActive();
      drawHistory(cached, sigOf(cached));
      rhJumpThread(t, t.scrollHeight);
      shownFromCache = true;
    }
    try {
      var data = await rhFetchChatMessages(chatId);
      if (rhSelectToken !== window.__rhSelectToken) return; // a newer tap won
      markActive();
      var sig = sigOf(data);
      if (shownFromCache) {
        if (sig === t.__rhHistSig) return; // the saved copy was already current
        // Only swap in the fresher copy if nothing new happened in the thread
        // since (no send in progress, no new bubbles), and keep the member's
        // place: follow to the bottom only if they were already there.
        var nodes = t.__rhHistNodes || [];
        var lastNode = nodes[nodes.length - 1];
        var untouched = !window.__rhSending && (!lastNode || (lastNode.parentNode === t && !lastNode.nextElementSibling));
        if (!untouched) return;
        var atBottom = (t.scrollHeight - t.scrollTop - t.clientHeight) < 80;
        nodes.forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
        drawHistory(data, sig);
        if (atBottom) rhJumpThread(t, t.scrollHeight);
        return;
      }
      drawHistory(data, sig);
      rhJumpThread(t, t.scrollHeight);
    } catch (e) {
      if (rhSelectToken !== window.__rhSelectToken) return;
      if (shownFromCache && !(e && e.message === 'not found')) return; // keep showing the saved copy
      if (shownFromCache) { rhHistDropChat(chatId); }
      // QA Oct 14: used to silently start a new chat on ANY error, so a slow
      // or failed load looked like "the conversation can't be opened".
      if (e && e.message === 'not found') { rhStartNewChat(); rhLoadDrawerList(); return; }
      var errEl = document.createElement('div');
      errEl.className = 'rh-msg rh-msg-assistant';
      errEl.textContent = "I couldn't open that conversation just now. ";
      var retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Try again';
      retry.style.cssText = 'background:none;border:none;color:var(--gold);text-decoration:underline;cursor:pointer;padding:0;font:inherit;';
      retry.addEventListener('click', function () { rhSelectChat(chatId); });
      errEl.appendChild(retry); t.appendChild(errEl);
    }
  }

  // "Show earlier messages": read the whole conversation (older ones too)
  // and put the older bubbles above, keeping the member's scroll position.
  async function rhLoadEarlierMessages(chatId, moreEl) {
    var t = rhThread();
    if (!t || !moreEl) return;
    var btn = moreEl.querySelector('button'); if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }
    try {
      var res = await fetch('/api/chats/' + encodeURIComponent(chatId));
      if (!res.ok) throw new Error('load failed');
      var data = await res.json();
      if (window.__rhActiveChatId !== chatId || !moreEl.parentNode) return;
      var shown = (t.__rhHistNodes || []).filter(function (n) { return n !== moreEl; }).length;
      var all = data.messages || [];
      var older = all.slice(0, Math.max(0, all.length - shown));
      var frag = document.createDocumentFragment();
      older.forEach(function (m) {
        var el = document.createElement('div');
        el.className = 'rh-msg ' + (m.role === 'assistant' ? 'rh-msg-assistant' : 'rh-msg-user');
        if (m.role === 'assistant') rhSetTextWithLinks(el, m.text); else el.textContent = m.text;
        frag.appendChild(el);
      });
      var before = t.scrollHeight;
      moreEl.parentNode.insertBefore(frag, moreEl);
      moreEl.remove();
      t.__rhHistNodes = null; t.__rhHistSig = null;
      rhJumpThread(t, t.scrollTop + (t.scrollHeight - before));
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = 'Show earlier messages'; }
    }
  }

  // Warm the conversation list (and the server function) shortly after the
  // page settles, so the first drawer open is instant.
  function rhWarmChatHistory() {
    if (!RH_EMAIL) return;
    var go = function () {
      rhFetchChatList().then(function (data) {
        if (!window.__rhChatList) window.__rhChatList = data.chats || [];
        var d = document.getElementById('rh-drawer');
        if (d && d.classList.contains('rh-open')) { window.__rhChatList = data.chats || []; rhRenderDrawerList(); }
      }).catch(function () {});
    };
    if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 4000 }); else setTimeout(go, 2500);
  }

  var RH_RESUME_CHAT_MS = 30 * 60 * 1000;
  function rhInitChatUI() {
    var input = document.getElementById('chat-input');
    if (input) {
      input.addEventListener('input', autoGrowChatInput);
      autoGrowChatInput();
    }
    var toggle = document.getElementById('rh-drawer-toggle');
    if (toggle) toggle.addEventListener('click', rhOpenDrawer);
    var closeBtn = document.getElementById('rh-drawer-close');
    if (closeBtn) closeBtn.addEventListener('click', rhCloseDrawer);
    var overlay = document.getElementById('rh-drawer-overlay');
    if (overlay) overlay.addEventListener('click', rhCloseDrawer);
    var newChatBtn = document.getElementById('rh-new-chat-btn');
    if (newChatBtn) newChatBtn.addEventListener('click', rhStartNewChat);
    var newChatTop = document.getElementById('rh-new-chat-top-btn');
    if (newChatTop) newChatTop.addEventListener('click', rhStartNewChat);
    document.addEventListener('click', function (ev) {
      if (ev.target.closest('#shift-modal-menu-btn')) {
        ev.stopPropagation();
        toggleShiftModalMenu();
        return;
      }
      if (!ev.target.closest('.rh-drawer-item-menu') && !ev.target.closest('.rh-drawer-popover')) {
        var p = document.querySelector('.rh-drawer-popover');
        if (p) p.remove();
      }
    });

    // QA Oct 14 (calmer home): only reopen the last conversation if it was
    // active in the last 30 minutes (e.g. a refresh mid-chat). Otherwise the
    // home chat starts fresh and older chats stay one tap away in the drawer.
    if (RH_EMAIL) {
      var saved = null, savedAt = 0;
      try { saved = localStorage.getItem('rh_active_chat_' + RH_EMAIL); savedAt = Number(localStorage.getItem('rh_active_chat_at_' + RH_EMAIL) || 0); } catch (e) {}
      if (saved && savedAt && (Date.now() - savedAt) < RH_RESUME_CHAT_MS) rhSelectChat(saved);
      else if (saved) { window.__rhActiveChatId = null; }
    }
  }

window.addEventListener('message', function(evt) {
    if (!evt.data || evt.data.type !== 'gapMethodComplete') return;
    var heroEmbed = document.getElementById('hero-gap-embed');
    if (heroEmbed) heroEmbed.style.display = 'none';
    loadMemberRevolutionData();
  });

  if (RH_EMAIL) {
    document.getElementById('gap-method-starter-btn').addEventListener('click', startGapMethodInChat);
    document.getElementById('hero-speak-btn').addEventListener('click', sendHeroChat);
    document.getElementById('chat-input').addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendHeroChat(); }
    });
    rhInitChatUI();
    rhWarmChatHistory();
