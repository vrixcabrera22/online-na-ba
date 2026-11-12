"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { buildPaths, nearestIndex, niceTicks, timeTicks, type Point } from "@/lib/chart";
import { formatResponseTime } from "@/lib/format";
import type { ResponseTimePoint, ResponseTimeRange } from "@/lib/supabase/database.types";

/**
 * Response-time chart with a 24 h / 7 d switch. Hand-built SVG instead of a
 * chart library: it renders on the server (nothing pops in later) and ships
 * almost no JavaScript, which matters on mid-range phones.
 *
 * The plot is an SVG stretched to its box (lines keep a 2px stroke via
 * non-scaling-stroke); labels, markers and the tooltip are HTML positioned in
 * percent, so text stays crisp and readable at any width.
 */
export function ResponseTimeChart({ data }: { data: Record<ResponseTimeRange, ResponseTimePoint[]> }) {
  const t = useTranslations("Site");
  const locale = useLocale();
  const [range, setRange] = useState<ResponseTimeRange>("24h");
  const [hover, setHover] = useState<number | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const gradientId = useId();

  const points: Point[] = data[range].map((p) => ({ t: new Date(p.bucket).getTime(), ms: p.avg_response_ms }));
  const raw = data[range];
  const total = raw.reduce((a, p) => a + p.total, 0);
  const down = raw.reduce((a, p) => a + p.down, 0);
  const timed = points.filter((p) => p.ms !== null);
  const avg = timed.length ? timed.reduce((a, p) => a + (p.ms ?? 0), 0) / timed.length : null;

  const ticks = niceTicks(Math.max(0, ...timed.map((p) => p.ms as number)));
  const yMax = ticks[ticks.length - 1];
  const { line, area } = buildPaths(points, yMax);
  const tMin = points[0]?.t ?? 0;
  const tMax = points[points.length - 1]?.t ?? 0;
  const xPct = (time: number) => (tMax === tMin ? 50 : ((time - tMin) / (tMax - tMin)) * 100);
  const yPct = (ms: number) => 100 - (ms / yMax) * 100;

  // Times are always Manila time, whatever the visitor's own time zone.
  const tickFmt = new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Manila",
    ...(range === "24h" ? { hour: "numeric", minute: "2-digit" } : { month: "short", day: "numeric" }),
  });
  const fullFmt = new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  function onPointer(e: React.PointerEvent) {
    const box = plotRef.current?.getBoundingClientRect();
    if (!box || points.length === 0) return;
    const frac = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    setHover(nearestIndex(points, tMin + frac * (tMax - tMin)));
  }

  const hovered = hover !== null ? points[hover] : null;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">{t("chartTitle")}</h2>
        <div role="group" aria-label={t("rangeLabel")} className="inline-flex rounded-lg border border-border p-0.5">
          {(["24h", "7d"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => {
                setRange(r);
                setHover(null);
              }}
              aria-pressed={range === r}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                range === r ? "bg-foreground text-background" : "text-muted hover:text-foreground"
              }`}
            >
              {r === "24h" ? t("range24h") : t("range7d")}
            </button>
          ))}
        </div>
      </div>

      {points.length < 2 ? (
        <p className="mt-4 rounded-lg bg-unknown-bg p-4 text-sm text-muted">{t("chartEmpty")}</p>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted">
            {t("chartAverage", { avg: formatResponseTime(avg, locale) })}
            {down > 0 && <> {t("chartDown", { down, total })}</>}
          </p>

          {/* Decorative for screen readers: the sentence above says the same. */}
          <div className="relative mt-4 h-64 select-none" aria-hidden="true">
            {/* Y axis labels + gridlines */}
            {ticks.map((v) => (
              <div key={v} className="absolute right-0 left-0 flex items-center" style={{ top: `calc(${yPct(v)}% * 0.88)` }}>
                <span className="w-14 shrink-0 -translate-y-1/2 pr-2 text-right text-xs text-muted tabular-nums">
                  {formatResponseTime(v, locale)}
                </span>
              </div>
            ))}

            {/* Plot area: leaves room for y labels (left) and x labels (bottom). */}
            <div
              ref={plotRef}
              className="absolute top-0 right-2 left-14 touch-pan-y"
              style={{ bottom: "12%" }}
              onPointerMove={onPointer}
              onPointerDown={onPointer}
              onPointerLeave={() => setHover(null)}
            >
              <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 1000 1000" preserveAspectRatio="none">
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {ticks.map((v) => (
                  <line
                    key={v}
                    x1="0"
                    x2="1000"
                    y1={1000 - (v / yMax) * 1000}
                    y2={1000 - (v / yMax) * 1000}
                    stroke="var(--border)"
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                <path d={area} fill={`url(#${gradientId})`} />
                <path
                  d={line}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>

              {/* Failed checks: red dots on the baseline (with a surface ring). */}
              {points.map((p, i) =>
                p.ms === null ? (
                  <span
                    key={i}
                    className="absolute bottom-0 size-2.5 -translate-x-1/2 translate-y-1/2 rounded-full bg-down ring-2 ring-surface"
                    style={{ left: `${xPct(p.t)}%` }}
                  />
                ) : null,
              )}

              {/* Hover: crosshair, dot and tooltip. */}
              {hovered && (
                <>
                  <span className="absolute top-0 bottom-0 w-px bg-muted/50" style={{ left: `${xPct(hovered.t)}%` }} />
                  {hovered.ms !== null && (
                    <span
                      className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-2 ring-surface"
                      style={{ left: `${xPct(hovered.t)}%`, top: `${yPct(hovered.ms)}%` }}
                    />
                  )}
                  <div
                    className="pointer-events-none absolute top-0 z-10 rounded-lg border border-border bg-surface px-3 py-2 text-xs whitespace-nowrap shadow-md"
                    style={{
                      left: `${xPct(hovered.t)}%`,
                      transform: `translateX(${xPct(hovered.t) > 60 ? "calc(-100% - 8px)" : "8px"})`,
                    }}
                  >
                    <div className="text-muted">{fullFmt.format(hovered.t)}</div>
                    <div className="font-semibold tabular-nums">
                      {hovered.ms === null ? t("downPoint") : formatResponseTime(hovered.ms, locale)}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* X axis labels */}
            <div className="absolute right-2 bottom-0 left-14 h-[10%]">
              {timeTicks(tMin, tMax, 4).map((time, i, all) => (
                <span
                  key={time}
                  className="absolute bottom-0 text-xs whitespace-nowrap text-muted"
                  style={{
                    left: `${xPct(time)}%`,
                    transform: i === 0 ? "none" : i === all.length - 1 ? "translateX(-100%)" : "translateX(-50%)",
                  }}
                >
                  {tickFmt.format(time)}
                </span>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
