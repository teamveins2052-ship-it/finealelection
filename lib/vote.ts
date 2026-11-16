"use client";

import { doc, serverTimestamp, setDoc } from "@/lib/db/firestore";
import { AppError } from "@/lib/db/errors";
import { backend } from "@/lib/backend/client";
import { CastVoteInput, ids } from "@/lib/schema";
import { call } from "@/lib/client-data";

export type VoteResult = { ok: true } | { ok: false; reason: "already" | "closed" | "offline" | "error"; message: string };

/**
 * Clients write ONLY the vote doc (AGENTS §5.2–3). Doc ID = `{niatId}_{positionId}`, so a
 * retry or second tab targets the same doc; rules deny the update → never double counted.
 * Offline, the write fails fast and the student is told to retry when back online.
 */
export async function castVote(voterId: string, positionId: string, nomineeId: string, onQueued?: () => void): Promise<VoteResult> {
  const input = CastVoteInput.parse({ voterId, positionId, nomineeId });
  const ref = doc(backend().db, "votes", ids.vote(input.voterId, input.positionId));
  const write = setDoc(ref, {
    voterId: input.voterId,
    positionId: input.positionId,
    nomineeId: input.nomineeId,
    createdAt: serverTimestamp(),
  });
  // If the server hasn't acknowledged within 4 s we're probably offline: tell the user it's queued.
  const slow = setTimeout(() => onQueued?.(), 4000);
  try {
    await write;
    // Ask the server to count THIS vote now (it can only count the caller's own vote doc;
    // a missed call is picked up by the server sweep in tick.ts).
    void call("countMyVote", { positionId: input.positionId }).catch(() => undefined);
    return { ok: true };
  } catch (e) {
    if (e instanceof AppError && e.code === "permission-denied") {
      return {
        ok: false,
        reason: "already",
        message: "Your vote couldn't be recorded. You may have already voted in this club, or voting is closed or paused.",
      };
    }
    if (e instanceof AppError && e.code === "unavailable") {
      return { ok: false, reason: "offline", message: "You're offline. Your vote was NOT recorded — reconnect and try again." };
    }
    return { ok: false, reason: "error", message: "Something went wrong. Try again." };
  } finally {
    clearTimeout(slow);
  }
}
