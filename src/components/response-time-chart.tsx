"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatResponseTime } from "@/lib/format";
import type { ResponseTimePoint, ResponseTimeRange } from "@/lib/supabase/database.types";

interface ChartRow {
  t: number;
  ms: number | null;
  /** Set (to 0, the bottom of the chart) when the bucket had down checks. */
  downMarker: number | null;
  down: number;
  total: number;
}

function toRows(points: ResponseTimePoint[]): ChartRow[] {
  return points.map((p) => ({
    t: new Date(p.bucket).getTime(),
    ms: p.avg_response_ms,
    downMarker: p.down > 0 ? 0 : null,
    down: p.down,
    total: p.total,
  }));
}

/**
 * Response-time chart with a 24 h / 7 d switch. Both ranges are passed in
 * (≤ 288 + 168 points), so switching is instant and needs no request.
 * Gaps in the line are failed checks; red dots on the axis mark them.
 */
export function ResponseTimeChart({
  data,
}: {
  data: Record<ResponseTimeRange, ResponseTimePoint[]>;
}) {
  const t = useTranslations("Site");
  const locale = useLocale();
  const [range, setRange] = useState<ResponseTimeRange>("24h");
  const gradientId = useId();

  const rows = toRows(data[range]);
  const total = rows.reduce((a, r) => a + r.total, 0);
  const down = rows.reduce((a, r) => a + r.down, 0);
  const timed = rows.filter((r) => r.ms !== null);
  const avg = timed.length ? timed.reduce((a, r) => a + (r.ms ?? 0), 0) / timed.length : null;

  // Times on the chart are Manila time, whatever the visitor's own time zone.
  const tick = new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Manila",
    ...(range === "24h" ? { hour: "numeric", minute: "2-digit" } : { month: "short", day: "numeric" }),
  });
  const full = new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">{t("chartTitle")}</h2>
        <div role="group" aria-label={t("rangeLabel")} className="inline-flex rounded-lg border border-border p-0.5">
          {(["24h", "7d"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
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

      {rows.length < 2 ? (
        <p className="mt-4 rounded-lg bg-unknown-bg p-4 text-sm text-muted">{t("chartEmpty")}</p>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted">
            {t("chartAverage", { avg: formatResponseTime(avg, locale) })}
            {down > 0 && <> {t("chartDown", { down, total })}</>}
          </p>
          {/* Fixed height so the page doesn't jump when the chart mounts. */}
          <div className="mt-4 h-64 w-full" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="t"
                  type="number"
                  scale="time"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(v: number) => tick.format(v)}
                  stroke="var(--muted)"
                  fontSize={12}
                  minTickGap={24}
                />
                <YAxis
                  stroke="var(--muted)"
                  fontSize={12}
                  width={56}
                  tickFormatter={(v: number) => formatResponseTime(v, locale)}
                />
                <Tooltip
                  labelFormatter={(v) => full.format(Number(v))}
                  formatter={(value, name, item) => {
                    const row = (item as { payload?: ChartRow }).payload;
                    if (name === "downMarker") return [t("downPoint"), ""];
                    if (row && row.ms === null) return [t("downPoint"), ""];
                    return [formatResponseTime(Number(value), locale), t("chartTitle")];
                  }}
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    color: "var(--foreground)",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="ms"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  fill={`url(#${gradientId})`}
                  connectNulls={false}
                  isAnimationActive={false}
                />
                <Scatter dataKey="downMarker" fill="var(--down)" isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
