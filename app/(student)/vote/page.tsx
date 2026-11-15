"use client";

import { Vote } from "lucide-react";
import { PausedBanner } from "@/components/shared/status";
import { EmptyState, ErrorState, ProgressRing, Skeleton } from "@/components/ui/primitives";
import { PositionCard } from "@/components/vote/position-card";
import { useAsync } from "@/hooks/use-async";
import { useElection } from "@/hooks/use-election";
import { useVotedPositions } from "@/hooks/use-my-votes";
import { useTallies } from "@/hooks/use-realtime";
import { getPositions } from "@/lib/client-data";

/** V1/V3: positions, unvoted first; voted cards dim with a ✓ chip (DESIGN §6.5). */
export default function VotePage() {
  const positions = useAsync(() => getPositions(), []);
  const voted = useVotedPositions();
  const election = useElection();
  const tallies = useTallies();
  const phase = election.status === "ready" ? election.phase : null;

  const active = positions.status === "ready" ? positions.data.filter((p) => p.active) : [];
  const ordered = [...active.filter((p) => !voted.has(p._id)), ...active.filter((p) => voted.has(p._id))];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-[28px] leading-[34px] lg:text-[40px] lg:leading-[44px]">Vote</h1>
        {active.length > 0 && <ProgressRing done={active.filter((p) => voted.has(p._id)).length} total={active.length} />}
      </div>
      <p className="text-sm text-muted">One vote per club. Tap a club to see its nominees.</p>
      <PausedBanner />

      {positions.status === "error" && <ErrorState onRetry={positions.retry} />}
      {positions.status === "ready" && ordered.length === 0 && <EmptyState icon={Vote} title="No positions yet." />}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {positions.status === "loading" && [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[76px] w-full" />)}
        {ordered.map((p) => (
          <PositionCard key={p._id} position={p} voted={voted.has(p._id)} closed={phase === "closed" || phase === "results"} total={tallies.data?.[p._id]?.total} />
        ))}
      </div>
    </div>
  );
}
