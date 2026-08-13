// Sends the GAP Method purchase magic-link email. Aug 13, per Rachael's
// Kajabi Purchase Webhook architecture request: the buyer's email/first name
// come from the Kajabi purchase webhook (never re-entered by the buyer), and
// this turns that into a clickable link back into their own, already-linked
// Gap Method session -- via an opaque, single-use token, never the email
// itself, in the URL.
//
// Uses Resend (https://resend.com) -- lightweight, well-documented, generous
// free tier, no SDK dependency required (plain fetch to their HTTP API).
// TODO(Rachael): set these two env vars in Vercel before this can actually
// send anything:
//   RESEND_API_KEY    - from resend.com/api-keys, after verifying a sending
//                        domain (e.g. mail.rachaelsbutterflyeffect.com)
//   RESEND_FROM_EMAIL - the verified "from" address, e.g.
//                        "The Revolutionary Healer <hello@rachaelsbutterflyeffect.com>"
// Also set APP_BASE_URL to your real production domain once you have one --
// defaults to the current Vercel preview URL otherwise.
// Until RESEND_API_KEY / RESEND_FROM_EMAIL are both set, this function logs a
// warning and no-ops instead of throwing, so a missing email provider never
// breaks the purchase webhook itself.

function appBaseUrl() {
  return (
    process.env.APP_BASE_URL ||
    "https://revolutionary-git-11f391-rachaelsbutterflyeffect-6807s-projects.vercel.app"
  );
}

export async function sendGapMethodMagicLink({ email, firstName, sessionToken }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    console.warn(
      "sendGapMethodMagicLink: RESEND_API_KEY / RESEND_FROM_EMAIL not set -- skipping send. " +
        "Set both in Vercel to actually email the Gap Method magic link."
    );
    return { skipped: true };
  }
  if (!email || !sessionToken) return { skipped: true };

  const link = `${appBaseUrl()}/gap-method.html?t=${encodeURIComponent(sessionToken)}`;
  const greeting = firstName ? `Hi ${firstName},` : "Hi,";
  const subject = "Your GAP Method is ready";
  const text = `${greeting}

Thanks for grabbing The GAP Method! Tap the link below to start your personalized 3-step diagnostic -- it's already linked to your purchase, so there's nothing else to enter.

${link}

This link is just for you, so please don't share it.

-- The Revolutionary Healer`;
  const html = `<p>${greeting}</p><p>Thanks for grabbing The GAP Method! Tap the button below to start your personalized 3-step diagnostic -- it's already linked to your purchase, so there's nothing else to enter.</p><p><a href="${link}" style="display:inline-block;padding:14px 28px;background:#CFA646;color:#121110;text-decoration:none;border-radius:6px;font-weight:bold;">Start The GAP Method</a></p><p style="color:#8C8272;font-size:13px;">This link is just for you, so please don't share it.</p><p>-- The Revolutionary Healer</p>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: email, subject, text, html }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend send failed: ${res.status} ${body}`);
  }

  return { skipped: false };
}

// Aug 13 (Rachael's Kajabi-linked landing page request): password-reset
// email for the app's own sign-in system. Same Resend setup as
// sendGapMethodMagicLink above -- logs a warning and no-ops until
// RESEND_API_KEY / RESEND_FROM_EMAIL are set in Vercel.
export async function sendPasswordResetEmail({ email, firstName, resetToken }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    console.warn(
      "sendPasswordResetEmail: RESEND_API_KEY / RESEND_FROM_EMAIL not set -- skipping send. " +
      "Set both in Vercel to actually email password reset links."
    );
    return { skipped: true };
  }
  if (!email || !resetToken) return { skipped: true };

  const link = `${appBaseUrl()}/reset-password?t=${encodeURIComponent(resetToken)}`;
  const greeting = firstName ? `Hi ${firstName},` : "Hi,";
  const subject = "Reset your Revolutionary Healer password";
  const text = `${greeting}

We got a request to reset your Revolutionary Healer app password. Tap the link below to choose a new one:

${link}

This link expires in 1 hour. If you didn't request this, you can safely ignore this email.

-- The Revolutionary Healer`;
  const html = `<p>${greeting}</p><p>We got a request to reset your Revolutionary Healer app password. Tap the button below to choose a new one:</p><p><a href="${link}" style="display:inline-block;padding:14px 28px;background:#CFA646;color:#121110;text-decoration:none;border-radius:6px;font-weight:bold;">Reset Password</a></p><p style="color:#8C8272;font-size:13px;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p><p>-- The Revolutionary Healer</p>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: email, subject, text, html }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend send failed: ${res.status} ${body}`);
  }

  return { skipped: false };
}
