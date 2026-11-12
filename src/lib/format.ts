// Small, pure formatting helpers shared by the status pages.

import type { CheckStatus } from "@/lib/supabase/database.types";

/** What a site card shows: a check status, or "unknown" when data is missing/stale. */
export type DisplayStatus = CheckStatus | "unknown";

/** A site's latest check is "stale" after this long (3 missed runs). */
export const STALE_AFTER_MS = 15 * 60 * 1000;

export function isStale(lastCheckedAt: string | null, now: number): boolean {
  if (!lastCheckedAt) return true;
  return now - new Date(lastCheckedAt).getTime() > STALE_AFTER_MS;
}

export function displayStatus(
  lastStatus: CheckStatus | null,
  lastCheckedAt: string | null,
  now: number,
): DisplayStatus {
  if (!lastStatus || isStale(lastCheckedAt, now)) return "unknown";
  return lastStatus;
}

/**
 * Uptime percentage for display. Never rounds up to 100: 99.996% shows as
 * "99.99%", so "100%" always means no downtime at all. Null → "—".
 */
export function formatUptime(value: number | null, locale: string): string {
  if (value === null || Number.isNaN(value)) return "—";
  if (value >= 100) return `${new Intl.NumberFormat(locale).format(100)}%`;
  const floored = Math.floor(value * 100) / 100;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(floored)}%`;
}

/** Response time: "320 ms" under a second, "1.2 s" above. Null → "—". */
export function formatResponseTime(ms: number | null, locale: string): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${new Intl.NumberFormat(locale).format(Math.round(ms))} ms`;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(ms / 1000)} s`;
}

/** Outage length as hours/minutes parts, e.g. { hours: 1, minutes: 5 }. */
export function durationParts(seconds: number): { hours: number; minutes: number } {
  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}
