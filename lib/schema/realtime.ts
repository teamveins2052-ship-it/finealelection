import { z } from "zod";
import { Phase } from "./common";

export const RtTallySchema = z.object({
  total: z.number().int().min(0),
  counts: z.record(z.string(), z.number().int().min(0)).default({}),
  updatedAt: z.number(),
});

export const RtWallSchema = z.object({
  totalVotes: z.number().int().min(0),
  votersCount: z.number().int().min(0),
  turnoutPct: z.number().min(0).max(100),
  recent: z.record(z.string(), z.object({ club: z.string(), at: z.number() })).default({}),
});

export const RtElectionSchema = z.object({
  phase: Phase,
  paused: z.boolean(),
  closesAt: z.number(),
  resultsPublished: z.boolean(),
});

export const RtPulseSchema = z.object({ counts: z.array(z.number().int().min(0)), total: z.number().int().min(0) });

export const RtLeaderboardEntrySchema = z.object({ name: z.string(), batch: z.string(), score: z.number().int() });

export type RtTally = z.infer<typeof RtTallySchema>;
export type RtWall = z.infer<typeof RtWallSchema>;
export type RtElection = z.infer<typeof RtElectionSchema>;
export type RtPulse = z.infer<typeof RtPulseSchema>;
export type RtLeaderboardEntry = z.infer<typeof RtLeaderboardEntrySchema>;
