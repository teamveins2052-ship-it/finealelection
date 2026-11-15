"use client";

import { useCallback, useEffect, useState } from "react";

export type Async<T> = { status: "loading" } | { status: "error"; retry: () => void } | { status: "ready"; data: T; reload: () => void };

/** Loading / error-with-retry / ready — every data screen needs all three (DESIGN §8). */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]): Async<T> {
  const [state, setState] = useState<{ status: "loading" } | { status: "error" } | { status: "ready"; data: T }>({ status: "loading" });
  const [n, setN] = useState(0);
  const retry = useCallback(() => setN((x) => x + 1), []);

  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    load()
      .then((data) => alive && setState({ status: "ready", data }))
      .catch((e) => {
        console.warn("[load]", e);
        if (alive) setState({ status: "error" });
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);

  if (state.status === "error") return { status: "error", retry };
  if (state.status === "ready") return { status: "ready", data: state.data, reload: retry };
  return { status: "loading" };
}
