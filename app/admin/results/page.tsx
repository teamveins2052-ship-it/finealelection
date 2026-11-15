"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { PageTitle } from "@/components/admin/shell";
import { useAdminData } from "@/components/admin/data";
import { Button } from "@/components/ui/button";
import { Card, Skeleton, VoteBar } from "@/components/ui/primitives";
import { useSession } from "@/hooks/use-session";
import { call, errorMessage } from "@/lib/client-data";
import { pct } from "@/lib/election";
import { cn } from "@/lib/utils";

export default function AdminResults() {
  const { positions, nominees, tallies } = useAdminData();
  const session = useSession();
  const [tab, setTab] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!positions || !nominees) return <Skeleton className="h-60" />;
  const active = positions.filter((p) => p.active);
  const current = active.find((p) => p._id === tab) ?? active[0];
  if (!current) return <p className="text-muted">No positions yet.</p>;
  const t = tallies?.[current._id];
  const rows = nominees.filter((n) => n.positionId === current._id && n.active).map((n) => ({ n, v: t?.counts[n._id] ?? 0 })).sort((a, b) => b.v - a.v);
  const canViewVoters = session.status === "ready" && session.admin?.canViewVoters;

  const recount = async () => {
    setBusy(true);
    try {
      const r = await call<{ positionId: string }, { total: number; drift: number }>("recountPosition", { positionId: current._id });
      toast.success(r.drift === 0 ? `No drift — ${r.total} votes` : `Recounted: ${r.total} votes (fixed drift of ${r.drift})`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageTitle title="Results">
        <Button variant="outline" size="sm" onClick={recount} loading={busy}>
          <RefreshCw className="size-4" /> Recount from votes
        </Button>
      </PageTitle>
      <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
        {active.map((p) => (
          <button key={p._id} role="tab" aria-selected={p._id === current._id} onClick={() => setTab(p._id)}
            className={cn("h-10 shrink-0 border-b-2 px-3 text-sm font-semibold", p._id === current._id ? "border-primary text-primary" : "border-transparent text-muted")}>
            {p.name}
          </button>
        ))}
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs text-muted">
            <tr><th className="p-3">#</th><th className="p-3">Nominee</th><th className="hidden p-3 md:table-cell">NIAT ID</th><th className="hidden w-1/3 p-3 sm:table-cell">Share</th><th className="p-3 text-right">Votes</th>{canViewVoters && <th className="p-3" />}</tr>
          </thead>
          <tbody>
            {rows.map(({ n, v }, i) => (
              <tr key={n._id} className="border-t border-border">
                <td className="p-3 tabular-nums">{i + 1}</td>
                <td className="p-3 font-semibold">{n.name}</td>
                <td className="hidden p-3 font-mono text-xs md:table-cell">{n.niatId}</td>
                <td className="hidden p-3 sm:table-cell"><div className="flex items-center gap-2"><VoteBar value={pct(v, t?.total ?? 0)} color={current.color} label={n.name} /><span className="w-12 text-right tabular-nums text-muted">{pct(v, t?.total ?? 0)}%</span></div></td>
                <td className="p-3 text-right font-semibold tabular-nums">{v}</td>
                {canViewVoters && <td className="p-3 text-right"><Link className="text-primary" href={`/admin/voters?position=${current._id}&nominee=${n._id}`}>Voters →</Link></td>}
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="border-t border-border"><td colSpan={2} className="p-3 text-right text-muted">Total</td><td className="hidden md:table-cell" /><td className="hidden sm:table-cell" /><td className="p-3 text-right font-bold tabular-nums">{t?.total ?? 0}</td>{canViewVoters && <td />}</tr></tfoot>
        </table>
      </Card>
    </>
  );
}
