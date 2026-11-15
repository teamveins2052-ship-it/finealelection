import { AwsClient } from "aws4fetch";
import { AuthError, verifyFirebaseToken } from "@/lib/auth/verify-token";
import { getDocument } from "@/lib/firebase/rest";
import { apiError } from "@/lib/http";
import { limit } from "@/lib/ratelimit";
import { UploadUrlInput } from "@/lib/schema";

export const dynamic = "force-dynamic";

const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL } = process.env;

/** P-API-03 / P-R2-01: presigned PUT, key bound to the caller's NIAT ID, type + size signed. */
export async function POST(req: Request) {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET || !R2_PUBLIC_URL) {
    return apiError(503, "uploads_disabled", "Uploads aren't configured yet. Ask the election committee.");
  }
  let email: string;
  let mfaOk = false;
  try {
    const claims = await verifyFirebaseToken(req.headers.get("authorization"));
    email = claims.email;
    // Same 2-step proof the rules check: claim `mfa` must equal this sign-in's auth_time.
    mfaOk = typeof claims.mfa === "number" && claims.mfa === claims.auth_time;
  } catch (e) {
    const err = e instanceof AuthError ? e : new AuthError(401, "Invalid token");
    return apiError(err.status, "unauthorized", "Sign in again to upload.");
  }
  if (!mfaOk) {
    const settings = await getDocument("settings/election");
    if (settings?.requireStudentMfa !== false) return apiError(403, "mfa_required", "Finish 2-step verification first.");
  }
  const input = UploadUrlInput.safeParse(await req.json().catch(() => ({})));
  if (!input.success) return apiError(400, "invalid_input", input.error.issues[0]?.message ?? "Invalid upload");

  const niatId = new URL(req.url).searchParams.get("niatId") ?? "";
  const student = niatId ? await getDocument(`students/${niatId}`) : null;
  if (!student || student.email !== email || student.status !== "active" || student.isNominee !== true) {
    return apiError(403, "forbidden", "Only nominees can upload.");
  }
  // Opted-in students need the code even when 2-step is optional for everyone (P-MFA-05).
  if (!mfaOk && student?.mfaEnabled === true) return apiError(403, "mfa_required", "Finish 2-step verification first.");
  if (!(await limit("upload", niatId, 30, "1 h"))) return apiError(429, "rate_limited", "Upload limit reached. Try later.");

  const { kind, contentType, sizeBytes } = input.data;
  const ext = contentType === "video/mp4" ? "mp4" : contentType.split("/")[1];
  const folder = kind === "avatar" ? "avatar" : kind === "story" ? "stories" : "posts";
  const key = `nominees/${niatId}/${folder}/${crypto.randomUUID()}.${ext}`;

  const r2 = new AwsClient({ accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, service: "s3", region: "auto" });
  const url = new URL(`https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${key}`);
  url.searchParams.set("X-Amz-Expires", "300");
  const signed = await r2.sign(new Request(url, {
    method: "PUT",
    headers: { "content-type": contentType, "content-length": String(sizeBytes) },
  }), { aws: { signQuery: true, allHeaders: true } });

  return Response.json({
    uploadUrl: signed.url,
    headers: { "content-type": contentType },
    publicUrl: `${R2_PUBLIC_URL.replace(/\/$/, "")}/${key}`,
  });
}
