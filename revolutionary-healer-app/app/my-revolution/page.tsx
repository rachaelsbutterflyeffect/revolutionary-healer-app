"use client";

// My Revolution: the member's Shift cards, built from the GAP Method
// diagnostic once it's linked to a real member record. Spec ref: SPEC.md
// §4.1d "My Revolution" + the "Post-Gap Method App Entry Flow" section
// (point 3: auto-create a Gap Method Shift card). Data comes from
// lib/airtable.js's Shifts table via /api/shifts (see
// lib/airtable.js's createGapMethodShift, wired Aug 13).
import { useEffect, useState } from "react";

const EMAIL_STORAGE_KEY = "rh_member_email";

type Shift = {
  id: string;
  divineIdentityName: string;
  currentFrequency: string;
  focusArea: string;
  gapExplanation: string;
  whatWeNoticed: string;
  recommendedActivation: string;
  progressStatus: string;
  createdAt: string;
};

export default function MyRevolution() {
  const [email, setEmail] = useState<string | null>(null);
  const [shifts, setShifts] = useState<Shift[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEmail(window.localStorage.getItem(EMAIL_STORAGE_KEY));
  }, []);

  useEffect(() => {
    if (!email) return;
    setError(null);
    fetch(`/api/shifts?email=${encodeURIComponent(email)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        setShifts(data.shifts ?? []);
      })
      .catch(() => setError("Couldn't load your Shifts right now."));
  }, [email]);

  return (
    <>
      <div className="topbar">
        <div className="topbar-inner">
          <div className="brand-eyebrow serif">The Revolutionary Healer</div>
          <div className="nav-links">
            <a href="/" className="nav-link-btn">Chat</a>
            <a href="/my-revolution" className="nav-link-btn active">My Revolution</a>
            <a href="/gap-method.html" className="nav-link-btn">GAP Method</a>
          </div>
        </div>
      </div>
      <main className="shell">
        <div className="eyebrow" style={{ marginTop: 32 }}>My Revolution</div>
        <h1 className="page-title serif">Your Shifts</h1>
        <p className="copy" style={{ marginBottom: 28 }}>
          Every Shift you activate lives here — what we noticed, what's recommended next, and where you are in the process.
        </p>

        {!email && (
          <div className="card center">
            <p className="copy">Enter your member email on the chat page first to see your Shifts.</p>
            <a className="btn-gold" href="/">Go to Chat →</a>
          </div>
        )}

        {email && shifts === null && !error && (
          <div className="loading-note">Loading your Shifts...</div>
        )}

        {error && <div className="error-note">{error}</div>}

        {email && shifts && shifts.length === 0 && (
          <div className="card center empty-state">
            <p className="copy">You haven't started a Shift yet.</p>
            <p className="copy" style={{ marginBottom: 24 }}>Complete the 3 Step GAP Method to create your first one.</p>
            <a className="btn-gold" href="/gap-method.html">Start the GAP Method →</a>
          </div>
        )}

        {shifts &&
          shifts.length > 0 &&
          shifts.map((s) => (
            <div key={s.id} className="shift-card">
              <div className={`shift-status ${s.progressStatus === "embodied" ? "embodied" : ""}`}>
                {s.progressStatus === "embodied" ? "Embodied" : "Shift in progress"}
              </div>
              <h3 className="shift-identity serif">{s.divineIdentityName || "Your Divine Identity"}</h3>
              <div className="shift-meta">
                {s.currentFrequency}
                {s.focusArea ? ` · ${s.focusArea}` : ""}
              </div>

              {s.gapExplanation && (
                <div className="shift-block">
                  <div className="label">Your Gap</div>
                  <div className="value">{s.gapExplanation}</div>
                </div>
              )}
              {s.whatWeNoticed && (
                <div className="shift-block">
                  <div className="label">What We Noticed</div>
                  <div className="value">{s.whatWeNoticed}</div>
                </div>
              )}
              {s.recommendedActivation && (
                <div className="shift-block">
                  <div className="label">Recommended Activation</div>
                  <div className="value">{s.recommendedActivation}</div>
                </div>
              )}
              {s.createdAt && (
                <div className="shift-date">
                  Started {new Date(s.createdAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
                </div>
              )}
            </div>
          ))}
      </main>
    </>
  );
}
