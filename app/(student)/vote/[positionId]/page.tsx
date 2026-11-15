"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, Users } from "lucide-react";
import { ClubIcon } from "@/components/shared/club-icon";
import { PausedBanner } from "@/components/shared/status";
import { EmptyState, ErrorState, LiveDot, Skeleton } from "@/components/ui/primitives";
import { NomineeRow } from "@/components/vote/nominee-row";
import { AnimatedNumber } from "@/components/vote/animated-number";
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
  const myNominee = myVote ? data.data.nominees.find((n) => n._id === myVote.nomineeId) : null;

  return (
    <div className="space-y-4">
      <Link href="/vote" className="-ml-2 inline-flex h-11 items-center gap-1 px-2 text-sm text-muted">
        <ArrowLeft className="size-4" /> All clubs
      </Link>
      <div className="flex items-center gap-3">
        <span className="grid size-12 place-items-center rounded-md" style={{ background: `${position.color}1f` }}>
          <ClubIcon name={position.icon} color={position.color} className="size-6" />
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
            You voted{myNominee ? <> for <b>{myNominee.name}</b></> : null}
            {myVote?.receiptCode ? <> · Receipt <span className="font-mono font-semibold">{myVote.receiptCode}</span></> : null}
          </span>
        </div>
      )}

      {ranked.length === 0 ? (
        <EmptyState icon={Users} title="No nominees yet." />
      ) : (
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
              mine={myVote?.nomineeId === n._id}
            />
          ))}
        </ul>
      )}

      {!voted && phase === "voting" && (
        <p className="sticky bottom-[calc(80px+env(safe-area-inset-bottom))] rounded-full bg-surface-2/95 py-2 text-center text-sm font-semibold text-muted backdrop-blur lg:bottom-4">
          Tap a nominee to view and vote
        </p>
      )}
    </div>
  );
}
