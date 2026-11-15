"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { firebase } from "@/lib/firebase/client";
import { conv, type WithId } from "@/lib/schema/converters";
import { ids, type Vote } from "@/lib/schema";
import { useSession } from "./use-session";

/**
 * Votes cast in this tab before onVoteCreated updates `votedPositions` (or while offline).
 * Merged with the server list so the UI locks instantly and never offers a second vote.
 */
const local = new Map<string, string>();
const subs = new Set<() => void>();
let snapshot = new Map(local);
export function rememberLocalVote(positionId: string, nomineeId: string) {
  local.set(positionId, nomineeId);
  snapshot = new Map(local);
  subs.forEach((s) => s());
}
function useLocalVotes() {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => snapshot,
    () => snapshot,
  );
}

/** Set of position IDs this student has voted in. */
export function useVotedPositions(): Set<string> {
  const s = useSession();
  const localVotes = useLocalVotes();
  const server = s.status === "ready" ? (s.student?.votedPositions ?? []) : [];
  return new Set([...server, ...localVotes.keys()]);
}

/**
 * Listens to the student's own vote doc for a position (owner read, P-VOT-01) — gives the
 * receipt code once onVoteCreated has run. Only subscribes when we know the doc exists,
 * because reading a missing vote doc is denied by rules.
 */
export function useMyVote(positionId: string, known: boolean) {
  const s = useSession();
  const niatId = s.status === "ready" ? s.student?.niatId : undefined;
  const [vote, setVote] = useState<WithId<Vote> | null>(null);
  useEffect(() => {
    if (!niatId || !known) return;
    return onSnapshot(
      doc(firebase().db, "votes", ids.vote(niatId, positionId)).withConverter(conv.vote),
      { includeMetadataChanges: true },
      (snap) => setVote(snap.exists() ? snap.data() : null),
      () => setVote(null),
    );
  }, [niatId, positionId, known]);
  return vote;
}
