import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { displayStatus, type DisplayStatus } from "@/lib/format";
import { toCells, type Cell } from "@/lib/heatmap";
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

/** First check ever recorded (start of all public data). */
export const DATA_SINCE = "2026-11-12T01:36:00Z";

/** First scheduled run with incident tracking; no outages exist before this. */
export const OUTAGES_TRACKED_SINCE = "2026-11-12T02:40:00Z";

/** Display order of categories on the board. */
export const CATEGORY_ORDER: readonly MonitorCategory[] = ["benefits", "ids", "tax", "others"];

/** A status board row plus the status to display (handles stale/missing data). */
export interface Site extends StatusBoardRow {
  status: DisplayStatus;
}

function toSite(row: StatusBoardRow): Site {
  // Date.now() inside a "use cache" scope is evaluated when the cache entry is
  // built, so staleness is accurate to within the cache lifetime (≤ 5 min).
  return { ...row, status: displayStatus(row.last_status, row.last_checked_at, Date.now()) };
}

export interface Outage {
  id: number;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
}

export async function getStatusBoard(): Promise<Site[]> {
  "use cache";
  statusCache();
  const { data, error } = await createPublicClient().rpc("status_board", {});
  if (error) throw new Error(`status_board failed: ${error.message}`);
  return (data ?? []).map(toSite);
}

export async function getSite(slug: string): Promise<Site | null> {
  "use cache";
  statusCache();
  const { data, error } = await createPublicClient().rpc("status_board", { p_slug: slug });
  if (error) throw new Error(`status_board(${slug}) failed: ${error.message}`);
  const row = data?.[0];
  return row ? toSite(row) : null;
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

export async function getBestTimes(monitorId: string): Promise<Cell[]> {
  "use cache";
  statusCache();
  const { data, error } = await createPublicClient().rpc("best_times", { p_monitor_id: monitorId });
  if (error) throw new Error(`best_times failed: ${error.message}`);
  return toCells(data ?? []);
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
