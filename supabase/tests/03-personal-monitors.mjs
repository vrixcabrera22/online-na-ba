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
ok(true, "all migrations + seed run (seed URLs pass the new URL rules)");

async function as(role, uid, sql, params) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}; select set_config('request.jwt.claim.sub', '${uid ?? ""}', true);`);
    return tx.query(sql, params);
  });
}
const fails = (role, uid, sql, p) => as(role, uid, sql, p).then(() => null, (e) => e.message);

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
await db.exec(`insert into auth.users (id) values ('${A}'), ('${B}')`);

await as("authenticated", A, "insert into monitors (name, url) values ('Shop', 'https://shop.example.com')");
await as("authenticated", A, "insert into monitors (name, url, is_active) values ('Blog', 'https://blog.example.com', false)");
const a1 = (await db.query(`select id from monitors where owner_id='${A}' and name='Shop'`)).rows[0].id;
await as("service_role", null, "select * from record_checks($1::jsonb)", [JSON.stringify([
  { monitor_id: a1, status: "up", status_code: 200, response_time_ms: 120, error: null, checked_at: new Date().toISOString() },
])]);

const mineA = (await as("authenticated", A, "select * from my_monitors()")).rows;
ok(mineA.length === 2, `A sees own 2 monitors incl. paused (got ${mineA.length})`);
ok(mineA.find((m) => m.name === "Blog").is_active === false, "paused monitor reported as is_active=false");
const shop = mineA.find((m) => m.name === "Shop");
ok(shop.last_status === "up" && Number(shop.uptime_24h) === 100, "latest check + uptime included");
ok((await as("authenticated", A, "select * from my_monitors($1)", [a1])).rows.length === 1, "my_monitors(id) returns one");
ok((await as("authenticated", B, "select * from my_monitors()")).rows.length === 0, "B sees none of A's monitors");
ok((await as("authenticated", B, "select * from my_monitors($1)", [a1])).rows.length === 0, "B can't fetch A's monitor by id");
ok(!!(await fails("anon", null, "select * from my_monitors()")), "visitors can't call my_monitors");
ok((await as("authenticated", A, "select * from my_monitors()")).rows.every((m) => !["SSS"].includes(m.name)), "public sites are not in my_monitors");

// URL rules
const bad = [
  "https://user:pass@example.com",
  "http://localhost:8080/",
  "http://app.localhost/",
  "http://printer.local/",
  "http://metadata.google.internal/",
  "http://127.0.0.1/",
  "http://10.0.0.5/",
  "http://192.168.1.1/admin",
  "http://169.254.169.254/latest/meta-data/",
  "http://172.16.0.1/",
  "http://172.31.255.255/",
  "http://[::1]/",
  "http://0.0.0.0/",
  "ftp://example.com/",
  "javascript:alert(1)",
];
for (const url of bad) {
  // delete one first so the 3-monitor limit isn't what rejects it
  const e = await fails("authenticated", B, "insert into monitors (name, url) values ('x', $1)", [url]);
  ok(!!e && !e.includes("monitor_limit"), `rejects ${url}`);
}
const good = ["https://example.com", "http://172.32.0.1/", "https://local.example.com/", "https://my-site.ph/path?q=1"];
for (const url of good) {
  const e = await fails("authenticated", B, "insert into monitors (name, url) values ('ok', $1)", [url]);
  ok(e === null || e.includes("monitor_limit"), `accepts ${url}${e ? " (limit reached)" : ""}`);
  await db.exec(`delete from monitors where owner_id='${B}'`);
}
ok(!!(await fails("authenticated", A, "update monitors set url = 'http://10.1.2.3/' where id = $1", [a1])), "can't change a URL to an internal one either");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
