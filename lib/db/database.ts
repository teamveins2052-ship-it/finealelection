"use client";

import { supabase } from "@/lib/supabase/client";

/**
 * Public live data (replaces Firebase Realtime Database): rows of the `rt` table
 * (tallies, wall, election, pulse, predictionLeaderboard), pushed by Supabase Realtime.
 * Never polled while Realtime works; falls back to a slow refresh if it can't connect
 * (e.g. the free plan's connection limit is reached).
 */
export type Database = { readonly kind: "rt" };
export const rtdb: Database = { kind: "rt" };
export interface RtRef {
  path: string;
}
export const ref = (_db: Database, path: string): RtRef => ({ path });

const PUBLIC = new Set(["tallies", "wall", "election", "pulse", "predictionLeaderboard"]);

function pick(value: unknown, rest: string[]): unknown {
  let cur = value;
  for (const p of rest) cur = cur && typeof cur === "object" ? (cur as Record<string, unknown>)[p] : undefined;
  return cur ?? null;
}

export function onValue(r: RtRef, cb: (snap: { val(): unknown }) => void, onError?: (e: Error) => void): () => void {
  const [top, ...rest] = r.path.split("/").filter(Boolean);
  if (!top || !PUBLIC.has(top)) {
    onError?.(new Error("not readable"));
    return () => undefined;
  }
  let stopped = false;
  let poll: ReturnType<typeof setInterval> | null = null;
  const emit = (value: unknown) => !stopped && cb({ val: () => pick(value, rest) });
  const load = async () => {
    const { data, error } = await supabase().from("rt").select("value").eq("path", top).maybeSingle();
    if (stopped) return;
    if (error) onError?.(new Error(error.message));
    else emit(data?.value ?? null);
  };
  const channel = supabase()
    .channel(`rt:${top}:${Math.random().toString(36).slice(2, 8)}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "rt", filter: `path=eq.${top}` }, (p) => {
      emit((p.new as { value?: unknown } | null)?.value ?? null);
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        if (poll) clearInterval(poll);
        poll = null;
        void load(); // catch anything that changed while connecting
      } else if ((status === "CHANNEL_ERROR" || status === "TIMED_OUT") && !poll) {
        poll = setInterval(load, 30_000);
      }
    });
  void load();
  return () => {
    stopped = true;
    if (poll) clearInterval(poll);
    void supabase().removeChannel(channel);
  };
}
