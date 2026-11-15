import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, type Timestamp } from "firebase-admin/firestore";
import { db, rtdb, callOpts } from "../lib/admin";
import { audit, requireAdmin, requireVoterAdmin } from "../auth/guards";
import { directoryEntry, electionTimes, emailUniqueOrThrow, refreshEligible } from "../lib/helpers";
import { announcementEmail, correctionEmail, queueEmail, reminderEmail } from "../lib/mailer";
import { mailAccounts } from "../lib/mail-accounts";
import {
  AdminUpdateStudentInput, ImportStudentsInput, IMPORT_HEADER_MAP, NIAT_ID_REGEX, RecountInput, ResolveRequestInput,
  SendRemindersInput, SetNomineeInput, AnnouncementInput, StudentImportRow, VotersQueryInput, deriveBatch, Email, ids,
} from "../schema";

const PhoneField = StudentImportRow.shape.phone;

function normaliseRow(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    const field = IMPORT_HEADER_MAP[k.trim().toLowerCase().replace(/\s+/g, " ")] ?? (k in StudentImportRow.shape ? k : null);
    if (field && v !== "" && v !== null && v !== undefined) out[field] = v;
  }
  return out;
}

/** P-FN-04. Upsert by NIAT ID; never touches status/votes/nominee flags of existing students (DATAMODEL §11). */
export const importStudents = onCall({ ...callOpts, timeoutSeconds: 300, memory: "512MiB" }, async (req) => {
  const admin = await requireAdmin(req);
  const { rows } = ImportStudentsInput.parse(req.data);
  return importRows(rows, admin.email);
});

/**
 * Shared by the admin Import page and the operator script (scripts/seed/import-sheet.ts) so the
 * official workbook goes through exactly the same validation, dedupe and audit either way.
 */
export async function importRows(rows: Array<Record<string, unknown>>, actorEmail: string) {

  const existing = await db.collection("students").get();
  const byId = new Map(existing.docs.map((d) => [d.id, d.data()]));
  const emailOwner = new Map(existing.docs.map((d) => [String(d.get("email")), d.id]));

  const errors: Array<{ row: number; message: string }> = [];
  const warnings: Array<{ row: number; message: string }> = [];
  const seenIds = new Set<string>();
  const seenEmails = new Set<string>();
  const valid: Array<StudentImportRow & { batch: string }> = [];

  rows.forEach((raw, i) => {
    const row = i + 2; // sheet row number (1 = header)
    const n = normaliseRow(raw);
    if (Object.keys(n).length === 0) return; // blank row
    const parsed = StudentImportRow.safeParse(n);
    if (!parsed.success) {
      errors.push({ row, message: parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ") });
      return;
    }
    const r = parsed.data;
    if (seenIds.has(r.niatId)) return void errors.push({ row, message: `Duplicate NIAT ID ${r.niatId}` });
    if (seenEmails.has(r.email)) return void errors.push({ row, message: `Duplicate email ${r.email}` });
    const owner = emailOwner.get(r.email);
    if (owner && owner !== r.niatId) return void errors.push({ row, message: `Email already used by ${owner}` });
    if (!NIAT_ID_REGEX.test(r.niatId)) warnings.push({ row, message: `Unusual NIAT ID format: ${r.niatId}` });
    seenIds.add(r.niatId);
    seenEmails.add(r.email);
    const batch = r.batch ?? deriveBatch(r.niatId);
    if (!/^20\d{2}$/.test(batch)) return void errors.push({ row, message: "Batch missing and not derivable from ID" });
    valid.push({ ...r, batch });
  });

  let created = 0;
  let updated = 0;
  for (let i = 0; i < valid.length; i += 200) {
    const batch = db.batch();
    for (const r of valid.slice(i, i + 200)) {
      const prev = byId.get(r.niatId);
      const base = { niatId: r.niatId, name: r.name, email: r.email, phone: r.phone, admissionNo: r.admissionNo ?? "", batch: r.batch };
      if (prev) {
        batch.update(db.doc(`students/${r.niatId}`), { ...base, updatedAt: FieldValue.serverTimestamp() });
        batch.set(db.doc(`directory/${r.niatId}`), directoryEntry({ ...prev, ...base }));
        updated++;
      } else {
        batch.set(db.doc(`students/${r.niatId}`), {
          ...base, status: "active", isNominee: false, nomineeOf: null, votedPositions: [], votedCount: 0,
          activeSessionId: null, lastLoginAt: null,
          createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
        });
        batch.set(db.doc(`directory/${r.niatId}`), directoryEntry({ ...base, status: "active" }));
        created++;
      }
    }
    await batch.commit();
  }
  await refreshEligible();
  await audit(actorEmail, "admin", "students_imported", "students", {
    created, updated, rejected: errors.length, warnings: warnings.length,
  });
  return { created, updated, errors, warnings };
}

/** D3: admin edits contact details/status. Students can never edit these themselves (D-02). */
export const adminUpdateStudent = onCall(callOpts, async (req) => {
  const admin = await requireAdmin(req);
  const input = AdminUpdateStudentInput.parse(req.data);
  const ref = db.doc(`students/${input.niatId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Student not found.");

  const patch: Record<string, unknown> = {};
  if (input.name) patch.name = input.name;
  if (input.admissionNo) patch.admissionNo = input.admissionNo.toUpperCase();
  if (input.status) patch.status = input.status;
  if (input.email) {
    await emailUniqueOrThrow(input.email, input.niatId);
    patch.email = input.email;
  }
  if (input.phone) {
    const p = PhoneField.safeParse(input.phone);
    if (!p.success) throw new HttpsError("invalid-argument", "Invalid Indian mobile number.");
    patch.phone = p.data;
  }
  if (!Object.keys(patch).length) return { ok: true };
  await ref.update({ ...patch, updatedAt: FieldValue.serverTimestamp() });
  await db.doc(`directory/${input.niatId}`).set(directoryEntry({ ...snap.data(), ...patch }));
  if (input.status) await refreshEligible();
  await audit(admin.email, "admin", "profile_updated", ref.path, { fields: Object.keys(patch) });
  return { ok: true };
});

/** D4 / N1. Ballot is locked once voting opens (D-15, RLSPOLICIES §10). */
export const setNominee = onCall(callOpts, async (req) => {
  const admin = await requireAdmin(req);
  const input = SetNomineeInput.parse(req.data);
  const { opensAt } = await electionTimes();
  if (Date.now() >= opensAt) throw new HttpsError("failed-precondition", "Nominees are locked once voting opens.");

  const nomineeId = ids.nominee(input.positionId, input.niatId);
  await db.runTransaction(async (tx) => {
    const sRef = db.doc(`students/${input.niatId}`);
    const pRef = db.doc(`positions/${input.positionId}`);
    const nRef = db.doc(`nominees/${nomineeId}`);
    const [s, p, n] = await Promise.all([tx.get(sRef), tx.get(pRef), tx.get(nRef)]);
    if (!s.exists) throw new HttpsError("not-found", "Student not found.");
    if (!p.exists) throw new HttpsError("not-found", "Position not found.");

    if (input.active) {
      if (s.get("status") !== "active") throw new HttpsError("failed-precondition", "Student account isn't active.");
      const other = s.get("nomineeOf") as string | null;
      if (s.get("isNominee") === true && other && other !== input.positionId) {
        throw new HttpsError("failed-precondition", `Already a nominee for ${other}. Remove them there first.`);
      }
      if (n.exists && n.get("active") === true) return;
      if (n.exists) tx.update(nRef, { active: true, updatedAt: FieldValue.serverTimestamp() });
      else {
        tx.set(nRef, {
          id: nomineeId, positionId: input.positionId, niatId: input.niatId, name: s.get("name"), batch: s.get("batch"),
          photoUrl: null, bio: "", promises: [], active: true, reactionCounts: { fire: 0, clap: 0 }, postCount: 0,
          hasActiveStory: false, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
        });
      }
      tx.update(sRef, { isNominee: true, nomineeOf: input.positionId, updatedAt: FieldValue.serverTimestamp() });
      tx.update(pRef, { nomineeCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
      tx.set(db.doc(`tallies/${input.positionId}`), { positionId: input.positionId, counts: { [nomineeId]: 0 }, total: FieldValue.increment(0), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    } else {
      if (!n.exists || n.get("active") !== true) return;
      tx.update(nRef, { active: false, updatedAt: FieldValue.serverTimestamp() });
      tx.update(sRef, { isNominee: false, nomineeOf: null, updatedAt: FieldValue.serverTimestamp() });
      tx.update(pRef, { nomineeCount: FieldValue.increment(-1), updatedAt: FieldValue.serverTimestamp() });
    }
  });
  await audit(admin.email, "admin", input.active ? "nominee_added" : "nominee_removed", `nominees/${nomineeId}`);
  return { nomineeId };
});

/** D3 / A6: apply or reject a correction → account back to `active`, student emailed. */
export const resolveRequest = onCall(callOpts, async (req) => {
  const admin = await requireAdmin(req);
  const input = ResolveRequestInput.parse(req.data);
  const rRef = db.doc(`correctionRequests/${input.requestId}`);
  const r = await rRef.get();
  if (!r.exists) throw new HttpsError("not-found", "Request not found.");
  if (r.get("status") !== "open") throw new HttpsError("failed-precondition", "Request already handled.");
  const niatId = r.get("niatId") as string;
  const sRef = db.doc(`students/${niatId}`);
  const s = await sRef.get();
  if (!s.exists) throw new HttpsError("not-found", "Student not found.");

  const patch: Record<string, unknown> = {};
  if (input.decision === "resolved" && input.apply) {
    for (const [field, value] of Object.entries(input.apply)) {
      if (field === "email") {
        const e = Email.parse(value);
        await emailUniqueOrThrow(e, niatId);
        patch.email = e;
      } else if (field === "phone") {
        const p = PhoneField.safeParse(value);
        if (!p.success) throw new HttpsError("invalid-argument", "Invalid Indian mobile number.");
        patch.phone = p.data;
      } else if (field === "name") patch.name = String(value).trim().replace(/\s+/g, " ");
      else if (field === "admissionNo") patch.admissionNo = String(value).trim().toUpperCase();
    }
  }
  const nextStatus = s.get("status") === "disabled" ? "disabled" : "active";
  const batch = db.batch();
  batch.update(sRef, { ...patch, status: nextStatus, updatedAt: FieldValue.serverTimestamp() });
  batch.set(db.doc(`directory/${niatId}`), directoryEntry({ ...s.data(), ...patch, status: nextStatus }));
  batch.update(rRef, {
    status: input.decision, resolution: input.resolution ?? "", resolvedBy: admin.email,
    resolvedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
  await audit(admin.email, "admin", "correction_resolved", rRef.path, { decision: input.decision, fields: Object.keys(patch) });

  const to = (patch.email as string | undefined) ?? (r.get("contactEmail") as string);
  const mail = correctionEmail(input.decision === "resolved", niatId, input.resolution);
  await queueEmail("correction", to, mail.subject, mail.html, `correction_${input.requestId}`);
  return { ok: true };
});

/** D2 / P-FN-05: who voted for whom — voter-admins only, every call audited. */
export const getVotersForNominee = onCall(callOpts, async (req) => {
  const admin = await requireVoterAdmin(req);
  const input = VotersQueryInput.parse(req.data);
  let q = db.collection("votes").where("positionId", "==", input.positionId);
  if (input.nomineeId) q = q.where("nomineeId", "==", input.nomineeId);
  const votes = await q.orderBy("createdAt", "desc").limit(3000).get();
  const studentRefs = [...new Set(votes.docs.map((d) => d.get("voterId") as string))].map((id) => db.doc(`students/${id}`));
  const students = studentRefs.length ? await db.getAll(...studentRefs) : [];
  const byId = new Map(students.map((s) => [s.id, s]));
  await audit(admin.email, "admin", "voters_viewed", `positions/${input.positionId}`, {
    nomineeId: input.nomineeId ?? null, count: votes.size,
  });
  return {
    rows: votes.docs.map((d) => {
      const s = byId.get(d.get("voterId") as string);
      return {
        niatId: d.get("voterId") as string,
        name: (s?.get("name") as string | undefined) ?? "—",
        batch: (d.get("batch") as string | undefined) ?? (s?.get("batch") as string | undefined) ?? "",
        nomineeId: d.get("nomineeId") as string,
        receiptCode: (d.get("receiptCode") as string | undefined) ?? null,
        at: (d.get("createdAt") as Timestamp).toMillis(),
      };
    }),
  };
});

/** D7: nudge non-voters. dryRun (default) only counts; real sends respect the Brevo daily cap. */
export const sendReminders = onCall({ ...callOpts, timeoutSeconds: 300 }, async (req) => {
  const admin = await requireAdmin(req);
  const input = SendRemindersInput.parse(req.data);
  const positions = await db.collection("positions").where("active", "==", true).get();
  const positionCount = positions.size;
  const students = await db.collection("students").where("status", "==", "active").get();
  const targets = students.docs.filter((d) => {
    if (input.batch && d.get("batch") !== input.batch) return false;
    const voted = (d.get("votedPositions") as string[] | undefined) ?? [];
    if (input.segment === "not_voted_any") return voted.length === 0;
    if (input.segment === "not_voted_all") return voted.length < positionCount;
    return !voted.includes(input.positionId!);
  });
  if (input.dryRun) return { count: targets.length, sent: 0, skipped: 0 };

  const day = new Date().toISOString().slice(0, 10);
  let sent = 0;
  let skipped = 0; // = queued for later (both Brevo accounts at today's limit)
  for (const t of targets) {
    const m = reminderEmail((t.get("name") as string).split(" ")[0], t.id);
    const r = await queueEmail("reminder", t.get("email") as string, m.subject, m.html, `reminder_${day}_${t.id}`);
    if (r === "sent") sent++;
    else if (r === "queued") skipped++;
  }
  await audit(admin.email, "admin", "reminders_sent", null, { segment: input.segment, batch: input.batch ?? null, sent, skipped });
  return { count: targets.length, sent, skipped };
});

/** Disaster recovery (9001): recompute a tally from votes — read-only over votes. */
export const recountPosition = onCall(callOpts, async (req) => {
  const admin = await requireAdmin(req);
  const { positionId } = RecountInput.parse(req.data);
  const votes = await db.collection("votes").where("positionId", "==", positionId).select("nomineeId").get();
  const nominees = await db.collection("nominees").where("positionId", "==", positionId).get();
  const counts: Record<string, number> = Object.fromEntries(nominees.docs.map((n) => [n.id, 0]));
  for (const v of votes.docs) counts[v.get("nomineeId") as string] = (counts[v.get("nomineeId") as string] ?? 0) + 1;
  const total = votes.size;
  const prev = await db.doc(`tallies/${positionId}`).get();
  await db.doc(`tallies/${positionId}`).set({ positionId, counts, total, updatedAt: FieldValue.serverTimestamp() });
  await rtdb.ref(`tallies/${positionId}`).set({ counts, total, updatedAt: Date.now() });
  const drift = ((prev.get("total") as number | undefined) ?? 0) - total;
  await audit(admin.email, "admin", "settings_changed", `tallies/${positionId}`, { op: "recount", total, drift });
  return { total, drift };
});

/** Promotion / announcement email to a segment of active students. Over-limit sends wait in the queue. */
export const sendAnnouncement = onCall({ ...callOpts, timeoutSeconds: 540 }, async (req) => {
  const admin = await requireAdmin(req);
  const input = AnnouncementInput.parse(req.data);
  const positions = await db.collection("positions").where("active", "==", true).get();
  const students = await db.collection("students").where("status", "==", "active").get();
  const targets = students.docs.filter((d) => {
    if (input.batch && d.get("batch") !== input.batch) return false;
    const voted = (d.get("votedPositions") as string[] | undefined) ?? [];
    if (input.segment === "all") return true;
    if (input.segment === "not_voted_any") return voted.length === 0;
    if (input.segment === "not_voted_all") return voted.length < positions.size;
    return !voted.includes(input.positionId!);
  });
  if (input.dryRun) return { count: targets.length, sent: 0, queued: 0 };

  let sent = 0;
  let queued = 0;
  for (const t of targets) {
    const m = announcementEmail(input.subject, input.message, (t.get("name") as string).split(" ")[0]);
    const r = await queueEmail("announcement", t.get("email") as string, m.subject, m.html);
    if (r === "sent") sent++;
    else if (r === "queued") queued++;
  }
  await audit(admin.email, "admin", "announcement_sent", null, { segment: input.segment, batch: input.batch ?? null, count: targets.length, sent, queued });
  return { count: targets.length, sent, queued };
});

/** Email dashboard: accounts configured, today's usage per account, emails waiting. */
export const emailStatus = onCall(callOpts, async (req) => {
  await requireAdmin(req);
  const accounts = mailAccounts();
  const day = new Date().toISOString().slice(0, 10);
  const q = await db.doc(`_emailQuota/${day}`).get();
  const waiting = (await db.collection("_mailQueue").where("status", "==", "queued").count().get()).data().count;
  return {
    accounts: accounts.map((a, i) => ({
      sender: a.from,
      sentToday: (q.get(`sent_${i}`) as number | undefined) ?? 0,
      full: q.get(`full_${i}`) === true,
    })),
    dailyCapPerAccount: Number(process.env.BREVO_DAILY_CAP ?? 280),
    waiting,
  };
});
