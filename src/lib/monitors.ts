import "server-only";
import { displayStatus } from "@/lib/format";
import { MONITOR_LIMITS } from "@/lib/monitor-input";
import type { BadgeStatus } from "@/components/status-badge";
import type { Outage } from "@/lib/status";
import type {
  MyMonitorRow,
  PlanType,
  ResponseTimePoint,
  ResponseTimeRange,
} from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Reads for the signed-in user's own monitors. Not cached: they depend on the
 * session cookie, and row-level security limits every query to the user's
 * own rows.
 */

export interface MyMonitor extends MyMonitorRow {
  status: BadgeStatus;
  /** Email alerts for this monitor are on (false if no setting exists). */
  alertsEnabled: boolean;
}

function toMyMonitor(row: MyMonitorRow, alertsEnabled: boolean): MyMonitor {
  return {
    ...row,
    status: row.is_active ? displayStatus(row.last_status, row.last_checked_at, Date.now()) : "paused",
    alertsEnabled,
  };
}

export async function getMyMonitors(): Promise<MyMonitor[]> {
  const supabase = await createSupabaseServerClient();
  const [monitors, alerts] = await Promise.all([
    supabase.rpc("my_monitors", {}),
    supabase.from("alert_settings").select("monitor_id, enabled"),
  ]);
  if (monitors.error) throw new Error(`my_monitors failed: ${monitors.error.message}`);
  const enabled = new Map((alerts.data ?? []).map((a) => [a.monitor_id, a.enabled]));
  return (monitors.data ?? []).map((row) => toMyMonitor(row, enabled.get(row.id) ?? false));
}

export async function getMyMonitor(id: string): Promise<MyMonitor | null> {
  // Not a UUID → can't exist (and would make Postgres raise an error).
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createSupabaseServerClient();
  const [monitor, alert] = await Promise.all([
    supabase.rpc("my_monitors", { p_id: id }),
    supabase.from("alert_settings").select("enabled").eq("monitor_id", id).maybeSingle(),
  ]);
  if (monitor.error) throw new Error(`my_monitors(id) failed: ${monitor.error.message}`);
  return monitor.data?.[0] ? toMyMonitor(monitor.data[0], alert.data?.enabled ?? false) : null;
}

/** The user's plan and how many monitors it allows. */
export async function getMyLimit(userId: string): Promise<{ plan: PlanType; max: number }> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("profiles").select("plan").eq("id", userId).maybeSingle();
  const plan = data?.plan ?? "free";
  return { plan, max: MONITOR_LIMITS[plan] };
}

/** Chart points for one of the user's monitors (RLS: own monitors only). */
export async function getMyResponseTimes(id: string, range: ResponseTimeRange): Promise<ResponseTimePoint[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("response_times", { p_monitor_id: id, p_range: range });
  if (error) throw new Error(`response_times failed: ${error.message}`);
  return data ?? [];
}

/** Recent outages for one of the user's monitors (RLS: own monitors only). */
export async function getMyOutages(id: string, limit = 20): Promise<Outage[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("incidents")
    .select("id, started_at, ended_at, duration_seconds")
    .eq("monitor_id", id)
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
