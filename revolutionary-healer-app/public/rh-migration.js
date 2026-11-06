(function (root, factory) {
    var api = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    if (root) root.rhMigration = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    var FRESH_LOGIN_MS = 2 * 60 * 1000;
    var FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;
    function keepStoredSignIn(input) {
        input = input || {};
        if (input.armed === true) return true;
        var five = input.fiveDaysMs || FIVE_DAYS_MS;
        return !!(input.loginAt && input.now - Number(input.loginAt) < five);
    }
    function decideMigrationPoll(input) {
        input = input || {};
        var response = input.response;
        var now = input.now || 0;
        var freshMs = input.freshMs || FRESH_LOGIN_MS;
        if (!response || response.migration !== true) {
            return { arm: false, clear: false, redirect: false, retry: false };
        }
        if (response.reauth !== true) {
            return { arm: true, clear: false, redirect: false, retry: false };
        }
        var issuedAt = Number(input.loginAt) || 0;
        if (issuedAt && now >= issuedAt && now - issuedAt < freshMs) {
            return { arm: true, clear: false, redirect: false, retry: true };
        }
        return { arm: true, clear: true, redirect: true, retry: false };
    }
    return { FRESH_LOGIN_MS: FRESH_LOGIN_MS, FIVE_DAYS_MS: FIVE_DAYS_MS, keepStoredSignIn: keepStoredSignIn, decideMigrationPoll: decideMigrationPoll };
});
