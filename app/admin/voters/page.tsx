"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, ShieldAlert } from "lucide-react";
import { PageTitle } from "@/components/admin/shell";
import { useAdminData } from "@/components/admin/data";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { useSession } from "@/hooks/use-session";
import { call, errorMessage } from "@/lib/client-data";
import { downloadCsv } from "@/lib/csv";
import { fmtIST } from "@/lib/election";

interface Row { niatId: string; name: string; batch: string; nomineeId: string; receiptCode: string | null; at: number }

export default function VotersPage() {
  return <Suspense><Voters /></Suspense>;
}

/** D2 / P-FN-05: who voted for whom. Voter-admins only; every load is audited server-side. */
function Voters() {
  const params = useSearchParams();
  const session = useSession();
  const { positions, nominees } = useAdminData();
  const [positionId, setPositionId] = useState(params.get("position") ?? "");
  const [nomineeId, setNomineeId] = useState(params.get("nominee") ?? "");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session.status !== "ready" || !session.admin?.canViewVoters) {
    return <EmptyState icon={ShieldAlert} title="Only voter-admins can see who voted for whom." />;
  }
  const nameOf = (id: string) => nominees?.find((n) => n._id === id)?.name ?? id;

  const load = async () => {
    if (!positionId) return;
    setBusy(true);
    setError(null);
    try {
      const r = await call<{ positionId: string; nomineeId?: string }, { rows: Row[] }>("getVotersForNominee", { positionId, ...(nomineeId ? { nomineeId } : {}) });
      setRows(r.rows);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageTitle title="Voters">
        {rows && rows.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => downloadCsv(`voters-${positionId}.csv`, [["NIAT ID", "Name", "Batch", "Voted for", "Receipt", "Time (IST)"], ...rows.map((r) => [r.niatId, r.name, r.batch, nameOf(r.nomineeId), r.receiptCode, fmtIST(r.at, "yyyy-MM-dd HH:mm:ss")])])}>
            <Download className="size-4" /> CSV
          </Button>
        )}
      </PageTitle>
      <p className="mb-4 flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm">
        <ShieldAlert className="size-4 shrink-0 text-danger" /> Sensitive — every view is logged in the audit log.
      </p>
      <Card className="mb-4 flex flex-wrap items-end gap-3 p-4">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted">Position</span>
          <select value={positionId} onChange={(e) => { setPositionId(e.target.value); setNomineeId(""); }} className="h-10 rounded-sm border border-border bg-surface-2 px-3">
            <option value="">Choose…</option>
            {positions?.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted">Nominee</span>
          <select value={nomineeId} onChange={(e) => setNomineeId(e.target.value)} className="h-10 rounded-sm border border-border bg-surface-2 px-3">
            <option value="">All nominees</option>
            {nominees?.filter((n) => n.positionId === positionId).map((n) => <option key={n._id} value={n._id}>{n.name}</option>)}
          </select>
        </label>
        <Button size="sm" onClick={load} loading={busy} disabled={!positionId}>Show voters</Button>
      </Card>
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      {busy && <Skeleton className="h-40" />}
      {rows && !busy && (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-2 text-left text-xs text-muted">
              <tr><th className="p-3">NIAT ID</th><th className="p-3">Name</th><th className="hidden p-3 sm:table-cell">Batch</th><th className="p-3">Voted for</th><th className="hidden p-3 md:table-cell">Receipt</th><th className="p-3">Time</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.niatId}`} className="border-t border-border">
                  <td className="p-3 font-mono text-xs">{r.niatId}</td><td className="p-3">{r.name}</td><td className="hidden p-3 sm:table-cell">{r.batch}</td>
                  <td className="p-3">{nameOf(r.nomineeId)}</td><td className="hidden p-3 font-mono text-xs md:table-cell">{r.receiptCode ?? "—"}</td>
                  <td className="p-3 text-xs text-muted">{fmtIST(r.at, "d MMM, h:mm:ss a")}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted">No votes yet.</td></tr>}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
