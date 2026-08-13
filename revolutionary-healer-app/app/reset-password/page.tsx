"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const GOLD = "#CFA646";
const BG = "#121110";
const CARD = "#1B1815";
const BORDER = "#3A342B";
const TEXT = "#F6F2E9";
const MUTED = "#A9997F";

export default function ResetPassword() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: BG }} />}>
      <ResetPasswordInner />
    </Suspense>
  );
}

function ResetPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("t") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Something went wrong. Please try again.");
        return;
      }
      setDone(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: BG,
        color: TEXT,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
        padding: "24px",
      }}
    >
      <div style={{ maxWidth: 420, width: "100%" }}>
        <div
          style={{
            fontFamily: 'Georgia, "Iowan Old Style", "Times New Roman", serif',
            fontSize: 22,
            letterSpacing: "0.04em",
            marginBottom: 22,
            textAlign: "center",
          }}
        >
          The Revolutionary<span style={{ color: GOLD }}> Healer</span>
        </div>

        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 26 }}>
          {!token ? (
            <p style={{ color: MUTED, fontSize: 14, lineHeight: 1.6 }}>
              This reset link is missing its token. Please request a new password reset link from the sign-in
              page.
            </p>
          ) : done ? (
            <>
              <p style={{ color: TEXT, fontSize: 14, lineHeight: 1.6, marginBottom: 18 }}>
                Your password has been reset. You can now sign in with your new password.
              </p>
              <button
                onClick={() => router.replace("/")}
                style={{
                  width: "100%",
                  background: GOLD,
                  color: "#241C0A",
                  border: "none",
                  borderRadius: 10,
                  padding: "13px 22px",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Back to sign in →
              </button>
            </>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Choose a new password</div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="New password"
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
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Confirm new password"
                style={{
                  background: "#141210",
                  border: `1px solid ${BORDER}`,
                  borderRadius: 10,
                  padding: "12px 14px",
                  color: TEXT,
                  fontSize: 14,
                }}
              />
              {error && <div style={{ color: "#E8A33D", fontSize: 13, lineHeight: 1.5 }}>{error}</div>}
              <button
                type="submit"
                disabled={submitting}
                style={{
                  background: GOLD,
                  color: "#241C0A",
                  border: "none",
                  borderRadius: 10,
                  padding: "13px 22px",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: submitting ? "default" : "pointer",
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? "Saving…" : "Reset password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
