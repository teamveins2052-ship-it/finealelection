"use client";

import { useEffect, useState } from "react";
import { onValue, ref } from "@/lib/db/database";
import type { ZodType } from "zod";
import { backend } from "@/lib/backend/client";
import { RtTallySchema, RtWallSchema, type RtTally, type RtWall } from "@/lib/schema";
import { z } from "zod";

/**
 * Live counts come from RTDB push, never polling (MASTER §3, AGENTS §6).
 * One shared socket; each path subscribed once however many components use it.
 */
export function useRtdb<T>(path: string, schema: ZodType<T>): { data: T | null; loading: boolean; error: boolean } {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: boolean }>({ data: null, loading: true, error: false });
  useEffect(() => {
    const unsub = onValue(
      ref(backend().rtdb, path),
      (snap) => {
        const parsed = schema.safeParse(snap.val());
        setState({ data: parsed.success ? parsed.data : null, loading: false, error: false });
      },
      () => setState({ data: null, loading: false, error: true }),
    );
    return unsub;
  }, [path, schema]);
  return state;
}

const TalliesSchema = z.record(z.string(), RtTallySchema).nullable().transform((v) => v ?? {});

export function useTallies() {
  return useRtdb<Record<string, RtTally>>("tallies", TalliesSchema as unknown as ZodType<Record<string, RtTally>>);
}

export function useWall() {
  return useRtdb<RtWall>("wall", RtWallSchema as unknown as ZodType<RtWall>);
}
