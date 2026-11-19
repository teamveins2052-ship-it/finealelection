"use client";

import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import { Award, Download, ListChecks, Share2 } from "lucide-react";
import { ClubIcon } from "@/components/shared/club-icon";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, ErrorState, Skeleton } from "@/components/ui/primitives";
import { useAsync } from "@/hooks/use-async";
import { useMyVote, useVotedPositions } from "@/hooks/use-my-votes";
import { useSession } from "@/hooks/use-session";
import { getPositions } from "@/lib/client-data";
import { fmtIST } from "@/lib/election";
import type { Position } from "@/lib/schema";

/** V8: clubs voted (not who for), time, receipt codes, pending clubs, badges. */
export default function MyVotesPage() {
  const session = useSession();
  const positions = useAsync(() => getPositions(), []);
  const voted = useVotedPositions();
  if (session.status !== "ready" || !session.student) return null;
  const firstName = session.student.name.split(" ")[0];

  if (positions.status === "loading") return <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  if (positions.status === "error") return <ErrorState onRetry={positions.retry} />;
  const active = positions.data.filter((p) => p.active);
  const done = active.filter((p) => voted.has(p._id));
  const pending = active.filter((p) => !voted.has(p._id));

  const share = async (club: string | null) => {
    // D-16: badge text names the club(s), never the nominee.
    const text = club ? `I voted in ${club} at NIAT Elections '26 ✓ — ${firstName}` : `I voted in all ${active.length} clubs at NIAT Elections '26 🎉 — ${firstName}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        toast.success("Copied — paste it anywhere");
      }
    } catch {
      /* dismissed */
    }
  };

  return (
    <div className="space-y-5">
      <h1 className="font-display text-[28px] leading-[34px] lg:text-[40px] lg:leading-[44px]">My Votes</h1>

      {done.length > 0 && (
        <section aria-label="Badges" className="flex gap-2 overflow-x-auto pb-1">
          {pending.length === 0 && (
            <button onClick={() => share(null)} className="flex shrink-0 items-center gap-2 shadow-ink rounded-full border-2 border-ink bg-ink px-4 py-2 text-sm font-extrabold text-bg">
              <Award className="size-4" /> All clubs
            </button>
          )}
          {done.map((p) => (
            <button key={p._id} onClick={() => share(p.club)} className="flex shrink-0 items-center gap-2 rounded-full border-2 border-ink bg-surface px-4 py-2 text-sm font-bold">
              <ClubIcon name={p.icon} color={p.color} className="size-4" /> I voted · {p.club}
            </button>
          ))}
        </section>
      )}

      {done.length > 0 && (
        <Card className="overflow-hidden border-2 border-ink/15 bg-surface p-4 sm:p-5 rounded-2xl shadow-card space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Award className="size-5 text-primary" />
              <h2 className="font-display text-base font-bold">Official Election 2026 Poster</h2>
            </div>
            {pending.length === 0 && (
              <span className="rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-bold text-success border border-success/30">
                All {active.length} Cast 🎉
              </span>
            )}
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <a href="/election-poster.jpg" target="_blank" rel="noopener noreferrer" className="block shrink-0 group">
              <Image
                src="/election-poster.jpg"
                alt="NIAT Elections 2026 Official Poster"
                width={144}
                height={256}
                className="w-28 sm:w-36 h-auto rounded-xl shadow-md border border-border transition-transform group-hover:scale-105"
              />
            </a>
            <div className="flex-1 space-y-2 text-center sm:text-left">
              <p className="text-sm font-semibold text-foreground">
                {pending.length === 0
                  ? "Congratulations! You have completed voting across all clubs in the NIAT Campus Elections 2026."
                  : `You've cast votes in ${done.length} of ${active.length} clubs. Download the official candidates poster:`}
              </p>
              <p className="text-xs text-muted">
                Official high-resolution poster featuring all presidential nominees across clubs.
              </p>
              <div className="flex flex-wrap gap-2.5 justify-center sm:justify-start pt-1">
                <a
                  href="/api/download-poster"
                  download="niat-election-poster-2026.jpg"
                  className="inline-flex items-center gap-1.5 rounded-full border border-ink bg-ink px-4 py-2 text-xs font-bold text-bg shadow-ink transition-transform active:scale-95"
                >
                  <Download className="size-3.5" /> Download Election Poster
                </a>
                <a
                  href="/election-poster.jpg"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-4 py-2 text-xs font-bold text-foreground hover:bg-muted/10"
                >
                  View Full Poster
                </a>
              </div>
            </div>
          </div>
        </Card>
      )}

      {done.length === 0 ? (
        <EmptyState icon={ListChecks} title="You haven't voted yet.">
          <Link href="/vote" className="font-semibold text-primary">
            Start voting →
          </Link>
        </EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {done.map((p) => (
            <VotedRow key={p._id} position={p} />
          ))}
        </div>
      )}

      {pending.length > 0 && done.length > 0 && (
        <section className="grid gap-2 md:grid-cols-2">
          <h2 className="font-display text-lg md:col-span-2">Still to vote</h2>
          {pending.map((p) => (
            <Link key={p._id} href={`/vote/${p._id}`} className="flex h-14 items-center gap-3 rounded-lg border border-border bg-surface px-4">
              <ClubIcon name={p.icon} color={p.color} />
              <span className="flex-1 font-semibold">{p.name}</span>
              <span className="text-sm font-semibold text-primary">Vote now →</span>
            </Link>
          ))}
        </section>
      )}
      {done.length > 0 && (
        <Button variant="secondary" className="w-full md:w-auto" onClick={() => share(null)} disabled={pending.length > 0}>
          <Share2 className="size-4" /> {pending.length ? `${pending.length} left for the all-clubs badge` : "Share all-clubs badge"}
        </Button>
      )}
    </div>
  );
}

/** The choice itself is never shown again after voting — only that the vote is in. */
function VotedRow({ position }: { position: Position & { _id: string } }) {
  const vote = useMyVote(position._id, true);
  return (
    <Card className="flex items-center gap-3 p-4">
      <ClubIcon name={position.icon} color={position.color} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted">{position.club}</p>
        <div className="truncate font-semibold">Voted for {position.name}</div>
        <p className="text-xs text-muted">{vote?.createdAt ? fmtIST(vote.createdAt.toMillis()) : "Submitting…"}</p>
      </div>
      {vote?.receiptCode ? (
        <span className="inline-flex h-11 items-center rounded-md bg-surface-2 px-3 font-mono text-sm font-semibold" aria-label={`Receipt ${vote.receiptCode}`}>
          {vote.receiptCode}
        </span>
      ) : (
        <Skeleton className="h-11 w-24" />
      )}
    </Card>
  );
}
