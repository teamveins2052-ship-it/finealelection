"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, Upload } from "lucide-react";
import { PageTitle } from "@/components/admin/shell";
import { useAdminData } from "@/components/admin/data";
import { Button } from "@/components/ui/button";
import { Card, Chip } from "@/components/ui/primitives";
import { call, errorMessage } from "@/lib/client-data";
import { IMPORT_HEADER_MAP, NIAT_ID_REGEX, StudentImportRow } from "@/lib/schema";
import { cn } from "@/lib/utils";

const CHUNK = 1000; // rows per importStudents call (server max 3,000)
type Checked = { row: number; where?: string; raw: Record<string, unknown>; ok: boolean; message?: string; warning?: string; niatId?: string; name?: string; email?: string };

/**
 * A1 / DATAMODEL §11: the sheet is parsed in the admin's browser (no PII upload of the raw
 * file), previewed with errors/warnings, then sent row-by-row to `importStudents`, which
 * re-validates everything server-side.
 */
export default function ImportPage() {
  const { students } = useAdminData();
  const input = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<Checked[] | null>(null);
  const [unmapped, setUnmapped] = useState<string[]>([]);
  const [sheets, setSheets] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number; errors: { row: number; message: string }[]; warnings: { row: number; message: string }[] } | null>(null);

  const parse = async (file: File) => {
    setResult(null);
    setFileName(file.name);
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer());
    // The official workbook has one tab per hall (27 tabs, two layouts) — read every tab.
    const json: Array<Record<string, unknown> & { __sheet: string; __row: number }> = [];
    const headerSet = new Set<string>();
    for (const name of wb.SheetNames) {
      const rowsInSheet = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name]!, { defval: "", raw: true });
      rowsInSheet.forEach((r, i) => {
        Object.keys(r).forEach((h) => headerSet.add(h));
        json.push({ ...r, __sheet: name, __row: i + 2 });
      });
    }
    setSheets(wb.SheetNames.length);
    setUnmapped([...headerSet].filter((h) => !IMPORT_HEADER_MAP[h.trim().toLowerCase().replace(/\s+/g, " ")]));

    const existingEmails = new Map((students ?? []).map((s) => [s.email, s.niatId]));
    const seenIds = new Set<string>();
    const seenEmails = new Set<string>();
    const checked: Checked[] = [];
    json.forEach((raw, i) => {
      const mapped: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(raw)) {
        if (k === "__sheet" || k === "__row") continue;
        const f = IMPORT_HEADER_MAP[k.trim().toLowerCase().replace(/\s+/g, " ")];
        if (f && v !== "") mapped[f] = v;
      }
      if (!Object.keys(mapped).length) return; // blank row
      const row = i + 1; // running number across all tabs
      const where = `${raw.__sheet} row ${raw.__row}`;
      const p = StudentImportRow.safeParse(mapped);
      if (!p.success) return void checked.push({ row, where, raw: mapped, ok: false, message: p.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; "), niatId: String(mapped.niatId ?? ""), name: String(mapped.name ?? "") });
      const r = p.data;
      let message: string | undefined;
      if (seenIds.has(r.niatId)) message = "Duplicate NIAT ID in sheet";
      else if (seenEmails.has(r.email)) message = "Duplicate email in sheet";
      else if (existingEmails.has(r.email) && existingEmails.get(r.email) !== r.niatId) message = `Email used by ${existingEmails.get(r.email)}`;
      seenIds.add(r.niatId);
      seenEmails.add(r.email);
      checked.push({ row, where, raw: mapped, ok: !message, message, warning: NIAT_ID_REGEX.test(r.niatId) ? undefined : "Unusual ID format", niatId: r.niatId, name: r.name, email: r.email });
    });
    setRows(checked);
  };

  const ok = rows?.filter((r) => r.ok) ?? [];
  const bad = rows?.filter((r) => !r.ok) ?? [];

  const doImport = async () => {
    setBusy(true);
    try {
      // The server takes ≤3,000 rows per call; the full workbook is bigger, so send in chunks.
      const all = ok.map((x) => x.raw);
      const total = { created: 0, updated: 0, errors: [] as { row: number; message: string }[], warnings: [] as { row: number; message: string }[] };
      for (let i = 0; i < all.length; i += CHUNK) {
        const r = await call<{ rows: Record<string, unknown>[] }, NonNullable<typeof result>>("importStudents", { rows: all.slice(i, i + CHUNK) });
        total.created += r.created;
        total.updated += r.updated;
        total.errors.push(...r.errors.map((e) => ({ ...e, row: e.row + i })));
        total.warnings.push(...r.warnings.map((w) => ({ ...w, row: w.row + i })));
      }
      setResult(total);
      toast.success(`Imported: ${total.created} new, ${total.updated} updated`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageTitle title="Import students" />
      <Card className="mb-4 space-y-3 p-5">
        <p className="text-sm text-muted">
          Upload the official Excel/CSV sheet. Recognised headers include <i>NIAT ID / Student ID, Name / Full Name, Email / Email ID, Phone / Mobile Number, Admission No / CDU Hall Ticket No (optional), Batch / Year</i>. Every tab of the workbook is read; extra columns
          (S.No, Branch, Father Name, Father Mobile…) are ignored and never stored.
          Re-importing updates contact details by NIAT ID and never touches status, votes or nominee flags.
        </p>
        <input ref={input} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => e.target.files?.[0] && parse(e.target.files[0])} />
        <Button variant="outline" onClick={() => input.current?.click()}><Upload className="size-4" /> {fileName ?? "Choose file"}</Button>
        {sheets > 1 && <p className="text-xs text-muted">Read {sheets} tabs.</p>}
        {unmapped.length > 0 && <p className="text-xs text-warning">Ignored columns: {unmapped.join(", ")}</p>}
      </Card>

      {rows && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Chip tone="success">{ok.length} ready</Chip>
            <Chip tone="danger">{bad.length} rejected</Chip>
            <Chip tone="warning">{rows.filter((r) => r.warning).length} warnings</Chip>
            <Button className="ml-auto" onClick={doImport} loading={busy} disabled={!ok.length}>
              <FileSpreadsheet className="size-4" /> Import {ok.length.toLocaleString("en-IN")} students
            </Button>
          </div>
          <Card className="max-h-[480px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-2 text-left text-xs text-muted"><tr><th className="p-2">Row</th><th className="p-2">NIAT ID</th><th className="p-2">Name</th><th className="p-2">Email</th><th className="p-2">Result</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.row} className={cn("border-t border-border", !r.ok && "bg-danger/8", r.ok && r.warning && "bg-warning/8")}>
                    <td className="p-2 text-xs tabular-nums whitespace-nowrap" title={r.where}>{r.where ?? r.row}</td><td className="p-2 font-mono text-xs">{r.niatId}</td><td className="p-2">{r.name}</td><td className="p-2 text-muted">{r.email}</td>
                    <td className="p-2 text-xs">{r.ok ? (r.warning ? <span className="text-warning">⚠ {r.warning}</span> : <span className="text-success">OK</span>) : <span className="text-danger">{r.message}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {result && (
        <Card className="mt-4 space-y-2 p-4 text-sm">
          <p className="font-semibold">Server result: {result.created} created · {result.updated} updated · {result.errors.length} rejected · {result.warnings.length} warnings</p>
          {result.errors.slice(0, 20).map((e) => <p key={`e${e.row}`} className="text-danger">Row {e.row}: {e.message}</p>)}
        </Card>
      )}
    </>
  );
}
