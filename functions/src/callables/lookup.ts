import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, callOpts } from "../lib/admin";
import { rateLimit, verifyTurnstile } from "../auth/guards";
import { CheckEmailInput, DirectoryEntrySchema, LookupInput } from "../schema";

/**
 * Pre-login lookup (P-API-01), run inside Cloud Functions so no service-account key file is
 * ever needed (Google's default org policy blocks key creation, and keys are a leak risk).
 * Anonymous callers: Turnstile + per-IP and per-ID rate limits; masked fields only.
 */
const NOT_FOUND = "We couldn't find that NIAT ID. Check for typos or request to be added.";

export const lookupStudent = onCall(callOpts, async (req) => {
  const data = (req.data ?? {}) as { niatId?: string; turnstileToken?: string };
  const input = LookupInput.safeParse({ niatId: data.niatId });
  if (!input.success) throw new HttpsError("invalid-argument", "That doesn't look like a NIAT ID.");
  const { niatId } = input.data;
  const ip = req.rawRequest.ip ?? "unknown";
  await verifyTurnstile(String(data.turnstileToken ?? ""), ip);
  await rateLimit(`dir_ip_${ip}`, 10, 60);
  await rateLimit(`dir_id_${niatId}`, 5, 600);

  const snap = await db.doc(`directory/${niatId}`).get();
  // Same answer for "missing" and "disabled", so the endpoint can't confirm who exists.
  if (!snap.exists || snap.get("status") === "disabled") throw new HttpsError("not-found", NOT_FOUND);
  const entry = DirectoryEntrySchema.safeParse(snap.data());
  if (!entry.success) throw new HttpsError("internal", "This record needs fixing. Contact the election committee.");
  return { niatId, ...entry.data };
});

/** MASTERPROMPT §6.2: compare the typed email server-side; answer only { match }. */
export const checkStudentEmail = onCall(callOpts, async (req) => {
  const id = LookupInput.safeParse({ niatId: (req.data as { niatId?: string })?.niatId });
  const body = CheckEmailInput.safeParse({ email: (req.data as { email?: string })?.email });
  if (!id.success || !body.success) throw new HttpsError("invalid-argument", "Enter a valid email address.");
  const ip = req.rawRequest.ip ?? "unknown";
  await rateLimit(`chk_ip_${ip}`, 10, 600);
  await rateLimit(`chk_id_${id.data.niatId}`, 5, 600);

  const s = await db.doc(`students/${id.data.niatId}`).get();
  return { match: s.exists && s.get("status") === "active" && s.get("email") === body.data.email };
});
