"use client";

import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import PasswordField from "@/components/PasswordField";
import styles from "./signin-mock.module.css";

type Star = { x: number; y: number; r: number; z: number; p: number; gold: boolean };
type Wing = { bx: number; by: number; s: number; j: number; teal: boolean };
type Swirl = { a: number; r: number; w: number; inw: number; s: number; j: number; teal: boolean };

const GOLD_LINE = "rgba(232,200,115,0.38)";

/**
 * Same particle butterfly and orbiting swirl drawn on the in-app home
 * (public/app-refresh.html, #rf-fly). Gold is the body of the mark.
 * Teal stays a sparse sparkle, matching the in-app motes, not a fill.
 */
function useHomeButterfly(skyRef: RefObject<HTMLCanvasElement | null>, flyRef: RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const sky = skyRef.current;
    const fly = flyRef.current;
    if (!sky || !fly) return;
    const sx = sky.getContext("2d");
    const fx = fly.getContext("2d");
    if (!sx || !fx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let W = 0;
    let H = 0;
    let FW = 0;
    let FH = 0;
    let stars: Star[] = [];
    let wings: Wing[] = [];
    let swirl: Swirl[] = [];
    let px = 0;
    let py = 0;
    let T = 0;
    let frame = 0;
    let raf = 0;
    let stopped = false;

    const resizeSky = () => {
      const d = Math.min(window.devicePixelRatio || 1, 2);
      const nw = window.innerWidth;
      const nh = window.innerHeight;
      if (W === nw && H === nh && stars.length) return;
      W = nw;
      H = nh;
      sky.width = Math.max(1, W * d);
      sky.height = Math.max(1, H * d);
      sky.style.width = W + "px";
      sky.style.height = H + "px";
      sx.setTransform(d, 0, 0, d, 0, 0);
      stars = Array.from({ length: 110 }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.4 + 0.2,
        z: Math.random() * 0.8 + 0.2,
        p: Math.random() * 6,
        gold: Math.random() < 0.35,
      }));
    };

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

    const draw = (force: boolean) => {
      T += 0.016;
      frame += 1;
      if (!force && (document.hidden || frame % 2 === 1)) return;
      sx.clearRect(0, 0, W, H);
      for (const s of stars) {
        const a = 0.45 + 0.55 * Math.sin(T * 1.5 + s.p);
        sx.fillStyle = s.gold ? `rgba(255,226,150,${a})` : `rgba(220,255,250,${a * 0.8})`;
        sx.beginPath();
        sx.arc(s.x + px * s.z, s.y + py * s.z, s.r, 0, Math.PI * 2);
        sx.fill();
      }
      if (!FW || !FH) return;
      fx.clearRect(0, 0, FW, FH);
      const cx = FW / 2 + px * 0.6;
      const cy = FH / 2 - 6 + py * 0.6;
      const k = Math.min(FW, FH) / 7.2;
      fx.globalCompositeOperation = "lighter";
      for (const p of wings) {
        const x = cx + Math.abs(p.bx) * p.s * k * 0.92 + Math.sin(T * 0.6 + p.j) * 0.8;
        const y = cy + p.by * k * 0.9 + Math.cos(T * 0.5 + p.j) * 0.8;
        fx.fillStyle = p.teal ? "rgba(110,240,228,0.75)" : "rgba(255,224,150,0.8)";
        fx.fillRect(x, y, 1.6, 1.6);
      }
      fx.fillStyle = "rgba(255,246,214,0.9)";
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
        fx.arc(vx, vy, v.s, 0, Math.PI * 2);
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
      draw(false);
      raf = requestAnimationFrame(loop);
    };

    const onPointer = (event: PointerEvent) => {
      if (!W || !H) return;
      px = (event.clientX / W - 0.5) * 14;
      py = (event.clientY / H - 0.5) * 14;
    };

    resizeSky();
    resizeFly();
    if (reduce) draw(true);
    else loop();

    const skyObserver = new ResizeObserver(() => {
      resizeSky();
      if (reduce) draw(true);
    });
    const flyObserver = new ResizeObserver(() => {
      resizeFly();
      if (reduce) draw(true);
    });
    skyObserver.observe(document.documentElement);
    flyObserver.observe(fly);
    window.addEventListener("pointermove", onPointer);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      skyObserver.disconnect();
      flyObserver.disconnect();
      window.removeEventListener("pointermove", onPointer);
    };
  }, [skyRef, flyRef]);
}

export default function SignInMock({ fontsClassName }: { fontsClassName: string }) {
  const skyRef = useRef<HTMLCanvasElement>(null);
  const flyRef = useRef<HTMLCanvasElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");

  useHomeButterfly(skyRef, flyRef);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("Preview only. This page does not sign you in.");
  }

  return (
    <div className={`${styles.page} ${fontsClassName}`}>
      <canvas ref={skyRef} className={styles.sky} aria-hidden="true" />
      <div className={styles.aurora} aria-hidden="true" />
      <div className={styles.stage}>
        <div className={styles.col}>
          <p className={styles.mark}>Revolutionary Healer</p>
          <div className={styles.hero} aria-hidden="true">
            <span className={styles.halo} />
            <canvas ref={flyRef} className={styles.fly} />
          </div>
          <h1 className={styles.title}>Sign in</h1>
          <div className={styles.divider} aria-hidden="true" />
          <p className={styles.hint}>Use the same email and password you use inside Kajabi.</p>
          <form className={styles.bubble} onSubmit={onSubmit}>
            <label className={styles.field} htmlFor="signin-mock-email">
              <span className={styles.eyebrow}>Email</span>
              <input
                id="signin-mock-email"
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
                onChange={(event) => {
                  setNotice("");
                  setEmail(event.target.value);
                }}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.eyebrow}>Password</span>
              <PasswordField
                name="password"
                value={password}
                onChange={(value) => {
                  setNotice("");
                  setPassword(value);
                }}
                placeholder="Password"
                borderColor={GOLD_LINE}
                autoComplete="current-password"
              />
            </label>
            <button type="submit" className={styles.button}>
              Sign in
            </button>
            {notice ? (
              <p className={styles.notice} role="status">
                {notice}
              </p>
            ) : null}
            <a className={styles.forgot} href="/contact-support">
              Forgot your password?
            </a>
          </form>
        </div>
      </div>
    </div>
  );
}
