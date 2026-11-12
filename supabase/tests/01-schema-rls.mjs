// Part of the database test suite: see supabase/tests/run.mjs (npm run test:db).
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const root = process.argv[2] ?? process.cwd();
import { readdirSync } from "node:fs";
const migDir = `${root}/supabase/migrations`;
const migration = readdirSync(migDir).filter(f => f.endsWith(".sql") && !f.includes("schedule")).sort().map(f => readFileSync(`${migDir}/${f}`, "utf8")).join("\n");
const seed = readFileSync(`${root}/supabase/seed.sql`, "utf8");

const db = new PGlite();
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`); };

// --- Minimal stand-in for Supabase's auth schema, roles and default grants ---
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
`);

await db.exec(migration);
ok(true, "migration runs");
await db.exec(seed);
await db.exec(seed);
const n = (await db.query("select count(*)::int c from monitors")).rows[0].c;
ok(n === 15, `seed is idempotent (15 monitors, got ${n})`);

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
await db.exec(`insert into auth.users (id, raw_user_meta_data) values ('${A}', '{"locale":"en"}'), ('${B}', '{}')`);
const profs = (await db.query("select id, plan, preferred_locale from profiles order by id")).rows;
ok(profs.length === 2 && profs[0].preferred_locale === "en" && profs[1].preferred_locale === "fil" && profs[0].plan === "free",
  "profiles auto-created with locale from metadata, default fil, plan free");

// helper: run as a role/user inside a transaction
async function as(role, uid, sql) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}; select set_config('request.jwt.claim.sub', '${uid ?? ""}', true);`);
    return tx.query(sql);
  });
}
async function fails(role, uid, sql) {
  try { await as(role, uid, sql); return null; } catch (e) { return e.message; }
}

// anon
ok((await as("anon", null, "select count(*)::int c from monitors")).rows[0].c === 15, "anon reads 15 public monitors");
ok(!!(await fails("anon", null, "insert into monitors (name, url) values ('x','https://x.com')")), "anon cannot insert monitors");

// user A: 3 monitors ok, 4th blocked
for (let i = 1; i <= 3; i++) await as("authenticated", A, `insert into monitors (name, url) values ('A${i}', 'https://a${i}.example.com')`);
const owned = (await db.query(`select count(*)::int c from monitors where owner_id = '${A}'`)).rows[0].c;
ok(owned === 3, "user A creates 3 monitors (owner_id defaults to auth.uid())");
const e4 = await fails("authenticated", A, "insert into monitors (name, url) values ('A4', 'https://a4.example.com')");
ok(e4?.includes("monitor_limit_reached"), `4th monitor blocked: ${e4}`);

// visibility
ok((await as("authenticated", A, "select count(*)::int c from monitors")).rows[0].c === 18, "A sees 15 public + 3 own");
ok((await as("authenticated", B, "select count(*)::int c from monitors")).rows[0].c === 15, "B does not see A's monitors");
ok((await as("anon", null, "select count(*)::int c from monitors where owner_id is not null")).rows[0].c === 0, "anon does not see personal monitors");

// B cannot modify A's monitors
const upd = await as("authenticated", B, `update monitors set name = 'hacked' where owner_id = '${A}' returning id`);
ok(upd.rows.length === 0, "B cannot update A's monitors");
const del = await as("authenticated", B, `delete from monitors where owner_id = '${A}' returning id`);
ok(del.rows.length === 0, "B cannot delete A's monitors");
ok(!!(await fails("authenticated", B, `insert into monitors (name, url, owner_id) values ('x','https://x.com','${A}')`)), "B cannot create a monitor owned by A");

// A cannot escalate
ok(!!(await fails("authenticated", A, `update monitors set is_public = true where owner_id = '${A}'`)), "A cannot make a monitor public");
ok(!!(await fails("authenticated", A, `update monitors set slug = 'sss2' where owner_id = '${A}'`)), "A cannot set slug");
ok(!!(await fails("authenticated", A, `update profiles set plan = 'pro'`)), "A cannot upgrade own plan");
ok((await as("authenticated", A, `update profiles set preferred_locale = 'fil' returning id`)).rows.length === 1, "A can change own language");
ok((await as("authenticated", B, `update profiles set preferred_locale = 'en' where id = '${A}' returning id`)).rows.length === 0, "B cannot change A's profile");
ok(!!(await fails("authenticated", A, `update monitors set url = 'javascript:alert(1)' where owner_id = '${A}'`)), "non-http URL rejected");

// public monitors can't be touched by users
ok((await as("authenticated", A, `update monitors set name = 'x' where slug = 'sss' returning id`)).rows.length === 0, "A cannot edit public monitors");

// checks: server writes; read follows monitor visibility
const sss = (await db.query("select id from monitors where slug='sss'")).rows[0].id;
const a1 = (await db.query(`select id from monitors where owner_id='${A}' limit 1`)).rows[0].id;
await as("service_role", null, `insert into checks (monitor_id, status, status_code, response_time_ms) values ('${sss}','up',200,300), ('${a1}','down',503,120)`);
ok(true, "service role writes checks");
ok(!!(await fails("authenticated", A, `insert into checks (monitor_id, status) values ('${a1}','up')`)), "users cannot write checks");
ok((await as("anon", null, "select count(*)::int c from checks")).rows[0].c === 1, "anon reads only public checks");
ok((await as("authenticated", A, "select count(*)::int c from checks")).rows[0].c === 2, "A reads public + own checks");
ok((await as("authenticated", B, "select count(*)::int c from checks")).rows[0].c === 1, "B cannot read A's checks");

// incidents
await db.exec(`insert into incidents (monitor_id, started_at, ended_at) values ('${sss}', '2026-11-11 00:00Z', '2026-11-11 00:12:30Z')`);
ok((await db.query("select duration_seconds from incidents")).rows[0].duration_seconds === 750, "incident duration computed (750 s)");
await db.exec(`insert into incidents (monitor_id, started_at) values ('${sss}', now())`);
ok(!!(await db.query(`insert into incidents (monitor_id, started_at) values ('${sss}', now())`).then(() => null, (e) => e.message)), "only one open incident per monitor");

// alert settings
ok((await as("authenticated", A, `insert into alert_settings (monitor_id, email) values ('${a1}', 'a@example.com') returning id`)).rows.length === 1, "A adds alert for own monitor");
ok(!!(await fails("authenticated", B, `insert into alert_settings (monitor_id, email) values ('${a1}', 'b@example.com')`)), "B cannot add alert on A's monitor");
ok((await as("authenticated", B, "select count(*)::int c from alert_settings")).rows[0].c === 0, "B cannot read A's alert settings");

// deleting a monitor frees a slot
await as("authenticated", A, `delete from monitors where id = '${a1}'`);
await as("authenticated", A, "insert into monitors (name, url) values ('A4', 'https://a4.example.com')");
ok(true, "after deleting one, A can add another");

// trigger functions are not callable by API roles
ok(!!(await fails("anon", null, "select public.enforce_monitor_limit()")), "anon cannot execute trigger function");
ok(!!(await fails("authenticated", A, "select public.handle_new_user()")), "authenticated cannot execute trigger function");
const pol = (await db.query("select count(*)::int c from pg_policies where tablename='monitors' and cmd='SELECT'")).rows[0].c;
ok(pol === 1, `monitors has a single SELECT policy (got ${pol})`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
