import { keepStoredSignIn } from "./migrationClient.js";

export function safeReturnPath(value) {
    return value === "/owner" ? "/owner" : "";
}

export function ownerSignInHref() {
    return "/?next=/owner";
}

// The sign-in page must not send a person who asked for /owner back to the
// app, and /owner must not immediately send them back here.
export function signInDestination({ sessionOk, stored, armed, loginAt, now, next }) {
    const safe = safeReturnPath(next);
    if (sessionOk === true && safe) return { kind: "return", path: safe };
    if (stored && keepStoredSignIn({ armed, loginAt, now }) && !safe) return { kind: "app", path: "" };
    return { kind: "form", path: "" };
}
