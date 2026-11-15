"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot, type Timestamp } from "firebase/firestore";
import { firebase } from "@/lib/firebase/client";
import { phaseOf, type ClientPhase, type PublicSettings } from "@/lib/election";

type State = { status: "loading" } | { status: "error" } | { status: "ready"; settings: PublicSettings; phase: ClientPhase };

let shared: State = { status: "loading" };
const listeners = new Set<(s: State) => void>();
let started = false;

const ms = (t: unknown) => ((t as Timestamp | undefined)?.toMillis?.() ?? 0);

function start() {
  if (started) return;
  started = true;
  // settings/election is public-read (P-SET-01) and changes rarely → one cheap listener per client.
  onSnapshot(
    doc(firebase().db, "settings", "election"),
    (snap) => {
      if (!snap.exists()) return emit({ status: "error" });
      const d = snap.data();
      const settings: PublicSettings = {
        campaignOpensAt: ms(d.campaignOpensAt),
        opensAt: ms(d.opensAt),
        closesAt: ms(d.closesAt),
        siteClosesAt: ms(d.siteClosesAt),
        paused: d.paused === true,
        pausedReason: (d.pausedReason as string | null) ?? null,
        resultsPublished: d.resultsPublished === true,
        nomineesCanSelfVote: d.nomineesCanSelfVote !== false,
        requireStudentMfa: d.requireStudentMfa !== false, // default ON (matches rules)
      };
      emit({ status: "ready", settings, phase: phaseOf(settings) });
    },
    () => emit({ status: "error" }),
  );
  // Re-derive phase every 15 s so the UI flips at open/close without a reload.
  setInterval(() => {
    if (shared.status === "ready") {
      const phase = phaseOf(shared.settings);
      if (phase !== shared.phase) emit({ ...shared, phase });
    }
  }, 15_000);
}

function emit(s: State) {
  shared = s;
  listeners.forEach((l) => l(s));
}

export function useElection(): State {
  const [state, setState] = useState<State>(shared);
  useEffect(() => {
    start();
    listeners.add(setState);
    setState(shared);
    return () => void listeners.delete(setState);
  }, []);
  return state;
}

/** Ticking clock for countdowns only (kept out of the shared state to avoid re-rendering everything). */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
