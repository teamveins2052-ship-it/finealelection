import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";

/**
 * Scheduled housekeeping (Vercel Cron and/or a free external pinger like cron-job.org).
 * Requires `Authorization: Bearer <CRON_SECRET>` — Vercel Cron sends this automatically.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || got.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(secret));
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { runTick } = await import("@/functions/src/http");
  const r = await runTick(true);
  return NextResponse.json(r, { headers: { "Cache-Control": "no-store" } });
}
