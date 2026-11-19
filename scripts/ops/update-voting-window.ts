import { db, Timestamp } from "../../functions/src/lib/store";
import { syncSettingsFromDb } from "../../functions/src/triggers/on-settings-written";

async function main() {
  const ref = db.doc("settings/election");
  const snap = await ref.get();
  if (!snap.exists) {
    console.error("settings/election document not found!");
    process.exit(1);
  }

  const current = snap.data()!;
  console.log("Current window (IST):", {
    campaignOpensAt: current.campaignOpensAt?.toDate().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
    opensAt: current.opensAt?.toDate().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
    closesAt: current.closesAt?.toDate().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
    siteClosesAt: current.siteClosesAt?.toDate().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
  });

  // 20-11-2026 23:00 IST = 2026-11-20T17:30:00.000Z
  const newClosesAt = Timestamp.fromDate(new Date("2026-11-20T17:30:00.000Z"));

  await ref.update({
    closesAt: newClosesAt,
    updatedAt: Timestamp.now(),
    updatedBy: "admin@election",
  });

  await syncSettingsFromDb();

  const updatedSnap = await ref.get();
  const updated = updatedSnap.data()!;
  console.log("\nSuccessfully updated window (IST):", {
    campaignOpensAt: updated.campaignOpensAt?.toDate().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
    opensAt: updated.opensAt?.toDate().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
    closesAt: updated.closesAt?.toDate().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
    siteClosesAt: updated.siteClosesAt?.toDate().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
  });
}

main().catch(console.error);
