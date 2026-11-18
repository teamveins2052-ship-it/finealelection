"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { Crown, Lock, Share2 } from "lucide-react";
import { ClubIcon } from "@/components/shared/club-icon";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, ErrorState, Skeleton, VoteBar } from "@/components/ui/primitives";
import { LeaderboardPodium, type LeaderboardRanking } from "@/components/ui/leaderboard-podium";
import { useAsync } from "@/hooks/use-async";
import { useElection } from "@/hooks/use-election";
import { useTallies } from "@/hooks/use-realtime";
import { getNominees, getPositions } from "@/lib/client-data";
import { fmtIST, pct } from "@/lib/election";

/** E4 / DESIGN §6.11: locked until the committee publishes. */
export default function ResultsPage() {
  const election = useElection();
  const tallies = useTallies();
  const published = election.status === "ready" && election.settings.resultsPublished;
  const data = useAsync(async () => {
    if (!published) return [];
    const positions = (await getPositions()).filter((p) => p.active);
    return Promise.all(positions.map(async (p) => ({ position: p, nominees: await getNominees(p._id) })));
  }, [published]);

  useEffect(() => {
    if (!published || sessionStorage.getItem("niat.confetti")) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    sessionStorage.setItem("niat.confetti", "1");
    // Lazy: confetti never ships on the voting path (DESIGN §11).
    import("canvas-confetti").then(({ default: confetti }) => confetti({ particleCount: 120, spread: 80, origin: { y: 0.3 } }));
  }, [published]);

  if (election.status !== "ready") return <Skeleton className="h-60 w-full" />;
  if (!published) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-12 text-muted" />
        <h1 className="font-display text-[22px] font-semibold">Results unlock when voting closes</h1>
        <p className="text-muted">Voting closes {fmtIST(election.settings.closesAt)} IST. The committee publishes results after review.</p>
      </div>
    );
  }
  if (data.status === "loading") return <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-60 w-full" />)}</div>;
  if (data.status === "error") return <ErrorState onRetry={data.retry} />;

  return (
    <div className="space-y-5">
      <h1 className="font-display text-[28px] leading-[34px] lg:text-[40px] lg:leading-[44px]">Results</h1>
      <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {data.data.map(({ position, nominees }) => {
        const t = tallies.data?.[position._id];
        const total = t?.total ?? 0;
        const ranked = nominees.map((n) => ({ n, v: t?.counts[n._id] ?? 0 })).sort((a, b) => b.v - a.v);
        const top = ranked[0];
        const tie = ranked.length > 1 && ranked[1].v === top?.v;

        const podiumRankings: LeaderboardRanking[] = ranked.slice(0, 3).map((r, idx) => ({
          userId: r.n._id,
          userName: r.n.name,
          rank: idx + 1,
          value: r.v,
          avatarUrl: r.n.photoUrl ?? undefined,
        }));

        return (
          <Card key={position._id} className="overflow-hidden border-t-4" style={{ borderTopColor: position.color }}>
            <div className="flex items-center gap-2 px-4 pt-4 text-sm font-semibold text-muted">
              <ClubIcon name={position.icon} color={position.color} className="size-4" /> {position.name}
            </div>

            {podiumRankings.length >= 2 ? (
              <div className="px-2 pt-4 pb-2">
                <LeaderboardPodium size="sm" rankings={podiumRankings} showValue showAvatar />
                {!tie && top && (
                  <div className="mt-2 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        const text = `Congratulations ${top.n.name} — ${position.name}, NIAT Elections '26 🎉`;
                        if (navigator.share) await navigator.share({ text }).catch(() => undefined);
                        else navigator.clipboard.writeText(text).then(() => toast.success("Copied"));
                      }}
                    >
                      <Share2 className="size-4" /> Share winner
                    </Button>
                  </div>
                )}
              </div>
            ) : top ? (
              <div className="flex flex-col items-center gap-2 p-5 text-center">
                <div className="relative">
                  <Avatar src={top.n.photoUrl} name={top.n.name} color={position.color} size={120} />
                  <Crown className="absolute -top-4 left-1/2 size-8 -translate-x-1/2 text-warning" />
                </div>
                <p className="font-display text-xl font-bold">{tie ? "Tie at the top" : top.n.name}</p>
                <p className="font-display text-sm tabular-nums text-muted">
                  {pct(top.v, total)}% · {top.v.toLocaleString("en-IN")} votes
                </p>
                {!tie && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      const text = `Congratulations ${top.n.name} — ${position.name}, NIAT Elections '26 🎉`;
                      if (navigator.share) await navigator.share({ text }).catch(() => undefined);
                      else navigator.clipboard.writeText(text).then(() => toast.success("Copied"));
                    }}
                  >
                    <Share2 className="size-4" /> Share
                  </Button>
                )}
              </div>
            ) : null}
            <ul className="space-y-3 border-t border-border p-4">
              {ranked.map(({ n, v }) => (
                <li key={n._id} className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="font-semibold">{n.name}</span>
                    <span className="tabular-nums text-muted">
                      {v.toLocaleString("en-IN")} · {pct(v, total)}%
                    </span>
                  </div>
                  <VoteBar value={pct(v, total)} color={position.color} label={`${n.name} share`} />
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
      </div>
    </div>
  );
}
