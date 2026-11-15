"use client";

import { useMemo } from "react";
import { PageTitle } from "@/components/admin/shell";
import { useAdminData } from "@/components/admin/data";
import { Card, Skeleton, VoteBar } from "@/components/ui/primitives";
import { pct } from "@/lib/election";

/** D8: turnout by batch, participation by position, lowest-participation clubs. */
export default function AnalyticsPage() {
  const { students, positions, tallies } = useAdminData();

  const byBatch = useMemo(() => {
    const m = new Map<string, { eligible: number; voted: number }>();
    for (const s of students ?? []) {
      if (s.status !== "active") continue;
      const e = m.get(s.batch) ?? { eligible: 0, voted: 0 };
      e.eligible++;
      if (s.votedCount > 0) e.voted++;
      m.set(s.batch, e);
    }
    return [...m.entries()].sort();
  }, [students]);

  const eligible = students?.filter((s) => s.status === "active").length ?? 0;
  const byPosition = (positions ?? []).filter((p) => p.active).map((p) => ({ p, total: tallies?.[p._id]?.total ?? 0 })).sort((a, b) => a.total - b.total);
  const completion = useMemo(() => {
    const active = (positions ?? []).filter((p) => p.active).length;
    const buckets = Array.from({ length: active + 1 }, () => 0);
    for (const s of students ?? []) if (s.status === "active") buckets[Math.min(s.votedCount, active)]++;
    return buckets;
  }, [students, positions]);

  if (!students || !positions) return <Skeleton className="h-96" />;

  return (
    <>
      <PageTitle title="Analytics" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-4">
          <h2 className="font-semibold">Turnout by batch</h2>
          {byBatch.map(([b, v]) => (
            <div key={b} className="space-y-1">
              <div className="flex justify-between text-sm"><span>Batch {b} {b === "2025" ? "(seniors)" : b === "2026" ? "(juniors)" : ""}</span><span className="tabular-nums text-muted">{v.voted}/{v.eligible} · {pct(v.voted, v.eligible)}%</span></div>
              <VoteBar value={pct(v.voted, v.eligible)} label={`Batch ${b} turnout`} />
            </div>
          ))}
        </Card>
        <Card className="space-y-3 p-4">
          <h2 className="font-semibold">Participation by position <span className="text-xs font-normal text-muted">(lowest first)</span></h2>
          {byPosition.map(({ p, total }) => (
            <div key={p._id} className="space-y-1">
              <div className="flex justify-between text-sm"><span>{p.name}</span><span className="tabular-nums text-muted">{total} · {pct(total, eligible)}%</span></div>
              <VoteBar value={pct(total, eligible)} color={p.color} label={`${p.name} participation`} />
            </div>
          ))}
        </Card>
        <Card className="space-y-3 p-4 lg:col-span-2">
          <h2 className="font-semibold">How many clubs each student has voted in</h2>
          <div className="flex h-40 items-end gap-2">
            {completion.map((n, i) => {
              const max = Math.max(...completion, 1);
              return (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-xs tabular-nums text-muted">{n}</span>
                  <div className="w-full rounded-t-sm bg-primary/80" style={{ height: `${(n / max) * 120}px` }} />
                  <span className="text-xs">{i}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </>
  );
}
