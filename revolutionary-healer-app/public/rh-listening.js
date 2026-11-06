// Activation listening client. Records actual playback only.
// A cover click, Mark as Listened, and a resume of the same session do not
// start a new play. Safe to load on both app.html and app-refresh.html.
(function (root, factory) {
    var api = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    if (root && root.document) root.rhListening = api.attach(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    var PLAYERS = ["native-audio", "wistia-video", "wistia-audio"];
    var HEARTBEAT_MS = 20000;

    function createListeningClient(options) {
        var now = options.now;
        var uuid = options.uuid;
        var send = options.send;
        var target = null;
        var session = null;

        function openSession() {
            session = {
                id: uuid(),
                seq: 0,
                phase: "open",
                playing: false,
                mediaTime: 0,
                unacked: null,
                queued: null,
                held: null,
                inFlight: false,
                attempts: 0,
                dead: false,
                lastSentAt: 0,
            };
        }

        function build(eventName, mediaTime) {
            session.mediaTime = mediaTime;
            return {
                sessionId: session.id,
                seq: session.seq + 1,
                activationSlug: target.slug,
                player: target.player,
                event: eventName,
                mediaTime: mediaTime,
                clientTs: now(),
            };
        }

        function pump() {
            if (!session || session.dead || session.inFlight || !session.queued) return Promise.resolve();
            var next = session.queued;
            session.queued = null;
            next.seq = session.seq + 1;
            return transmit(next, false);
        }

        function transmit(payload, beacon) {
            session.inFlight = true;
            session.unacked = payload;
            return Promise.resolve()
                .then(function () { return send(payload, { beacon: !!beacon }); })
                .then(function (res) {
                    session.inFlight = false;
                    var status = res && res.status;
                    var action = res && res.body && res.body.action;
                    if (status === 401) {
                        session.dead = true;
                        session.unacked = null;
                        session.queued = null;
                        session.held = null;
                        if (res.body && res.body.code === "no_server_session_to_migrate" && !session.coverageWarned) {
                            session.coverageWarned = true;
                            if (typeof console !== "undefined" && console.warn) {
                                console.warn("Activation listening was not recorded for this open login. No server session exists to migrate, and the email in this browser is not accepted as identity.");
                            }
                        }
                        return res;
                    }
                    if (status === 400) {
                        session.unacked = null;
                        return res;
                    }
                    if (status === 202 || action === "unconfirmed" || status === 429 || !res || typeof status !== "number" || status >= 500) {
                        session.attempts += 1;
                        session.unacked = payload;
                        session.nextRetryAt = now() + (session.attempts <= 1 ? 0 : Math.min(20000, 1000 * Math.pow(2, session.attempts - 1)));
                        return res;
                    }
                    if (action === "coalesce") {
                        session.unacked = null;
                        session.attempts = 0;
                        if (session.queued) {
                            session.held = null;
                            return pump();
                        }
                        session.held = payload;
                        return res;
                    }
                    session.seq = payload.seq;
                    session.unacked = null;
                    session.held = null;
                    session.attempts = 0;
                    session.lastSentAt = now();
                    return pump().then(function () { return res; });
                })
                .catch(function () {
                    session.inFlight = false;
                    session.attempts += 1;
                    session.unacked = payload;
                    session.nextRetryAt = now();
                });
        }

        function enqueue(eventName, mediaTime, opts) {
            opts = opts || {};
            if (!target || PLAYERS.indexOf(target.player) === -1 || !target.slug) return Promise.resolve();
            if (session && session.dead) return Promise.resolve();
            if (eventName === "playing") {
                if (!session || session.phase === "ended" || session.phase === "closed") openSession();
                session.playing = true;
                session.phase = "open";
            } else if (!session || session.phase === "closed" || session.phase === "ended") {
                return Promise.resolve();
            }
            if (eventName === "pause") session.playing = false;
            if (eventName === "ended") {
                session.playing = false;
                session.phase = "ended";
            }
            if (eventName === "hidden") {
                session.playing = false;
                if (!opts.retain) session.phase = "closed";
            }
            var payload = build(eventName, mediaTime);
            if ((eventName === "heartbeat" || eventName === "seeked") && !session.inFlight && !session.unacked) {
                if (now() - session.lastSentAt < HEARTBEAT_MS) {
                    session.held = payload;
                    return Promise.resolve();
                }
            }
            if (session.unacked && !session.inFlight) {
                if (eventName === "heartbeat" || eventName === "seeked") {
                    session.unacked.mediaTime = mediaTime;
                    session.unacked.clientTs = now();
                    if (eventName === "seeked") session.unacked.event = "seeked";
                    session.mediaTime = mediaTime;
                    return Promise.resolve();
                }
                payload.seq = session.unacked.seq;
                session.unacked = payload;
                return transmit(payload, opts.beacon);
            }
            if (session.inFlight) {
                if (opts.beacon && session.unacked && (eventName === "hidden" || eventName === "ended" || eventName === "pause")) {
                    payload.seq = session.unacked.seq + 1;
                    session.queued = payload;
                    send(payload, { beacon: true });
                    return Promise.resolve();
                }
                session.queued = payload;
                return Promise.resolve();
            }
            session.held = null;
            return transmit(payload, opts.beacon);
        }

        return {
            setTarget: function (next) {
                target = next ? { slug: next.slug, player: next.player } : null;
            },
            clearTarget: function () { target = null; },
            uiIntent: function () {},
            manualMark: function () {},
            onMedia: function (evt) {
                return enqueue(evt.type, evt.mediaTime, { retain: evt.retain, beacon: evt.beacon });
            },
            release: function () {
                if (!session || session.phase !== "open") return Promise.resolve();
                return enqueue("hidden", session.mediaTime || 0, { beacon: true, retain: false });
            },
            checkpoint: function () {
                if (!session || session.phase !== "open") return Promise.resolve();
                return enqueue("hidden", session.mediaTime || 0, { beacon: true, retain: true });
            },
            sessionId: function () {
                return session && session.phase !== "closed" ? session.id : null;
            },
            tick: function () {
                if (!session || session.dead || session.inFlight) return Promise.resolve();
                if (session.unacked && session.attempts > 0 && now() >= (session.nextRetryAt || 0)) {
                    return transmit(session.unacked, false);
                }
                if (session.held && !session.unacked && now() - session.lastSentAt >= HEARTBEAT_MS) {
                    var payload = session.held;
                    session.held = null;
                    payload.seq = session.seq + 1;
                    payload.clientTs = now();
                    return transmit(payload, false);
                }
                return Promise.resolve();
            },
        };
    }

    function handleHtmlMediaEvent(client, name, currentTime) {
        var map = { playing: "playing", pause: "pause", ended: "ended", seeked: "seeked" };
        if (!map[name]) return Promise.resolve();
        return client.onMedia({ type: map[name], mediaTime: currentTime || 0 });
    }

    function handleWistiaEvent(client, name, time) {
        var map = { play: "playing", pause: "pause", end: "ended", seek: "seeked", secondchange: "heartbeat" };
        if (!map[name]) return Promise.resolve();
        return client.onMedia({ type: map[name], mediaTime: typeof time === "number" ? time : 0 });
    }

    function attach(win) {
        var client = createListeningClient({
            now: function () { return Date.now(); },
            uuid: function () {
                if (win.crypto && win.crypto.randomUUID) return win.crypto.randomUUID();
                return "00000000-0000-4000-8000-" + Math.random().toString(16).slice(2, 14).padEnd(12, "0");
            },
            send: function (payload, opts) {
                var body = JSON.stringify(payload);
                if (opts && opts.beacon && win.navigator && win.navigator.sendBeacon) {
                    var blob = new Blob([body], { type: "application/json" });
                    if (win.navigator.sendBeacon("/api/activation-listens", blob)) {
                        // The beacon has no response. Keep the sample unacked so a
                        // restored page retries it; the server dedupes that retry.
                        return Promise.resolve({ status: 202, body: { action: "unconfirmed" } });
                    }
                }
                return win.fetch("/api/activation-listens", {
                    method: "POST",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: body,
                    keepalive: true,
                }).then(function (res) {
                    return res.json().catch(function () { return {}; }).then(function (parsed) {
                        return { status: res.status, body: parsed };
                    });
                });
            },
        });
        var generation = 0;
        var boundMedia = null;
        var boundVideo = null;
        var wistiaLoading = null;

        function liveTime() {
            if (boundMedia) return boundMedia.currentTime || 0;
            if (boundVideo && typeof boundVideo.time === "function") return Number(boundVideo.time()) || 0;
            return null;
        }

        function flush(retain) {
            var time = liveTime();
            if (typeof time === "number") {
                return client.onMedia({ type: "hidden", mediaTime: time, beacon: true, retain: !!retain });
            }
            return retain ? client.checkpoint() : client.release();
        }

        function loadWistia() {
            if (win.Wistia) return Promise.resolve();
            if (wistiaLoading) return wistiaLoading;
            wistiaLoading = new Promise(function (resolve) {
                var script = win.document.createElement("script");
                script.src = "https://fast.wistia.net/assets/external/E-v1.js";
                script.async = true;
                script.onload = function () { resolve(); };
                script.onerror = function () { resolve(); };
                win.document.head.appendChild(script);
            });
            return wistiaLoading;
        }

        function claim(opts) {
            release();
            if (!opts || !opts.slug || PLAYERS.indexOf(opts.player) === -1) return;
            var gen = generation;
            client.setTarget({ slug: opts.slug, player: opts.player });
            if (opts.media) {
                boundMedia = opts.media;
                ["playing", "pause", "ended", "seeked"].forEach(function (name) {
                    opts.media.addEventListener(name, function () {
                        if (gen !== generation) return;
                        handleHtmlMediaEvent(client, name, opts.media.currentTime);
                    });
                });
                opts.media.addEventListener("timeupdate", function () {
                    if (gen !== generation || opts.media.paused || opts.media.ended) return;
                    client.onMedia({ type: "heartbeat", mediaTime: opts.media.currentTime || 0 });
                });
                return;
            }
            if (!opts.wistiaId) return;
            loadWistia().then(function () {
                if (gen !== generation) return;
                win._wq = win._wq || [];
                win._wq.push({
                    id: opts.wistiaId,
                    onReady: function (video) {
                        if (gen !== generation || !video || !video.bind) return;
                        video.bind("play", function () { if (gen === generation) handleWistiaEvent(client, "play", video.time()); });
                        video.bind("pause", function () { if (gen === generation) handleWistiaEvent(client, "pause", video.time()); });
                        video.bind("end", function () { if (gen === generation) handleWistiaEvent(client, "end", video.time()); });
                        video.bind("seek", function (time) { if (gen === generation) handleWistiaEvent(client, "seek", time); });
                        video.bind("secondchange", function (second) { if (gen === generation) handleWistiaEvent(client, "secondchange", second); });
                        if (gen !== generation) return;
                        boundVideo = video;
                        if (typeof video.state === "function" && video.state() === "playing") {
                            handleWistiaEvent(client, "play", video.time());
                        }
                    },
                });
            });
        }

        function release() {
            var pending = flush(false);
            boundMedia = null;
            boundVideo = null;
            generation += 1;
            return pending;
        }

        win.addEventListener("pagehide", function () { flush(true); });
        win.addEventListener("freeze", function () { flush(true); });
        win.addEventListener("pageshow", function () {
            client.tick();
            if (boundMedia && !boundMedia.paused && !boundMedia.ended) {
                client.onMedia({ type: "playing", mediaTime: boundMedia.currentTime || 0 });
            }
        });
        win.document.addEventListener("visibilitychange", function () {
            if (win.document.visibilityState === "hidden") flush(true);
        });
        win.setInterval(function () { client.tick(); }, 5000);

        return { claim: claim, release: release };
    }

    return {
        PLAYERS: PLAYERS,
        createListeningClient: createListeningClient,
        handleHtmlMediaEvent: handleHtmlMediaEvent,
        handleWistiaEvent: handleWistiaEvent,
        attach: attach,
    };
});
