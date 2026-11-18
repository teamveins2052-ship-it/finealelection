import { db, rtdb } from "../../functions/src/lib/store";

async function resetFresh() {
  console.log("=== RESETTING DATABASE TO FRESH DEPLOYMENT STATE ===");

  // 1. Delete all test votes (temporarily disable trigger for ops reset, then immediately re-enable)
  await db.query("alter table public.votes disable trigger votes_guard");
  try {
    const delVotes = await db.query("delete from public.votes returning id");
    console.log(`Deleted ${delVotes.rowCount} test votes.`);
  } finally {
    await db.query("alter table public.votes enable trigger votes_guard");
    console.log("Re-enabled votes_guard trigger.");
  }

  // 2. Delete all test nominees
  const delNoms = await db.query("delete from public.nominees returning id");
  console.log(`Deleted ${delNoms.rowCount} test nominees.`);

  // 3. Reset ALL student voting and nominee flags (votedCount: 0, votedPositions: [], isNominee: false, nomineeOf: null)
  const resetStudents = await db.query(`
    update public.students
    set data = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(data, '{votedCount}', '0'::jsonb),
          '{votedPositions}', '[]'::jsonb
        ),
        '{isNominee}', 'false'::jsonb
      ),
      '{nomineeOf}', 'null'::jsonb
    )
    where coalesce((data->>'votedCount')::int, 0) > 0
       or (data->>'isNominee')::boolean = true
       or jsonb_array_length(coalesce(data->'votedPositions', '[]'::jsonb)) > 0
    returning id
  `);
  console.log(`Reset ${resetStudents.rowCount} students from voted and nominee status.`);

  // 4. Reset nomineeCount on all positions
  const resetPositions = await db.query(`
    update public.positions
    set data = jsonb_set(data, '{nomineeCount}', '0'::jsonb)
    returning id
  `);
  console.log(`Reset nomineeCount on ${resetPositions.rowCount} positions.`);

  // 5. Reset tallies for all positions
  const posRows = await db.query("select id from public.positions");
  for (const row of posRows.rows) {
    await db.query(`
      insert into public.tallies (id, data)
      values ($1, $2)
      on conflict (id) do update set data = $2
    `, [
      row.id,
      JSON.stringify({
        positionId: row.id,
        total: 0,
        counts: {},
        updatedAt: new Date().toISOString()
      })
    ]);
  }
  console.log(`Reset tallies for ${posRows.rowCount} positions to 0.`);

  // 6. Delete any test questions, reactions, posts
  await db.query("delete from public.questions");
  await db.query("delete from public.reactions");
  await db.query("delete from public.posts");
  console.log("Cleaned test questions, reactions, and posts.");

  // 7. Update Realtime live wall & tallies
  await rtdb.ref("wall").set({
    totalVotes: 0,
    turnoutPct: 0,
    updatedAt: Date.now()
  });
  const emptyTallies: Record<string, { total: number; counts: Record<string, number> }> = {};
  for (const row of posRows.rows) {
    emptyTallies[row.id] = { total: 0, counts: {} };
  }
  await rtdb.ref("tallies").set(emptyTallies);
  console.log("Reset Realtime wall and tallies to 0 votes, 0% turnout.");

  // 8. Ping _changes for students and positions
  await db.query(`
    insert into public._changes (key, at)
    values ('c:students', now()), ('c:positions', now()), ('c:tallies', now()), ('c:nominees', now())
    on conflict (key) do update set at = now()
  `);
  console.log("Broadcasted realtime pings on _changes.");

  console.log("=== FRESH DATABASE RESET COMPLETE ===");
  process.exit(0);
}

resetFresh().catch((err) => {
  console.error("Reset failed:", err);
  process.exit(1);
});
