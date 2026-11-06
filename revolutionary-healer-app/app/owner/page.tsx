"use client";

import { useState } from "react";
import styles from "./owner.module.css";

type Report = {
    ready?: boolean;
    error?: string;
    code?: string;
    coverage?: { verifiedEvents: number; unverifiedEvents: number; gap: string; legacyNote: string };
    totals?: Record<string, number> | null;
    top5?: { rank: number; slug: string; starts: number; listenedSeconds: number; finishes: number }[] | null;
    cohorts?: { day: string; starts: number; returnedNextDay: number }[] | null;
    lastScreens?: { memberEmail: string; screen: string; at: string }[];
    lastScreenNote?: string;
    timeline?: { at: string; event: string; slug?: string; code?: string; screen?: string }[];
    scan?: { complete: boolean; rowsRead: number; nextCursor?: string | null };
    unverifiedSummary?: { shown?: boolean; events?: number; playStarts?: number; chatTurns?: number };
    legacy?: { label?: string; chatSessionsSample?: number; favoritesSample?: number };
};

function defaultRange() {
    const end = new Date();
    const start = new Date(end.getTime() - 13 * 86400000);
    const day = (value: Date) => value.toISOString().slice(0, 10);
    return { from: day(start), to: day(end) };
}

export default function OwnerActivityPage() {
    const initial = defaultRange();
    const [from, setFrom] = useState(initial.from);
    const [to, setTo] = useState(initial.to);
    const [member, setMember] = useState("");
    const [testers, setTesters] = useState(false);
    const [unverified, setUnverified] = useState(false);
    const [report, setReport] = useState<Report | null>(null);
    const [error, setError] = useState("");
    const [reading, setReading] = useState(false);

    async function load() {
        setError("");
        setReading(true);
        setReport(null);
        let cursor = "";
        let pages = 0;
        try {
            while (pages < 500) {
                pages += 1;
                const res = await fetch("/api/owner/activity", {
                    method: "POST",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ from, to, member, testers, unverified, cursor }),
                });
                const data = await res.json();
                if (!res.ok) {
                    setReport(null);
                    setError(data.error || "Could not load the report.");
                    return;
                }
                setReport(data);
                if (data.ready === true && data.scan?.complete === true) return;
                cursor = data.scan?.nextCursor || "";
                if (!cursor) {
                    setError("The report stopped before every matching row was read. Totals are not shown.");
                    setReport(null);
                    return;
                }
                await new Promise((resolve) => setTimeout(resolve, 300));
            }
            setError("The date range is still unread after 500 pages. Totals are not shown. Narrow the dates and load again.");
            setReport(null);
        } finally {
            setReading(false);
        }
    }

    const ready = report?.ready === true && report.scan?.complete === true;

    return (
        <main className={styles.page}>
            <div className={styles.sheet}>
            <h1>Owner activity</h1>
            <p>Private to the owner session. Totals, top 5, and next-day cohorts appear only after every matching row in the date range has been read. Owner and tester rows stay out of those totals unless that filter is on. Unverified rows stay in a separate tally.</p>
            <div className={styles.controls}>
                <label>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
                <label>To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
                <label>Member <input value={member} onChange={(e) => setMember(e.target.value)} placeholder="verified email" /></label>
                <label><input type="checkbox" checked={testers} onChange={(e) => setTesters(e.target.checked)} /> Include owner and testers</label>
                <label><input type="checkbox" checked={unverified} onChange={(e) => setUnverified(e.target.checked)} /> Show a separate unverified tally. Totals stay verified members only.</label>
                <button type="button" onClick={load} disabled={reading}>{reading ? "Reading…" : "Load"}</button>
            </div>
            {error ? <p>{error} Use the normal sign-in page. This page does not sign anyone out.</p> : null}
            {reading && report?.scan ? <p>Read {report.scan.rowsRead} rows so far. Metrics stay hidden until this range is complete.</p> : null}
            {ready && report?.coverage ? (
                <>
                    <h2>Coverage</h2>
                    <p>Verified events in this range: {report.coverage.verifiedEvents}. Unverified device events in this range: {report.coverage.unverifiedEvents}. Unverified rows are not inside the totals below. Every matching row in the date range was read.</p>
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
            </div>
        </main>
    );
}
