import { readFileSync, existsSync } from "fs";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) process.env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
}

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/$/, "");
const SECRET = process.env.SUPABASE_SECRET_KEY;

async function run() {
  const fileData = readFileSync("public/election-poster.jpg");
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/media/assets/election-poster.jpg`, {
    method: "POST",
    headers: {
      apikey: SECRET,
      Authorization: `Bearer ${SECRET}`,
      "content-type": "image/jpeg",
      "x-upsert": "true",
    },
    body: fileData,
  });
  console.log("Upload status:", res.status, await res.text());
  console.log("Storage URL:", `${SUPABASE_URL}/storage/v1/object/public/media/assets/election-poster.jpg`);
}

run().catch(console.error);
