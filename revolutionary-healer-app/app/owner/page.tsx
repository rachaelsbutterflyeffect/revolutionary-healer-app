"use client";

import { useState } from "react";

type Report = {
    error?: string;
    coverage?: { verifiedEvents: number; unverifiedEvents: number; gap: string; legacyNote: string };
    totals?: Record<string, number>;
    top5?: { rank: number; slug: string; starts: number; listenedSeconds: number; finishes: number }[];
    cohorts?: { day: string; starts: number; returnedNextDay: number }[];
    lastScreens?: { memberEmail: string; screen: string; at: string }[];
    lastScreenNote?: string;
    timeline?: { at: string; event: string; slug?: string; code?: string; screen?: string }[];
    scan?: { cap: number; complete: boolean };
    unverifiedSummary?: { shown?: boolean; events?: number; playStarts?: number; chatTurns?: number };
    legacy?: { label?: string; chatSessionsSample?: number; favoritesSample?: number };
};

export default function OwnerActivityPage() {
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [member, setMember] = useState("");
    const [testers, setTesters] = useState(false);
    const [unverified, setUnverified] = useState(false);
    const [report, setReport] = useState<Report | null>(null);
    const [error, setError] = useState("");

    async function load() {
        setError("");
        const params = new URLSearchParams();
        if (from) params.set("from", from);
        if (to) params.set("to", to);
        if (member) params.set("member", member);
        if (testers) params.set("testers", "1");
        if (unverified) params.set("unverified", "1");
        const res = await fetch("/api/owner/activity?" + params.toString(), { credentials: "same-origin" });
        const data = await res.json();
        if (!res.ok) {
            setReport(null);
            setError(data.error || "Could not load the report.");
            return;
        }
        setReport(data);
    }

    return (
        <main style={{ maxWidth: 880, margin: "40px auto", fontFamily: "Georgia, serif", color: "#241c0a", padding: 16 }}>
            <h1>Owner activity</h1>
            <p>Private to the owner session. Aggregates leave out owner and tester rows unless that filter is on. Unverified device rows stay out of the totals unless that filter is on.</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
                <label>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
                <label>To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
                <label>Member <input value={member} onChange={(e) => setMember(e.target.value)} placeholder="verified email" /></label>
                <label><input type="checkbox" checked={testers} onChange={(e) => setTesters(e.target.checked)} /> Include owner and testers</label>
                <label><input type="checkbox" checked={unverified} onChange={(e) => setUnverified(e.target.checked)} /> Show a separate unverified tally. Totals stay verified members only.</label>
                <button type="button" onClick={load}>Load</button>
            </div>
            {error ? <p>{error} Use the normal sign-in page. This page does not sign anyone out.</p> : null}
            {report?.coverage ? (
                <>
                    <h2>Coverage</h2>
                    <p>Verified events in this scan: {report.coverage.verifiedEvents}. Unverified device events in this scan: {report.coverage.unverifiedEvents}. Unverified rows are not inside the totals below.</p>
                    {report.scan ? <p>Scan cap {report.scan.cap}. {report.scan.complete ? "This scan reached the end of the matching rows." : "This scan stopped at the cap, so the totals are not a complete history."}</p> : null}
                    {report.unverifiedSummary?.shown ? <p>Separate unverified tally (not added into the totals): {report.unverifiedSummary.events} events, {report.unverifiedSummary.playStarts} play starts, {report.unverifiedSummary.chatTurns} chat turns.</p> : null}
                    <p>{report.coverage.gap}</p>
                    <p>{report.coverage.legacyNote}</p>
                    {report.legacy ? <p>{report.legacy.label} Chats in this sample: {report.legacy.chatSessionsSample ?? "—"}. Favorites in this sample: {report.legacy.favoritesSample ?? "—"}.</p> : null}
                    <h2>Totals</h2>
                    <ul>
                        {Object.entries(report.totals || {}).map(([key, value]) => <li key={key}>{key}: {value}</li>)}
                    </ul>
                    <h2>Top 5 plays</h2>
                    <ul>{(report.top5 || []).map((row) => <li key={row.slug}>{row.rank}. {row.slug} — {row.starts} starts, {row.listenedSeconds}s listened, {row.finishes} finishes</li>)}</ul>
                    <h2>Next-day return, mature Toronto days only</h2>
                    <ul>{(report.cohorts || []).map((row) => <li key={row.day}>{row.day}: {row.starts} starters, {row.returnedNextDay} back the next day</li>)}</ul>
                    <p>{report.lastScreenNote}</p>
                    <ul>{(report.lastScreens || []).map((row) => <li key={row.memberEmail}>{row.memberEmail}: {row.screen}</li>)}</ul>
                    <h2>Member timeline</h2>
                    <ul>{(report.timeline || []).map((row, index) => <li key={index}>{row.at} {row.event} {row.slug || row.code || row.screen || ""}</li>)}</ul>
                </>
            ) : null}
        </main>
    );
}
