/**
 * Import the official student workbook (all hall tabs) into the REAL project — same validation,
 * dedupe and audit as Admin → Import (importRows in functions/src/callables/admin.ts).
 *
 *   tsx --env-file=.env.bootstrap scripts/seed/import-sheet.ts <file.xlsx>           # dry run: checks only
 *   tsx --env-file=.env.bootstrap scripts/seed/import-sheet.ts <file.xlsx> --write   # writes
 *
 * Only NIAT ID, name, email, mobile, hall-ticket no. and batch are read. Every other column
 * (S.No, Branch, Father Name, Father Mobile…) is dropped before anything else happens and is
 * never stored. Output never prints names, emails or phone numbers.
 */
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { IMPORT_HEADER_MAP, StudentImportRow } from "../../lib/schema/inputs";

const file = process.argv[2];
const WRITE = process.argv.includes("--write");
if (!file) throw new Error("Usage: import-sheet.ts <file.xlsx> [--write]");

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!keyPath) throw new Error("Set GOOGLE_APPLICATION_CREDENTIALS");
process.env.FIREBASE_SERVICE_ACCOUNT_B64 = Buffer.from(readFileSync(keyPath)).toString("base64");
process.env.DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
delete process.env.FIRESTORE_EMULATOR_HOST;

const norm = (h: string) => IMPORT_HEADER_MAP[h.trim().toLowerCase().replace(/\s+/g, " ")];

const wb = XLSX.read(readFileSync(file));
const rows: Array<Record<string, unknown>> = [];
const where: string[] = [];
const ignored = new Set<string>();
let blank = 0;
for (const tab of wb.SheetNames) {
  const sheet = wb.Sheets[tab];
  if (!sheet) continue;
  XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: true }).forEach((raw, i) => {
    const kept: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (norm(k)) {
        if (v !== "" && v !== null) kept[k] = v;
      } else ignored.add(k);
    }
    if (!Object.keys(kept).length) return void blank++;
    rows.push(kept);
    where.push(`${tab} row ${i + 2}`);
  });
}

// Local pre-check (same schema the server uses) so the dry run explains problems by tab/row.
const problems: string[] = [];
const ids = new Set<string>();
const emails = new Set<string>();
const byBatch: Record<string, number> = {};
rows.forEach((r, i) => {
  const mapped: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) mapped[norm(k)!] = v;
  const p = StudentImportRow.safeParse(mapped);
  if (!p.success) return void problems.push(`${where[i]}: ${p.error.issues.map((x) => x.path.join(".")).join(", ")} invalid`);
  if (ids.has(p.data.niatId)) problems.push(`${where[i]}: duplicate NIAT ID`);
  if (emails.has(p.data.email)) problems.push(`${where[i]}: duplicate email`);
  ids.add(p.data.niatId);
  emails.add(p.data.email);
  const b = p.data.batch ?? `20${p.data.niatId.slice(1, 3)}`;
  byBatch[b] = (byBatch[b] ?? 0) + 1;
});

console.log(`Tabs: ${wb.SheetNames.length} · student rows: ${rows.length} · blank rows skipped: ${blank}`);
console.log(`By batch: ${JSON.stringify(byBatch)}`);
console.log(`Columns dropped (never stored): ${[...ignored].join(", ") || "none"}`);
console.log(`Rows with problems: ${problems.length}`);
problems.slice(0, 40).forEach((p) => console.log("  - " + p));
if (problems.length > 40) console.log(`  … and ${problems.length - 40} more`);

if (!WRITE) {
  console.log("\nDry run only — nothing written. Re-run with --write to import the valid rows.");
  process.exit(0);
}

const { importRows } = await import("../../functions/src/callables/admin");
const actor = (process.env.ADMIN_EMAILS ?? "operator").split(",")[0]!.trim();
const r = await importRows(rows, actor);
console.log(`\n✅ Imported: ${r.created} new, ${r.updated} updated, ${r.errors.length} rejected, ${r.warnings.length} warnings`);
r.errors.slice(0, 40).forEach((e) => console.log(`  - ${where[e.row - 2] ?? `row ${e.row}`}: ${e.message.replace(/\S+@\S+/g, "<email>")}`));
process.exit(0);
