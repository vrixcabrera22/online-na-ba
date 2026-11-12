// "What we found": a Markdown write-up from the data collected so far.
//
//   npm run findings                 # prints Markdown, saves docs/findings.md
//
// Uses the hourly summaries (kept forever) and outages for the 15 public sites.
// Times are Asia/Manila. Needs .env.local (via --env-file) for the secret key.

import { writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
const key = process.env.SUPABASE_SECRET_KEY?.trim();
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY (run with --env-file=.env.local).");
  process.exit(2);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const { data: sites } = await db.from("monitors").select("id, name, slug").eq("is_public", true).order("name");

async function all(table, columns, filter) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(columns).range(from, from + 999);
    q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

const ids = sites.map((s) => s.id);
const stats = await all("hourly_stats", "monitor_id, hour, total, up_count, slow_count, down_count, avg_response_ms", (q) =>
  q.in("monitor_id", ids).order("hour"),
);
const outages = await all("incidents", "monitor_id, started_at, ended_at, duration_seconds", (q) => q.in("monitor_id", ids));

const manila = (iso) => {
  const d = new Date(new Date(iso).getTime() + 8 * 3600e3); // UTC+8, no DST
  return { dow: d.getUTCDay(), hour: d.getUTCHours() };
};
const hourLabel = (h) => `${((h + 11) % 12) + 1} ${h < 12 ? "AM" : "PM"}`;
const pct = (n) => `${n.toFixed(n >= 99.95 ? 0 : 2)}%`;
const ms = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${Math.round(n)} ms`);

// Per site.
const perSite = new Map(sites.map((s) => [s.id, { checks: 0, ok: 0, rtSum: 0, rtN: 0, hours: new Map() }]));
for (const h of stats) {
  const s = perSite.get(h.monitor_id);
  const responding = h.up_count + h.slow_count;
  s.checks += h.total;
  s.ok += responding;
  if (h.avg_response_ms !== null) {
    s.rtSum += h.avg_response_ms * responding;
    s.rtN += responding;
  }
  const { hour } = manila(h.hour);
  const slot = s.hours.get(hour) ?? { rtSum: 0, rtN: 0 };
  if (h.avg_response_ms !== null) {
    slot.rtSum += h.avg_response_ms * responding;
    slot.rtN += responding;
  }
  s.hours.set(hour, slot);
}
for (const o of outages) {
  const s = perSite.get(o.monitor_id);
  s.outages = (s.outages ?? 0) + 1;
  const end = o.ended_at ? Date.parse(o.ended_at) : Date.now();
  s.downMinutes = (s.downMinutes ?? 0) + (end - Date.parse(o.started_at)) / 60000;
}

const rows = sites
  .map((site) => {
    const s = perSite.get(site.id);
    const fastest = [...s.hours.entries()].filter(([, v]) => v.rtN >= 6).sort((a, b) => a[1].rtSum / a[1].rtN - b[1].rtSum / b[1].rtN)[0];
    return {
      name: site.name,
      checks: s.checks,
      uptime: s.checks ? (100 * s.ok) / s.checks : null,
      avgMs: s.rtN ? s.rtSum / s.rtN : null,
      outages: s.outages ?? 0,
      downMinutes: Math.round(s.downMinutes ?? 0),
      fastestHour: fastest ? fastest[0] : null,
    };
  })
  .filter((r) => r.checks > 0);

// All sites together: speed by hour of day and weekday vs weekend.
const byHour = new Map();
let weekday = { s: 0, n: 0 }, weekend = { s: 0, n: 0 };
for (const h of stats) {
  if (h.avg_response_ms === null) continue;
  const responding = h.up_count + h.slow_count;
  const { dow, hour } = manila(h.hour);
  const slot = byHour.get(hour) ?? { s: 0, n: 0 };
  slot.s += h.avg_response_ms * responding;
  slot.n += responding;
  byHour.set(hour, slot);
  const bucket = dow === 0 || dow === 6 ? weekend : weekday;
  bucket.s += h.avg_response_ms * responding;
  bucket.n += responding;
}
const hourly = [...byHour.entries()].filter(([, v]) => v.n > 0).map(([h, v]) => ({ h, avg: v.s / v.n })).sort((a, b) => a.avg - b.avg);

const first = stats[0]?.hour;
const last = stats.at(-1)?.hour;
const days = first ? (Date.parse(last) - Date.parse(first)) / 86400e3 + 1 / 24 : 0;
const totalChecks = rows.reduce((a, r) => a + r.checks, 0);

const reliable = [...rows].sort((a, b) => b.uptime - a.uptime || a.avgMs - b.avgMs);
const fast = [...rows].sort((a, b) => a.avgMs - b.avgMs);

const md = [];
md.push(`## What we found`);
md.push("");
md.push(
  `Based on **${totalChecks.toLocaleString("en-US")} checks** of ${rows.length} government sites over **${days.toFixed(1)} days** ` +
    `(${new Date(first).toISOString().slice(0, 10)} to ${new Date(last).toISOString().slice(0, 10)}), measured every 5 minutes from Singapore. Times are Philippine time.`,
);
md.push("");
if (days < 7) md.push(`> ⚠️ Less than a week of data: treat these as early observations, not conclusions.\n`);

md.push(`### Reliability`);
md.push("");
md.push(`| Site | Uptime | Outages | Total downtime |`);
md.push(`|---|---|---|---|`);
for (const r of reliable) md.push(`| ${r.name} | ${pct(r.uptime)} | ${r.outages} | ${r.downMinutes ? `${r.downMinutes} min` : "–"} |`);
md.push("");

md.push(`### Speed`);
md.push("");
md.push(`| Site | Average response | Usually fastest around |`);
md.push(`|---|---|---|`);
for (const r of fast) md.push(`| ${r.name} | ${ms(r.avgMs)} | ${r.fastestHour === null ? "–" : hourLabel(r.fastestHour)} |`);
md.push("");

md.push(`### Highlights`);
md.push("");
const perfect = rows.filter((r) => r.outages === 0 && r.uptime >= 99.95);
const perfectText =
  perfect.length === rows.length
    ? `all ${rows.length} sites had no recorded outages`
    : perfect.length
      ? `${perfect.map((r) => r.name).join(", ")} had no recorded outages`
      : `${reliable[0].name} (${pct(reliable[0].uptime)})`;
md.push(`- **Most reliable:** ${perfectText}.`);
const worst = reliable.at(-1);
if (worst && worst.uptime < 99.95) md.push(`- **Least reliable:** ${worst.name} at ${pct(worst.uptime)} uptime, with ${worst.outages} outage(s) totalling ${worst.downMinutes} min.`);
md.push(`- **Fastest:** ${fast[0].name} (${ms(fast[0].avgMs)} on average). **Slowest:** ${fast.at(-1).name} (${ms(fast.at(-1).avgMs)}), about ${(fast.at(-1).avgMs / fast[0].avgMs).toFixed(0)}× slower.`);
if (hourly.length >= 6) {
  md.push(`- **Across all sites,** responses were fastest around ${hourLabel(hourly[0].h)} (${ms(hourly[0].avg)}) and slowest around ${hourLabel(hourly.at(-1).h)} (${ms(hourly.at(-1).avg)}).`);
}
if (weekday.n && weekend.n) {
  const wd = weekday.s / weekday.n, we = weekend.s / weekend.n;
  md.push(`- **Weekdays vs weekends:** ${ms(wd)} vs ${ms(we)} on average${Math.abs(wd - we) / Math.min(wd, we) < 0.1 ? " (about the same)" : wd > we ? " (weekdays slower)" : " (weekends slower)"}.`);
}
md.push("");
md.push(`*Generated by \`npm run findings\` on ${new Date().toISOString().slice(0, 10)}.*`);

const out = md.join("\n");
mkdirSync("docs", { recursive: true });
writeFileSync("docs/findings.md", out + "\n");
console.log(out);
