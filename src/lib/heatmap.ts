// Logic for the "best time to access" heatmap (pure: unit tested).

import type { BestTimeRow } from "@/lib/supabase/database.types";

export type HeatmapMetric = "uptime" | "speed";

/** A cell needs at least this many checks (half an hour's worth) to count. */
export const MIN_CHECKS = 6;
/** Number of color steps. Level LEVELS-1 is always the best (darkest). */
export const LEVELS = 5;

export interface Cell {
  dow: number; // 0 = Sunday (Manila)
  hour: number; // 0–23 (Manila)
  checks: number;
  uptime: number | null;
  avgMs: number | null;
}

export function toCells(rows: BestTimeRow[]): Cell[] {
  return rows.map((r) => ({
    dow: r.dow,
    hour: r.hour,
    checks: r.checks,
    uptime: r.uptime === null ? null : Number(r.uptime),
    avgMs: r.avg_response_ms,
  }));
}

export const hasEnoughData = (c: Cell | undefined): c is Cell => !!c && c.checks >= MIN_CHECKS;

/**
 * Uptime levels use fixed thresholds, so colors mean the same thing on every
 * site: <90%, 90–97%, 97–99%, 99–99.9%, ≥99.9% (darkest = most reliable).
 */
export function uptimeLevel(uptime: number): number {
  if (uptime >= 99.9) return 4;
  if (uptime >= 99) return 3;
  if (uptime >= 97) return 2;
  if (uptime >= 90) return 1;
  return 0;
}

/**
 * Speed levels are relative to this site's own range (a 2 s site and a 200 ms
 * site both get a useful spread). Darkest = fastest. If every cell is equally
 * fast, they all get the top level.
 */
export function speedLevels(cells: Cell[]): (ms: number) => number {
  const values = cells.filter(hasEnoughData).map((c) => c.avgMs).filter((v): v is number => v !== null);
  if (values.length === 0) return () => LEVELS - 1;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max - min < 1) return () => LEVELS - 1;
  return (ms) => {
    const t = (ms - min) / (max - min); // 0 = fastest, 1 = slowest
    return Math.max(0, Math.min(LEVELS - 1, LEVELS - 1 - Math.floor(t * LEVELS)));
  };
}

export interface Window {
  dow: number;
  fromHour: number;
  /** Exclusive end hour (fromHour + length). */
  toHour: number;
  value: number;
}

/**
 * Best/worst run of `length` consecutive hours on the same day (all cells with
 * enough data). Falls back to single hours when no full run exists yet.
 */
function windows(cells: Cell[], value: (c: Cell) => number | null, length: number): Window[] {
  const byKey = new Map(cells.map((c) => [`${c.dow}-${c.hour}`, c]));
  const out: Window[] = [];
  for (let dow = 0; dow < 7; dow++) {
    for (let h = 0; h + length <= 24; h++) {
      const run = Array.from({ length }, (_, i) => byKey.get(`${dow}-${h + i}`));
      if (!run.every(hasEnoughData)) continue;
      const vals = run.map((c) => value(c as Cell));
      if (vals.some((v) => v === null)) continue;
      out.push({ dow, fromHour: h, toHour: h + length, value: (vals as number[]).reduce((a, b) => a + b, 0) / length });
    }
  }
  return out.length || length === 1 ? out : windows(cells, value, 1);
}

export interface HeatmapSummary {
  enoughData: boolean;
  fastest: Window | null;
  slowest: Window | null;
  /** True when every hour with data was ≥ 99.5% up. */
  alwaysOnline: boolean;
  leastReliable: Window | null;
}

export function summarize(cells: Cell[]): HeatmapSummary {
  const usable = cells.filter(hasEnoughData);
  if (usable.length === 0) {
    return { enoughData: false, fastest: null, slowest: null, alwaysOnline: false, leastReliable: null };
  }
  const speed = windows(usable, (c) => c.avgMs, 2);
  const reliability = windows(usable, (c) => c.uptime, 2);
  const fastest = speed.reduce<Window | null>((best, w) => (!best || w.value < best.value ? w : best), null);
  // The slowest window must not share hours with the fastest one, or the two
  // sentences contradict each other (happens when there's little data).
  const overlapsFastest = (w: Window) =>
    !!fastest && w.dow === fastest.dow && w.fromHour < fastest.toHour && fastest.fromHour < w.toHour;
  const slowest = speed
    .filter((w) => !overlapsFastest(w))
    .reduce<Window | null>((worst, w) => (!worst || w.value > worst.value ? w : worst), null);
  const alwaysOnline = usable.every((c) => (c.uptime ?? 0) >= 99.5);
  const leastReliable = alwaysOnline
    ? null
    : reliability.reduce<Window | null>((worst, w) => (!worst || w.value < worst.value ? w : worst), null);
  return {
    enoughData: true,
    fastest,
    // Only worth saying when it's actually different from the fastest.
    slowest: slowest && fastest && slowest.value > fastest.value * 1.2 ? slowest : null,
    alwaysOnline,
    leastReliable,
  };
}
