"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { Crown, Flame, HandHeart } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { VoteBar } from "@/components/ui/primitives";
import { AnimatedNumber } from "./animated-number";
import type { Nominee } from "@/lib/schema";
import { cn } from "@/lib/utils";

/** DESIGN §4 NomineeRow: ranked, live, reorders with a layout animation (no jump). */
export function NomineeRow({
  nominee,
  rank,
  votes,
  pctValue,
  color,
  leader,
  mine,
}: {
  nominee: Nominee & { _id: string };
  rank: number;
  votes: number;
  pctValue: number;
  color: string;
  leader: boolean;
  mine?: boolean;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.li layout={!reduce} transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }} className="w-full min-w-0 max-w-full">
      <Link
        href={`/nominee/${nominee._id}`}
        className={cn(
          "flex items-center gap-2.5 sm:gap-3 rounded-lg border border-border bg-surface p-2.5 sm:p-3 shadow-card active:scale-[.99] w-full min-w-0 max-w-full overflow-hidden",
          mine && "border-success ring-1 ring-success",
        )}
      >
        <span className="w-5 sm:w-6 shrink-0 text-center font-display text-xs sm:text-sm font-bold text-muted tabular-nums">#{rank}</span>
        <Avatar src={nominee.photoUrl} name={nominee.name} color={color} size={44} ring={nominee.hasActiveStory} className="shrink-0" />
        <span className="min-w-0 flex-1 space-y-1">
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="truncate block font-semibold text-xs sm:text-sm">{nominee.name}</span>
            {leader && votes > 0 && <Crown className="size-3.5 sm:size-4 shrink-0 text-warning" aria-label="Leading" />}
          </span>
          <span className="flex items-center gap-2 sm:gap-3 text-[11px] sm:text-xs text-muted">
            <span className="shrink-0">Batch {nominee.batch}</span>
            <span className="inline-flex items-center gap-0.5 shrink-0">
              <Flame className="size-3 sm:size-3.5" /> {nominee.reactionCounts?.fire ?? 0}
            </span>
            <span className="inline-flex items-center gap-0.5 shrink-0">
              <HandHeart className="size-3.5 sm:size-3.5" /> {nominee.reactionCounts?.clap ?? 0}
            </span>
          </span>
          <VoteBar value={pctValue} color={color} label={`${nominee.name} share of votes`} />
        </span>
        <span className="w-14 sm:w-16 shrink-0 text-right">
          <span className="block font-display text-base sm:text-lg font-bold tabular-nums">
            <AnimatedNumber value={votes} />
          </span>
          <span className="block text-[11px] sm:text-xs text-muted tabular-nums">{pctValue}%</span>
        </span>
      </Link>
    </motion.li>
  );
}
