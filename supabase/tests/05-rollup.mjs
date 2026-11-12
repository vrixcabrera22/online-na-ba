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
for (const f of readdirSync(migDir).filter((f) => f.endsWith(".sql") && !f.includes("schedule")).sort()) {
  await db.exec(readFileSync(`${migDir}/${f}`, "utf8"));
}
await db.exec(readFileSync(`${root}/supabase/seed.sql`, "utf8"));
ok(true, "all migrations + seed run (incl. backfill on empty data)");

const as = (role, sql, p) => db.transaction(async (tx) => { await tx.exec(`set local role ${role};`); return tx.query(sql, p); });
const fails = (role, sql) => as(role, sql).then(() => null, (e) => e.message);

const sss = (await db.query("select id from monitors where slug='sss'")).rows[0].id;
const bir = (await db.query("select id from monitors where slug='bir'")).rows[0].id;

// Checks across three finished hours (UTC), plus some in the current hour.
await db.exec(`
  insert into checks (monitor_id, status, response_time_ms, checked_at)
  select '${sss}', s, rt, date_trunc('hour', now(), 'UTC') - interval '3 hours' + (n * interval '5 minutes')
  from (values (0,'up'::check_status,100),(1,'up',200),(2,'slow',6000),(3,'down',null)) v(n,s,rt);
  insert into checks (monitor_id, status, response_time_ms, checked_at)
  select '${sss}', 'up', 300, date_trunc('hour', now(), 'UTC') - interval '2 hours' + (g * interval '5 minutes')
  from generate_series(0, 11) g;
  insert into checks (monitor_id, status, response_time_ms, checked_at)
  values ('${bir}', 'up', 50, date_trunc('hour', now(), 'UTC') - interval '1 hour'),
         ('${sss}', 'up', 999, date_trunc('hour', now(), 'UTC'));   -- current hour: not rolled up yet
`);

const n1 = (await as("service_role", "select rollup_hourly_stats() as n")).rows[0].n;
ok(n1 === 3, `rolls up 3 finished monitor-hours (got ${n1})`);
const h = (await db.query(`select * from hourly_stats where monitor_id='${sss}' order by hour`)).rows;
ok(h.length === 2, "current (unfinished) hour is not summarized");
ok(h[0].total === 4 && h[0].up_count === 2 && h[0].slow_count === 1 && h[0].down_count === 1, "counts by status");
ok(h[0].avg_response_ms === 2100, `average ignores failed checks (100+200+6000)/3 = 2100 (got ${h[0].avg_response_ms})`);
ok(h[1].total === 12 && h[1].avg_response_ms === 300, "12 checks in a full hour");

const n2 = (await as("service_role", "select rollup_hourly_stats() as n")).rows[0].n;
const again = (await db.query(`select sum(total)::int t from hourly_stats`)).rows[0].t;
ok(n2 === 3 && again === 17, "running again recomputes, never double-counts");

// A late check arriving for a summarized hour is picked up on the next run.
await db.exec(`insert into checks (monitor_id, status, response_time_ms, checked_at) values ('${bir}', 'down', null, date_trunc('hour', now(), 'UTC') - interval '1 hour' + interval '30 minutes')`);
await as("service_role", "select rollup_hourly_stats()");
const birH = (await db.query(`select total, down_count from hourly_stats where monitor_id='${bir}'`)).rows[0];
ok(birH.total === 2 && birH.down_count === 1, "late-arriving check updates its hour on the next run");

// Cleanup: old checks that are summarized get deleted; unsummarized ones stay.
await db.exec(`
  insert into checks (monitor_id, status, response_time_ms, checked_at) values
    ('${sss}', 'up', 100, now() - interval '40 days'),
    ('${sss}', 'up', 100, now() - interval '35 days');
`);
await as("service_role", "select rollup_hourly_stats(now() - interval '41 days')");
await db.exec(`insert into checks (monitor_id, status, checked_at) values ('${bir}', 'up', now() - interval '45 days')`); // never rolled up
const before = (await db.query("select count(*)::int c from checks")).rows[0].c;
const deleted = (await as("service_role", "select cleanup_old_checks() as n")).rows[0].n;
const after = (await db.query("select count(*)::int c from checks")).rows[0].c;
ok(deleted === 2 && after === before - 2, `deletes the 2 summarized checks older than 30 days (deleted ${deleted})`);
ok((await db.query("select count(*)::int c from checks where checked_at < now() - interval '30 days'")).rows[0].c === 1, "keeps an old check whose hour was never summarized");
ok((await db.query(`select count(*)::int c from hourly_stats where hour < now() - interval '30 days'`)).rows[0].c === 2, "hourly summaries of deleted checks are kept");
ok((await as("service_role", "select cleanup_old_checks() as n")).rows[0].n === 0, "cleanup is idempotent");

// Permissions
ok(!!(await fails("anon", "select rollup_hourly_stats()")), "visitors can't run the rollup");
ok(!!(await fails("authenticated", "select cleanup_old_checks()")), "users can't run the cleanup");
ok((await as("anon", "select count(*)::int c from hourly_stats")).rows[0].c >= 1, "visitors can read public hourly stats (RLS)");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
