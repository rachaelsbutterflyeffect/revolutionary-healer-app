import { NextResponse } from "next/server";
import { clearMemberSessionCookie } from "@/lib/memberSession";

export async function POST() {
    const res = NextResponse.json({ ok: true });
    res.headers.set("Set-Cookie", clearMemberSessionCookie(process.env));
    return res;
}
