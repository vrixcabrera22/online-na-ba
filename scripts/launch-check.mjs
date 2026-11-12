// Definition-of-done audit. Re-runnable before (and after) launch:
//
//   npm run launch-check            # checks the live site
//   BASE=http://localhost:3000 npm run launch-check
//
// 1. Secrets: nothing secret anywhere in git history
// 2. .env.example lists every environment variable the code reads
// 3. Every public page (from the sitemap), in both languages: loads, shows
//    the unofficial disclaimer, has no untranslated message keys, and links
//    its other-language version (hreflang)
// 4. Data continuity: every gap in the 5-minute checks since data began
//
// Needs .env.local (via --env-file) for the continuity check.

import { execSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const BASE = (process.env.BASE ?? "https://online-na-ba.vercel.app").replace(/\/$/, "");
let failures = 0;
const pass = (m) => console.log(`  PASS  ${m}`);
const fail = (m) => { failures++; console.log(`  FAIL  ${m}`); };
const section = (t) => console.log(`\n${t}`);
const check = (ok, good, bad) => (ok ? pass(good) : fail(bad));

// ---------------------------------------------------------------------------
section("1. Secrets in git history");
// Every patch ever committed, on every branch.
const history = execSync("git log -p --all --no-color", { maxBuffer: 1024 * 1024 * 512 }).toString();
const patterns = {
  "Supabase secret key": /sb_secret_[A-Za-z0-9_-]{16,}/,
  "Resend API key": /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{8,}/,
  "GitHub token": /\bgh[pousr]_[A-Za-z0-9]{30,}/,
  "JWT (legacy service_role/anon key)": /eyJhbGciOi[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/,
  "private key block": /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
};
for (const [label, re] of Object.entries(patterns)) {
  check(!re.test(history), `no ${label}`, `${label} found in git history`);
}
// The actual secret values from .env.local must never appear either.
for (const name of ["SUPABASE_SECRET_KEY", "CRON_SECRET", "RESEND_API_KEY"]) {
  const value = process.env[name]?.trim();
  if (!value) continue;
  check(!history.includes(value), `value of ${name} not in history`, `the value of ${name} appears in git history`);
}
const tracked = execSync("git ls-files").toString().split("\n");
check(!tracked.some((f) => /^\.env(?!\.example$)/.test(f)), "no .env files tracked (only .env.example)", ".env file tracked by git");

// ---------------------------------------------------------------------------
section("2. .env.example covers every variable the code reads");
function files(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx|mjs)$/.test(p) ? [p] : [];
  });
}
const used = new Set();
for (const f of [...files("src"), ...files("scripts")]) {
  // A name must end in a letter or digit, so "NEXT_PUBLIC_*" in a comment isn't counted.
  for (const m of readFileSync(f, "utf8").matchAll(/process\.env(?:\.([A-Z][A-Z0-9_]*[A-Z0-9])(?![A-Z0-9_*])|\[["']([A-Z][A-Z0-9_]*[A-Z0-9])["']\])/g)) used.add(m[1] ?? m[2]);
}
// Names passed to requireEnv("X") count too.
for (const f of files("src")) {
  for (const m of readFileSync(f, "utf8").matchAll(/requireEnv\(["']([A-Z0-9_]+)["']\)/g)) used.add(m[1]);
}
for (const builtin of ["NODE_ENV", "BASE"]) used.delete(builtin);
const documented = new Set([...readFileSync(".env.example", "utf8").matchAll(/^([A-Z0-9_]+)=/gm)].map((m) => m[1]));
for (const name of [...used].sort()) {
  check(documented.has(name), `${name} documented`, `${name} is used but missing from .env.example`);
}

// ---------------------------------------------------------------------------
section(`3. Public pages on ${BASE}`);
const sitemap = await fetch(`${BASE}/sitemap.xml`).then((r) => r.text());
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/^https?:\/\/[^/]+/, BASE));
check(urls.length >= 30, `sitemap lists ${urls.length} pages`, `sitemap lists only ${urls.length} pages`);
const DISCLAIMER = { fil: "Hindi opisyal", en: "Unofficial" };
// A raw key like "Status.paused" in visible text means a missing translation.
const RAW_KEY = />[^<]*\b(?:Metadata|Header|Home|Footer|Status|Categories|Site|NotFound|Error|Auth|Dashboard|Email|Unsubscribe|Heatmap|About)\.[a-z][A-Za-z0-9.]+\b[^<]*</;
let pageProblems = 0;
for (const url of urls) {
  const locale = new URL(url).pathname.split("/")[1];
  const res = await fetch(url);
  const html = await res.text();
  const visible = html.replace(/<script[\s\S]*?<\/script>/g, "");
  const problems = [];
  if (res.status !== 200) problems.push(`HTTP ${res.status}`);
  if (!visible.includes(DISCLAIMER[locale])) problems.push("no disclaimer in footer");
  if (RAW_KEY.test(visible)) problems.push(`untranslated key: ${visible.match(RAW_KEY)[0].slice(0, 60)}`);
  if (!/hrefLang="fil"/.test(html) || !/hrefLang="en"/.test(html)) problems.push("missing hreflang links");
  if (problems.length) { pageProblems++; fail(`${url.replace(BASE, "")}: ${problems.join("; ")}`); }
}
if (!pageProblems) pass(`all ${urls.length} pages: 200, disclaimer, translated, hreflang`);

// ---------------------------------------------------------------------------
section("4. Data continuity (5-minute checks)");
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
const secret = process.env.SUPABASE_SECRET_KEY?.trim();
if (!sbUrl || !secret) {
  console.log("  SKIP  no Supabase credentials (run with --env-file=.env.local)");
} else {
  const admin = createClient(sbUrl, secret, { auth: { persistSession: false } });
  const { data: health } = await admin.rpc("health_report", {});
  check(health?.[0]?.job_active, "check-monitors cron job is active", "check-monitors cron job missing or inactive");
  // One public monitor's checks = one row per run since data began.
  const { data: sss } = await admin.from("monitors").select("id").eq("slug", "sss").single();
  const runs = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await admin.from("checks").select("checked_at").eq("monitor_id", sss.id).order("checked_at").range(from, from + 999);
    runs.push(...(data ?? []).map((r) => Date.parse(r.checked_at)));
    if (!data || data.length < 1000) break;
  }
  // Raw checks older than 30 days are deleted; hourly summaries remain.
  const first = runs[0];
  const days = (Date.now() - first) / 86400e3;
  const gaps = [];
  for (let i = 1; i < runs.length; i++) {
    const minutes = (runs[i] - runs[i - 1]) / 60000;
    if (minutes > 15) gaps.push({ at: new Date(runs[i - 1]).toISOString(), minutes: Math.round(minutes) });
  }
  console.log(`  INFO  ${runs.length} runs over ${days.toFixed(1)} days since ${new Date(first).toISOString()}`);
  check(days >= 14, "at least 2 weeks of checks", `only ${days.toFixed(1)} days of checks (Definition of done: 14)`);
  if (gaps.length === 0) pass("no gaps over 15 minutes");
  else {
    console.log(`  WARN  ${gaps.length} gap(s) over 15 minutes:`);
    for (const g of gaps) console.log(`          ${g.at}  (${g.minutes} min)`);
  }
}

console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) failed.`}`);
process.exit(failures ? 1 : 0);
