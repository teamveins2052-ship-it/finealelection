import { after, NextResponse, type NextRequest } from "next/server";
import { handleCallable, runTick } from "@/functions/src/http";

/**
 * Server actions over HTTP for free hosting (no Cloud Functions / Blaze plan).
 * POST /api/fn/<callableName>  body: { data }  →  { result } | { error: { status, message } }
 * Guards, rate limits and Zod validation run inside each callable (AGENTS §5.8).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NAME = /^[A-Za-z]{2,40}$/;
const MAX_BODY = 2_000_000; // student import sends up to ~3,000 rows

export async function POST(req: NextRequest, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  if (!NAME.test(name)) return NextResponse.json({ error: { status: "not-found", message: "Unknown action." } }, { status: 404 });

  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BODY) return NextResponse.json({ error: { status: "invalid-argument", message: "Request too large." } }, { status: 413 });

  let data: unknown = {};
  try {
    const body = (await req.json()) as { data?: unknown };
    data = body?.data ?? {};
  } catch {
    return NextResponse.json({ error: { status: "invalid-argument", message: "Bad request." } }, { status: 400 });
  }

  // First hop only — the hosting proxy appends the real client IP to x-forwarded-for.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const r = await handleCallable(name, data, { authorization: req.headers.get("authorization"), appCheck: req.headers.get("x-firebase-appcheck") }, ip);

  // Opportunistic housekeeping after the response (vote sweep, settings mirror, email queue).
  // The Firestore lease inside runTick keeps it to once a minute across all instances.
  after(() => runTick().catch((e: unknown) => console.error("[tick]", e instanceof Error ? e.message : e)));

  return NextResponse.json(r.body, { status: r.status, headers: { "Cache-Control": "no-store" } });
}
