"use client";

import { Download } from "lucide-react";
import { PageTitle } from "@/components/admin/shell";
import { useAdminData } from "@/components/admin/data";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { downloadCsv } from "@/lib/csv";
import { fmtIST, pct } from "@/lib/election";

/**
 * D9: CSV exports built from data the admin can already read. The voter list (who voted for
 * whom) is exported from the Voters page, which only voter-admins can open and which is audited.
 */
export default function ExportPage() {
  const { positions, nominees, tallies, students, requests } = useAdminData();
  const stamp = fmtIST(Date.now(), "yyyy-MM-dd-HHmm");
  const ready = positions && nominees && students && requests;

  const exports = [
    {
      title: "Results",
      desc: "Every position and nominee with votes and share.",
      run: () => downloadCsv(`results-${stamp}.csv`, [["Position", "Nominee", "NIAT ID", "Votes", "Share %", "Position total"],
        ...positions!.filter((p) => p.active).flatMap((p) => {
          const t = tallies?.[p._id];
          return nominees!.filter((n) => n.positionId === p._id && n.active).map((n) => [p.name, n.name, n.niatId, t?.counts[n._id] ?? 0, pct(t?.counts[n._id] ?? 0, t?.total ?? 0), t?.total ?? 0]);
        })]),
    },
    {
      title: "Turnout list",
      desc: "Each student, whether they voted and in how many clubs — never their choices.",
      run: () => downloadCsv(`turnout-${stamp}.csv`, [["NIAT ID", "Name", "Batch", "Status", "Clubs voted"], ...students!.map((s) => [s.niatId, s.name, s.batch, s.status, s.votedCount])]),
    },
    {
      title: "Correction requests",
      desc: "All requests with status and resolution.",
      run: () => downloadCsv(`requests-${stamp}.csv`, [["NIAT ID", "Fields", "Requested", "Contact", "Status", "Resolved by", "Created (IST)"],
        ...requests!.map((r) => [r.niatId, r.fields.join(" "), JSON.stringify(r.requested), r.contactEmail, r.status, r.resolvedBy ?? "", r.createdAt ? fmtIST(r.createdAt.toMillis(), "yyyy-MM-dd HH:mm") : ""])]),
    },
  ];

  return (
    <>
      <PageTitle title="Export" />
      <div className="grid gap-3 md:grid-cols-3">
        {exports.map((e) => (
          <Card key={e.title} className="flex flex-col gap-3 p-4">
            <h2 className="font-semibold">{e.title}</h2>
            <p className="flex-1 text-sm text-muted">{e.desc}</p>
            <Button variant="outline" onClick={e.run} disabled={!ready}><Download className="size-4" /> Download CSV</Button>
          </Card>
        ))}
      </div>
      <p className="mt-4 text-sm text-muted">Audit log: export from the Audit Log page. Voter list: Voters page (voter-admins only, audited).</p>
    </>
  );
}
