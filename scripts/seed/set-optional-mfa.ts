/** One-off (16 Nov): make 2-step optional for students on the real project, then mirror + audit. */
import { readFileSync } from "node:fs";
process.env.FIREBASE_SERVICE_ACCOUNT_B64 = Buffer.from(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS!)).toString("base64");
process.env.DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const { db } = await import("../../functions/src/lib/admin");
await db.doc("settings/election").update({ requireStudentMfa: false, updatedBy: process.env.ADMIN_EMAILS?.split(",")[0] ?? "operator", updatedAt: new Date() });
const { runTick } = await import("../../functions/src/tick");
await runTick(true);
const s = await db.doc("settings/election").get();
console.log("✅ requireStudentMfa =", s.get("requireStudentMfa"));
process.exit(0);
