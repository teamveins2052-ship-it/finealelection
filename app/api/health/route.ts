import { NextResponse } from "next/server";

/**
 * GET /api/health — deployment self-check. Shows WHICH settings are present and whether the
 * database answers; never shows values. Use it right after deploying to spot a missing env var.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_DB_URL",
  "MFA_ENCRYPTION_KEY",
  "APP_URL",
] as const;
const OPTIONAL = ["BREVO_API_KEY", "BREVO_API_KEY_2", "BREVO_API_KEY_3", "EMAIL_FROM", "CRON_SECRET"] as const;

export async function GET() {
  const settings = Object.fromEntries([...REQUIRED, ...OPTIONAL].map((k) => [k, !!process.env[k]?.trim()]));
  const missing = REQUIRED.filter((k) => !settings[k]);

  const problems: string[] = [];
  const url = process.env.SUPABASE_URL?.trim();
  if (url && process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() !== url) problems.push("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_URL must be the same project URL.");
  if (process.env.SUPABASE_SECRET_KEY && !process.env.SUPABASE_SECRET_KEY.startsWith("sb_secret_")) problems.push("SUPABASE_SECRET_KEY should be the secret key (starts with sb_secret_).");
  if (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.startsWith("sb_secret_")) problems.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be the PUBLISHABLE key, never the secret one.");
  const mfa = process.env.MFA_ENCRYPTION_KEY?.trim();
  if (mfa && Buffer.from(mfa, "base64").length !== 32) problems.push("MFA_ENCRYPTION_KEY must be 32 bytes (base64).");

  let database = "skipped (settings missing)";
  if (!missing.length && !problems.length) {
    try {
      const { db } = await import("@/functions/src/lib/store");
      const s = await db.doc("settings/election").get();
      database = s.exists ? "ok" : "connected, but settings/election not found";
    } catch (e) {
      database = `error: ${e instanceof Error ? e.message.split("\n")[0]!.slice(0, 160) : "unknown"}`;
    }
  }

  const healthy = !missing.length && !problems.length && database === "ok";
  return NextResponse.json(
    { healthy, missing, problems, database, node: process.version, settings },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
