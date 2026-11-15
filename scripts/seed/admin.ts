import { initializeApp, getApps, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
const projectId = process.env.FIREBASE_PROJECT_ID;
if (!projectId) throw new Error("FIREBASE_PROJECT_ID is required");

const usingEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;
const isProd = /prod/i.test(projectId);
const isBootstrap = process.argv[1]?.includes("bootstrap-prod");

if (isProd && !isBootstrap) {
  console.error(`✋ Refusing to seed fake data into "${projectId}". Use bootstrap:prod for production.`);
  process.exit(1);
}
if (!usingEmulator && !isProd) {
  console.warn(`⚠️  Seeding REAL Firebase project "${projectId}" (not emulator). Ctrl+C within 5 s to abort…`);
  await new Promise((r) => setTimeout(r, 5000));
}

if (!getApps().length) {
  initializeApp({
    projectId,
    databaseURL: process.env.FIREBASE_DATABASE_URL,
    ...(usingEmulator ? {} : { credential: applicationDefault() }),
  });
}

export const db = getFirestore();
export const auth = getAuth();
export const rtdb = getDatabase();
export const env = { projectId, usingEmulator, isProd };
