"use client";

import Link from "next/link";
import { ArrowRight, PartyPopper, Sparkles, Trophy, Vote } from "lucide-react";
import { Banners, PausedBanner } from "@/components/shared/status";
import { Card, ErrorState, LiveDot, Skeleton, VoteBar } from "@/components/ui/primitives";
import { PositionCard } from "@/components/vote/position-card";
import { AnimatedNumber } from "@/components/vote/animated-number";
import type { LeaderboardRanking } from "@/components/ui/leaderboard-podium";
import { useAsync } from "@/hooks/use-async";
import { useElection } from "@/hooks/use-election";
import { useVotedPositions } from "@/hooks/use-my-votes";
import { useTallies, useWall } from "@/hooks/use-realtime";
import { useSession } from "@/hooks/use-session";
import { getAllNominees, getPositions } from "@/lib/client-data";
import { fmtIST } from "@/lib/election";

export default function DashboardPage() {
  const session = useSession();
  const election = useElection();
  const positions = useAsync(() => getPositions(), []);
  const nominees = useAsync(() => getAllNominees(), []);
  const voted = useVotedPositions();
  const wall = useWall();
  const tallies = useTallies();

  const active = positions.status === "ready" ? positions.data.filter((p) => p.active) : [];
  const pending = active.filter((p) => !voted.has(p._id));
  const allDone = active.length > 0 && pending.length === 0;
  const phase = election.status === "ready" ? election.phase : null;

  // Compute respective Leaderboard Podium rankings for each position section strictly from real data
  const getRankingsForPosition = (positionId: string): LeaderboardRanking[] => {
    const list = nominees.status === "ready" ? nominees.data.filter((n) => n.positionId === positionId && n.active) : [];
    if (list.length === 0) return [];

    const counts = tallies.data?.[positionId]?.counts ?? {};
    return list
      .map((n) => {
        const count = counts[n._id] ?? 0;
        const nameParts = n.name.trim().split(/\s+/);
        const displayName =
          nameParts.length > 1
            ? `${nameParts[0]} ${nameParts[1][0]}.`
            : nameParts[0];
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

  if (session.status !== "ready" || !session.student) return null;
  const student = session.student;
  const nomineeOf = student.isNominee ? active.find((p) => p._id === student.nomineeOf) : null;

  return (
    <div className="space-y-6">
      <h1 className="font-display text-[28px] leading-[34px] lg:text-[40px] lg:leading-[44px]">Hi {student.name.split(" ")[0]} 👋</h1>
      <PausedBanner />
      <Banners />

      {/* Status cards: stacked on phones, side by side from tablet up. */}
      <div className="grid gap-4 md:grid-cols-2">

        {nomineeOf && (
          <Link href="/studio" className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/8 p-4">
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
          <Link href="/results" className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card">
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

        {/* Card 1: Live Votes Cast & Turnout */}
        <Card className="space-y-2.5 p-4 rounded-2xl">
          <div className="flex items-center justify-between">
            <LiveDot />
            <span className="text-xs text-muted">Counts update every few seconds</span>
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

        {/* Card 2: Your Ballot Summary & Progress */}
        <Card className="flex flex-col justify-between p-4 space-y-2.5 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
              <Vote className="size-3.5 text-primary" /> Your Ballot Status
            </span>
            <span className="text-xs font-semibold text-muted tabular-nums">
              {active.length - pending.length} of {active.length} voted
            </span>
          </div>
          <div>
            <p className="font-display text-[26px] leading-8 font-bold text-ink">
              {allDone ? "All Complete! 🎉" : `${pending.length} remaining to vote`}
            </p>
            <p className="text-xs text-muted mt-1">
              {allDone
                ? "You have cast your votes across all campus clubs."
                : "Each club section below shows its own live leaderboard and candidate standings."}
            </p>
          </div>
          <div className="w-full bg-surface-2 h-2 rounded-full overflow-hidden">
            <div
              className="bg-ink h-full rounded-full transition-all duration-500"
              style={{
                width: `${active.length > 0 ? ((active.length - pending.length) / active.length) * 100 : 0}%`,
              }}
            />
          </div>
        </Card>

      </div>

      {/* Main Ballot Sections with Respective Leaderboard for EACH Club */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <div>
            <h2 className="font-display text-[22px] font-semibold">
              {phase === "voting" ? "Club Election Sections" : "Positions & Standings"}
            </h2>
            <p className="text-xs text-muted">
              Live leaderboard standings and voting ballots for each participating club
            </p>
          </div>
          {active.length > 0 && (
            <span className="text-sm text-muted tabular-nums">
              {active.length - pending.length} of {active.length} voted
            </span>
          )}
        </div>

        {positions.status === "error" && <ErrorState onRetry={positions.retry} />}

        {/* 1 Col Mobile, 2 Col Tablet, 3 Col Laptop Grid */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {positions.status === "loading" && [0, 1, 2].map((i) => <Skeleton key={i} className="h-[280px] w-full rounded-2xl" />)}
          {positions.status === "ready" &&
            [...pending, ...active.filter((p) => voted.has(p._id))].map((p) => (
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
      </section>
    </div>
  );
}
