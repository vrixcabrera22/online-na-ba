// Part of the database test suite: see supabase/tests/run.mjs (npm run test:db).
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";

const root = process.argv[2] ?? process.cwd();
const migDir = `${root}/supabase/migrations`;
const db = new PGlite();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else fail++; console.log(`${c ? "PASS" : "FAIL"}  ${m}`); };

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create schema cron; create table cron.job (jobname text, active boolean); -- stand-in for pg_cron
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`);
// skip the pg_cron migration (extensions not available in PGlite)
for (const f of readdirSync(migDir).filter((f) => f.endsWith(".sql") && !f.includes("schedule")).sort()) {
  await db.exec(readFileSync(`${migDir}/${f}`, "utf8"));
}
await db.exec(readFileSync(`${root}/supabase/seed.sql`, "utf8"));
ok(true, "all migrations + seed run");

async function as(role, uid, sql, params) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}; select set_config('request.jwt.claim.sub', '${uid ?? ""}', true);`);
    return tx.query(sql, params);
  });
}
const fails = (role, uid, sql, p) => as(role, uid, sql, p).then(() => null, (e) => e.message);

const sss = (await db.query("select id from monitors where slug='sss'")).rows[0].id;
const bir = (await db.query("select id from monitors where slug='bir'")).rows[0].id;

// helper: one run at minute offset t (minutes ago) for a monitor
const t0 = Date.now() - 60 * 60 * 1000; // 1 hour ago
const at = (min) => new Date(t0 + min * 60_000).toISOString();
async function run(monitor, status, min) {
  const res = await as("service_role", null, "select * from record_checks($1::jsonb)", [
    JSON.stringify([{ monitor_id: monitor, status, status_code: status === "down" ? 503 : 200, response_time_ms: status === "down" ? null : 100 + min, error: null, checked_at: at(min) }]),
  ]);
  return res.rows;
}

// --- incident rules ---
ok((await run(sss, "up", 0)).length === 0, "up: no event");
ok((await run(sss, "down", 5)).length === 0, "1st down: no incident yet");
const opened = await run(sss, "down", 10);
ok(opened.length === 1 && opened[0].event === "opened", "2nd consecutive down opens an incident");
ok(new Date(opened[0].started_at).toISOString() === at(5), "incident starts at the FIRST down check");
ok((await run(sss, "down", 15)).length === 0, "3rd down: no repeat event");
ok((await db.query(`select count(*)::int c from incidents where monitor_id='${sss}'`)).rows[0].c === 1, "still exactly one incident");
const closed = await run(sss, "slow", 20);
ok(closed.length === 1 && closed[0].event === "closed", "first non-down check (slow) closes it");
const inc = (await db.query(`select duration_seconds from incidents where monitor_id='${sss}'`)).rows[0];
ok(inc.duration_seconds === 15 * 60, `duration = 15 min (got ${inc.duration_seconds}s)`);
ok((await run(sss, "down", 25)).length === 0, "single down after recovery: no incident");
ok((await run(sss, "up", 30)).length === 0, "up after single down: nothing to close");

// multi-monitor batch in one call
const batch = await as("service_role", null, "select * from record_checks($1::jsonb)", [JSON.stringify([
  { monitor_id: bir, status: "down", status_code: null, response_time_ms: null, error: "timeout", checked_at: at(35) },
  { monitor_id: sss, status: "up", status_code: 200, response_time_ms: 90, error: null, checked_at: at(35) },
])]);
ok(batch.rows.length === 0, "batch insert of several monitors works");
const b2 = await run(bir, "down", 40);
ok(b2.length === 1 && b2[0].event === "opened", "bir opens after its own 2 downs");

// permissions
ok(!!(await fails("anon", null, "select * from record_checks('[]'::jsonb)")), "anon cannot call record_checks");
ok(!!(await fails("authenticated", "00000000-0000-0000-0000-00000000000a", "select * from record_checks('[]'::jsonb)")), "users cannot call record_checks");

// --- status_board ---
const board = (await as("anon", null, "select * from status_board()")).rows;
ok(board.length === 15, `anon status_board returns 15 public sites (got ${board.length})`);
const s = board.find((r) => r.slug === "sss");
// sss checks: up, down, down, down, slow, down, up, up => 8 total, 4 down → 50%
ok(Number(s.uptime_24h) === 50 && Number(s.uptime_7d) === 50 && Number(s.uptime_30d) === 50, `sss uptime 50% (got ${s.uptime_24h})`);
ok(s.last_status === "up" && s.last_response_ms === 90, "latest check is reported");
const empty = board.find((r) => r.slug === "csc");
ok(empty.last_status === null && empty.uptime_24h === null, "site with no checks yet → nulls, not 0%");
ok((await as("anon", null, "select * from status_board('bir')")).rows.length === 1, "status_board(slug) returns one site");
ok((await as("anon", null, "select * from status_board('nope')")).rows.length === 0, "unknown slug → no rows");

// old checks outside 24h but inside 7d
await db.exec(`insert into checks (monitor_id, status, checked_at) values ('${bir}', 'up', now() - interval '3 days')`);
const birRow = (await as("anon", null, "select * from status_board('bir')")).rows[0];
ok(Number(birRow.uptime_24h) === 0 && Math.abs(Number(birRow.uptime_7d) - 33.33) < 0.01, `24h vs 7d windows differ (24h=${birRow.uptime_24h}, 7d=${birRow.uptime_7d})`);

// --- response_times ---
const r24 = (await as("anon", null, "select * from response_times($1, '24h')", [sss])).rows;
ok(r24.length === 8, `24h: one point per check (got ${r24.length})`);
ok(r24.filter((r) => r.avg_response_ms === null).length === 4, "down checks have null response time");
const r7 = (await as("anon", null, "select * from response_times($1, '7d')", [sss])).rows;
ok(r7.length >= 1 && r7.length <= 2 && r7.reduce((a, r) => a + r.total, 0) === 8, `7d: hourly buckets (got ${r7.length})`);

// personal monitor not visible to others via response_times
const A = "00000000-0000-0000-0000-00000000000a";
await db.exec(`insert into auth.users (id) values ('${A}')`);
await as("authenticated", A, "insert into monitors (name, url) values ('mine', 'https://mine.example.com')");
const mine = (await db.query(`select id from monitors where owner_id='${A}'`)).rows[0].id;
await as("service_role", null, "select * from record_checks($1::jsonb)", [JSON.stringify([{ monitor_id: mine, status: "up", status_code: 200, response_time_ms: 50, error: null, checked_at: at(50) }])]);
ok((await as("anon", null, "select * from response_times($1, '24h')", [mine])).rows.length === 0, "anon cannot read a personal monitor's chart");
ok((await as("authenticated", A, "select * from response_times($1, '24h')", [mine])).rows.length === 1, "owner can read own monitor's chart");
ok((await as("anon", null, "select * from status_board()")).rows.length === 15, "personal monitors never appear on the public board");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
