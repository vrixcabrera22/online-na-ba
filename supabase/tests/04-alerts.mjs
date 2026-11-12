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
ok(true, "all migrations + seed run");

async function as(role, uid, sql, params) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}; select set_config('request.jwt.claim.sub', '${uid ?? ""}', true);`);
    return tx.query(sql, params);
  });
}
const fails = (role, uid, sql, p) => as(role, uid, sql, p).then(() => null, (e) => e.message);

const A = "00000000-0000-0000-0000-00000000000a";
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${A}', 'juan@example.com', '{"locale":"en"}')`);
await as("authenticated", A, "insert into monitors (name, url) values ('Shop', 'https://shop.example.com')");
const mon = (await db.query(`select id from monitors where owner_id='${A}'`)).rows[0].id;

const setting = (await db.query(`select * from alert_settings where monitor_id='${mon}'`)).rows;
ok(setting.length === 1 && setting[0].enabled && setting[0].email === "juan@example.com", "new monitor gets an alert setting (on, owner's email)");
ok((await db.query("select count(*)::int c from alert_settings")).rows[0].c === 1, "public monitors get no alert settings");

const t0 = Date.now() - 30 * 60_000;
const at = (min) => new Date(t0 + min * 60_000).toISOString();
const run = (status, min) =>
  as("service_role", null, "select * from record_checks($1::jsonb)", [JSON.stringify([{ monitor_id: mon, status, status_code: status === "down" ? 503 : 200, response_time_ms: status === "down" ? null : 100, error: status === "down" ? "HTTP 503" : null, checked_at: at(min) }])]);
const pending = () => as("service_role", null, "select * from pending_alerts()").then((r) => r.rows);
const mark = (list) => as("service_role", null, "select mark_alerts_sent($1::jsonb) as n", [JSON.stringify(list)]).then((r) => r.rows[0].n);

await run("up", 0);
await run("down", 5);
ok((await pending()).length === 0, "one down check: nothing to send");
await run("down", 10);
let p = await pending();
ok(p.length === 1 && p[0].kind === "down", "incident opened → one 'down' alert pending");
ok(p[0].recipient === "juan@example.com" && p[0].locale === "en", "recipient = account email, in the account's language");
ok(p[0].last_error === "HTTP 503" && p[0].monitor_name === "Shop", "includes the reason and monitor name");
const inc = p[0].incident_id;

// Not marked (send failed) → still pending next run.
ok((await pending()).length === 1, "unsent alert stays pending (retried next run)");
ok((await mark([{ incident_id: inc, kind: "down" }])) === 1, "mark down as sent");
ok((await mark([{ incident_id: inc, kind: "down" }])) === 0, "marking twice does nothing (overlapping runs)");
ok((await pending()).length === 0, "nothing pending after sending");

await run("down", 15);
ok((await pending()).length === 0, "still down: no repeat alert");
await run("up", 20);
p = await pending();
ok(p.length === 1 && p[0].kind === "up" && p[0].duration_seconds === 15 * 60, "recovered → 'up' alert with 15 min duration");
await mark([{ incident_id: inc, kind: "up" }]);
ok((await pending()).length === 0, "nothing pending after 'up' sent");

// Recovery without a down alert ever sent → no 'up' alert.
await run("down", 25);
await run("down", 26);
const inc2 = (await pending())[0].incident_id;
await run("up", 27); // recovered before the down alert went out
p = await pending();
ok(p.length === 1 && p[0].kind === "down" && p[0].incident_id === inc2, "if down wasn't sent yet, only 'down' is pending (no 'up' first)");

// Disabled alerts → nothing.
await db.exec(`update alert_settings set enabled = false where monitor_id = '${mon}'`);
ok((await pending()).length === 0, "disabled alerts → nothing pending");
await db.exec(`update alert_settings set enabled = true where monitor_id = '${mon}'`);
await mark([{ incident_id: inc2, kind: "down" }, { incident_id: inc2, kind: "up" }]);

// Flapping: after 6 alerts in an hour, stop.
await db.exec(`delete from incidents where monitor_id = '${mon}'`);
for (let i = 0; i < 3; i++) {
  await db.exec(`insert into incidents (monitor_id, started_at, ended_at, down_alert_sent_at, up_alert_sent_at) values ('${mon}', now() - interval '20 minutes', now() - interval '15 minutes', now(), now())`);
}
await db.exec(`insert into incidents (monitor_id, started_at) values ('${mon}', now() - interval '1 minute')`);
ok((await pending()).length === 0, "6 alerts in the last hour → flapping guard holds the 7th");

// Old incidents are never alerted.
await db.exec(`delete from incidents where monitor_id = '${mon}'`);
await db.exec(`insert into incidents (monitor_id, started_at) values ('${mon}', now() - interval '2 days')`);
ok((await pending()).length === 0, "incidents older than 24 h are not alerted");

// Changing the account email changes the recipient.
await db.exec(`delete from incidents where monitor_id = '${mon}'`);
await db.exec(`insert into incidents (monitor_id, started_at) values ('${mon}', now())`);
await db.exec(`update auth.users set email = 'bago@example.com' where id = '${A}'`);
ok((await pending())[0]?.recipient === "bago@example.com", "uses the account's current email");

// Permissions.
ok(!!(await fails("anon", null, "select * from pending_alerts()")), "visitors can't call pending_alerts");
ok(!!(await fails("authenticated", A, "select * from pending_alerts()")), "users can't call pending_alerts (it reveals emails)");
ok(!!(await fails("authenticated", A, "select mark_alerts_sent('[]'::jsonb)")), "users can't call mark_alerts_sent");
ok(!!(await fails("authenticated", A, `update incidents set down_alert_sent_at = now() where monitor_id = '${mon}'`)), "users can't edit incidents");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
