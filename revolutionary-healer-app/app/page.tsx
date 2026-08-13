"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("rh_member_email") : null;
    if (stored) {
      router.replace("/app.html");
    } else {
      setChecking(false);
    }
  }, [router]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    localStorage.setItem("rh_member_email", trimmed);
    router.replace("/app.html");
  }

  if (checking) {
    return (
      <div style={{ minHeight: "100vh", background: "#121110" }} />
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#121110",
        color: "#F6F2E9",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
        padding: "24px",
      }}
    >
      <div style={{ maxWidth: 440, width: "100%", textAlign: "center" }}>
        <div
          style={{
            fontFamily: 'Georgia, "Iowan Old Style", "Times New Roman", serif',
            fontSize: 22,
            letterSpacing: "0.04em",
            marginBottom: 28,
          }}
        >
          The Revolutionary<span style={{ color: "#CFA646" }}> Healer</span>
        </div>
        <p style={{ color: "#A9997F", fontSize: 14, lineHeight: 1.6, marginBottom: 28 }}>
          Enter the email you used to join to access your Revolution.
        </p>
        <form onSubmit={handleSubmit} style={{ display: "flex", gap: 10 }}>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={{
              flex: 1,
              background: "#1B1815",
              border: "1px solid #3A342B",
              borderRadius: 10,
              padding: "12px 14px",
              color: "#F6F2E9",
              fontSize: 14,
            }}
          />
          <button
            type="submit"
            style={{
              background: "#CFA646",
              color: "#241C0A",
              border: "none",
              borderRadius: 10,
              padding: "12px 22px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Enter →
          </button>
        </form>
      </div>
    </div>
  );
}
