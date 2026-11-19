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

const newPositions = [
  {
    id: "genai-lead",
    club: "Gen AI Club",
    name: "Gen AI Club President",
    icon: "Sparkles",
    color: "#0BA5EC",
    order: 1,
    active: true,
    description: "Leading AI innovations, workshops and machine learning projects on campus.",
  },
  {
    id: "tech-lead",
    club: "Advanced Tech",
    name: "Advanced Tech President",
    icon: "Code2",
    color: "#F79009",
    order: 2,
    active: true,
    description: "Driving hackathons, full-stack systems, development and deep tech projects.",
  },
  {
    id: "edc-lead",
    club: "Entrepreneurship Development Club (EDC)",
    name: "EDC President",
    icon: "Rocket",
    color: "#10B981",
    order: 3,
    active: true,
    description: "Fostering student startups, business ideation, pitch fests and venture building.",
  },
  {
    id: "media-head",
    club: "Media Club",
    name: "Media Club President",
    icon: "Camera",
    color: "#FF5A36",
    order: 4,
    active: true,
    description: "Directing campus photography, videography, journalism and public relations.",
  },
  {
    id: "arts-head",
    club: "Arts Club",
    name: "Arts Club President",
    icon: "Palette",
    color: "#EE46BC",
    order: 5,
    active: true,
    description: "Championing fine arts, music, dance, theater, exhibitions and creative showcases.",
  },
  {
    id: "sports-president",
    club: "Sports Club",
    name: "Sports Club President",
    icon: "Trophy",
    color: "#12B76A",
    order: 6,
    active: true,
    description: "Organising campus tournaments, athletic leagues, physical fitness and team sports.",
  },
  {
    id: "nsgc-president",
    club: "NIAT Student General Council (NSGC)",
    name: "NSGC President",
    icon: "Landmark",
    color: "#5B3DF5",
    order: 7,
    active: true,
    description: "Representing the entire NIAT student body across academic governance and student welfare.",
  },
];

async function updatePositions() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Remove legacy positions that have no votes
    await client.query("DELETE FROM positions WHERE id IN ('literary-head', 'cultural-head')");
    await client.query("DELETE FROM tallies WHERE id IN ('literary-head', 'cultural-head')");

    for (const p of newPositions) {
      const existing = await client.query("SELECT data FROM positions WHERE id = $1", [p.id]);
      const currentNomineeCount = existing.rows[0]?.data?.nomineeCount ?? 0;

      const posData = {
        id: p.id,
        club: p.club,
        name: p.name,
        icon: p.icon,
        color: p.color,
        order: p.order,
        active: p.active,
        description: p.description,
        nomineeCount: currentNomineeCount,
        createdAt: existing.rows[0]?.data?.createdAt ?? { $ts: Date.now() },
        updatedAt: { $ts: Date.now() },
      };

      await client.query(
        `INSERT INTO positions (id, data) VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET data = $2`,
        [p.id, JSON.stringify(posData)],
      );

      // Ensure tally document exists
      const tallyRes = await client.query("SELECT data FROM tallies WHERE id = $1", [p.id]);
      if (tallyRes.rowCount === 0) {
        await client.query(
          "INSERT INTO tallies (id, data) VALUES ($1, $2)",
          [p.id, JSON.stringify({ positionId: p.id, total: 0, counts: {}, updatedAt: { $ts: Date.now() } })],
        );
      }
    }

    await client.query("COMMIT");
    console.log("Successfully updated all 7 positions in Supabase Postgres!");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

updatePositions().catch(console.error);
