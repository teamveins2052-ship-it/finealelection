import { NextResponse } from "next/server";

/**
 * GET /api/health — deployment self-check. Shows WHICH settings are present and whether the
 * database answers; never shows values. Use it right after deploying to spot a missing env var.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REQUIRED = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_DATABASE_URL",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_SERVICE_ACCOUNT_B64",
  "DATABASE_URL",
  "MFA_ENCRYPTION_KEY",
  "APP_URL",
] as const;
const OPTIONAL = ["BREVO_API_KEY", "BREVO_API_KEY_2", "BREVO_API_KEY_3", "EMAIL_FROM", "CRON_SECRET"] as const;

export async function GET() {
  const settings = Object.fromEntries([...REQUIRED, ...OPTIONAL].map((k) => [k, !!process.env[k]?.trim()]));
  const missing = REQUIRED.filter((k) => !settings[k]);

  const problems: string[] = [];
  if (process.env.NEXT_PUBLIC_USE_EMULATORS === "true" || process.env.USE_FIREBASE_EMULATORS === "true") {
    problems.push("Emulator mode is ON — set NEXT_PUBLIC_USE_EMULATORS and USE_FIREBASE_EMULATORS to false.");
  }
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64?.trim();
  if (b64) {
    try {
      const key = JSON.parse(Buffer.from(b64, "base64").toString("utf8")) as { project_id?: string; private_key?: string };
      if (!key.private_key) problems.push("FIREBASE_SERVICE_ACCOUNT_B64 decodes but has no private_key.");
      if (key.project_id !== process.env.FIREBASE_PROJECT_ID) problems.push("Service account is for a different project than FIREBASE_PROJECT_ID.");
    } catch {
      problems.push("FIREBASE_SERVICE_ACCOUNT_B64 is not valid base64 JSON (copy the whole value, no quotes).");
    }
  }
  const mfa = process.env.MFA_ENCRYPTION_KEY?.trim();
  if (mfa && Buffer.from(mfa, "base64").length !== 32) problems.push("MFA_ENCRYPTION_KEY must be 32 bytes (base64).");

  let database = "skipped (settings missing)";
  if (!missing.length && !problems.length) {
    try {
      const { db } = await import("@/functions/src/lib/admin");
      const s = await db.doc("settings/election").get();
      database = s.exists ? "ok" : "connected, but settings/election not found";
    } catch (e) {
      database = `error: ${e instanceof Error ? e.message.split("\n")[0]!.slice(0, 160) : "unknown"}`;
    }
  }

  const healthy = !missing.length && !problems.length && database === "ok";
  return NextResponse.json(
    { healthy, missing, problems, database, settings },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
