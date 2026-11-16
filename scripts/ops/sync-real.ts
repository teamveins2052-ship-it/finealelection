/**
 * Run the housekeeping tick once (same code the website runs): mirror settings to the live
 * display, rebuild live counts, count any unreported vote, send queued emails.
 *   npm run ops:sync
 */
const { runTick } = await import("../../functions/src/tick");
const r = await runTick(true);
console.log("synced", r);
process.exit(0);

export {};
