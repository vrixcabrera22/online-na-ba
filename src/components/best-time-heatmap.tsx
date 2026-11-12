"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { formatResponseTime, formatUptime } from "@/lib/format";
import {
  hasEnoughData,
  LEVELS,
  speedLevels,
  summarize,
  uptimeLevel,
  type Cell,
  type HeatmapMetric,
  type Window,
} from "@/lib/heatmap";

/** Monday first: government offices work Monday–Friday. */
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const HEAT = ["bg-[var(--heat-0)]", "bg-[var(--heat-1)]", "bg-[var(--heat-2)]", "bg-[var(--heat-3)]", "bg-[var(--heat-4)]"];

/**
 * "Best time to access" heatmap: day of week × hour (Manila), colored by
 * response time (default; it varies by hour) or uptime. One-hue sequential
 * ramp, darker = better in both views. Cells with too few checks stay neutral
 * instead of pretending to be a value. The grid is a real table with a label
 * on every cell, so screen readers get the numbers too.
 */
export function BestTimeHeatmap({ cells, since }: { cells: Cell[]; since: string }) {
  const t = useTranslations("Heatmap");
  const locale = useLocale();
  const [metric, setMetric] = useState<HeatmapMetric>("speed");
  const [selected, setSelected] = useState<string | null>(null);

  const byKey = useMemo(() => new Map(cells.map((c) => [`${c.dow}-${c.hour}`, c])), [cells]);
  const summary = useMemo(() => summarize(cells), [cells]);
  const speedLevel = useMemo(() => speedLevels(cells), [cells]);

  // Day and hour names in the page's language. 2026-11-08 is a Sunday.
  const dayFmt = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  const dayLongFmt = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" });
  const hourFmt = new Intl.DateTimeFormat(locale, { hour: "numeric", timeZone: "UTC" });
  const day = (dow: number) => dayFmt.format(Date.UTC(2026, 10, 8 + dow));
  const dayLong = (dow: number) => dayLongFmt.format(Date.UTC(2026, 10, 8 + dow));
  const hour = (h: number) => hourFmt.format(Date.UTC(2026, 0, 1, h % 24));
  const windowText = (w: Window) => t("window", { day: dayLong(w.dow), from: hour(w.fromHour), to: hour(w.toHour) });

  const level = (c: Cell | undefined): number | null => {
    if (!hasEnoughData(c)) return null;
    if (metric === "uptime") return c.uptime === null ? null : uptimeLevel(c.uptime);
    return c.avgMs === null ? 0 : speedLevel(c.avgMs);
  };
  const label = (dow: number, h: number) => {
    const c = byKey.get(`${dow}-${h}`);
    if (!hasEnoughData(c)) return t("cellNoData", { day: dayLong(dow), hour: hour(h) });
    return t("cell", {
      day: dayLong(dow),
      hour: hour(h),
      uptime: formatUptime(c.uptime, locale),
      speed: formatResponseTime(c.avgMs, locale),
      checks: c.checks,
    });
  };

  // Plain cells, not buttons: 168 tab stops would be unusable with a keyboard,
  // and small buttons fail tap-target rules. Each cell carries its numbers as
  // screen-reader text; one pointer handler on the table shows them visually.
  const cell = (dow: number, h: number, size: string) => {
    const key = `${dow}-${h}`;
    const lv = level(byKey.get(key));
    return (
      <td key={dow * 100 + h} data-cell={key} className="p-0">
        <span
          className={`block w-full rounded-[3px] ${size} ${
            lv === null ? "border border-dashed border-border" : HEAT[lv]
          } ${selected === key ? "outline-2 outline-offset-1 outline-foreground" : ""}`}
        />
        <span className="sr-only">{label(dow, h)}</span>
      </td>
    );
  };
  const pick = (e: React.PointerEvent) => {
    const key = (e.target as HTMLElement).closest("td")?.dataset.cell;
    if (key) setSelected(key);
  };
  const tableEvents = { onPointerOver: pick, onPointerDown: pick };

  if (!summary.enoughData) {
    return (
      <div>
        <h2 className="text-lg font-bold">{t("title")}</h2>
        <p className="mt-3 rounded-lg bg-unknown-bg p-4 text-sm text-muted">{t("notEnough")}</p>
      </div>
    );
  }

  const [selDow, selHour] = selected ? selected.split("-").map(Number) : [null, null];
  const sinceText = new Intl.DateTimeFormat(locale, { month: "long", day: "numeric", year: "numeric", timeZone: "Asia/Manila" }).format(
    new Date(since),
  );

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{t("title")}</h2>
          <p className="text-sm text-muted">{t("subtitle")}</p>
        </div>
        <div role="group" aria-label={t("metricLabel")} className="inline-flex rounded-lg border border-border p-0.5">
          {(["speed", "uptime"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={metric === m}
              onClick={() => setMetric(m)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                metric === m ? "bg-foreground text-background" : "text-muted hover:text-foreground"
              }`}
            >
              {m === "speed" ? t("metricSpeed") : t("metricUptime")}
            </button>
          ))}
        </div>
      </div>

      {/* Plain-language takeaways, so nobody has to decode the grid. */}
      <ul className="mt-3 space-y-1 text-sm">
        {summary.fastest && <li>⚡ {t("fastest", { when: windowText(summary.fastest) })}</li>}
        {summary.slowest && <li>🐢 {t("slowest", { when: windowText(summary.slowest) })}</li>}
        {summary.alwaysOnline ? (
          <li>✓ {t("alwaysOnline")}</li>
        ) : (
          summary.leastReliable && <li>⚠ {t("leastReliable", { when: windowText(summary.leastReliable) })}</li>
        )}
      </ul>

      {/* Phone: days across, hours down (each cell stays tappable). */}
      <table {...tableEvents} className="mt-4 w-full table-fixed border-separate border-spacing-[2px] sm:hidden">
        <thead>
          <tr>
            <th scope="col" className="w-12 text-left text-[11px] font-medium text-muted">
              <span className="sr-only">{t("hourColumn")}</span>
            </th>
            {DAY_ORDER.map((d) => (
              <th key={d} scope="col" className="text-[11px] font-medium text-muted">
                {day(d)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {HOURS.map((h) => (
            <tr key={h}>
              <th scope="row" className="pr-1 text-left text-[11px] font-normal whitespace-nowrap text-muted">
                {hour(h)}
              </th>
              {DAY_ORDER.map((d) => cell(d, h, "h-4"))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Wider screens: days down, hours across. */}
      <table {...tableEvents} className="mt-4 hidden w-full table-fixed border-separate border-spacing-[2px] sm:table">
        <thead>
          <tr>
            <th scope="col" className="w-12">
              <span className="sr-only">{t("dayColumn")}</span>
            </th>
            {HOURS.map((h) => (
              <th key={h} scope="col" className="text-[11px] font-medium whitespace-nowrap text-muted">
                {h % 3 === 0 ? hour(h) : <span className="sr-only">{hour(h)}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DAY_ORDER.map((d) => (
            <tr key={d}>
              <th scope="row" className="pr-2 text-left text-xs font-medium text-muted">
                {day(d)}
              </th>
              {HOURS.map((h) => cell(d, h, "h-7"))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Details for the tapped/hovered cell (a tooltip that also works on phones). */}
      <p className="mt-3 min-h-[2.5rem] text-sm" aria-hidden="true">
        {selDow !== null && selHour !== null ? label(selDow, selHour) : <span className="text-muted">{t("hint")}</span>}
      </p>

      {/* Legend: the ramp's two ends are labeled; no-data has its own swatch. */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
        <div className="flex items-center gap-1.5">
          <span>{metric === "speed" ? t("legendSpeedLow") : t("legendUptimeLow")}</span>
          {Array.from({ length: LEVELS }, (_, i) => (
            <span key={i} className={`inline-block h-3 w-5 rounded-[3px] ${HEAT[i]}`} aria-hidden="true" />
          ))}
          <span>{metric === "speed" ? t("legendSpeedHigh") : t("legendUptimeHigh")}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded-[3px] border border-dashed border-border" aria-hidden="true" />
          <span>{t("noData")}</span>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">{t("since", { date: sinceText })}</p>
    </div>
  );
}
