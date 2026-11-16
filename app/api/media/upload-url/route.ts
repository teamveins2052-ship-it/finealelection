import { apiError } from "@/lib/http";
import { UploadUrlInput } from "@/lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const SECRET = process.env.SUPABASE_SECRET_KEY ?? "";

/**
 * P-API-03: a one-time signed upload URL for the Supabase Storage bucket "media". The object
 * path is bound to the caller's own NIAT ID (nominees/<niatId>/…), so a nominee can only ever
 * upload into their own folder — the same check the nominee/post rules make on the URL.
 */
export async function POST(req: Request) {
  if (!SUPABASE_URL || !SECRET) return apiError(503, "uploads_disabled", "Uploads aren't configured yet. Ask the election committee.");
  const [{ verifyAccessToken }, { db }, { rateLimit }] = await Promise.all([
    import("@/functions/src/lib/auth"),
    import("@/functions/src/lib/store"),
    import("@/functions/src/auth/guards"),
  ]);
  const bearer = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  let token;
  try {
    if (!bearer) throw new Error("no token");
    token = await verifyAccessToken(bearer);
  } catch {
    return apiError(401, "unauthorized", "Sign in again to upload.");
  }
  if (!token.email || !token.email_verified) return apiError(401, "unauthorized", "Sign in again to upload.");
  const mfaOk = typeof token.mfa === "number" && token.mfa === token.auth_time;

  const input = UploadUrlInput.safeParse(await req.json().catch(() => ({})));
  if (!input.success) return apiError(400, "invalid_input", input.error.issues[0]?.message ?? "Invalid upload");

  const niatId = new URL(req.url).searchParams.get("niatId") ?? "";
  const student = niatId ? (await db.doc(`students/${niatId}`).get()).data() : undefined;
  if (!student || student.email !== token.email || student.status !== "active" || student.isNominee !== true) {
    return apiError(403, "forbidden", "Only nominees can upload.");
  }
  if (!mfaOk) {
    const settings = (await db.doc("settings/election").get()).data();
    if (settings?.requireStudentMfa !== false || student.mfaEnabled === true) return apiError(403, "mfa_required", "Finish 2-step verification first.");
  }
  try {
    await rateLimit(`upload_${niatId}`, 30, 3600);
  } catch {
    return apiError(429, "rate_limited", "Upload limit reached. Try later.");
  }

  const { kind, contentType } = input.data;
  const ext = contentType === "video/mp4" ? "mp4" : contentType.split("/")[1];
  const folder = kind === "avatar" ? "avatar" : kind === "story" ? "stories" : "posts";
  const key = `nominees/${niatId}/${folder}/${crypto.randomUUID()}.${ext}`;

  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/upload/sign/media/${key}`, {
    method: "POST",
    headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}`, "content-type": "application/json" },
    body: "{}",
  });
  const signed = res.ok ? ((await res.json()) as { url?: string }) : null;
  if (!signed?.url) {
    console.error("[upload-url] sign failed", { status: res.status });
    return apiError(503, "upload_failed", "Couldn't start the upload. Try again.");
  }
  return Response.json({
    uploadUrl: `${SUPABASE_URL}/storage/v1${signed.url}`,
    headers: { "content-type": contentType, "x-upsert": "false" },
    publicUrl: `${SUPABASE_URL}/storage/v1/object/public/media/${key}`,
  });
}
