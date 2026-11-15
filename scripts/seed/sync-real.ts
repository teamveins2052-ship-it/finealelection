/**
 * One-off for the real project on free hosting: mirror settings → RTDB /election and run the
 * housekeeping tick (same code the website runs). Credentials: FIREBASE_SERVICE_ACCOUNT_B64.
 *   tsx --env-file=.env.bootstrap scripts/seed/sync-real.ts
 */
import { readFileSync } from "node:fs";
const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!keyPath) throw new Error("Set GOOGLE_APPLICATION_CREDENTIALS");
process.env.FIREBASE_SERVICE_ACCOUNT_B64 = Buffer.from(readFileSync(keyPath)).toString("base64");
process.env.DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const { runTick } = await import("../../functions/src/tick");
const r = await runTick(true);
console.log("✅ synced", r);
process.exit(0);
