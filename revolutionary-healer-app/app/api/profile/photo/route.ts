import { NextRequest, NextResponse } from "next/server";
import { getMemberByEmail, normalizeEmail } from "@/lib/airtable";

// Aug 13 (Rachael's Profile page request): lets a member upload, replace, or
// remove their profile photo. Airtable has no direct-binary-upload support
// via the `airtable` npm client, so this calls Airtable's REST
// "Upload attachment" endpoint directly (base64, <=5MB, single request --
// see https://airtable.com/developers/web/api/upload-attachment). The
// Members table's profile_photo field is a single-attachment field; every
// write here replaces it outright rather than appending.
// (touch 1786667974847 to force redeploy)

const MAX_BYTES = 5 * 1024 * 1024;

// Oct 15 2026: the Members table + profile_photo field ids differ per Airtable base (the TEST base is a
// copy with new ids). Env overrides let a preview point at its own base; the defaults are production's
// ids, so production behaviour is byte-for-byte unchanged when these are not set.
const MEMBERS_TABLE_ID = () => process.env.AIRTABLE_MEMBERS_TABLE_ID || "tblst1afWTBfy5OQC";
const PHOTO_FIELD_ID = () => process.env.AIRTABLE_PHOTO_FIELD_ID || "flda1tG8E0chadCwk";

function airtableCreds() {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!apiKey || !baseId) {
    throw new Error("AIRTABLE_API_KEY / AIRTABLE_BASE_ID not configured.");
  }
  return { apiKey, baseId };
}

export async function GET(req: NextRequest) {
  try {
    const email = normalizeEmail(String(req.nextUrl.searchParams.get("email") ?? ""));
    if (!email) return NextResponse.json({ error: "Missing email." }, { status: 400 });

    const member = await getMemberByEmail(email);
    if (!member) return NextResponse.json({ error: "Member not found." }, { status: 404 });

    const photo = (member.fields as any).profile_photo;
    const url = Array.isArray(photo) && photo.length && photo[photo.length - 1]?.url ? photo[photo.length - 1].url : null; // newest
    return NextResponse.json({ url });
  } catch (err) {
    console.error("GET /api/profile/photo failed", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = normalizeEmail(String(body?.email ?? ""));
    const contentType = String(body?.contentType ?? "");
    const filename = String(body?.filename ?? "photo.jpg");
    const fileBase64 = String(body?.fileBase64 ?? "");

    if (!email || !contentType || !fileBase64) {
      return NextResponse.json({ error: "Missing email, contentType, or file." }, { status: 400 });
    }
    if (!contentType.startsWith("image/")) {
      return NextResponse.json({ error: "Only image files are supported." }, { status: 400 });
    }
    const approxBytes = Math.ceil((fileBase64.length * 3) / 4);
    if (approxBytes > MAX_BYTES) {
      return NextResponse.json({ error: "Photo is too large. Please use an image under 5MB." }, { status: 400 });
    }

    const member = await getMemberByEmail(email);
    if (!member) return NextResponse.json({ error: "Member not found." }, { status: 404 });

    const { apiKey, baseId } = airtableCreds();
    const res = await fetch(
      `https://content.airtable.com/v0/${baseId}/${member.id}/${PHOTO_FIELD_ID()}/uploadAttachment`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ contentType, file: fileBase64, filename }),
      }
    );

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error("Airtable uploadAttachment failed", res.status, errBody);
      return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 502 });
    }

    const data = await res.json();
    const photo = data?.fields?.[PHOTO_FIELD_ID()] ?? data?.fields?.profile_photo;
    // uploadAttachment APPENDS: a new photo used to land behind the old one, which kept showing. Keep only
    // the newest attachment (best effort) and return its URL.
    const list = Array.isArray(photo) ? photo : [];
    const newest = list.length ? list[list.length - 1] : null;
    if (list.length > 1 && newest?.id) {
      await fetch(`https://api.airtable.com/v0/${baseId}/${MEMBERS_TABLE_ID()}/${member.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fields: { profile_photo: [{ id: newest.id }] } }),
      }).catch((e) => console.error("Airtable keep-newest profile_photo failed", e));
    }
    const url = newest?.url || null;
    return NextResponse.json({ ok: true, url });
  } catch (err) {
    console.error("POST /api/profile/photo failed", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(String(body?.email ?? ""));
    if (!email) return NextResponse.json({ error: "Missing email." }, { status: 400 });

    const member = await getMemberByEmail(email);
    if (!member) return NextResponse.json({ error: "Member not found." }, { status: 404 });

    const { apiKey, baseId } = airtableCreds();
    const res = await fetch(`https://api.airtable.com/v0/${baseId}/${MEMBERS_TABLE_ID()}/${member.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields: { profile_photo: [] } }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error("Airtable clear profile_photo failed", res.status, errBody);
      return NextResponse.json({ error: "Something went wrong removing your photo." }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/profile/photo failed", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
