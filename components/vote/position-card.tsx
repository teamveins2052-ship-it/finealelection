import Link from "next/link";
import { CheckCircle2, ChevronRight } from "lucide-react";
import { ClubIcon } from "@/components/shared/club-icon";
import { Chip } from "@/components/ui/primitives";
import type { Position } from "@/lib/schema";
import { cn } from "@/lib/utils";

export function PositionCard({
  position,
  voted,
  closed,
  total,
}: {
  position: Position & { _id: string };
  voted: boolean;
  closed: boolean;
  total?: number;
}) {
  return (
    <Link
      href={`/vote/${position._id}`}
      className={cn(
        "flex min-h-[76px] min-w-0 items-center gap-3 rounded-lg border border-t-4 border-border bg-surface p-4 shadow-card transition-transform active:scale-[.98]",
        voted && "opacity-80",
      )}
      style={{ borderTopColor: position.color }}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-md" style={{ background: `${position.color}1f` }}>
        <ClubIcon name={position.icon} color={position.color} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{position.name}</span>
        <span className="block text-sm text-muted">
          {position.nomineeCount} nominee{position.nomineeCount === 1 ? "" : "s"}
          {typeof total === "number" && ` · ${total.toLocaleString("en-IN")} votes`}
        </span>
      </span>
      {voted ? (
        <Chip tone="success">
          <CheckCircle2 className="size-3.5" /> Voted
        </Chip>
      ) : closed ? (
        <Chip>Closed</Chip>
      ) : (
        <Chip tone="primary">Not voted</Chip>
      )}
      <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
    </Link>
  );
}
