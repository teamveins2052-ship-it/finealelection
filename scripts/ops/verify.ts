/**
 * npm run ops:verify — read-only health check of the live Supabase project.
 * Prints pass/fail only — no personal data.
 */
const { db, rtdb } = await import("../../functions/src/lib/store");
const { handleCallable } = await import("../../functions/src/http");
const out: string[] = [];
const ok = (step: string, pass: boolean, note = "") => out.push(`${pass ? "PASS" : "FAIL"}  ${step}${note ? "  — " + note : ""}`);
const ist = (ms: number) => new Date(ms).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
const count = async (sql: string) => Number((await db.query(sql)).rows[0]?.n ?? 0);

const s = (await db.doc("settings/election").get()).data();
ok("Database connected (settings readable)", !!s);
if (s) {
  const now = Date.now(), opens = s.opensAt.toMillis(), closes = s.closesAt.toMillis();
  ok("Voting window open now", opens <= now && now < closes && s.paused !== true, `open ${ist(opens)} → close ${ist(closes)}`);
  ok("Student 2-step optional, results not published", s.requireStudentMfa === false && s.resultsPublished !== true);
  const live = (await rtdb.ref("election").get()).val() as { closesAt?: number; paused?: boolean } | null;
  ok("Live display mirrors settings", !!live && live.closesAt === closes && live.paused === s.paused, live ? "" : "run npm run ops:sync");
}
const students = await count("select count(*)::int n from public.students");
const dir = await count("select count(*)::int n from public.directory");
ok("Students imported", students > 0 && students === dir, `${students} students, ${dir} lookup entries`);
ok("Admin account present", (await count("select count(*)::int n from public.admins")) > 0);
const clubs = await count("select count(*)::int n from public.positions where data->>'active' = 'true'");
const noms = await count("select count(*)::int n from public.nominees where data->>'active' = 'true'");
ok("Clubs active", clubs > 0, `${clubs} clubs`);
ok("Nominees added", noms > 0, `${noms} active nominees`);
const uncounted = await count("select count(*)::int n from public.votes where coalesce(data->>'counted', 'false') <> 'true'");
ok("Every vote counted", uncounted === 0, `${uncounted} waiting`);
const tallied = await count("select coalesce(sum((data->>'total')::int), 0)::int n from public.tallies");
const votes = await count("select count(*)::int n from public.votes");
ok("Tallies match votes", tallied === votes, `${tallied} tallied / ${votes} votes`);
const rls = await count("select count(*)::int n from pg_tables where schemaname = 'public' and not rowsecurity");
ok("Row Level Security on every table", rls === 0);

const st = (await db.collection("students").where("status", "==", "active").limit(1).get()).docs[0];
if (st) {
  const look = await handleCallable("lookupStudent", { niatId: st.id, turnstileToken: "verify" }, {}, "127.0.0.1");
  const r = (look.body as { result?: { maskedEmail?: string } }).result;
  ok('Login step "Is this you?" works', look.status === 200 && !!r?.maskedEmail?.includes("*"));
}
console.log(out.join("\n"));
process.exit(out.some((l) => l.startsWith("FAIL")) ? 1 : 0);

export {};
