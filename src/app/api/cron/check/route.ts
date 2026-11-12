import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { STATUS_TAG } from "@/lib/status";
import { checkUrl, mapWithConcurrency } from "@/lib/check";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { checkerUserAgent } from "@/lib/env";
import { createAdminClient, supabaseUrl } from "@/lib/supabase/admin";
import type { CheckInput, IncidentEvent } from "@/lib/supabase/database.types";

// All checks run in parallel with a 15 s timeout each, so a run takes ~15 s at
// worst. 60 s leaves headroom for the database writes.
export const maxDuration = 60;

// Enough parallelism to finish well within the timeout, without opening
// hundreds of sockets at once as personal monitors grow.
const CONCURRENCY = 20;

/**
 * Called every 5 minutes by Supabase Cron (pg_cron + pg_net).
 * Checks every active monitor once, saves the results and updates incidents.
 * Alert emails are added in Week 4.
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

  const results: CheckInput[] = await mapWithConcurrency(monitors, CONCURRENCY, async (m) => ({
    monitor_id: m.id,
    checked_at: checkedAt,
    ...toRow(await checkUrl(m.url, { userAgent })),
  }));

  // Saves the checks and opens/closes incidents in one transaction (see
  // record_checks in supabase/migrations). Returns the incidents that changed,
  // which Week 4 turns into alert emails.
  let events: IncidentEvent[] = [];
  if (results.length > 0) {
    const { data, error: saveError } = await supabase.rpc("record_checks", { p_checks: results });
    if (saveError) {
      console.error("[cron/check] failed to save checks", saveError);
      return NextResponse.json(
        { error: "failed to save checks", detail: saveError.message },
        { status: 500 },
      );
    }
    events = data ?? [];
    // Tell Next.js the cached status pages are stale, so the next visit
    // refreshes them with this run's results.
    revalidateTag(STATUS_TAG, "max");
  }

  const summary = {
    checked: results.length,
    up: results.filter((r) => r.status === "up").length,
    slow: results.filter((r) => r.status === "slow").length,
    down: results.filter((r) => r.status === "down").length,
    incidentsOpened: events.filter((e) => e.event === "opened").length,
    incidentsClosed: events.filter((e) => e.event === "closed").length,
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
