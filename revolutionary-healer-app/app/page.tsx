"use client";

// Chat UI: focus-area picker, messages, healing cards. Spec ref: SPEC.md §7.
// Rebuilt Aug 13 to match Rachael's brand (see public/gap-method.html /
// app/globals.css: black + gold, serif headings) and to add real navigation
// into /my-revolution. Email is persisted in localStorage so a member
// doesn't have to retype it to move between the chat and My Revolution.
import { useState, useEffect } from "react";
import { FOCUS_AREAS } from "@/lib/focusAreas";
import { PROCESSES } from "@/lib/processes";

type ChatMessage = { role: "user" | "assistant"; content: string };

const EMAIL_STORAGE_KEY = "rh_member_email";

export default function Home() {
  const [email, setEmail] = useState("");
  const [emailLocked, setEmailLocked] = useState(false);
  const [focusAreaSlug, setFocusAreaSlug] = useState(FOCUS_AREAS[0].slug);
  const [processSlug, setProcessSlug] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // Restore a previously-entered email so returning members skip the gate.
  useEffect(() => {
    const saved = window.localStorage.getItem(EMAIL_STORAGE_KEY);
    if (saved) {
      setEmail(saved);
      setEmailLocked(true);
    }
  }, []);

  function lockEmail() {
    if (!email.trim()) return;
    window.localStorage.setItem(EMAIL_STORAGE_KEY, email.trim());
    setEmailLocked(true);
  }

  function signOut() {
    window.localStorage.removeItem(EMAIL_STORAGE_KEY);
    setEmailLocked(false);
    setEmail("");
    setMessages([]);
    setProcessSlug(null);
  }

  async function sendMessage(text: string, activeProcessSlug: string | null = processSlug) {
    if (!text.trim()) return;
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          focusAreaSlug,
          message: text,
          history: nextMessages.slice(0, -1).map((m) => ({ role: m.role, content: m.content })),
          processSlug: activeProcessSlug,
        }),
      });
      const data = await res.json();
      if (data.reply) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: data.error ?? "Something went wrong." }]);
      }
    } finally {
      setLoading(false);
    }
  }

  // Quick-start chip: begins the process automatically -- the member just
  // clicks it, no typing required. Unlike sendMessage, the trigger prompt is
  // sent to the model but never shown as a "user" bubble, so it reads as the
  // bot starting the walkthrough on its own (e.g. the Gap Method's scripted
  // welcome line + first question). Spec ref: SPEC.md §4.1a/§4.1c.
  async function startProcess(slug: string, chatPrompt: string) {
    setProcessSlug(slug);
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          focusAreaSlug,
          message: chatPrompt,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
          processSlug: slug,
        }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply ?? data.error ?? "Something went wrong." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  if (!emailLocked) {
    return (
      <main className="shell">
        <div className="topbar">
          <div className="topbar-inner">
            <div className="brand-eyebrow serif">The Revolutionary Healer</div>
          </div>
        </div>
        <div className="card center" style={{ marginTop: 48 }}>
          <div className="eyebrow">Welcome</div>
          <h1 className="page-title serif">Enter your member email to continue.</h1>
          <p className="copy">This unlocks your focus-area coaching and your My Revolution space.</p>
          <div className="composer" style={{ marginTop: 24, position: "static", justifyContent: "center" }}>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && lockEmail()}
            />
            <button className="btn-gold" onClick={lockEmail}>Continue</button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <>
      <div className="topbar">
        <div className="topbar-inner">
          <div className="brand-eyebrow serif">The Revolutionary Healer</div>
          <div className="nav-links">
            <a href="/" className="nav-link-btn active">Chat</a>
            <a href="/my-revolution" className="nav-link-btn">My Revolution</a>
            <a href="/gap-method.html" className="nav-link-btn">GAP Method</a>
            <button className="nav-link-btn" onClick={signOut}>Sign out</button>
          </div>
        </div>
      </div>
      <main className="shell">
        <div className="focus-picker">
          {FOCUS_AREAS.map((fa) => (
            <button
              key={fa.slug}
              className={`focus-pill ${fa.slug === focusAreaSlug ? "active" : ""}`}
              onClick={() => {
                setFocusAreaSlug(fa.slug);
                setProcessSlug(null); // leaving a guided process back to open focus-area coaching
              }}
            >
              {fa.name}
            </button>
          ))}
        </div>

        {/* Quick-start: pick a process and the bot begins automatically -- the
            member never sees or types anything to kick it off. Spec ref:
            SPEC.md §4.1a / §4.1c "Guided Processes". */}
        <div className="process-picker">
          {PROCESSES.map((p) => (
            <button
              key={p.slug}
              className={`process-chip ${p.slug === processSlug ? "active" : ""}`}
              title={p.description}
              onClick={() => startProcess(p.slug, p.chatPrompt)}
            >
              {p.name}
            </button>
          ))}
        </div>

        <div className="messages">
          {messages.length === 0 && !loading && (
            <div className="bubble assistant">
              Welcome back. Pick a focus area or a guided process above, or just start typing below.
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`bubble ${m.role}`}>
              {m.content}
            </div>
          ))}
          {loading && <div className="bubble assistant">...</div>}
        </div>

        <div className="composer">
          <input
            value={input}
            placeholder="Ask your focus-area coach..."
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage(input)}
          />
          <button className="btn-gold" onClick={() => sendMessage(input)}>Send</button>
        </div>
      </main>
    </>
  );
}
