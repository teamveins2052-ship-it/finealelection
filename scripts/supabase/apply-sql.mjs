// Applies supabase/migrations/*.sql in order (each file is idempotent).
// Usage: node scripts/supabase/apply-sql.mjs   (needs SUPABASE_DB_URL — loaded from .env.bootstrap or the shell)
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

for (const f of [".env.bootstrap", ".env.local"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const url = process.env.SUPABASE_DB_URL;
if (!url) throw new Error("SUPABASE_DB_URL is not set");

const dir = "supabase/migrations";
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    process.stdout.write(`applying ${file} … `);
    await client.query(readFileSync(join(dir, file), "utf8"));
    console.log("ok");
  }
} finally {
  await client.end();
}
