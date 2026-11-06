"use client";

import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { useRouter } from "next/navigation";
import PasswordField from "@/components/PasswordField";
import { keepStoredSignIn } from "@/lib/migrationClient";
import { safeReturnPath, signInDestination } from "@/lib/returnPath";
import styles from "./sign-in.module.css";

type Wing = { bx: number; by: number; s: number; j: number; teal: boolean };
type Swirl = { a: number; r: number; w: number; inw: number; s: number; j: number; teal: boolean };

const GOLD_LINE = "rgba(232,200,115,0.38)";

/**
 * The signed-in home butterfly (#rf-fly in public/app-refresh.html): 520 wing
 * points, 140 inward swirls, the same curve, colors, and every-other-frame loop.
 */
function useAppButterfly(flyRef: RefObject<HTMLCanvasElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const fly = flyRef.current;
    if (!fly) return;
    const fx = fly.getContext("2d");
    if (!fx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let FW = 0;
    let FH = 0;
    let wings: Wing[] = [];
    let swirl: Swirl[] = [];
    let px = 0;
    let py = 0;
    let T = 0;
    let frame = 0;
    let raf = 0;
    let stopped = false;

    const resizeFly = () => {
      const d = Math.min(window.devicePixelRatio || 1, 2);
      const nextW = fly.clientWidth;
      const nextH = fly.clientHeight;
      if (!nextW || !nextH) return;
      if (nextW === FW && nextH === FH && wings.length) return;
      FW = nextW;
      FH = nextH;
      fly.width = FW * d;
      fly.height = FH * d;
      fx.setTransform(d, 0, 0, d, 0, 0);
      wings = Array.from({ length: 520 }, () => {
        const t = Math.random() * Math.PI * 2;
        const side = Math.random() < 0.5 ? -1 : 1;
        const r =
          (Math.exp(Math.sin(t)) - 2 * Math.cos(4 * t) + Math.pow(Math.sin((2 * t - Math.PI) / 24), 5)) *
          Math.pow(Math.random(), 0.35);
        return {
          bx: Math.sin(t) * r * side,
          by: -Math.cos(t) * r,
          s: side,
          j: Math.random() * 6,
          teal: Math.random() < 0.18,
        };
      });
      const k = Math.min(FW, FH) / 7.2;
      swirl = Array.from({ length: 140 }, () => ({
        a: Math.random() * 7,
        r: k * (0.9 + Math.random() * 2.4),
        w: 0.004 + Math.random() * 0.01,
        inw: Math.random() < 0.4 ? 0.08 + Math.random() * 0.15 : 0,
        s: Math.random() * 1.6 + 0.4,
        j: Math.random() * 6,
        teal: Math.random() < 0.4,
      }));
    };

    const draw = () => {
      T += 0.016;
      frame += 1;
      if (document.hidden || (frame & 1) === 0) return;
      if (!FW || !FH) return;
      fx.clearRect(0, 0, FW, FH);
      const cx = FW / 2 + px * 0.6;
      const cy = FH / 2 - 6 + py * 0.6;
      const k = Math.min(FW, FH) / 7.2;
      fx.globalCompositeOperation = "lighter";
      for (const p of wings) {
        const x = cx + Math.abs(p.bx) * p.s * k * 0.92 + Math.sin(T * 0.6 + p.j) * 0.8;
        const y = cy + p.by * k * 0.9 + Math.cos(T * 0.5 + p.j) * 0.8;
        fx.fillStyle = p.teal ? "rgba(110,240,228,.75)" : "rgba(255,224,150,.8)";
        fx.fillRect(x, y, 1.6, 1.6);
      }
      fx.fillStyle = "rgba(255,246,214,.9)";
      fx.fillRect(cx - 1, cy - k * 0.9, 2, k * 1.6);
      const step = reduce ? 0 : 2;
      for (const v of swirl) {
        v.a += v.w * step;
        v.r -= v.inw * step;
        if (v.r < k * 0.4) {
          v.r = k * (2 + Math.random() * 1.4);
          v.a = Math.random() * 7;
        }
        const tw = 0.35 + 0.65 * Math.abs(Math.sin(T * 2 + v.j));
        const vx = cx + Math.cos(v.a) * v.r;
        const vy = cy + Math.sin(v.a) * v.r * 0.62;
        fx.fillStyle = v.teal ? `rgba(110,240,228,${tw})` : `rgba(255,226,150,${tw})`;
        fx.beginPath();
        fx.arc(vx, vy, v.s, 0, 7);
        fx.fill();
        if (v.s > 1.3) {
          fx.fillRect(vx - v.s * 2.5, vy - 0.3, v.s * 5, 0.6);
          fx.fillRect(vx - 0.3, vy - v.s * 2.5, 0.6, v.s * 5);
        }
      }
      fx.globalCompositeOperation = "source-over";
    };

    const loop = () => {
      if (stopped) return;
      draw();
      raf = requestAnimationFrame(loop);
    };

    const onPointer = (event: PointerEvent) => {
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      px = (event.clientX / w - 0.5) * 14;
      py = (event.clientY / h - 0.5) * 14;
    };

    resizeFly();
    if (reduce) {
      window.setTimeout(draw, 300);
    } else {
      loop();
    }

    const flyObserver = new ResizeObserver(() => {
      resizeFly();
      if (reduce) draw();
    });
    flyObserver.observe(fly);
    window.addEventListener("pointermove", onPointer);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      flyObserver.disconnect();
      window.removeEventListener("pointermove", onPointer);
    };
  }, [flyRef, active]);
}

// Oct 15 2026 (old-look flash fix): decide which look a member gets here, before leaving the sign-in
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

export default function SignInHome({ fontsClassName }: { fontsClassName: string }) {
  const router = useRouter();
  const flyRef = useRef<HTMLCanvasElement>(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signInError, setSignInError] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  useAppButterfly(flyRef, !checking);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("rh_member_email") : null;
    const loginAt = typeof window !== "undefined" ? Number(localStorage.getItem("rh_member_login_at") || 0) : 0;
    const armed = typeof window !== "undefined" && localStorage.getItem("rh_auth_migration") === "on";
    const next = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("next") || "" : "";
    const go = (data: { ok?: boolean } | null) => {
      const dest = signInDestination({ sessionOk: data?.ok === true, stored: !!stored, armed, loginAt, now: Date.now(), next });
      if (dest.kind === "return" && dest.path) { router.replace(dest.path); return; }
      if (dest.kind === "app" && stored) { memberAppPath(stored).then((path) => router.replace(path)); return; }
      if (stored && !keepStoredSignIn({ armed, loginAt, now: Date.now() }) && !safeReturnPath(next)) {
        localStorage.removeItem("rh_member_email");
        localStorage.removeItem("rh_member_login_at");
      }
      setChecking(false);
    };
    fetch("/api/auth/session", { credentials: "same-origin" })
      .then((res) => res.json())
      .then(go)
      .catch(() => go(null));
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

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      const next = safeReturnPath(new URLSearchParams(window.location.search).get("next") || "");
      router.replace(next || await memberAppPath(data.email || trimmedEmail));
    } catch {
      setSignInError("Something went wrong. Please try again.");
    } finally {
      setSigningIn(false);
    }
  }

  if (checking) {
    return <div className={`${styles.page} ${fontsClassName}`} />;
  }

  return (
    <div className={`${styles.page} ${fontsClassName}`}>
      <main className={styles.stage}>
        <div className={styles.glow}>
          <section className={styles.card} aria-labelledby="signin-heading">
            <div className={styles.mark} aria-hidden="true">
              <canvas ref={flyRef} className={styles.fly} />
            </div>
            <div className={styles.rule} aria-hidden="true" />
            <p className={styles.welcome}>Welcome to</p>
            <h1 id="signin-heading" className={styles.title}>Revolutionary Healer</h1>
            <form className={styles.form} onSubmit={handleSignIn}>
              <label className={styles.field} htmlFor="signin-email">
                <span className={styles.sr}>Email</span>
                <input
                  id="signin-email"
                  className={styles.input}
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.sr}>Password</span>
                <PasswordField
                  name="password"
                  value={password}
                  onChange={setPassword}
                  placeholder="Password"
                  borderColor={GOLD_LINE}
                  autoComplete="current-password"
                />
              </label>
              {signInError ? (
                <div id="signin-error" role="alert" className={styles.error}>
                  {signInError}
                </div>
              ) : null}
              <button type="submit" className={styles.button} disabled={signingIn}>
                {signingIn ? "Signing in…" : "Sign in"}
              </button>
              <a className={styles.forgot} href="/contact-support">
                Forgot your password?
              </a>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}
