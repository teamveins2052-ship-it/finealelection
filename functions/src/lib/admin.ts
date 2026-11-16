import { cert, getApps, initializeApp, type AppOptions } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Two hosts run this code:
 *  - Cloud Functions / Functions emulator (FUNCTIONS_EMULATOR, GCLOUD_PROJECT set by the runtime)
 *  - the Next.js server at /api/fn/* (free hosting without the Blaze plan). There the
 *    credential comes from FIREBASE_SERVICE_ACCOUNT_B64 (base64 of the key JSON) and the
 *    emulator switch from USE_FIREBASE_EMULATORS=true.
 */
export const IS_EMULATOR = process.env.FUNCTIONS_EMULATOR === "true" || process.env.USE_FIREBASE_EMULATORS === "true";
export const REGION = "asia-south1";
const PROJECT = process.env.GCLOUD_PROJECT ?? process.env.FIREBASE_PROJECT_ID ?? "demo-niat-elections";

/**
 * App Check rollout (RLSPOLICIES P-APP-01): leave ENFORCE_APP_CHECK unset while you set up
 * and "monitor" in the console; set it to "true" on enforce day (18 Nov), after the web app
 * is sending App Check tokens.
 */
export const ENFORCE_APP_CHECK = !IS_EMULATOR && process.env.ENFORCE_APP_CHECK === "true";

if (IS_EMULATOR) {
  // The Next server doesn't get these from the Functions emulator, so point the SDK at it.
  process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
  process.env.FIREBASE_DATABASE_EMULATOR_HOST ??= "127.0.0.1:9000";
}

if (!getApps().length) {
  // Emulator: pin the RTDB namespace so functions, seeds and the browser share one database.
  // Real projects: RTDB in asia-southeast1 needs its full URL (DATABASE_URL).
  // Fallback only so `next build` can load this module without runtime settings; production
  // always sets DATABASE_URL (asia-southeast1 needs the full regional URL).
  const databaseURL = IS_EMULATOR
    ? `http://127.0.0.1:9000?ns=${PROJECT}-default-rtdb`
    : (process.env.DATABASE_URL?.trim() || `https://${PROJECT}-default-rtdb.firebaseio.com`);
  const options: AppOptions = { projectId: PROJECT, ...(databaseURL ? { databaseURL } : {}) };
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  if (b64 && !IS_EMULATOR) {
    try {
      const key = JSON.parse(Buffer.from(b64, "base64").toString("utf8")) as { project_id: string; client_email: string; private_key: string };
      options.credential = cert({ projectId: key.project_id, clientEmail: key.client_email, privateKey: key.private_key });
      options.projectId = key.project_id;
    } catch (e) {
      console.error("[admin] failed to parse FIREBASE_SERVICE_ACCOUNT_B64", e);
    }
  } else if (process.env.FIREBASE_SA_CLIENT_EMAIL && process.env.FIREBASE_SA_PRIVATE_KEY && !IS_EMULATOR) {
    const clientEmail = process.env.FIREBASE_SA_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_SA_PRIVATE_KEY.replace(/\\n/g, "\n");
    options.credential = cert({ projectId: PROJECT, clientEmail, privateKey });
    options.projectId = PROJECT;
  }
  initializeApp(options);
}

export const db = getFirestore();
export const rtdb = getDatabase();
export const adminAuth = getAuth();

export const callOpts = { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK, cors: true } as const;
