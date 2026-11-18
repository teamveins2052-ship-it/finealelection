import { z } from "zod";
import { onCall, HttpsError } from "../lib/callable";
import { db, callOpts } from "../lib/admin";
import { rateLimit, verifyTurnstile } from "../auth/guards";
import { APP_URL, sendEmail } from "../lib/helpers";
import { esc } from "../lib/mailer";
import { Email, LookupInput } from "../schema";

/**
 * Email sign-in link (replaces Firebase's email-link sign-in). Supabase generates the one-time
 * link (admin API) and we send it through Brevo, so the low built-in Supabase email limit
 * never blocks students. Only registered, active students (email must match their NIAT ID)
 * and admins can get a link; the answer is the same either way, so it can't probe who exists.
 */
const SUPABASE_URL = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const SECRET = process.env.SUPABASE_SECRET_KEY ?? "";

const Input = z.object({
  email: Email,
  niatId: LookupInput.shape.niatId.optional(),
  next: z.enum(["student", "admin"]).default("student"),
  turnstileToken: z.string().max(4096).optional(),
  redirectTo: z.string().url().optional(),
});

async function admin(path: string, body: unknown) {
  return fetch(`${SUPABASE_URL}/auth/v1/admin/${path}`, {
    method: "POST",
    headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export const sendLoginLink = onCall(callOpts, async (req) => {
  const input = Input.safeParse(req.data);
  if (!input.success) throw new HttpsError("invalid-argument", "Enter a valid email address.");
  const { email, niatId, next } = input.data;
  const ip = req.rawRequest.ip ?? "unknown";
  await verifyTurnstile(String(input.data.turnstileToken ?? ""), ip);
  await rateLimit(`link_ip_${ip}`, 10, 600);
  await rateLimit(`link_email_${email}`, 4, 600);

  let allowed = false;
  if (next === "admin") {
    allowed = (await db.doc(`admins/${email}`).get()).exists;
  } else if (niatId) {
    const s = await db.doc(`students/${niatId}`).get();
    allowed = s.exists && s.get("status") === "active" && s.get("email") === email;
  }
  // Same response whether or not the address is registered (P-API-01).
  if (!allowed) return { sent: true };

  // Make sure an auth user exists (no password; identity is proven only by clicking the link).
  await admin("users", { email, email_confirm: true });
  let redirectTarget = `${APP_URL}/auth/callback`;
  if (input.data.redirectTo) {
    try {
      const u = new URL(input.data.redirectTo);
      if (u.pathname === "/auth/callback") redirectTarget = input.data.redirectTo;
    } catch {
      // ignore invalid URL and keep default
    }
  }
  const res = await admin("generate_link", { type: "magiclink", email, redirect_to: redirectTarget });
  const link = res.ok ? ((await res.json()) as { action_link?: string; properties?: { action_link?: string } }) : null;
  const url = link?.action_link ?? link?.properties?.action_link;
  if (!url) {
    console.error("[login] generate_link failed", { status: res.status });
    throw new HttpsError("unavailable", "Couldn't create a sign-in link right now. Try Google sign-in or try again shortly.");
  }

  const html = `<!doctype html><html><body style="margin:0;background:#F2F1EC;font-family:Arial,Helvetica,sans-serif;color:#111">
<table role="presentation" width="100%" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:520px;background:#FBFAF7;border:2px solid #111;border-radius:16px;padding:28px"><tr><td>
<div style="font-weight:900;font-size:14px;letter-spacing:.04em">✓ NIAT ELECTIONS '26</div>
<h1 style="font-size:26px;margin:18px 0 12px;text-transform:uppercase">Your sign-in link</h1>
<p style="font-size:16px;line-height:1.5">Tap the button to sign in${niatId ? ` as <b>${esc(niatId)}</b>` : ""}. The link works once and expires in 1 hour.</p>
<p style="margin:22px 0"><a href="${esc(url)}" style="display:inline-block;background:#111;color:#FBFAF7;text-decoration:none;font-weight:800;text-transform:uppercase;padding:14px 26px;border-radius:999px">Sign in</a></p>
<p style="font-size:12px;color:#5C5B56">Didn't ask for this? Ignore this email — nobody can sign in without it.</p>
</td></tr></table></td></tr></table></body></html>`;
  const r = await sendEmail(email, "Your NIAT Elections sign-in link", html);
  if (r === "full") throw new HttpsError("resource-exhausted", "Email limit reached for today. Use Google sign-in instead.");
  if (r === "failed") throw new HttpsError("unavailable", "Couldn't send the email. Check the address or use Google sign-in.");
  return { sent: true };
});
