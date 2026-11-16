/**
 * Server data access. Everything now lives in Supabase (Postgres + Realtime + Storage);
 * `db` and `rtdb` keep the document/live-data API the server code was written against.
 */
export { db, rtdb } from "./store";
export { callOpts } from "./callable";

/** Local test mode: no emails are sent (they are logged instead). */
export const IS_EMULATOR = process.env.LOCAL_TEST_MODE === "true";
export const REGION = "ap-south-1";
