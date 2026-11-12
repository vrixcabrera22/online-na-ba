// Part of the database test suite: see supabase/tests/run.mjs (npm run test:db).
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
const root = process.argv[2] ?? process.cwd(); const migDir = `${root}/supabase/migrations`;
const db = new PGlite(); let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else fail++; console.log(`${c ? "PASS" : "FAIL"}  ${m}`); };
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create schema cron; create table cron.job (jobname text, active boolean); -- stand-in for pg_cron
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated, service_role; grant execute on function auth.uid() to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;`);
for (const f of readdirSync(migDir).filter((f) => f.endsWith(".sql") && !f.includes("schedule")).sort()) await db.exec(readFileSync(`${migDir}/${f}`, "utf8"));
await db.exec(readFileSync(`${root}/supabase/seed.sql`, "utf8"));
const as = (role, uid, sql, p) => db.transaction(async (tx) => { await tx.exec(`set local role ${role}; select set_config('request.jwt.claim.sub', '${uid ?? ""}', true);`); return tx.query(sql, p); });
const sss = (await db.query("select id from monitors where slug='sss'")).rows[0].id;
// 2026-11-09 is a Monday. 01:00 UTC = 09:00 Manila Monday; 23:00 UTC Sunday 11-08 = 07:00 Manila Monday.
// Use recent dates relative to now so they fall in the 30-day window: find last Monday 01:00 UTC.
const base = (await db.query(`select (date_trunc('week', now() at time zone 'UTC') + interval '1 hour') at time zone 'UTC' as t`)).rows[0].t; // Monday 01:00 UTC this week
const iso = (d) => new Date(d).toISOString();
const b = new Date(base).getTime();
const week = 7 * 86400e3;
// Two Mondays at 09:00 Manila (01:00 UTC): one perfect & fast, one with downs & slow
await db.query(`insert into hourly_stats (monitor_id, hour, total, up_count, slow_count, down_count, avg_response_ms) values
  ($1, $2, 12, 12, 0, 0, 100),
  ($1, $3, 12, 6, 0, 6, 400),
  ($1, $4, 12, 12, 0, 0, 50),
  ($1, $5, 12, 12, 0, 0, 999)`,
  [sss, iso(b - week), iso(b - 2 * week), iso(b - week - 2 * 3600e3), iso(b - 40 * 86400e3)]);
// b - week - 2h = Sunday 23:00 UTC = Monday 07:00 Manila
const rows = (await as("anon", null, "select * from best_times($1)", [sss])).rows;
console.log(JSON.stringify(rows));
const mon9 = rows.find((r) => r.dow === 1 && r.hour === 9);
ok(!!mon9, "Monday 9 AM Manila cell exists (01:00 UTC → 09:00 Manila)");
ok(mon9.checks === 24 && Number(mon9.uptime) === 75, `two weeks combined: 24 checks, 75% uptime (got ${mon9?.checks}, ${mon9?.uptime})`);
ok(mon9.avg_response_ms === 200, `avg weighted by responding checks: (12×100+6×400)/18 = 200 (got ${mon9?.avg_response_ms})`);
const mon7 = rows.find((r) => r.dow === 1 && r.hour === 7);
ok(!!mon7 && mon7.avg_response_ms === 50, "Sunday 23:00 UTC lands on Monday 07:00 Manila");
ok(rows.length === 2, "data older than 30 days is excluded");
ok((await as("anon", null, "select * from best_times($1, 60)", [sss])).rows.length === 3, "p_days widens the window");
const A = "00000000-0000-0000-0000-00000000000a"; const B = "00000000-0000-0000-0000-00000000000b";
await db.exec(`insert into auth.users (id, email) values ('${A}','a@x.com'),('${B}','b@x.com')`);
await as("authenticated", A, "insert into monitors (name, url) values ('mine', 'https://mine.example.com')");
const mine = (await db.query(`select id from monitors where owner_id='${A}'`)).rows[0].id;
await db.query(`insert into hourly_stats (monitor_id, hour, total, up_count, slow_count, down_count, avg_response_ms) values ($1, now() - interval '2 hours', 12, 12, 0, 0, 80)`, [mine]);
ok((await as("authenticated", A, "select * from best_times($1)", [mine])).rows.length === 1, "owner sees their monitor's heatmap");
ok((await as("authenticated", B, "select * from best_times($1)", [mine])).rows.length === 0, "other users don't");
ok((await as("anon", null, "select * from best_times($1)", [mine])).rows.length === 0, "visitors don't");
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
