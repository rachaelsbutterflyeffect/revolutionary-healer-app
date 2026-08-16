"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const GOLD = "#CFA646";
const BG = "#121110";
const CARD = "#1B1815";
const BORDER = "#3A342B";
const TEXT = "#F6F2E9";
const MUTED = "#A9997F";
const TEAL = "#01676C";
const TEAL_SOFT = "#3FA8A3";

const MONTHLY_CHECKOUT = "https://www.rachaelsbutterflyeffect.com/offers/26bJnuRE/checkout";
const ANNUAL_CHECKOUT = "https://www.rachaelsbutterflyeffect.com/offers/3YC8s5FV/checkout";

function Mockup({ label, children }: { label: string; children: React.ReactNode }) {
return (
<div
style={{
background: CARD,
border: `1px solid ${BORDER}`,
borderRadius: 16,
padding: 18,
display: "flex",
flexDirection: "column",
gap: 10,
}}
>
<div style={{ fontSize: 11, letterSpacing: "0.08em", color: MUTED, textTransform: "uppercase" }}>{label}</div>
{children}
</div>
);
}

export default function Home() {
const router = useRouter();
const [checking, setChecking] = useState(true);

const [email, setEmail] = useState("");
const [password, setPassword] = useState("");
const [signInError, setSignInError] = useState("");
const [signingIn, setSigningIn] = useState(false);

const [showForgot, setShowForgot] = useState(false);
const [forgotEmail, setForgotEmail] = useState("");
const [forgotMessage, setForgotMessage] = useState("");
const [forgotSending, setForgotSending] = useState(false);

useEffect(() => {
const stored = typeof window !== "undefined" ? localStorage.getItem("rh_member_email") : null;
const loginAt = typeof window !== "undefined" ? Number(localStorage.getItem("rh_member_login_at") || 0) : 0;
const fiveDaysMs = 5 * 24 * 60 * 60 * 1000;
if (stored && loginAt && Date.now() - loginAt < fiveDaysMs) {
router.replace("/app.html");
} else {
if (stored) {
localStorage.removeItem("rh_member_email");
localStorage.removeItem("rh_member_login_at");
}
setChecking(false);
}
}, [router]);

async function handleSignIn(e: React.FormEvent) {
e.preventDefault();
setSignInError("");
const trimmedEmail = email.trim();
if (!trimmedEmail || !password) return;
setSigningIn(true);
try {
const res = await fetch("/api/auth/login", {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({ email: trimmedEmail, password }),
});
const data = await res.json();
if (!res.ok) {
setSignInError(data?.error || "Something went wrong signing you in.");
return;
}
localStorage.setItem("rh_member_email", data.email || trimmedEmail);
localStorage.setItem("rh_member_login_at", String(Date.now()));
router.replace("/app.html");
} catch {
setSignInError("Something went wrong. Please try again.");
} finally {
setSigningIn(false);
}
}

async function handleForgot(e: React.FormEvent) {
e.preventDefault();
const trimmed = forgotEmail.trim();
if (!trimmed) return;
setForgotSending(true);
setForgotMessage("");
try {
const res = await fetch("/api/auth/forgot-password", {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({ email: trimmed }),
});
const data = await res.json();
setForgotMessage(data?.message || "If that email has an active account, we've sent a reset link.");
} catch {
setForgotMessage("Something went wrong. Please try again.");
} finally {
setForgotSending(false);
}
}

if (checking) {
return <div style={{ minHeight: "100vh" }} />;
}

return (
<div
style={{
minHeight: "100vh",
color: TEXT,
fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
}}
>
{/* HERO */}
<div style={{ padding: "64px 24px 40px", textAlign: "center", maxWidth: 720, margin: "0 auto" }}>
<div
style={{
fontFamily: 'Georgia, "Iowan Old Style", "Times New Roman", serif',
fontSize: 30,
letterSpacing: "0.03em",
marginBottom: 14,
}}
>
The Revolutionary<span style={{ color: GOLD }}> Healer</span>
</div>
<p style={{ color: MUTED, fontSize: 16, lineHeight: 1.7, maxWidth: 560, margin: "0 auto" }}>
Your daily home for the GAP Method, guided activations, and a chat companion that knows your
Revolution — so every shift you make actually sticks.
</p>
</div>

{/* SIGN IN */}
<div style={{ maxWidth: 420, margin: "0 auto", padding: "0 24px 56px" }}>
<div
style={{
background: CARD,
border: `1px solid ${BORDER}`,
borderRadius: 16,
padding: 26,
boxShadow: `0 0 24px rgba(1,103,108,0.35), 0 0 60px rgba(1,103,108,0.15)`,
}}
>
<div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Sign in to your Revolution</div>
<p style={{ color: MUTED, fontSize: 13, marginBottom: 18 }}>
Use the same email and password you use inside Kajabi.
</p>

{!showForgot ? (
<form onSubmit={handleSignIn} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
<input
type="email"
required
value={email}
onChange={(e) => setEmail(e.target.value)}
placeholder="you@example.com"
style={{
background: "#141210",
border: `1px solid ${BORDER}`,
borderRadius: 10,
padding: "12px 14px",
color: TEXT,
fontSize: 14,
}}
/>
<input
type="password"
required
value={password}
onChange={(e) => setPassword(e.target.value)}
placeholder="Password"
style={{
background: "#141210",
border: `1px solid ${BORDER}`,
borderRadius: 10,
padding: "12px 14px",
color: TEXT,
fontSize: 14,
}}
/>
{signInError && (
<div style={{ color: "#E8A33D", fontSize: 13, lineHeight: 1.5 }}>{signInError}</div>
)}
<button
type="submit"
disabled={signingIn}
style={{
background: GOLD,
color: "#241C0A",
border: "none",
borderRadius: 10,
padding: "13px 22px",
fontSize: 14,
fontWeight: 700,
cursor: signingIn ? "default" : "pointer",
opacity: signingIn ? 0.7 : 1,
}}
>
{signingIn ? "Signing in…" : "Enter your Revolution →"}
</button>
<button
type="button"
onClick={() => {
setShowForgot(true);
setForgotEmail(email);
setForgotMessage("");
}}
style={{
background: "none",
border: "none",
color: TEAL_SOFT,
fontSize: 13,
textDecoration: "underline",
cursor: "pointer",
padding: 0,
marginTop: 2,
}}
>
Forgot your password?
</button>
</form>
) : (
<form onSubmit={handleForgot} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
<input
type="email"
required
value={forgotEmail}
onChange={(e) => setForgotEmail(e.target.value)}
placeholder="you@example.com"
style={{
background: "#141210",
border: `1px solid ${BORDER}`,
borderRadius: 10,
padding: "12px 14px",
color: TEXT,
fontSize: 14,
}}
/>
{forgotMessage && (
<div style={{ color: MUTED, fontSize: 13, lineHeight: 1.5 }}>{forgotMessage}</div>
)}
<button
type="submit"
disabled={forgotSending}
style={{
background: GOLD,
color: "#241C0A",
border: "none",
borderRadius: 10,
padding: "13px 22px",
fontSize: 14,
fontWeight: 700,
cursor: forgotSending ? "default" : "pointer",
opacity: forgotSending ? 0.7 : 1,
}}
>
{forgotSending ? "Sending…" : "Send reset link"}
</button>
<button
type="button"
onClick={() => setShowForgot(false)}
style={{
background: "none",
border: "none",
color: TEAL_SOFT,
fontSize: 13,
textDecoration: "underline",
cursor: "pointer",
padding: 0,
}}
>
Back to sign in
</button>
</form>
)}
</div>
</div>

{/* INSIDE THE APP PREVIEW */}
<div style={{ maxWidth: 960, margin: "0 auto", padding: "0 24px 60px" }}>
<div style={{ textAlign: "center", marginBottom: 26 }}>
<div style={{ fontSize: 20, fontWeight: 600 }}>A look inside</div>
<p style={{ color: MUTED, fontSize: 14, marginTop: 6 }}>What's waiting for you the moment you sign in.</p>
</div>
<div
style={{
display: "grid",
gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
gap: 18,
}}
>
<Mockup label="My Revolution">
<div style={{ fontSize: 13, color: MUTED, marginBottom: 8 }}>Your current Shift</div>
<div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 12 }}>
<div style={{ fontSize: 13, fontWeight: 600, color: GOLD, marginBottom: 4 }}>The Leader</div>
<div style={{ fontSize: 12, color: MUTED, lineHeight: 1.5 }}>
Current frequency: Hiddenness → moving toward Visibility
</div>
</div>
</Mockup>
<Mockup label="3-Step GAP Method">
<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
{["Step 1 · Diagnose", "Step 2 · Discover", "Step 3 · Your Shift"].map((s) => (
<div
key={s}
style={{
background: BG,
border: `1px solid ${BORDER}`,
borderRadius: 8,
padding: "8px 10px",
fontSize: 12,
color: TEXT,
}}
>
{s}
</div>
))}
</div>
</Mockup>
<Mockup label="Activation Library">
<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
{["Embodiment", "Frequency Shifts", "Deep Healing"].map((s) => (
<div
key={s}
style={{
background: BG,
border: `1px solid ${BORDER}`,
borderRadius: 8,
padding: "8px 10px",
fontSize: 12,
color: TEXT,
display: "flex",
justifyContent: "space-between",
}}
>
<span>{s}</span>
<span style={{ color: TEAL_SOFT }}>▶</span>
</div>
))}
</div>
</Mockup>
</div>
</div>

{/* PRICING */}
<div style={{ maxWidth: 760, margin: "0 auto", padding: "0 24px 80px" }}>
<div style={{ textAlign: "center", marginBottom: 26 }}>
<div style={{ fontSize: 20, fontWeight: 600 }}>Step into the app</div>
<p style={{ color: MUTED, fontSize: 14, marginTop: 6 }}>Choose your plan — full access, no trial.</p>
</div>
<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
<div
style={{
background: CARD,
border: `1px solid ${BORDER}`,
borderRadius: 16,
padding: 28,
display: "flex",
flexDirection: "column",
gap: 14,
}}
>
<div style={{ fontSize: 13, color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em" }}>
Monthly
</div>
<div style={{ fontSize: 34, fontWeight: 700 }}>
$30<span style={{ fontSize: 15, color: MUTED, fontWeight: 400 }}> /month</span>
</div>
<p style={{ color: MUTED, fontSize: 13, lineHeight: 1.6 }}>
Full access to the app, the GAP Method, and the entire Activation Library.
</p>
<a
href={MONTHLY_CHECKOUT}
target="_blank"
rel="noopener noreferrer"
style={{
textAlign: "center",
background: "transparent",
color: GOLD,
border: `1px solid ${GOLD}`,
borderRadius: 10,
padding: "13px 22px",
fontSize: 14,
fontWeight: 700,
textDecoration: "none",
}}
>
Get monthly access →
</a>
</div>

<div
style={{
background: CARD,
border: `1px solid ${GOLD}`,
borderRadius: 16,
padding: 28,
display: "flex",
flexDirection: "column",
gap: 14,
position: "relative",
}}
>
<div
style={{
position: "absolute",
top: -12,
right: 20,
background: GOLD,
color: "#241C0A",
fontSize: 11,
fontWeight: 700,
padding: "4px 10px",
borderRadius: 999,
letterSpacing: "0.04em",
}}
>
BEST VALUE
</div>
<div style={{ fontSize: 13, color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em" }}>
Yearly
</div>
<div style={{ fontSize: 34, fontWeight: 700 }}>
$347<span style={{ fontSize: 15, color: MUTED, fontWeight: 400 }}> /year</span>
</div>
<p style={{ color: MUTED, fontSize: 13, lineHeight: 1.6 }}>
Everything in Monthly, at just under $29/month — the same full access, paid once a year.
</p>
<a
href={ANNUAL_CHECKOUT}
target="_blank"
rel="noopener noreferrer"
style={{
textAlign: "center",
background: GOLD,
color: "#241C0A",
border: `1px solid ${GOLD}`,
borderRadius: 10,
padding: "13px 22px",
fontSize: 14,
fontWeight: 700,
textDecoration: "none",
}}
>
Get yearly access →
</a>
</div>
</div>
<p style={{ textAlign: "center", color: MUTED, fontSize: 12, marginTop: 22 }}>
After checkout, come back here and sign in with the same email and password you used at checkout.
</p>
</div>
</div>
);
}
