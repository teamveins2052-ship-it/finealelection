"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, Trophy, Users } from "lucide-react";
import { ClubIcon } from "@/components/shared/club-icon";
import { PausedBanner } from "@/components/shared/status";
import { EmptyState, ErrorState, LiveDot, Skeleton } from "@/components/ui/primitives";
import { NomineeRow } from "@/components/vote/nominee-row";
import { AnimatedNumber } from "@/components/vote/animated-number";
import { LeaderboardPodium } from "@/components/ui/leaderboard-podium";
import { useAsync } from "@/hooks/use-async";
import { useElection } from "@/hooks/use-election";
import { useMyVote, useVotedPositions } from "@/hooks/use-my-votes";
import { useTallies } from "@/hooks/use-realtime";
import { getNominees, getPositions } from "@/lib/client-data";
import { pct } from "@/lib/election";

/** DESIGN §6.6: ranked nominees with live counts; reorder animates. */
export default function PositionPage() {
  const { positionId } = useParams<{ positionId: string }>();
  const data = useAsync(async () => {
    const [positions, nominees] = await Promise.all([getPositions(), getNominees(positionId)]);
    return { position: positions.find((p) => p._id === positionId) ?? null, nominees };
  }, [positionId]);
  const tallies = useTallies();
  const election = useElection();
  const voted = useVotedPositions().has(positionId);
  const myVote = useMyVote(positionId, voted);

  const tally = tallies.data?.[positionId];
  const ranked = useMemo(() => {
    if (data.status !== "ready") return [];
    return [...data.data.nominees]
      .map((n) => ({ n, votes: tally?.counts[n._id] ?? 0 }))
      .sort((a, b) => b.votes - a.votes || a.n.name.localeCompare(b.n.name));
  }, [data, tally]);

  if (data.status === "loading") {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-56" />
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[92px] w-full" />)}
      </div>
    );
  }
  if (data.status === "error") return <ErrorState onRetry={data.retry} />;
  const { position } = data.data;
  if (!position) return <EmptyState icon={Users} title="This position doesn't exist." />;
  const total = tally?.total ?? 0;
  const phase = election.status === "ready" ? election.phase : null;

  return (
    <div className="space-y-4">
      <Link href="/vote" className="-ml-2 inline-flex h-11 items-center gap-1 px-2 text-sm text-muted">
        <ArrowLeft className="size-4" /> All clubs
      </Link>
      <div className="flex items-center gap-3">
        <span
          className="relative grid size-14 shrink-0 place-items-center rounded-full overflow-hidden bg-white border-2 p-2 shadow-sm"
          style={{ borderColor: `${position.color}80` }}
        >
          <ClubIcon name={position.icon} id={position._id} color={position.color} className="size-full object-contain" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[22px] leading-7 font-semibold">{position.name}</h1>
          <p className="flex items-center gap-2 text-sm text-muted">
            <LiveDot /> <span className="tabular-nums"><AnimatedNumber value={total} /> votes</span>
          </p>
        </div>
      </div>
      {position.description && <p className="text-sm text-muted">{position.description}</p>}
      <PausedBanner />

      {voted && (
        <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 p-3 text-sm">
          <CheckCircle2 className="size-5 shrink-0 text-success" />
          <span>
            You voted for {position.name}{/* the choice itself is never shown again */}
            {myVote?.receiptCode ? <> · Receipt <span className="font-mono font-semibold">{myVote.receiptCode}</span></> : null}
          </span>
        </div>
      )}

      {ranked.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-8 text-center flex flex-col items-center justify-center space-y-2">
          <Users className="size-8 text-muted/40" />
          <p className="font-semibold text-ink text-base">No candidates registered yet</p>
          <p className="text-xs text-muted max-w-xs">
            Candidates for {position.name} will be announced soon. You can vote in other clubs in the meantime.
          </p>
          <Link href="/vote" className="mt-2 text-xs font-bold text-primary hover:underline">
            ← Back to Ballot
          </Link>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-border bg-surface p-4 shadow-sm flex flex-col items-center">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted mb-2">
              <Trophy className="size-3.5 text-warning" /> Live {position.name} Standings
            </div>
            <LeaderboardPodium
              size="sm"
              rankings={ranked.slice(0, 3).map(({ n, votes }, i) => ({
                userId: n._id,
                userName: n.name.split(" ")[0] + (n.name.split(" ")[1] ? " " + n.name.split(" ")[1][0] + "." : ""),
                value: votes,
                avatarUrl: n.photoUrl || undefined,
                rank: i + 1,
              }))}
              showValue
              showAvatar
            />
          </div>

          <ul className="grid gap-2 lg:grid-cols-2" aria-live="off">
            {ranked.map(({ n, votes }, i) => (
              <NomineeRow
                key={n._id}
                nominee={n}
                rank={i + 1}
                votes={votes}
                pctValue={pct(votes, total)}
                color={position.color}
                leader={i === 0}
              />
            ))}
          </ul>
        </>
      )}

      {!voted && phase === "voting" && ranked.length > 0 && (
        <p className="sticky bottom-[calc(80px+env(safe-area-inset-bottom))] rounded-full bg-surface-2/95 py-2 text-center text-sm font-semibold text-muted backdrop-blur lg:bottom-4">
          Tap a nominee to view and vote
        </p>
      )}
    </div>
  );
}
