/** npm run ops:verify — read-only health check of the real project (run before/while voting). */
// Read-only end-to-end check of the real project. Prints pass/fail only — no personal data.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
process.env.FIREBASE_SERVICE_ACCOUNT_B64 = Buffer.from(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS!)).toString("base64");
process.env.DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const { db, rtdb } = await import("../../functions/src/lib/admin");
const { handleCallable } = await import("../../functions/src/http");
const { cert } = await import("firebase-admin/app");
const out: string[] = [];
const ok = (step: string, pass: boolean, note = "") => out.push(`${pass ? "PASS" : "FAIL"}  ${step}${note ? "  — " + note : ""}`);
const ist = (d: Date) => d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

// 1. Database + settings
const s = (await db.doc("settings/election").get()).data()!;
const now = Date.now(), opens = s.opensAt.toMillis(), closes = s.closesAt.toMillis();
ok("Database connected (settings readable)", !!s);
ok("Voting window open now", opens <= now && now < closes && s.paused !== true, `open ${ist(new Date(opens))} → close ${ist(new Date(closes))}`);
ok("Close time is 20 Nov 8:00 PM IST", new Date(closes).toISOString() === "2026-11-20T14:30:00.000Z");
ok("Student 2-step optional, results not published", s.requireStudentMfa === false && s.resultsPublished !== true);
const count = async (q: FirebaseFirestore.Query) => (await q.count().get()).data().count;
const students = await count(db.collection("students")), dir = await count(db.collection("directory"));
ok("Students imported", students === 1668 && dir === 1668, `${students} students, ${dir} lookup entries`);
ok("Admin account present", (await db.doc("admins/tarunuttupulusu@gmail.com").get()).exists);
const pos = await db.collection("positions").where("active", "==", true).get();
const noms = await count(db.collection("nominees").where("active", "==", true));
ok("Clubs active", pos.size > 0, `${pos.size} clubs`);
ok("Nominees added", noms > 0, `${noms} active nominees${noms === 0 ? " — students can't vote until nominees are added" : ""}`);
const live = (await rtdb.ref("election").get()).val() as { phase?: string; paused?: boolean; closesAt?: number } | null;
ok("Live display mirrors settings", !!live && live.closesAt === closes && live.paused === false, `phase=${live?.phase}`);
ok("Turnout counts against all students", (await rtdb.ref("meta/eligible").get()).val() === 1668);

// 2. Login steps (same code the website runs)
const pick = (b: string) => db.collection("students").where("batch", "==", b).limit(1).get().then((q) => q.docs[0]!);
for (const b of ["2025", "2026"]) {
  const st = await pick(b);
  const look = await handleCallable("lookupStudent", { niatId: st.id, turnstileToken: "verify" }, {}, "127.0.0.1");
  const r = (look.body as { result?: { status: string; maskedEmail: string } }).result;
  ok(`Step 2–3 "Is this you?" for a ${b} student`, look.status === 200 && r?.status === "active" && r.maskedEmail.includes("*"));
  const good = await handleCallable("checkStudentEmail", { niatId: st.id, email: st.get("email") }, {}, "127.0.0.1");
  const bad = await handleCallable("checkStudentEmail", { niatId: st.id, email: "not.this.person@gmail.com" }, {}, "127.0.0.1");
  ok(`Step 4 email check for a ${b} student`, (good.body as { result?: { match: boolean } }).result?.match === true && (bad.body as { result?: { match: boolean } }).result?.match === false, "right email accepted, wrong email refused");
}
const unknown = await handleCallable("lookupStudent", { niatId: "N25H01A9999", turnstileToken: "verify" }, {}, "127.0.0.1");
ok("Unknown NIAT ID is refused politely", unknown.status === 404);
const noAuth = await handleCallable("countMyVote", { positionId: pos.docs[0]?.id ?? "x" }, {}, "127.0.0.1");
ok("Voting actions need sign-in", noAuth.status === 401);
const adminNoAuth = await handleCallable("emailStatus", {}, {}, "127.0.0.1");
ok("Admin actions need sign-in", adminNoAuth.status === 401);

// 3. Live security rules = the code
const { access_token } = await cert(JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS!, "utf8"))).getAccessToken();
const H = { Authorization: `Bearer ${access_token}` };
const rel = await (await fetch("https://firebaserules.googleapis.com/v1/projects/election2026-2014a/releases/cloud.firestore", { headers: H })).json() as { rulesetName?: string };
const rs = await (await fetch(`https://firebaserules.googleapis.com/v1/${rel.rulesetName}`, { headers: H })).json() as { source?: { files?: { content: string }[] } };
const liveRules = rs.source?.files?.[0]?.content ?? "";
const hash = (t: string) => createHash("sha256").update(t.replace(/\r\n/g, "\n")).digest("hex");
ok("Live Firestore rules = firestore.rules in code", hash(liveRules) === hash(readFileSync("firestore.rules", "utf8")), "incl. optional 2-step + voting window");

// 4. Sign-in providers / allowed sites
const cfg = await (await fetch("https://identitytoolkit.googleapis.com/admin/v2/projects/election2026-2014a/config", { headers: H })).json() as { authorizedDomains?: string[]; signIn?: { email?: { enabled?: boolean } } };
const g = await (await fetch("https://identitytoolkit.googleapis.com/admin/v2/projects/election2026-2014a/defaultSupportedIdpConfigs/google.com", { headers: H })).json() as { enabled?: boolean };
ok("Google sign-in enabled", g.enabled === true);
ok("Email link sign-in enabled", cfg.signIn?.email?.enabled === true);
const domains = cfg.authorizedDomains ?? [];
ok("Live (Vercel) site allowed to sign in", domains.some((d) => d.endsWith(".vercel.app") || d.includes("semmap")), `allowed: ${domains.join(", ")}`);
console.log(out.join("\n"));
process.exit(0);
