import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import type {
  MonitorCategory,
  ResponseTimePoint,
  ResponseTimeRange,
  StatusBoardRow,
} from "@/lib/supabase/database.types";

/**
 * Cached reads for the public status pages.
 *
 * Everything is tagged "status". The cron route calls revalidateTag("status")
 * after each run, so pages refresh as soon as new checks land. The cacheLife
 * below is a fallback in case that call is ever missed.
 */
export const STATUS_TAG = "status";

function statusCache() {
  cacheTag(STATUS_TAG);
  // Checks run every 5 minutes.
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
}

/** Display order of categories on the board. */
export const CATEGORY_ORDER: readonly MonitorCategory[] = ["benefits", "ids", "tax", "others"];

export interface Outage {
  id: number;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
}

export async function getStatusBoard(): Promise<StatusBoardRow[]> {
  "use cache";
  statusCache();
  const { data, error } = await createPublicClient().rpc("status_board", {});
  if (error) throw new Error(`status_board failed: ${error.message}`);
  return data ?? [];
}

export async function getSite(slug: string): Promise<StatusBoardRow | null> {
  "use cache";
  statusCache();
  const { data, error } = await createPublicClient().rpc("status_board", { p_slug: slug });
  if (error) throw new Error(`status_board(${slug}) failed: ${error.message}`);
  return data?.[0] ?? null;
}

export async function getResponseTimes(
  monitorId: string,
  range: ResponseTimeRange,
): Promise<ResponseTimePoint[]> {
  "use cache";
  statusCache();
  const { data, error } = await createPublicClient().rpc("response_times", {
    p_monitor_id: monitorId,
    p_range: range,
  });
  if (error) throw new Error(`response_times failed: ${error.message}`);
  return data ?? [];
}

export async function getRecentOutages(monitorId: string, limit = 20): Promise<Outage[]> {
  "use cache";
  statusCache();
  const { data, error } = await createPublicClient()
    .from("incidents")
    .select("id, started_at, ended_at, duration_seconds")
    .eq("monitor_id", monitorId)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`incidents failed: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    durationSeconds: r.duration_seconds,
  }));
}
