"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  getFirestore,
  type Firestore,
} from "firebase/firestore";
import { connectDatabaseEmulator, getDatabase, type Database } from "firebase/database";
import { connectFunctionsEmulator, getFunctions, type Functions } from "firebase/functions";
import { initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from "firebase/app-check";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const USE_EMULATORS = process.env.NEXT_PUBLIC_USE_EMULATORS === "true";
/** reCAPTCHA Enterprise site key for App Check (P-APP-01). Unset → App Check off (emulator/early setup). */
const APP_CHECK_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_KEY;
const FUNCTIONS_REGION = "asia-south1";

interface Clients {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  rtdb: Database;
  functions: Functions;
  /** Set when App Check is on; lib/client-data sends its token with /api/fn calls. */
  appCheck: AppCheck | null;
}

let clients: Clients | null = null;

/** Lazily initialised so nothing Firebase-related runs during SSR/static builds. */
export function firebase(): Clients {
  if (clients) return clients;
  if (typeof window === "undefined") throw new Error("firebase() is browser-only");

  const isFresh = getApps().length === 0;
  const app = isFresh ? initializeApp(config) : getApp();
  // App Check first, so every Firestore/RTDB/Functions request carries an attestation token.
  const appCheck =
    isFresh && APP_CHECK_KEY && !USE_EMULATORS
      ? initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(APP_CHECK_KEY), isTokenAutoRefreshEnabled: true })
      : null;

  // Persistent cache = offline vote queue (PRD V6): a vote written offline syncs on reconnect,
  // and its deterministic ID means a retry can never double count.
  const db = isFresh
    ? initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })
    : getFirestore(app);
  const auth = getAuth(app);
  const rtdb = getDatabase(app);
  const functions = getFunctions(app, FUNCTIONS_REGION);

  if (USE_EMULATORS && isFresh) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectDatabaseEmulator(rtdb, "127.0.0.1", 9000);
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  }

  clients = { app, auth, db, rtdb, functions, appCheck };
  // Emulator-only debugging handle (never set in staging/prod builds).
  if (USE_EMULATORS) (window as unknown as { __niat?: Clients }).__niat = clients;
  return clients;
}
