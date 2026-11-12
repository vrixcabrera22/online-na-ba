import { NextResponse } from "next/server";
import { checkUrl, mapWithConcurrency } from "@/lib/check";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { checkerUserAgent } from "@/lib/env";
import { createAdminClient, supabaseUrl } from "@/lib/supabase/admin";

// All checks run in parallel with a 15 s timeout each, so a run takes ~15 s at
// worst. 60 s leaves headroom for the database writes.
export const maxDuration = 60;

// Enough parallelism to finish well within the timeout, without opening
// hundreds of sockets at once as personal monitors grow.
const CONCURRENCY = 20;

/**
 * Called every 5 minutes by Supabase Cron (pg_cron + pg_net).
 * Checks every active monitor once and saves the results.
 * Incident open/close and alert emails are added in Week 4.
 */
export async function POST(request: Request) {
  if (!isAuthorizedCronRequest(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch (err) {
    // requireEnv's message names the missing variable, never its value.
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[cron/check] misconfigured", detail);
    return NextResponse.json({ error: "server misconfigured", detail }, { status: 500 });
  }

  const { data: monitors, error: loadError } = await supabase
    .from("monitors")
    .select("id, url")
    .eq("is_active", true);

  if (loadError) {
    console.error("[cron/check] failed to load monitors", loadError);
    // Only the scheduler (holding CRON_SECRET) can reach this point, so it is
    // safe to include the database error to make failures debuggable.
    return NextResponse.json(
      // The project URL is public (it's in every browser request), so showing
      // it here is fine and helps spot a misconfigured environment variable.
      { error: "failed to load monitors", detail: loadError.message, supabaseUrl: supabaseUrl() },
      { status: 500 },
    );
  }

  // One timestamp per run, so every row from this run lines up on charts.
  const checkedAt = new Date(startedAt).toISOString();
  const userAgent = checkerUserAgent();

  const results = await mapWithConcurrency(monitors, CONCURRENCY, async (m) => ({
    monitor_id: m.id,
    checked_at: checkedAt,
    ...toRow(await checkUrl(m.url, { userAgent })),
  }));

  if (results.length > 0) {
    const { error: insertError } = await supabase.from("checks").insert(results);
    if (insertError) {
      console.error("[cron/check] failed to save checks", insertError);
      return NextResponse.json(
        { error: "failed to save checks", detail: insertError.message },
        { status: 500 },
      );
    }
  }

  const summary = {
    checked: results.length,
    up: results.filter((r) => r.status === "up").length,
    slow: results.filter((r) => r.status === "slow").length,
    down: results.filter((r) => r.status === "down").length,
    durationMs: Date.now() - startedAt,
  };
  console.log("[cron/check]", JSON.stringify(summary));
  return NextResponse.json(summary);
}

function toRow(r: Awaited<ReturnType<typeof checkUrl>>) {
  return {
    status: r.status,
    status_code: r.statusCode,
    response_time_ms: r.responseTimeMs,
    error: r.error,
  };
}
