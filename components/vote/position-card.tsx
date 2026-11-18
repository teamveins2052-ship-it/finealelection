import Link from "next/link";
import { CheckCircle2, ChevronRight, Trophy } from "lucide-react";
import { ClubIcon } from "@/components/shared/club-icon";
import { Chip } from "@/components/ui/primitives";
import { LeaderboardPodium, type LeaderboardRanking } from "@/components/ui/leaderboard-podium";
import type { Position } from "@/lib/schema";
import { cn } from "@/lib/utils";

function getClubShortName(position: { _id: string; club?: string; name: string }) {
  if (position._id === "genai-lead") return "Gen AI";
  if (position._id === "tech-lead") return "Advanced Tech";
  if (position._id === "edc-lead") return "EDC";
  if (position._id === "media-head") return "Media Club";
  if (position._id === "arts-head") return "Arts Club";
  if (position._id === "sports-president") return "Sports Club";
  if (position._id === "nsgc-president") return "NSGC";
  return position.club?.replace(/\s*\([^)]*\)/g, "") || position.name.replace(/ Lead| Head| President/g, "");
}

export function PositionCard({
  position,
  voted,
  closed,
  total,
  rankings,
  compact = false,
}: {
  position: Position & { _id: string };
  voted: boolean;
  closed: boolean;
  total?: number;
  rankings?: LeaderboardRanking[];
  compact?: boolean;
}) {
  const nomineeCount = typeof position.nomineeCount === "number" ? position.nomineeCount : (rankings ? rankings.length : 0);
  const voteTotal = typeof total === "number" ? total : (rankings ? rankings.reduce((acc, r) => acc + r.value, 0) : 0);

  if (compact) {
    return (
      <Link
        href={`/vote/${position._id}`}
        className={cn(
          "flex h-[76px] min-w-0 items-center gap-2.5 rounded-lg border border-t-4 border-border bg-surface px-3 py-2.5 sm:px-3.5 shadow-card transition-all hover:border-ink/40 active:scale-[.98]",
          voted && "opacity-80",
        )}
        style={{ borderTopColor: position.color }}
      >
        <span
          className="relative grid size-10 shrink-0 place-items-center rounded-full overflow-hidden bg-white border-2 p-1 shadow-xs"
          style={{ borderColor: `${position.color}80` }}
        >
          <ClubIcon name={position.icon} id={position._id} color={position.color} className="size-full object-contain" />
        </span>
        <span className="min-w-0 flex-1 overflow-hidden">
          <span className="block truncate font-semibold text-sm leading-tight text-ink" title={position.name}>
            {position.name}
          </span>
          <span className="block text-xs text-muted truncate">
            {nomineeCount} {nomineeCount === 1 ? "nominee" : "nominees"} · {voteTotal.toLocaleString("en-IN")} {voteTotal === 1 ? "vote" : "votes"}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {voted ? (
            <Chip tone="success" className="h-6 px-2 text-[11px]">
              <CheckCircle2 className="size-3" /> Voted
            </Chip>
          ) : closed ? (
            <Chip className="h-6 px-2 text-[11px]">Closed</Chip>
          ) : (
            <Chip tone="primary" className="h-6 px-2 text-[11px]">Not voted</Chip>
          )}
          <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
        </span>
      </Link>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col justify-between rounded-2xl border border-border bg-surface shadow-card transition-all overflow-hidden hover:border-ink/30",
        voted && "opacity-90"
      )}
      style={{ borderTop: `4px solid ${position.color}` }}
    >
      {/* Header */}
      <div className="p-3.5 sm:p-4 flex items-center justify-between gap-2.5 border-b border-border/40">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="relative grid size-12 sm:size-13 shrink-0 place-items-center rounded-full overflow-hidden bg-white border-2 p-1.5 shadow-sm"
            style={{ borderColor: `${position.color}80` }}
          >
            <ClubIcon name={position.icon} id={position._id} color={position.color} className="size-full object-contain" />
          </span>
          <div className="min-w-0">
            <h3 className="block truncate font-bold text-sm leading-tight text-ink" title={position.name}>
              {position.name}
            </h3>
            <p className="block text-xs text-muted truncate">
              {nomineeCount} {nomineeCount === 1 ? "nominee" : "nominees"} · {voteTotal.toLocaleString("en-IN")} {voteTotal === 1 ? "vote" : "votes"}
            </p>
          </div>
        </div>
        <div className="shrink-0">
          {voted ? (
            <Chip tone="success" className="h-6 px-2 text-[11px] font-semibold">
              <CheckCircle2 className="size-3" /> Voted
            </Chip>
          ) : closed ? (
            <Chip className="h-6 px-2 text-[11px] font-semibold">Closed</Chip>
          ) : (
            <Chip tone="primary" className="h-6 px-2 text-[11px] font-semibold">Not voted</Chip>
          )}
        </div>
      </div>

      {/* Dedicated Leaderboard Podium for this Section */}
      <div className="p-3 sm:p-4 flex-1 flex flex-col justify-end items-center min-h-[175px] bg-surface-2/20">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted mb-2 flex items-center gap-1">
          <Trophy className="size-3 text-warning" /> Live {getClubShortName(position)} Standings
        </span>
        {rankings && rankings.length > 0 ? (
          <LeaderboardPodium size="sm" rankings={rankings} showValue showAvatar />
        ) : (
          <div className="flex flex-col items-center justify-center py-6 text-center text-xs text-muted">
            <Trophy className="size-6 text-muted/30 mb-1" />
            <p className="font-medium">
              {nomineeCount === 0 ? "No candidates registered yet" : "No votes recorded yet"}
            </p>
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div className="p-3 bg-surface border-t border-border/40">
        <Link
          href={`/vote/${position._id}`}
          className={cn(
            "w-full flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-bold rounded-xl transition shadow-sm",
            voted
              ? "bg-surface-2 text-ink hover:bg-border/60"
              : "bg-ink text-bg hover:opacity-90 active:scale-[.99]"
          )}
        >
          <span>{voted ? "View Results & Receipt" : `Vote in ${getClubShortName(position)}`}</span>
          <ChevronRight className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}
