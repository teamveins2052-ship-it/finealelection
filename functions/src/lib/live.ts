import { db } from "./store";

/**
 * Rebuilds the public live nodes (rt.tallies, rt.wall) from the source of truth
 * (tallies, votes, students) and writes them only when they changed. Browsers get the
 * update over Supabase Realtime. Throttled to one rebuild per FLUSH_MS across all servers,
 * so a burst of votes costs one realtime message per watcher, not one per vote (Supabase
 * free plan: 2M realtime messages/month). runTick calls it too, so the last vote of a burst
 * shows up within a minute even when traffic stops.
 *
 * Anonymous by design (P-RTD-01): counts, turnout and "a vote in <club> at <time>" only.
 */
const FLUSH_MS = 8_000;
let lastLocal = 0;

export async function flushLive(force = false): Promise<boolean> {
  if (!force && Date.now() - lastLocal < FLUSH_MS) return false;
  lastLocal = Date.now();
  // Cross-instance lease: only one server rebuilds per window.
  const lease = await db.query(
    `insert into public._meta (id, data) values ('live', jsonb_build_object('at', $1::bigint))
     on conflict (id) do update set data = jsonb_build_object('at', $1::bigint), updated_at = now()
     where $2::boolean or coalesce((public._meta.data->>'at')::bigint, 0) < $1::bigint - $3::bigint
     returning id`,
    [Date.now(), force, FLUSH_MS],
  );
  if (!lease.rowCount) return false;

  const [tallies, voters, eligible, recent] = await Promise.all([
    db.query(`select id, data from public.tallies`),
    db.query(`select count(*)::int as n from public.students where coalesce((data->>'votedCount')::int, 0) > 0`),
    db.query(`select count(*)::int as n from public.students where data->>'status' = 'active'`),
    db.query(
      `select coalesce(p.data->>'club', v.data->>'positionId') as club, (v.data->'createdAt'->>'$ts')::bigint as at
         from public.votes v left join public.positions p on p.id = v.data->>'positionId'
        where v.data->>'counted' = 'true'
        order by v.data->'createdAt' desc limit 10`,
    ),
  ]);

  const tallyNode: Record<string, { counts: Record<string, number>; total: number; updatedAt: number }> = {};
  let totalVotes = 0;
  for (const row of tallies.rows as Array<{ id: string; data: { counts?: Record<string, number>; total?: number; updatedAt?: { $ts: number } } }>) {
    const total = Number(row.data.total ?? 0);
    totalVotes += total;
    tallyNode[row.id] = { counts: row.data.counts ?? {}, total, updatedAt: row.data.updatedAt?.$ts ?? 0 };
  }
  const votersCount = Number(voters.rows[0]?.n ?? 0);
  const eligibleCount = Number(eligible.rows[0]?.n ?? 0);
  const recentNode: Record<string, { club: string; at: number }> = {};
  (recent.rows as Array<{ club: string; at: string }>).forEach((r, i) => {
    recentNode[`r${String(9 - i).padStart(2, "0")}`] = { club: r.club, at: Number(r.at) };
  });
  const wall = {
    totalVotes,
    votersCount,
    turnoutPct: eligibleCount > 0 ? Math.min(100, +((votersCount / eligibleCount) * 100).toFixed(1)) : 0,
    recent: recentNode,
  };

  // Write only what changed (an unchanged row sends no realtime message).
  await db.query(
    `insert into public.rt (path, value) values ('tallies', $1::jsonb), ('wall', $2::jsonb)
     on conflict (path) do update set value = excluded.value, updated_at = now()
     where public.rt.value is distinct from excluded.value`,
    [JSON.stringify(tallyNode), JSON.stringify(wall)],
  );
  return true;
}
