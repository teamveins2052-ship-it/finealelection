import { db, auth, rtdb, env } from "./admin";

if (env.isProd) { console.error("✋ Never reset production."); process.exit(1); }

const COLLECTIONS = [
  "admins", "students", "directory", "correctionRequests", "positions", "nominees", "votes", "tallies",
  "posts", "questions", "questionAuthors", "comments", "commentAuthors", "reactions", "debates",
  "predictions", "pulsePolls", "pulseVotes", "banners", "settings", "auditLogs", "_rateLimits", "mfa", "_events", "_emailQuota",
];

async function main() {
  for (const c of COLLECTIONS) {
    await db.recursiveDelete(db.collection(c));
    console.log(`🗑️  ${c}`);
  }
  await rtdb.ref("/").set(null);
  if (env.usingEmulator) {
    const { users } = await auth.listUsers(1000);
    if (users.length) await auth.deleteUsers(users.map((u) => u.uid));
  }
  console.log("✅ Reset complete");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
