export const FRESH_LOGIN_MS = 2 * 60 * 1000;
export const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

export function keepStoredSignIn({ armed, loginAt, now, fiveDaysMs = FIVE_DAYS_MS }) {
    if (armed === true) return true;
    return !!(loginAt && now - Number(loginAt) < fiveDaysMs);
}

// A migration poll may ask for one password sign-in. It must not clear a
// session that was just issued, and a live session is left in place.
export function decideMigrationPoll({ response, now = 0, loginAt = 0, freshMs = FRESH_LOGIN_MS }) {
    if (!response || response.migration !== true) {
        return { arm: false, clear: false, redirect: false, retry: false };
    }
    if (response.reauth !== true) {
        return { arm: true, clear: false, redirect: false, retry: false };
    }
    const issuedAt = Number(loginAt) || 0;
    if (issuedAt && now >= issuedAt && now - issuedAt < freshMs) {
        return { arm: true, clear: false, redirect: false, retry: true };
    }
    return { arm: true, clear: true, redirect: true, retry: false };
}
