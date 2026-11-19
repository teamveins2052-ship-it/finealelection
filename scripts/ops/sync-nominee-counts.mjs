import pg from "pg";
import { readFileSync, existsSync } from "fs";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) process.env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
}

const pool = new pg.Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  const nomRes = await pool.query(
    "SELECT data->>'positionId' as pos_id, COUNT(*) as cnt FROM nominees WHERE (data->>'active')::boolean = true GROUP BY data->>'positionId'"
  );
  const countMap = {};
  for (const r of nomRes.rows) countMap[r.pos_id] = parseInt(r.cnt, 10);

  const posRes = await pool.query("SELECT id, data FROM positions");
  for (const p of posRes.rows) {
    const actual = countMap[p.id] || 0;
    if (p.data.nomineeCount !== actual) {
      console.log(`Fixing nomineeCount for ${p.id} from ${p.data.nomineeCount} to ${actual}`);
      p.data.nomineeCount = actual;
      await pool.query("UPDATE positions SET data = $1 WHERE id = $2", [JSON.stringify(p.data), p.id]);
    }
  }
  console.log("Nominee counts synced successfully!");
  await pool.end();
}

run().catch(console.error);
