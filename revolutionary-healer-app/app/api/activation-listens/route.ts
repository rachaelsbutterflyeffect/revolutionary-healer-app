import { NextRequest, NextResponse } from "next/server";
import { postActivationListen } from "@/lib/listening";
import { createAirtableListenStore } from "@/lib/listeningStore";

const store = createAirtableListenStore();

// Per-play listening sessions. Identity comes from the login session cookie.
// A failed write is an error: this route never reports success without a
// stored row, and it never falls back to ActivationCompletions.
export async function POST(req: NextRequest) {
    let body: unknown = null;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
    }
    try {
        const result = await postActivationListen({
            headers: {
                cookie: req.headers.get("cookie"),
                authorization: req.headers.get("authorization"),
            },
            body,
            store,
            now: Date.now(),
            env: process.env,
        });
        return NextResponse.json(result.body, { status: result.status });
    } catch (err) {
        console.error("POST /api/activation-listens failed", err);
        return NextResponse.json(
            { error: "Listening storage is not ready. The play was not recorded.", code: "listen_storage_unavailable" },
            { status: 503 }
        );
    }
}
