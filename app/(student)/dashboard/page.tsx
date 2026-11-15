"use client";

import Link from "next/link";
import { ArrowRight, PartyPopper, Sparkles, Trophy } from "lucide-react";
import { Banners, PausedBanner } from "@/components/shared/status";
import { Card, ErrorState, LiveDot, Skeleton, VoteBar } from "@/components/ui/primitives";
import { PositionCard } from "@/components/vote/position-card";
import { AnimatedNumber } from "@/components/vote/animated-number";
import { useAsync } from "@/hooks/use-async";
import { useElection } from "@/hooks/use-election";
import { useVotedPositions } from "@/hooks/use-my-votes";
import { useTallies, useWall } from "@/hooks/use-realtime";
import { useSession } from "@/hooks/use-session";
import { getPositions } from "@/lib/client-data";
import { fmtIST } from "@/lib/election";

export default function DashboardPage() {
  const session = useSession();
  const election = useElection();
  const positions = useAsync(() => getPositions(), []);
  const voted = useVotedPositions();
  const wall = useWall();
  const tallies = useTallies();
  if (session.status !== "ready" || !session.student) return null;
  const student = session.student;

  const active = positions.status === "ready" ? positions.data.filter((p) => p.active) : [];
  const pending = active.filter((p) => !voted.has(p._id));
  const allDone = active.length > 0 && pending.length === 0;
  const phase = election.status === "ready" ? election.phase : null;
  const nomineeOf = student.isNominee ? active.find((p) => p._id === student.nomineeOf) : null;

  return (
    <div className="space-y-5">
      <h1 className="font-display text-[28px] leading-[34px] lg:text-[40px] lg:leading-[44px]">Hi {student.name.split(" ")[0]} 👋</h1>
      <PausedBanner />
      <Banners />
      {/* Status cards: stacked on phones, side by side from tablet up. */}
      <div className="grid gap-4 md:grid-cols-2">

      {nomineeOf && (
        <Link href="/studio" className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/8 p-4">
          <Sparkles className="size-6 shrink-0 text-primary" />
          <span className="flex-1 text-sm">
            You&apos;re a nominee for <b>{nomineeOf.name}</b> — set up your profile in the Studio.
          </span>
          <ArrowRight className="size-5 text-primary" />
        </Link>
      )}

      {allDone && (
        <Card className="flex items-center gap-3 border-success/40 bg-success/8 p-4">
          <PartyPopper className="size-8 shrink-0 text-success" />
          <div className="flex-1">
            <p className="font-semibold">You voted in all {active.length} clubs 🎉</p>
            <Link href="/my-votes" className="text-sm font-semibold text-primary">
              See receipts & share your badge →
            </Link>
          </div>
        </Card>
      )}

      {phase === "results" && (
        <Link href="/results" className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4 shadow-card">
          <Trophy className="size-6 text-warning" />
          <span className="flex-1 font-semibold">Results are out</span>
          <ArrowRight className="size-5" />
        </Link>
      )}
      {(phase === "setup" || phase === "campaign") && election.status === "ready" && (
        <Card className="p-4">
          <p className="font-semibold">Voting opens {fmtIST(election.settings.opensAt)} IST</p>
          <p className="text-sm text-muted">Browse nominees now — vote buttons appear when voting opens.</p>
        </Card>
      )}
      {phase === "closed" && (
        <Card className="p-4">
          <p className="font-semibold">Voting has closed</p>
          <p className="text-sm text-muted">Results unlock when the committee publishes them.</p>
        </Card>
      )}

      <Card className="space-y-2 p-4">
        <div className="flex items-center justify-between">
          <LiveDot />
          <span className="text-xs text-muted">Counts update every few seconds.</span>
        </div>
        {wall.data ? (
          <>
            <p>
              <span className="font-display text-[32px] leading-10 font-bold tabular-nums">
                <AnimatedNumber value={wall.data.totalVotes} />
              </span>{" "}
              <span className="text-muted">votes cast</span>
            </p>
            <VoteBar value={wall.data.turnoutPct} label="Turnout" />
            <p className="text-xs text-muted tabular-nums">{wall.data.turnoutPct}% of students have voted</p>
          </>
        ) : wall.loading ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <p className="text-sm text-muted">No votes yet.</p>
        )}
      </Card>
      </div>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-[22px] font-semibold">{phase === "voting" ? "Your ballot" : "Positions"}</h2>
          {active.length > 0 && (
            <span className="text-sm text-muted tabular-nums">
              {active.length - pending.length} of {active.length} voted
            </span>
          )}
        </div>
        {positions.status === "error" && <ErrorState onRetry={positions.retry} />}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {positions.status === "loading" && [0, 1, 2].map((i) => <Skeleton key={i} className="h-[76px] w-full" />)}
        {positions.status === "ready" &&
          [...pending, ...active.filter((p) => voted.has(p._id))].map((p) => (
            <PositionCard
              key={p._id}
              position={p}
              voted={voted.has(p._id)}
              closed={phase === "closed" || phase === "results"}
              total={tallies.data?.[p._id]?.total}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
