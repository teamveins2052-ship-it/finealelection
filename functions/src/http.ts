import { HttpsError, type CallableFunction, type CallableRequest } from "firebase-functions/v2/https";
import { getAppCheck } from "firebase-admin/app-check";
import { adminAuth, ENFORCE_APP_CHECK } from "./lib/admin";
import { requestCorrection, askQuestion } from "./callables/student";
import {
  importStudents,
  adminUpdateStudent,
  setNominee,
  resolveRequest,
  getVotersForNominee,
  sendReminders,
  recountPosition,
  sendAnnouncement,
  emailStatus,
} from "./callables/admin";
import { mfaStatus, mfaEnrollStart, mfaEnrollConfirm, mfaVerify, mfaReset } from "./callables/mfa";
import { lookupStudent, checkStudentEmail } from "./callables/lookup";
import { bootstrapElection } from "./callables/bootstrap";
import { countMyVote, syncReactions, syncElection, welcome } from "./callables/sync";

/**
 * Runs the same callables over plain HTTP from the Next.js server (/api/fn/[name]) so the app
 * works on free hosting without Cloud Functions. Each callable's own guard, rate limit and Zod
 * parse still run inside `.run()` — this adapter only rebuilds the request the Functions
 * runtime would have built: verified ID token → req.auth, App Check → req.app, client IP.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CALLABLES: Record<string, CallableFunction<any, any>> = {
  requestCorrection, askQuestion,
  importStudents, adminUpdateStudent, setNominee, resolveRequest, getVotersForNominee,
  sendReminders, recountPosition, sendAnnouncement, emailStatus,
  mfaStatus, mfaEnrollStart, mfaEnrollConfirm, mfaVerify, mfaReset,
  lookupStudent, checkStudentEmail, bootstrapElection,
  countMyVote, syncReactions, syncElection, welcome,
};

export interface HttpResult {
  status: number;
  body: { result: unknown } | { error: { status: string; message: string } };
}

const STATUS: Record<string, number> = {
  "invalid-argument": 400, "failed-precondition": 400, "out-of-range": 400,
  unauthenticated: 401, "permission-denied": 403, "not-found": 404, "already-exists": 409,
  aborted: 409, "resource-exhausted": 429, cancelled: 499, unavailable: 503, "deadline-exceeded": 504,
};

export async function handleCallable(
  name: string,
  data: unknown,
  headers: { authorization?: string | null; appCheck?: string | null },
  ip: string,
): Promise<HttpResult> {
  const fn = Object.prototype.hasOwnProperty.call(CALLABLES, name) ? CALLABLES[name] : undefined;
  if (!fn) return { status: 404, body: { error: { status: "NOT_FOUND", message: "Unknown action." } } };

  try {
    let auth: CallableRequest["auth"];
    const bearer = headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (bearer) {
      try {
        const token = await adminAuth.verifyIdToken(bearer);
        auth = { uid: token.uid, token, rawToken: bearer };
      } catch {
        throw new HttpsError("unauthenticated", "Your sign-in expired. Sign in again.");
      }
    }
    let app: CallableRequest["app"];
    if (headers.appCheck) {
      try {
        const r = await getAppCheck().verifyToken(headers.appCheck);
        app = { appId: r.appId, token: r.token, alreadyConsumed: false };
      } catch {
        app = undefined;
      }
    }
    if (ENFORCE_APP_CHECK && !app) throw new HttpsError("failed-precondition", "App verification failed.");

    const req = {
      data,
      auth,
      app,
      rawRequest: { ip, headers: {} },
      acceptsStreaming: false,
    } as unknown as CallableRequest;
    const result = await fn.run(req);
    return { status: 200, body: { result: result ?? null } };
  } catch (e) {
    if (e instanceof HttpsError) {
      return { status: STATUS[e.code] ?? 500, body: { error: { status: e.code, message: e.message } } };
    }
    // Zod errors from Input.parse → treat as bad input, never leak internals.
    if (e && typeof e === "object" && "issues" in e) {
      return { status: 400, body: { error: { status: "invalid-argument", message: "Some details were invalid." } } };
    }
    console.error("[fn] crash", { name, err: e instanceof Error ? e.message : String(e) });
    return { status: 500, body: { error: { status: "internal", message: "Something went wrong. Try again." } } };
  }
}

export { runTick } from "./tick";
