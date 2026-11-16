import { after, NextResponse, type NextRequest } from "next/server";

/**
 * Browser document reads/writes: POST /api/db  body = DbRequest (functions/src/rules.ts).
 * The browser can't touch the database directly (RLS on, no policies); every request is
 * checked here against the same rules the old firestore.rules enforced.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BODY = 200_000;

export async function POST(req: NextRequest) {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) {
    return NextResponse.json({ error: { status: "invalid-argument", message: "Request too large." } }, { status: 413 });
  }
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: { status: "invalid-argument", message: "Bad request." } }, { status: 400 });
  try {
    const [{ handleDb }, { verifyAccessToken, TokenError }, { HttpsError }, { runTick }] = await Promise.all([
      import("@/functions/src/rules"),
      import("@/functions/src/lib/auth"),
      import("@/functions/src/lib/callable"),
      import("@/functions/src/tick"),
    ]);
    const bearer = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
    let token = null;
    if (bearer) {
      try {
        token = await verifyAccessToken(bearer);
      } catch (e) {
        if (e instanceof TokenError) return NextResponse.json({ error: { status: "unauthenticated", message: "Your sign-in expired. Sign in again." } }, { status: 401 });
        throw e;
      }
    }
    try {
      const result = await handleDb(body, token);
      if ((body as { op?: string }).op !== "get" && (body as { op?: string }).op !== "query") {
        after(() => runTick().catch((e: unknown) => console.error("[tick]", e instanceof Error ? e.message : e)));
      }
      return NextResponse.json({ result }, { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      if (e instanceof HttpsError) {
        const status = e.code === "permission-denied" ? 403 : e.code === "not-found" ? 404 : e.code === "unauthenticated" ? 401 : 400;
        return NextResponse.json({ error: { status: e.code, message: e.message } }, { status });
      }
      if (e && typeof e === "object" && "issues" in e) {
        return NextResponse.json({ error: { status: "invalid-argument", message: "Some details were invalid." } }, { status: 400 });
      }
      throw e;
    }
  } catch (err) {
    console.error("[api/db:fatal]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: { status: "internal", message: "Something went wrong. Try again in a moment." } }, { status: 500 });
  }
}
