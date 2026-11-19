"use client";

import { Vote } from "lucide-react";
import { PausedBanner } from "@/components/shared/status";
import { EmptyState, ErrorState, ProgressRing, Skeleton } from "@/components/ui/primitives";
import { PositionCard } from "@/components/vote/position-card";
import type { LeaderboardRanking } from "@/components/ui/leaderboard-podium";
import { useAsync } from "@/hooks/use-async";
import { useElection } from "@/hooks/use-election";
import { useVotedPositions } from "@/hooks/use-my-votes";
import { useTallies } from "@/hooks/use-realtime";
import { getAllNominees, getPositions } from "@/lib/client-data";

/** V1/V3: positions, unvoted first; voted cards dim with a ✓ chip (DESIGN §6.5). */
export default function VotePage() {
  const data = useAsync(async () => {
    const [positions, nominees] = await Promise.all([getPositions(), getAllNominees()]);
    return { positions, nominees };
  }, []);

  const voted = useVotedPositions();
  const election = useElection();
  const tallies = useTallies();
  const phase = election.status === "ready" ? election.phase : null;

  const positions = data.status === "ready" ? data.data.positions : [];
  const nominees = data.status === "ready" ? data.data.nominees : [];

  const active = positions.filter((p) => p.active);
  const ordered = [...active.filter((p) => !voted.has(p._id)), ...active.filter((p) => voted.has(p._id))];

  const getRankingsForPosition = (positionId: string): LeaderboardRanking[] => {
    const list = nominees.filter((n) => n.positionId === positionId && n.active);
    if (list.length === 0) return [];

    const counts = tallies.data?.[positionId]?.counts ?? {};
    return list
      .map((n) => {
        const count = counts[n._id] ?? 0;
        const nameParts = n.name.trim().split(/\s+/);
        const wordIdx = nameParts.findIndex((p) => p.length > 2);
        const displayName = wordIdx > 0 ? nameParts.slice(0, wordIdx + 1).join(" ") : nameParts.slice(0, 2).join(" ");
        return {
          userId: n._id,
          userName: displayName,
          value: count,
          avatarUrl: n.photoUrl || undefined,
        };
      })
      .sort((a, b) => b.value - a.value || a.userName.localeCompare(b.userName))
      .slice(0, 3)
      .map((r, i) => ({ ...r, rank: i + 1 }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-[28px] leading-[34px] lg:text-[40px] lg:leading-[44px]">Vote</h1>
        {active.length > 0 && <ProgressRing done={active.filter((p) => voted.has(p._id)).length} total={active.length} />}
      </div>
      <p className="text-sm text-muted">One vote per club. Tap a club to see its nominees.</p>
      <PausedBanner />

      {data.status === "error" && <ErrorState onRetry={data.retry} />}
      {data.status === "ready" && ordered.length === 0 && <EmptyState icon={Vote} title="No positions yet." />}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.status === "loading" && [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[280px] w-full rounded-2xl" />)}
        {ordered.map((p) => (
          <PositionCard
            key={p._id}
            position={p}
            voted={voted.has(p._id)}
            closed={phase === "closed" || phase === "results"}
            total={tallies.data?.[p._id]?.total}
            rankings={getRankingsForPosition(p._id)}
          />
        ))}
      </div>
    </div>
  );
}
