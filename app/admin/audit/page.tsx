"use client";

import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, where, type Timestamp } from "@/lib/db/firestore";
import { Download } from "lucide-react";
import { PageTitle } from "@/components/admin/shell";
import { Button } from "@/components/ui/button";
import { Card, Skeleton } from "@/components/ui/primitives";
import { backend } from "@/lib/backend/client";
import { downloadCsv } from "@/lib/csv";
import { fmtIST } from "@/lib/election";
import { AuditAction } from "@/lib/schema";

interface Log { id: string; actor: string; actorRole: string; action: string; target: string | null; meta: Record<string, unknown>; at: Timestamp | null }

/** D6: append-only audit log, admin read (P-AUD-01). */
export default function AuditPage() {
  const [action, setAction] = useState("");
  const [max, setMax] = useState(100);
  const [logs, setLogs] = useState<Log[] | null>(null);

  useEffect(() => {
    const base = collection(backend().db, "auditLogs");
    const q = action ? query(base, where("action", "==", action), orderBy("at", "desc"), limit(max)) : query(base, orderBy("at", "desc"), limit(max));
    return onSnapshot(q, (s) => setLogs(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Log, "id">) }))), () => setLogs([]));
  }, [action, max]);

  return (
    <>
      <PageTitle title="Audit log">
        <select value={action} onChange={(e) => setAction(e.target.value)} className="h-10 rounded-sm border border-border bg-surface-2 px-3 text-sm" aria-label="Filter action">
          <option value="">All actions</option>{AuditAction.options.map((a) => <option key={a}>{a}</option>)}
        </select>
        <Button variant="outline" size="sm" disabled={!logs?.length} onClick={() => downloadCsv("audit-log.csv", [["Time (IST)", "Actor", "Role", "Action", "Target", "Meta"], ...(logs ?? []).map((l) => [l.at ? fmtIST(l.at.toMillis(), "yyyy-MM-dd HH:mm:ss") : "", l.actor, l.actorRole, l.action, l.target, JSON.stringify(l.meta)])])}>
          <Download className="size-4" /> CSV
        </Button>
      </PageTitle>
      {logs === null ? <Skeleton className="h-96" /> : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-2 text-left text-xs text-muted"><tr><th className="p-3">Time</th><th className="p-3">Actor</th><th className="p-3">Action</th><th className="hidden p-3 md:table-cell">Target</th><th className="hidden p-3 lg:table-cell">Details</th></tr></thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-t border-border">
                  <td className="p-3 text-xs whitespace-nowrap text-muted">{l.at ? fmtIST(l.at.toMillis(), "d MMM, HH:mm:ss") : ""}</td>
                  <td className="p-3 text-xs"><span className="font-mono">{l.actor}</span> <span className="text-muted">({l.actorRole})</span></td>
                  <td className="p-3 font-semibold">{l.action}</td>
                  <td className="hidden max-w-48 truncate p-3 font-mono text-xs text-muted md:table-cell">{l.target}</td>
                  <td className="hidden max-w-64 truncate p-3 font-mono text-xs text-muted lg:table-cell">{Object.keys(l.meta ?? {}).length ? JSON.stringify(l.meta) : ""}</td>
                </tr>
              ))}
              {logs.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted">No entries.</td></tr>}
            </tbody>
          </table>
        </Card>
      )}
      {logs && logs.length >= max && <Button variant="ghost" className="mt-3" onClick={() => setMax((m) => m + 100)}>Load more</Button>}
    </>
  );
}
