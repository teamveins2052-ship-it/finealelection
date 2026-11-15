"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Inbox } from "lucide-react";
import { PageTitle } from "@/components/admin/shell";
import { useAdminData } from "@/components/admin/data";
import { Button } from "@/components/ui/button";
import { Card, Chip, EmptyState, Input, Label, Skeleton } from "@/components/ui/primitives";
import { call, errorMessage } from "@/lib/client-data";
import { fmtIST } from "@/lib/election";
import type { CorrectionRequest } from "@/lib/schema";
import type { WithId } from "@/lib/schema/converters";
import { cn } from "@/lib/utils";

const LABEL = { name: "Name", email: "Email", phone: "Phone", admissionNo: "Admission no." } as const;

/** D3 / A6: Open → Resolved | Rejected, side panel with current vs requested. */
export default function RequestsPage() {
  const { requests, students } = useAdminData();
  const [tab, setTab] = useState<"open" | "resolved" | "rejected">("open");
  const [selected, setSelected] = useState<string | null>(null);
  if (!requests || !students) return <Skeleton className="h-80" />;
  const list = requests.filter((r) => r.status === tab);
  const current = list.find((r) => r._id === selected) ?? list[0];

  return (
    <>
      <PageTitle title="Correction requests" />
      <div className="mb-4 flex gap-1">
        {(["open", "resolved", "rejected"] as const).map((t) => (
          <button key={t} onClick={() => { setTab(t); setSelected(null); }} className={cn("h-10 rounded-md px-4 text-sm font-semibold capitalize", tab === t ? "bg-primary/10 text-primary" : "text-muted hover:bg-surface-2")}>
            {t} ({requests.filter((r) => r.status === t).length})
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <EmptyState icon={Inbox} title={`No ${tab} requests.`} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <Card className="max-h-[70vh] overflow-y-auto">
            {list.map((r) => {
              const s = students.find((x) => x.niatId === r.niatId);
              return (
                <button key={r._id} onClick={() => setSelected(r._id)} className={cn("block w-full border-b border-border p-3 text-left last:border-0", current?._id === r._id && "bg-primary/8")}>
                  <p className="font-semibold">{s?.name ?? r.niatId}</p>
                  <p className="font-mono text-xs text-muted">{r.niatId}</p>
                  <p className="mt-1 text-xs text-muted">{r.fields.map((f) => LABEL[f]).join(", ")} · {r.createdAt ? fmtIST(r.createdAt.toMillis()) : ""}</p>
                </button>
              );
            })}
          </Card>
          {current && <Detail key={current._id} r={current} />}
        </div>
      )}
    </>
  );
}

function Detail({ r }: { r: WithId<CorrectionRequest> }) {
  const { students } = useAdminData();
  const s = students?.find((x) => x.niatId === r.niatId);
  const [apply, setApply] = useState<Record<string, string>>(() => ({ ...r.requested }) as Record<string, string>);
  const [resolution, setResolution] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const decide = async (decision: "resolved" | "rejected") => {
    setBusy(decision);
    try {
      await call("resolveRequest", { requestId: r._id, decision, ...(decision === "resolved" ? { apply } : {}), ...(resolution ? { resolution } : {}) });
      toast.success(decision === "resolved" ? "Applied — student can log in now" : "Rejected — account re-activated with original details");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">{s?.name ?? r.niatId}</h2>
        <Chip tone={r.status === "open" ? "info" : r.status === "resolved" ? "success" : "neutral"}>{r.status}</Chip>
      </div>
      <p className="text-sm text-muted">Contact: {r.contactEmail}</p>
      {r.note && <p className="rounded-md bg-surface-2 p-3 text-sm">“{r.note}”</p>}
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted"><tr><th className="py-2">Field</th><th className="py-2">Current</th><th className="py-2">Requested → apply</th></tr></thead>
        <tbody>
          {r.fields.map((f) => (
            <tr key={f} className="border-t border-border">
              <td className="py-2 font-semibold">{LABEL[f]}</td>
              <td className="py-2 text-muted">{s ? String(s[f]) : "—"}</td>
              <td className="py-2">
                {r.status === "open" ? <Input className="h-9" value={apply[f] ?? ""} onChange={(e) => setApply((a) => ({ ...a, [f]: e.target.value }))} aria-label={`New ${LABEL[f]}`} /> : r.requested[f]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {r.status === "open" ? (
        <>
          <div>
            <Label htmlFor="res">Note to student (optional)</Label>
            <Input id="res" className="h-10" value={resolution} onChange={(e) => setResolution(e.target.value)} maxLength={300} />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => decide("resolved")} loading={busy === "resolved"} disabled={!!busy}>Apply & resolve</Button>
            <Button variant="outline" onClick={() => decide("rejected")} loading={busy === "rejected"} disabled={!!busy}>Reject</Button>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted">Handled by {r.resolvedBy} {r.resolvedAt ? `· ${fmtIST(r.resolvedAt.toMillis())}` : ""} {r.resolution ? `· “${r.resolution}”` : ""}</p>
      )}
    </Card>
  );
}
