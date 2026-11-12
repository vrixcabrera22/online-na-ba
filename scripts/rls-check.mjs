// Live row-level security check against the real Supabase project.
//
//   node --env-file=.env.local scripts/rls-check.mjs
//
// Creates two temporary, pre-confirmed users (on example.com, so no email is
// sent), then tries every way user B could see or change user A's data, using
// only the public (publishable) key like the real app does. Deletes both users
// and everything they created at the end, even if a check fails.
//
// Needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and
// SUPABASE_SECRET_KEY (the secret key is only used to create/delete the test
// users and to write a check row, as the checker would).

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
const secret = process.env.SUPABASE_SECRET_KEY?.trim();
if (!url || !publishable || !secret) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or SUPABASE_SECRET_KEY.");
  process.exit(2);
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, secret, opts);
const anon = createClient(url, publishable, opts);

let pass = 0;
let fail = 0;
const check = (ok, label) => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
};

const tag = randomBytes(4).toString("hex");
const password = randomBytes(18).toString("base64url");
const created = [];

async function makeUser(name) {
  const email = `rls-${name}-${tag}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser ${name}: ${error.message}`);
  created.push(data.user.id);
  const client = createClient(url, publishable, opts);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`signIn ${name}: ${signInError.message}`);
  return { id: data.user.id, client };
}

try {
  const A = await makeUser("a");
  const B = await makeUser("b");

  // --- A's own data ---
  const { data: mon, error: monErr } = await A.client
    .from("monitors")
    .insert({ name: "A shop", url: "https://a-shop.example.com", owner_id: A.id })
    .select("id")
    .single();
  check(!monErr && mon?.id, `A can create a monitor ${monErr ? `(${monErr.message})` : ""}`);
  const monitorId = mon.id;

  // A check row, written the way the checker writes them (secret key).
  await admin.rpc("record_checks", {
    p_checks: [
      { monitor_id: monitorId, status: "up", status_code: 200, response_time_ms: 99, error: null, checked_at: new Date().toISOString() },
    ],
  });
  const { error: alertErr } = await A.client
    .from("alert_settings")
    .insert({ monitor_id: monitorId, email: `rls-a-${tag}@example.com` });
  check(!alertErr, "A can add an alert setting for their own monitor");

  const mineA = await A.client.rpc("my_monitors", {});
  check(mineA.data?.length === 1 && mineA.data[0].last_status === "up", "A sees their monitor and its latest check");

  // --- B tries to read A's data ---
  const bMonitors = await B.client.from("monitors").select("id").eq("id", monitorId);
  check(bMonitors.data?.length === 0, "B cannot read A's monitor (table)");
  const bMine = await B.client.rpc("my_monitors", { p_id: monitorId });
  check(bMine.data?.length === 0, "B cannot read A's monitor (my_monitors)");
  const bChecks = await B.client.from("checks").select("id").eq("monitor_id", monitorId);
  check(bChecks.data?.length === 0, "B cannot read A's check results");
  const bChart = await B.client.rpc("response_times", { p_monitor_id: monitorId, p_range: "24h" });
  check(bChart.data?.length === 0, "B cannot read A's response-time chart");
  const bIncidents = await B.client.from("incidents").select("id").eq("monitor_id", monitorId);
  check(bIncidents.data?.length === 0, "B cannot read A's incidents");
  const bAlerts = await B.client.from("alert_settings").select("id").eq("monitor_id", monitorId);
  check(bAlerts.data?.length === 0, "B cannot read A's alert settings");
  const bProfile = await B.client.from("profiles").select("id").eq("id", A.id);
  check(bProfile.data?.length === 0, "B cannot read A's profile");

  // --- B tries to change A's data ---
  const bRename = await B.client.from("monitors").update({ name: "hacked" }).eq("id", monitorId).select("id");
  check(!bRename.data?.length, "B cannot edit A's monitor");
  const bPause = await B.client.from("monitors").update({ is_active: false }).eq("id", monitorId).select("id");
  check(!bPause.data?.length, "B cannot pause A's monitor");
  const bDelete = await B.client.from("monitors").delete().eq("id", monitorId).select("id");
  check(!bDelete.data?.length, "B cannot delete A's monitor");
  const bSteal = await B.client
    .from("monitors")
    .insert({ name: "x", url: "https://x.example.com", owner_id: A.id })
    .select("id");
  check(!!bSteal.error, "B cannot create a monitor owned by A");
  const bAlertOnA = await B.client
    .from("alert_settings")
    .insert({ monitor_id: monitorId, email: `rls-b-${tag}@example.com` });
  check(!!bAlertOnA.error, "B cannot subscribe to alerts on A's monitor");
  const bFakeCheck = await B.client.from("checks").insert({ monitor_id: monitorId, status: "down" });
  check(!!bFakeCheck.error, "B cannot write fake check results");

  const still = await admin.from("monitors").select("name, is_active").eq("id", monitorId).single();
  check(still.data?.name === "A shop" && still.data?.is_active === true, "A's monitor is unchanged after B's attempts");

  // --- Visitors (not signed in) ---
  const anonMon = await anon.from("monitors").select("id").eq("id", monitorId);
  check(anonMon.data?.length === 0, "visitors cannot read A's monitor");
  const anonBoard = await anon.rpc("status_board", {});
  check(anonBoard.data?.length === 15 && !anonBoard.data.some((r) => r.id === monitorId), "public board shows only the 15 public sites");

  // --- Escalation attempts by A ---
  const aPublic = await A.client.from("monitors").update({ is_public: true }).eq("id", monitorId);
  check(!!aPublic.error, "A cannot make their monitor public");
  const aPlan = await A.client.from("profiles").update({ plan: "pro" }).eq("id", A.id);
  check(!!aPlan.error, "A cannot upgrade their own plan");
  const aInternal = await A.client.from("monitors").update({ url: "http://169.254.169.254/" }).eq("id", monitorId);
  check(!!aInternal.error, "A cannot point a monitor at an internal address");

  // --- 3-monitor limit ---
  for (const n of [2, 3]) {
    await A.client.from("monitors").insert({ name: `A ${n}`, url: `https://a${n}.example.com`, owner_id: A.id });
  }
  const fourth = await A.client.from("monitors").insert({ name: "A 4", url: "https://a4.example.com", owner_id: A.id });
  check(fourth.error?.message?.includes("monitor_limit_reached"), "a 4th monitor is rejected by the database");
} catch (err) {
  fail++;
  console.error("ERROR ", err instanceof Error ? err.message : err);
} finally {
  // Deleting the users cascades to profiles, monitors, checks, incidents and alert settings.
  for (const id of created) await admin.auth.admin.deleteUser(id);
  const leftover = created.length
    ? (await admin.from("monitors").select("id", { count: "exact", head: true }).in("owner_id", created)).count
    : 0;
  console.log(`\ncleanup: deleted ${created.length} test users, ${leftover ?? "?"} monitors left behind`);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
