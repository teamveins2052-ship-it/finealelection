"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { FileSpreadsheet, Search } from "lucide-react";
import { PageTitle } from "@/components/admin/shell";
import { useAdminData } from "@/components/admin/data";
import { Button } from "@/components/ui/button";
import { Card, Chip, Input, Label, Skeleton } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/sheet";
import { useElection } from "@/hooks/use-election";
import { call, errorMessage } from "@/lib/client-data";
import type { Student } from "@/lib/schema";
import type { WithId } from "@/lib/schema/converters";

const PAGE = 50;
const statusTone = { active: "success", pending: "warning", disabled: "neutral" } as const;

/** D3: search, edit contact details/status, toggle nominee (D4). */
export default function StudentsPage() {
  const { students } = useAdminData();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "pending" | "disabled" | "voted" | "notVoted" | "nominees">("all");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<WithId<Student> | null>(null);

  const rows = useMemo(() => {
    if (!students) return [];
    const needle = q.trim().toLowerCase();
    return students
      .filter((s) => {
        if (filter === "voted") return s.votedCount > 0;
        if (filter === "notVoted") return s.status === "active" && s.votedCount === 0;
        if (filter === "nominees") return s.isNominee;
        return filter === "all" || s.status === filter;
      })
      .filter((s) => !needle || s.niatId.toLowerCase().includes(needle) || s.name.toLowerCase().includes(needle) || s.email.includes(needle) || s.phone.includes(needle))
      .sort((a, b) => a.niatId.localeCompare(b.niatId));
  }, [students, q, filter]);

  if (!students) return <Skeleton className="h-96" />;
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const view = rows.slice(page * PAGE, page * PAGE + PAGE);

  return (
    <>
      <PageTitle title={`Students (${students.length.toLocaleString("en-IN")})`}>
        <Link href="/admin/import" className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-fg">
          <FileSpreadsheet className="size-4" /> Import sheet
        </Link>
      </PageTitle>
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative min-w-60 flex-1">
          <Search className="absolute top-3 left-3 size-4 text-muted" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Search NIAT ID, name, email, phone" className="h-10 pl-9" aria-label="Search students" />
        </div>
        <select value={filter} onChange={(e) => { setFilter(e.target.value as typeof filter); setPage(0); }} className="h-10 rounded-sm border border-border bg-surface-2 px-3 text-sm" aria-label="Filter">
          <option value="all">All</option><option value="active">Active</option><option value="pending">Pending</option><option value="disabled">Disabled</option>
          <option value="voted">Voted</option><option value="notVoted">Not voted</option><option value="nominees">Nominees</option>
        </select>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface-2 text-left text-xs text-muted">
            <tr><th className="p-3">NIAT ID</th><th className="p-3">Name</th><th className="hidden p-3 md:table-cell">Email</th><th className="hidden p-3 sm:table-cell">Batch</th><th className="p-3">Status</th><th className="hidden p-3 sm:table-cell">Voted</th><th className="p-3" /></tr>
          </thead>
          <tbody>
            {view.map((s) => (
              <tr key={s.niatId} className="border-t border-border hover:bg-surface-2/50">
                <td className="p-3 font-mono text-xs">{s.niatId}</td>
                <td className="p-3">{s.name}{s.isNominee && <Chip tone="primary" className="ml-2">Nominee</Chip>}</td>
                <td className="hidden max-w-56 truncate p-3 text-muted md:table-cell">{s.email}</td>
                <td className="hidden p-3 sm:table-cell">{s.batch}</td>
                <td className="p-3"><Chip tone={statusTone[s.status]}>{s.status}</Chip></td>
                <td className="hidden p-3 tabular-nums sm:table-cell">{s.votedCount}</td>
                <td className="p-3 text-right"><Button size="sm" variant="ghost" onClick={() => setEditing(s)}>Edit</Button></td>
              </tr>
            ))}
            {view.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted">No students match.</td></tr>}
          </tbody>
        </table>
      </Card>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
        <span>{rows.length.toLocaleString("en-IN")} results</span>
        <span className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Prev</Button>
          {page + 1} / {pages}
          <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </span>
      </div>
      {editing && <EditStudent student={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function EditStudent({ student, onClose }: { student: WithId<Student>; onClose: () => void }) {
  const { positions } = useAdminData();
  const election = useElection();
  const [form, setForm] = useState({ name: student.name, email: student.email, phone: student.phone, admissionNo: student.admissionNo, status: student.status });
  const [positionId, setPositionId] = useState(student.nomineeOf ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const ballotLocked = election.status === "ready" && Date.now() >= election.settings.opensAt;

  const save = async () => {
    setBusy("save");
    const changed = Object.fromEntries(Object.entries(form).filter(([k, v]) => v !== student[k as keyof Student]));
    try {
      await call("adminUpdateStudent", { niatId: student.niatId, ...changed });
      toast.success("Student updated");
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const nominee = async (active: boolean) => {
    const pid = active ? positionId : student.nomineeOf;
    if (!pid) return toast.error("Choose a position first.");
    setBusy("nominee");
    try {
      await call("setNominee", { niatId: student.niatId, positionId: pid, active });
      toast.success(active ? "Added as nominee" : "Removed as nominee");
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet open onClose={onClose} title={`Edit ${student.niatId}`} className="sm:max-w-lg">
      <div className="space-y-4">
        <h2 className="font-display text-lg font-semibold">{student.niatId}</h2>
        {(["name", "email", "phone", "admissionNo"] as const).map((k) => (
          <div key={k}>
            <Label htmlFor={`f-${k}`}>{k === "admissionNo" ? "Admission no." : k[0].toUpperCase() + k.slice(1)}</Label>
            <Input id={`f-${k}`} value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} className="h-10" />
          </div>
        ))}
        <div>
          <Label htmlFor="f-status">Status</Label>
          <select id="f-status" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as Student["status"] }))} className="h-10 w-full rounded-sm border border-border bg-surface-2 px-3">
            <option value="active">active</option><option value="pending">pending</option><option value="disabled">disabled</option>
          </select>
        </div>
        <Button className="w-full" onClick={save} loading={busy === "save"}>Save changes</Button>

        <div className="space-y-2 border-t border-border pt-4">
          <p className="text-sm font-semibold">2-step verification</p>
          <p className="text-xs text-muted">Lost phone? Resetting signs them out everywhere; they set up 2-step again on next sign-in. Confirm their identity first (ID card in person).</p>
          <Button size="sm" variant="outline" loading={busy === "mfa"} onClick={async () => {
            if (!confirm(`Reset 2-step verification for ${student.name} (${student.niatId})?`)) return;
            setBusy("mfa");
            try { await call("mfaReset", { email: student.email }); toast.success("2-step reset — they'll set it up again on next sign-in"); }
            catch (e) { toast.error(errorMessage(e)); }
            finally { setBusy(null); }
          }}>Reset 2-step</Button>
        </div>

        <div className="space-y-2 border-t border-border pt-4">
          <p className="text-sm font-semibold">Nominee</p>
          {ballotLocked && <p className="text-xs text-warning">Nominees are locked once voting opens.</p>}
          {student.isNominee ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm">Nominee for <b>{positions?.find((p) => p._id === student.nomineeOf)?.name}</b></span>
              <Button size="sm" variant="destructive" onClick={() => nominee(false)} loading={busy === "nominee"} disabled={ballotLocked}>Remove</Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <select value={positionId} onChange={(e) => setPositionId(e.target.value)} className="h-10 flex-1 rounded-sm border border-border bg-surface-2 px-3 text-sm" aria-label="Position">
                <option value="">Choose position…</option>
                {positions?.filter((p) => p.active).map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
              </select>
              <Button size="sm" onClick={() => nominee(true)} loading={busy === "nominee"} disabled={ballotLocked || !positionId || student.status !== "active"}>Make nominee</Button>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}
