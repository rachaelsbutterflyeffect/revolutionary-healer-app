// Future activity only. No email is sent. A random device id is not a member.
(function (root, factory) {
    var api = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    if (root && root.document) root.rhActivity = api.attach(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    function uuid() {
        if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
        var bytes = [];
        for (var i = 0; i < 16; i++) bytes.push(Math.floor(Math.random() * 256));
        bytes[6] = (bytes[6] & 15) | 64;
        bytes[8] = (bytes[8] & 63) | 128;
        var hex = bytes.map(function (b) { return (b < 16 ? "0" : "") + b.toString(16); }).join("");
        return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" + hex.slice(16, 20) + "-" + hex.slice(20);
    }
    function createClient(opts) {
        var now = opts.now, send = opts.send, queue = [], play = null, lastNav = "", foregroundSince = 0, backgroundSince = 0, hidden = false, audioOn = false, lastFlush = 0, retryTimer = 0;
        function deviceId() { return opts.deviceId; }
        function push(event) {
            event.eventId = uuid();
            event.deviceId = deviceId();
            queue.push(event);
            if (queue.length > 30) queue.splice(0, queue.length - 30);
            if (event.event === "activation_play" || event.event === "finder_complete" || event.event === "gap_complete" || event.event === "presence") return flush(true);
            return Promise.resolve();
        }
        function scheduleRetry() {
            if (retryTimer) return;
            var wait = Math.max(50, 15000 - (now() - lastFlush) + 50);
            var schedule = opts.schedule || function (fn, ms) { return setTimeout(fn, ms); };
            retryTimer = schedule(function () { retryTimer = 0; flush(true); }, wait) || 1;
        }
        function flush(force) {
            if (!queue.length) return Promise.resolve();
            if (!force && now() - lastFlush < 15000) return Promise.resolve();
            var batch = queue.splice(0, 8);
            lastFlush = now();
            return send(batch).catch(function () { queue = batch.concat(queue).slice(0, 30); scheduleRetry(); });
        }
        function credit(mediaTime, evenIfPaused) {
            if (!play) return;
            if (!play.playing && !evenIfPaused) return;
            var t = now();
            var wall = Math.max(0, (t - play.mark) / 1000);
            var position = typeof mediaTime === "number" ? mediaTime : play.media;
            var moved = position - play.media;
            if (moved > 0.05) play.listened += Math.min(moved, wall + 0.35);
            else if (moved < -0.35) play.listened += Math.min(wall, 120);
            play.mark = t;
            play.media = position;
        }
        function playPayload(state) {
            return { event: "activation_play", playId: play.playId, slug: play.slug, state: state, listenedSeconds: Math.round(play.listened * 10) / 10, durationSeconds: play.duration };
        }
        function checkpoint(mediaTime) {
            if (!play) return Promise.resolve();
            credit(typeof mediaTime === "number" ? mediaTime : play.media, true);
            return push(playPayload("pause"));
        }
        return {
            deviceId: deviceId,
            open: function (slug, entry) { return push({ event: "activation_open", slug: slug, entry: entry || "" }); },
            favorite: function (slug, on) { return push({ event: on ? "favorite_add" : "favorite_remove", slug: slug }); },
            nav: function (screen) {
                if (screen && screen !== lastNav) { lastNav = screen; push({ event: "nav", screen: screen }); }
                if (play) return checkpoint(play.media);
                return flush(true);
            },
            finder: function (result) { return push({ event: "finder_complete", slug: result.slug, scores: result.scores, bodyOrMind: result.bm, pace: result.sm }); },
            resetDay: function (dayId) { return push({ event: "reset_day", dayId: dayId }); },
            gap: function (kind, extra) { extra = extra || {}; extra.event = kind; return push(extra); },
            startPlay: function (slug, playId, mediaTime, duration) {
                play = { slug: slug, playId: playId, listened: 0, media: mediaTime || 0, mark: now(), playing: true, duration: duration || null };
                audioOn = true;
                return push({ event: "activation_play", playId: playId, slug: slug, state: "start", listenedSeconds: 0, durationSeconds: play.duration });
            },
            sample: function (mediaTime, duration) {
                if (!play) return;
                credit(mediaTime);
                if (duration) play.duration = duration;
            },
            stopPlay: function (state, mediaTime) {
                if (!play) return Promise.resolve();
                credit(typeof mediaTime === "number" ? mediaTime : play.media, true);
                play.playing = false;
                audioOn = state !== "ended" && state !== "pause" ? audioOn : false;
                var payload = playPayload(state);
                if (state === "ended") play = null;
                return push(payload);
            },
            checkpoint: checkpoint,
            presence: function () {
                var t = now();
                var chunk = 0;
                if (!hidden && foregroundSince) chunk = Math.max(0, Math.min(6 * 3600, (t - foregroundSince) / 1000));
                var back = 0;
                if (hidden && audioOn && backgroundSince) back = Math.max(0, Math.min(6 * 3600, (t - backgroundSince) / 1000));
                foregroundSince = hidden ? 0 : t;
                backgroundSince = hidden && audioOn ? t : 0;
                if (chunk < 1 && back < 1) return Promise.resolve();
                return push({ event: "presence", foregroundSeconds: Math.round(chunk), backgroundAudioSeconds: Math.round(back) });
            },
            setHidden: function (value) { hidden = !!value; if (hidden) backgroundSince = audioOn ? now() : 0; else foregroundSince = now(); },
            flush: flush,
            playId: function () { return play ? play.playId : null; },
            playing: function () { return !!(play && play.playing); },
            listened: function () { return play ? play.listened : 0; },
            resume: function (mediaTime) {
                if (!play || play.playing) return;
                var position = typeof mediaTime === "number" ? mediaTime : play.media;
                var moved = position - play.media;
                var wall = Math.max(0, (now() - play.mark) / 1000);
                play.playing = true;
                audioOn = true;
                if (moved > 0.05 && moved <= wall + 0.35) {
                    play.listened += moved;
                    play.media = position;
                } else if (typeof mediaTime === "number") play.media = position;
                play.mark = now();
            },
        };
    }
    function attach(win) {
        var key = "rh_device_id";
        var id = "";
        try { id = win.localStorage.getItem(key) || ""; } catch (e) {}
        if (!UUID.test(id)) { id = uuid(); try { win.localStorage.setItem(key, id); } catch (e) {} }
        win.rhDeviceId = id;
        var client = createClient({
            deviceId: id,
            now: function () { return Date.now(); },
            send: function (events) {
                return win.fetch("/api/activity", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ events: events }), keepalive: true })
                    .then(function (res) { if (res.status === 429 || res.status >= 500) throw new Error("retry"); return res; });
            },
        });
        client.setHidden(win.document.visibilityState === "hidden");
        win.document.addEventListener("visibilitychange", function () {
            var hiddenNow = win.document.visibilityState === "hidden";
            client.presence();
            client.setHidden(hiddenNow);
            client.flush(true);
        });
        win.setInterval(function () {
            if (win.document.visibilityState !== "hidden" || client.playId()) client.presence();
        }, 60000);
        win.addEventListener("pagehide", function () { client.checkpoint(); client.presence(); client.flush(true); });
        win.addEventListener("freeze", function () { client.checkpoint(); client.presence(); client.flush(true); });
        client.watchAudio = function (audio, slug) {
            var playId = null;
            function begin() {
                var duration = audio.duration || null;
                if (!playId) { playId = uuid(); client.startPlay(slug, playId, audio.currentTime || 0, duration); }
                else client.resume(audio.currentTime || 0);
            }
            audio.addEventListener("play", begin);
            audio.addEventListener("playing", begin);
            audio.addEventListener("timeupdate", function () { client.sample(audio.currentTime || 0, audio.duration || null); });
            win.setInterval(function () {
                if (!playId || audio.paused) return;
                client.sample(audio.currentTime || 0, audio.duration || null);
            }, 15000);
            audio.addEventListener("pause", function () { client.stopPlay("pause", audio.currentTime || 0); });
            audio.addEventListener("ended", function () { client.stopPlay("ended", audio.currentTime || 0); playId = null; });
        };
        client.watchWistia = function (wistiaId, slug) {
            function bind() {
                win._wq = win._wq || [];
                win._wq.push({ id: wistiaId, onReady: function (video) {
                    var playId = null;
                    function durationOf(video) {
                    try {
                        var value = typeof video.duration === "function" ? video.duration() : video.duration;
                        return typeof value === "number" && isFinite(value) && value > 0 ? value : null;
                    } catch (e) { return null; }
                }
                video.bind("play", function () {
                    var duration = durationOf(video);
                    if (!playId) { playId = uuid(); client.startPlay(slug, playId, video.time() || 0, duration); }
                    else client.resume(video.time() || 0);
                });
                win.setInterval(function () {
                    if (!playId || (typeof video.state === "function" && video.state() === "paused")) return;
                    client.sample(video.time() || 0, durationOf(video));
                }, 15000);
                    video.bind("secondchange", function (second) { client.sample(second || 0, durationOf(video)); });
                    video.bind("pause", function () { client.stopPlay("pause", video.time() || 0); });
                    video.bind("end", function () { client.stopPlay("ended", video.time() || 0); playId = null; });
                } });
            }
            if (win.Wistia) { bind(); return; }
            var script = win.document.createElement("script");
            script.src = "https://fast.wistia.net/assets/external/E-v1.js";
            script.async = true;
            script.onload = bind;
            win.document.head.appendChild(script);
        };
        return client;
    }
    return { createClient: createClient, attach: attach, uuid: uuid };
});
