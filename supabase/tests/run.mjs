// Database tests: applies every migration (except pg_cron schedules, which
// PGlite can't run) plus the seed to an in-memory Postgres (PGlite), with a
// small stand-in for Supabase's auth schema and roles, then checks row-level
// security, triggers and functions for real. No Docker or Supabase needed.
//
//   npm run test:db

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
let failed = 0;
for (const file of readdirSync(here).filter((f) => /^\d+-.*\.mjs$/.test(f)).sort()) {
  const r = spawnSync(process.execPath, [join(here, file), root], { encoding: "utf8" });
  const summary = (r.stdout.match(/(\d+) passed, (\d+) failed/) ?? [])[0] ?? "no summary";
  console.log(`${r.status === 0 ? "ok  " : "FAIL"}  ${file.padEnd(28)} ${summary}`);
  if (r.status !== 0) {
    failed++;
    console.log((r.stdout + r.stderr).split("\n").filter((l) => /FAIL|Error/.test(l)).join("\n"));
  }
}
process.exit(failed ? 1 : 0);
