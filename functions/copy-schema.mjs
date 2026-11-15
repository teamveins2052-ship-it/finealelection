// Functions share the app's Zod schemas (MASTER §7). Copied at build time so the
// functions package stays self-contained for deploy. converters.ts is client-only.
import { cpSync, mkdirSync } from "node:fs";
mkdirSync("src/schema", { recursive: true });
for (const f of ["common", "entities", "inputs", "realtime", "index"]) {
  cpSync(`../lib/schema/${f}.ts`, `src/schema/${f}.ts`);
}
