"use client";

// Chat UI: focus-area picker, messages, healing cards. Spec ref: SPEC.md §7.
import { useState } from "react";
import { FOCUS_AREAS } from "@/lib/focusAreas";
import { PROCESSES } from "@/lib/processes";

type ChatMessage = { role: "user" | "assistant"; content: string };

export default function Home() {
  const [email, setEmail] = useState("");
  const [emailLocked, setEmailLocked] = useState(false);
  const [focusAreaSlug, setFocusAreaSlug] = useState(FOCUS_AREAS[0].slug);
  const [processSlug, setProcessSlug] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

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
          // Carry this session's messages so far (empty on a fresh session).
          // Lets the model notice a member re-running a process it already
          // walked them through earlier in this same sitting -- see
          // lib/processes.js GAP_METHOD_SCRIPT_MEMBER's "Restarting" section.
          // Cross-session/device memory is a separate, not-yet-built Phase 2
          // concern (SPEC.md §7).
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
        <h1>The Revolutionary Healer</h1>
        <p>Enter your member email to continue.</p>
        <div className="composer">
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button onClick={() => email && setEmailLocked(true)}>Continue</button>
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      <h1>The Revolutionary Healer</h1>

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
        <button onClick={() => sendMessage(input)}>Send</button>
      </div>
    </main>
  );
}
