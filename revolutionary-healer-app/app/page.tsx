"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PasswordField from "@/components/PasswordField";

import { DAWN_CSS, DAWN_PRE, DAWN_POST } from "./dawn-content";

const MONTHLY_CHECKOUT = "https://www.rachaelsbutterflyeffect.com/offers/rkwoQv2s/checkout";
const ANNUAL_CHECKOUT = "https://www.rachaelsbutterflyeffect.com/offers/3YC8s5FV/checkout";

// Nov 3 2026: logged-out home = the approved "dawn" landing (rh-ideal). Checkout links unchanged.
const PRE_HTML = DAWN_PRE;
const POST_HTML = DAWN_POST.replace("__MONTHLY__", MONTHLY_CHECKOUT).replace("__ANNUAL__", ANNUAL_CHECKOUT);

// Oct 15 2026 (old-look flash fix): decide which look a member gets here, before leaving the landing
// page, and go straight there -- allowed members never load the classic shell first. The decision is
// remembered (localStorage rh_ui_refresh) so app.html can also decide synchronously. Fails open to
// /app.html (which re-checks) after 2.5 s or on any error. ?t= / hash are not used on this page.
async function memberAppPath(email: string): Promise<string> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch("/api/ui-refresh?email=" + encodeURIComponent(email), { cache: "no-store", signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) return "/app.html";
    const d = await r.json();
    try { localStorage.setItem("rh_ui_refresh", (d && d.refresh ? "1:" : "0:") + email); } catch {}
    return d && d.refresh ? "/app-refresh.html" : "/app.html";
  } catch {
    return "/app.html";
  }
}

export default function Home() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signInError, setSignInError] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("rh_member_email") : null;
    const loginAt = typeof window !== "undefined" ? Number(localStorage.getItem("rh_member_login_at") || 0) : 0;
    const fiveDaysMs = 5 * 24 * 60 * 60 * 1000;
    if (stored && loginAt && Date.now() - loginAt < fiveDaysMs) {
      memberAppPath(stored).then((path) => router.replace(path));
    } else {
      if (stored) {
        localStorage.removeItem("rh_member_email");
        localStorage.removeItem("rh_member_login_at");
      }
      setChecking(false);
    }
  }, [router]);

  // Every sign-in problem must be seen: on iPhone the keyboard covers the message under the button, so close
  // the keyboard and bring the message into view. A member the app sent back here (no active access) gets
  // the reason instead of a silent return to this form.
  useEffect(() => {
    if (!signInError) return;
    try { (document.activeElement as HTMLElement | null)?.blur(); } catch {}
    const t = setTimeout(() => { try { document.getElementById("signin-error")?.scrollIntoView({ block: "center", behavior: "smooth" }); } catch {} }, 60);
    return () => clearTimeout(t);
  }, [signInError]);
  useEffect(() => {
    try {
      const n = sessionStorage.getItem("rh_signin_notice");
      if (n) { sessionStorage.removeItem("rh_signin_notice"); setSignInError(n); }
    } catch {}
  }, [checking]);

  // Dawn landing: drifting sparkles + sparkle butterflies (public/dawn/sparkbf.js), once the page is shown.
  useEffect(() => {
    if (checking) return;
    document.querySelectorAll<HTMLElement>(".dawn .sparks").forEach((s) => {
      if (s.childElementCount) return;
      const n = +(s.dataset.n || 0);
      for (let i = 0; i < n; i++) {
        const e = document.createElement("i"); const r = Math.random();
        e.style.left = Math.random() * 100 + "%"; e.style.top = Math.random() * 100 + "%";
        const z = r < 0.2 ? 5 : r < 0.5 ? 3 : 2; e.style.width = e.style.height = z + "px";
        if (s.dataset.night && Math.random() < 0.2) { e.style.background = "#9FE8DA"; e.style.boxShadow = "0 0 6px rgba(120,220,200,.6)"; }
        e.style.animationDuration = 6 + Math.random() * 10 + "s"; e.style.animationDelay = -Math.random() * 12 + "s";
        s.appendChild(e);
      }
    });
    if (!document.getElementById("dawn-sparkbf")) {
      const sc = document.createElement("script"); sc.id = "dawn-sparkbf"; sc.src = "/dawn/sparkbf.js"; document.body.appendChild(sc);
    }
  }, [checking]);

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
      router.replace(await memberAppPath(data.email || trimmedEmail));
    } catch {
      setSignInError("Something went wrong. Please try again.");
    } finally {
      setSigningIn(false);
    }
  }

  if (checking) {
    return <div style={{ minHeight: "100vh" }} />;
  }

  return (
    <div className="dawn">
      <style dangerouslySetInnerHTML={{ __html: DAWN_CSS }} />
      <div dangerouslySetInnerHTML={{ __html: PRE_HTML }} />
      <section className="signin-sec" id="signin" style={{ paddingTop: 70 }}>
        <div className="wrap">
          <div className="glass signin">
            <div>
              <div className="eyebrow" style={{ justifyContent: "flex-start" }}>Already a member</div>
              <h3 style={{ marginTop: 10 }}>Sign in to your Revolution</h3>
              <p>Use the same email and password you use inside Kajabi.</p>
            </div>
            <form onSubmit={handleSignIn}>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
              <PasswordField
                name="password"
                value={password}
                onChange={setPassword}
                placeholder="Password"
                borderColor="rgba(184,145,58,.35)"
                autoComplete="current-password"
              />
              <button type="submit" className="btn btn-gold" disabled={signingIn}>
                {signingIn ? "Signing in…" : "Enter →"}
              </button>
              {signInError && (
                <div id="signin-error" role="alert" className="err">{signInError}</div>
              )}
              <a className="f" href="/contact-support">Forgot your password?</a>
            </form>
          </div>
        </div>
      </section>
      <div dangerouslySetInnerHTML={{ __html: POST_HTML }} />
    </div>
  );
}
