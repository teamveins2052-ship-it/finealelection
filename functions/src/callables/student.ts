import { onCall, HttpsError } from "../lib/callable";
import { FieldValue } from "../lib/store";
import { db, callOpts } from "../lib/admin";
import { audit, rateLimit, requireStudent, verifyTurnstile } from "../auth/guards";
import { electionTimes } from "../lib/helpers";
import { AskQuestionInput, CorrectionRequestInput } from "../schema";

/**
 * Anonymous (P-FN-01): student says their pre-filled details are wrong. Account goes
 * `pending` and login is blocked until an admin resolves it (D-02).
 */
export const requestCorrection = onCall(callOpts, async (req) => {
  const input = CorrectionRequestInput.parse(req.data);
  const ip = req.rawRequest.ip ?? "unknown";
  await verifyTurnstile(input.turnstileToken, ip);
  await rateLimit(`corr_ip_${ip}`, 10, 3600);
  await rateLimit(`corr_${input.niatId}`, 3, 3600);

  const sRef = db.doc(`students/${input.niatId}`);
  const s = await sRef.get();
  // Same message for missing/disabled so the endpoint can't be used to probe IDs (P-API-01).
  if (!s.exists || s.get("status") === "disabled") {
    throw new HttpsError("not-found", "We couldn't find that NIAT ID. Contact the election committee.");
  }

  const open = await db.collection("correctionRequests")
    .where("niatId", "==", input.niatId).where("status", "==", "open").limit(1).get();
  if (!open.empty) return { requestId: open.docs[0].id, alreadyOpen: true };

  const ref = db.collection("correctionRequests").doc();
  const batch = db.batch();
  batch.set(ref, {
    niatId: input.niatId, fields: input.fields, requested: input.requested, note: input.note,
    contactEmail: input.contactEmail, status: "open", createdAt: FieldValue.serverTimestamp(),
  });
  batch.update(sRef, { status: "pending", updatedAt: FieldValue.serverTimestamp() });
  batch.set(db.doc(`directory/${input.niatId}`), { status: "pending" }, { merge: true });
  await batch.commit();
  await audit(input.niatId, "student", "correction_requested", ref.path, { fields: input.fields });
  return { requestId: ref.id, alreadyOpen: false };
});

const BLOCKLIST = /\b(fuck|shit|bitch|bastard|asshole|madarchod|bhenchod|chutiya|gandu)\b/i;

/** P-FN-02: anonymous Q&A. Identity goes only to questionAuthors (voter-admin readable). */
export const askQuestion = onCall(callOpts, async (req) => {
  const me = await requireStudent(req);
  await rateLimit(`ask_${me.niatId}`, 5, 3600);
  const input = AskQuestionInput.parse(req.data);
  if (BLOCKLIST.test(input.text)) throw new HttpsError("invalid-argument", "Please keep questions respectful.");

  const nominee = await db.doc(`nominees/${input.nomineeId}`).get();
  if (!nominee.exists || nominee.get("active") !== true) throw new HttpsError("not-found", "Nominee not found.");
  const { closesAt } = await electionTimes();
  if (Date.now() >= closesAt) throw new HttpsError("failed-precondition", "Q&A closed with voting.");

  const qRef = db.collection("questions").doc();
  const batch = db.batch();
  batch.set(qRef, {
    nomineeId: input.nomineeId, text: input.text, answer: null, answeredAt: null, hidden: false,
    createdAt: FieldValue.serverTimestamp(),
  });
  batch.set(db.doc(`questionAuthors/${qRef.id}`), { niatId: me.niatId, createdAt: FieldValue.serverTimestamp() });
  await batch.commit();
  return { questionId: qRef.id };
});
